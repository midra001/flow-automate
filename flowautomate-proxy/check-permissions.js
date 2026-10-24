// Usage (from flowautomate-proxy): node check-permissions.js <channelId>
// Prints what the bot can do in a channel. Never prints the token.
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const channelId = process.argv[2];
if (!/^\d{17,20}$/.test(channelId || '')) { console.error('Usage: node check-permissions.js <channelId>'); process.exit(1); }
if (!process.env.DISCORD_BOT_TOKEN) { console.error('DISCORD_BOT_TOKEN is missing from .env'); process.exit(1); }

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.username}`);
  console.log(`Bot is in ${client.guilds.cache.size} server(s): ${[...client.guilds.cache.values()].map(g => g.name).join(', ') || '(none)'}`);
  try {
    const channel = await client.channels.fetch(channelId);
    console.log(`Channel found: #${channel.name || '(DM)'} | type=${channel.type} | server=${channel.guild?.name || 'n/a'}`);
    if (!channel.guild) { console.log('This is a DM channel, no server permissions to check.'); }
    else {
      const perms = channel.permissionsFor(client.user);
      const checks = [
        ['ViewChannel', 'needed by the trigger to see messages'],
        ['SendMessages', 'needed by the action to post'],
        ['AttachFiles', 'needed to attach the JSON file'],
        ['ReadMessageHistory', 'recommended'],
      ];
      for (const [name, why] of checks) console.log(`${perms?.has(name) ? 'OK     ' : 'MISSING'} ${name} (${why})`);
    }
  } catch (e) {
    console.log(`Cannot access that channel (${e.code || e.message}). Wrong ID, or the bot is not in that server or cannot see the channel.`);
  }
  client.destroy();
});
client.login(process.env.DISCORD_BOT_TOKEN).catch(e => { console.error('Login failed:', e.code || e.message); process.exit(1); });