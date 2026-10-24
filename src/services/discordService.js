// Optional public setting contains only the backend address, never a bot token.
const DEFAULT_BACKEND = process.env.EXPO_PUBLIC_FLOWAUTOMATE_API_URL || 'http://localhost:3000';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function backendUrl(config = {}) {
  const url = String(config.backendUrl || DEFAULT_BACKEND).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('Discord backend address must begin with http:// or https://.');
  return url;
}

async function request(config, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${backendUrl(config)}${path}`, {
      ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Discord backend returned HTTP ${response.status}.`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Discord backend request timed out. Check that it is running.');
    if (error instanceof TypeError) throw new Error('Cannot reach Discord backend. Start it and check Backend URL, CORS origin, and network address.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function sendDiscordMessage(config, { action, targetId, messageContent, fileContent, fileName }) {
  // Deliberately do not transmit config.botToken (legacy saved workflows may contain it).
  return request(config, '/api/discord/send', { method: 'POST', body: JSON.stringify({ action, targetId, messageContent, fileContent, fileName }) });
}

export async function waitForDiscordEvent(config, onProgress) {
  const channelId = String(config.channelId || '').trim();
  if (!/^\d{17,20}$/.test(channelId)) throw new Error('Enter a valid Discord channel ID.');
  const timeoutSeconds = Number(config.timeoutSeconds || 120);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 600) throw new Error('Discord timeout must be 10–600 seconds.');
  const mode = config.eventMode || 'attachment';
  const { listenerId } = await request(config, '/api/discord/listeners', {
    method: 'POST', body: JSON.stringify({ channelId, mode, timeoutSeconds }),
  });
  const deadline = Date.now() + timeoutSeconds * 1000;
  try {
    onProgress?.({ status: 'Listening', message: mode === 'attachment' ? 'Upload a NEW file to Discord now.' : 'Send a NEW message or file to Discord now.' });
    while (Date.now() < deadline) {
      const result = await request(config, `/api/discord/listeners/${encodeURIComponent(listenerId)}/events`);
      if (result.status === 'success') return result.event;
      await sleep(1000);
    }
    throw new Error(`No new Discord ${mode === 'attachment' ? 'file' : 'message'} received within ${timeoutSeconds} seconds. Start another run, then post a new message after Listening appears.`);
  } finally {
    await request(config, `/api/discord/listeners/${encodeURIComponent(listenerId)}`, { method: 'DELETE' }).catch(() => {});
  }
}
