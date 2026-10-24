require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { EventStore, normalizeMessage } = require('./eventStore');

const validId = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });

function createApp({ client, store = new EventStore(), origins = ['http://localhost:8081', 'http://localhost:19006'] }) {
  const app = express(); app.use((req, res, next) => { console.log(`[http] ${req.method} ${req.url}`); next(); });
  app.use(cors({ origin(origin, callback) {
    callback(origin && !origins.includes(origin) ? fail(403, 'Frontend origin is not allowed. Set FRONTEND_ORIGINS in the backend .env.') : null, true);
  } }));
  app.use(express.json({ limit: '12mb' }));
  const ready = () => {
    if (!client.isReady()) throw fail(503, 'Discord bot is offline. Check the backend token, connection, and Message Content Intent.');
  };

  app.get('/api/discord/status', (req, res) => res.json({ ready: client.isReady(), bot: client.user?.username || null }));

  app.post('/api/discord/listeners', async (req, res) => {
    try {
      ready();
      const { channelId, mode = 'attachment', timeoutSeconds = 120 } = req.body || {};
      if (!validId(channelId)) throw fail(400, 'Enter a valid Discord channel ID.');
      if (!['attachment', 'message'].includes(mode)) throw fail(400, 'Trigger mode must be attachment or message.');
      if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 600) throw fail(400, 'Listener timeout must be 10–600 seconds.');
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || !channel.isSendable()) throw fail(400, 'Choose an accessible text channel or thread.');
      if (channel.guild) {
        const permissions = channel.permissionsFor(client.user);
        if (!permissions?.has('ViewChannel')) throw fail(403, 'Bot needs View Channel permission.');
      }
      const listenerId = store.create({ channelId, mode, timeoutSeconds }); console.log(`[listener] created for channel ${channelId} mode=${mode}`);
      res.status(201).json({ listenerId, status: 'listening' });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/discord/listeners/:id/events', (req, res) => {
    try {
      ready();
      const result = store.next(req.params.id);
      if (!result.exists) throw fail(410, 'Listener expired or backend restarted. Run the workflow again.');
      res.json(result.event ? { status: 'success', event: result.event } : { status: 'waiting' });
    } catch (error) { sendError(res, error); }
  });
  app.delete('/api/discord/listeners/:id', (req, res) => { store.close(req.params.id); res.status(204).end(); });

  app.post('/api/discord/send', async (req, res) => {
    try {
      ready();
      const { targetId, action = 'send_channel_message', messageContent = '', fileContent, fileName = 'workflow_output.json' } = req.body || {};
      if (!validId(targetId)) throw fail(400, 'Enter a valid channel or user ID.');
      if (!['send_channel_message', 'send_direct_message'].includes(action)) throw fail(400, 'Unsupported Discord action.');
      if (typeof messageContent !== 'string' || messageContent.length > 2000) throw fail(400, 'Discord text must be at most 2,000 characters. Attach longer output as a file.');
      if (!messageContent.trim() && !fileContent) throw fail(400, 'Provide message text or a file.');
      const payload = { content: messageContent || undefined, allowedMentions: { parse: [] } };
      if (fileContent) {
        if (typeof fileContent !== 'string' || fileContent.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(fileContent)) throw fail(400, 'Attachment must be valid base64.');
        const bytes = Buffer.from(fileContent, 'base64');
        if (bytes.length > 8 * 1024 * 1024) throw fail(400, 'Demo attachment limit is 8 MiB.');
        if (typeof fileName !== 'string' || !fileName.length || fileName.length > 150 || /[\\/\r\n\x00]/.test(fileName)) throw fail(400, 'Use a plain attachment file name, not a path.');
        payload.files = [{ attachment: bytes, name: fileName }];
      }
      const target = action === 'send_direct_message'
        ? await client.users.fetch(targetId)
        : await client.channels.fetch(targetId);
      if (!target || typeof target.send !== 'function') throw fail(400, 'Target cannot receive messages.');
      const message = await target.send(payload);
      res.json({ id: message.id, channelId: message.channelId, content: message.content, url: message.url,
        attachments: [...message.attachments.values()].map(file => ({ fileName: file.name, url: file.url })) });
    } catch (error) { sendError(res, error); }
  });

  // Old clients must not silently consume historical attachments.
  app.post('/api/discord/fetch', (req, res) => res.status(410).json({ error: 'Replace WorkflowEngine.js: Discord now uses live listeners instead of historical-message polling.' }));
  app.use((error, req, res, next) => sendError(res, error));
  return app;
}

function sendError(res, error) {
  const known = {
    50001: 'Bot has no access to that channel. Check server/channel permissions.',
    50013: 'Bot is missing permissions. Check View Channel, Send Messages, and Attach Files.',
    50007: 'Discord refused the DM. The user may need to share a server with the bot and allow DMs.',
    10003: 'Unknown Discord channel. Check the channel ID.',
    10013: 'Unknown Discord user. Check the user ID.',
  };
  const message = known[error.code] || (error.expose || (error.status && error.status < 500) ? error.message : 'Discord request failed. Check bot connectivity, IDs, and permissions.');
  res.status(error.status >= 400 && error.status <= 599 ? error.status : known[error.code] ? 400 : 500).json({ error: message });
}

if (require.main === module) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { console.error('Set DISCORD_BOT_TOKEN in flowautomate-proxy/.env before starting.'); process.exit(1); }
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
  const store = new EventStore();
    client.on('messageCreate', message => { console.log(`[discord] message in channel ${message.channelId} | bot=${message.author.bot} | files=${message.attachments.size} | active listeners=${store.sessions.size}`); const event = normalizeMessage(message); if (event) store.publish(event); });
  client.on('clientReady', () => console.log(`Discord connected as ${client.user.username}`));
  client.on('error', () => console.error('Discord connection error. Check network and bot configuration.'));
  const origins = (process.env.FRONTEND_ORIGINS || 'http://localhost:8081,http://localhost:19006').split(',').map(s => s.trim());
  const server = createApp({ client, store, origins }).listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('FlowAutomate Discord backend started.'));
  client.login(token).catch(() => { console.error('Discord login failed. Verify bot token and enable Message Content Intent in the Developer Portal.'); server.close(); client.destroy(); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { client.destroy(); server.close(() => process.exit(0)); });
}

module.exports = { createApp };
