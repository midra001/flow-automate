/*
 * This file is part of FlowAutomate.
 *
 * Copyright © 2026 midra001
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FlowAutomate is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * FlowAutomate is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with FlowAutomate. If not, see <https://www.gnu.org/licenses/>.
 *
 * @author midra001
 * @since 2026-09-26
 */

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { createGoogleRouter, SCOPES, mimeMessage } = require('../googleIntegration.cjs');
const { createApp } = require('../server.js');
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

async function fixture(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-google-'));
  const env = { GOOGLE_DEMO_API_KEY: 'local-demo-secret-key-at-least-32-characters', GOOGLE_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret', ...options.env };
  const tokenPath = path.join(dir, '.data', 'tokens.enc');
  const calls = []; let clock = Date.now(); let granted = []; let custom;
  const mock = async (url, init) => {
    const call = { url: String(url), init }; calls.push(call);
    if (custom) { const response = await custom(call); if (response) return response; }
    if (String(url).endsWith('/token')) {
      const refresh = init.body.get('grant_type') === 'refresh_token';
      return json({ access_token: refresh ? 'refreshed-access-secret' : 'access-secret', ...(refresh ? {} : { refresh_token: 'refresh-secret' }), expires_in: 3600, scope: granted.join(' ') });
    }
    if (String(url).endsWith('/profile')) return json({ emailAddress: 'demo@example.com' });
    if (String(url).endsWith('/revoke')) return json({});
    return json({ id: 'result-id' });
  };
  const googleOptions = { env, tokenPath, fetchImpl: mock, now: () => clock, stateTtlMs: 1000 };
  const app = options.full ? createApp({ googleOptions }) : express().use(express.json({ limit: '12mb' })).use('/api/google', createGoogleRouter(googleOptions));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const api = async (route, { method = 'GET', body, key = env.GOOGLE_DEMO_API_KEY, headers = {} } = {}) => {
    const r = await fetch(`${origin}/api/google${route}`, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, headers: r.headers, data: r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.text() };
  };
  async function start(service) {
    const r = await api('/auth/start', { method: 'POST', body: { service } });
    assert.equal(r.status, 200); const url = new URL(r.data.url); granted = url.searchParams.get('scope').split(' '); return url;
  }
  const callback = url => api(`/oauth/callback?state=${url.searchParams.get('state')}&code=private-code`, { key: null });
  const connect = async service => { const url = await start(service); assert.equal((await callback(url)).status, 200); return url; };
  return { api, start, callback, connect, calls, tokenPath, env, googleOptions, origin, setMock: value => { custom = value; }, advance: ms => { clock += ms; } };
}

test('API key required; absent/short server key fails closed; invalid service rejected', async t => {
  const f = await fixture(t);
  for (const route of ['/status', '/auth/start', '/execute', '/connection']) {
    const method = route === '/connection' ? 'DELETE' : ['/execute', '/auth/start'].includes(route) ? 'POST' : 'GET';
    assert.equal((await f.api(route, { method, body: method === 'POST' ? {} : undefined, key: null })).status, 401);
    assert.equal((await f.api(route, { method, body: method === 'POST' ? {} : undefined, key: 'wrong' })).status, 401);
  }
  assert.equal((await f.api('/auth/start', { method: 'POST', body: { service: '__proto__' } })).status, 400);
  assert.equal(f.calls.length, 0);
  const disabled = await fixture(t, { env: { GOOGLE_DEMO_API_KEY: '' } });
  assert.equal((await disabled.api('/status')).status, 503);
});

test('PKCE, fixed redirect, one-time expiring state, safe callback and secret-free URL', async t => {
  const f = await fixture(t); const url = await f.start('gmail');
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/google/oauth/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('client_secret'), null);
  assert.ok(!url.href.includes(f.env.GOOGLE_DEMO_API_KEY));
  const bad = await f.api('/oauth/callback?state=unknown&code=secret', { key: null });
  assert.equal(bad.status, 400); assert.equal(f.calls.length, 0);
  const done = await f.callback(url); assert.equal(done.status, 200);
  const exchange = f.calls.find(call => call.url.endsWith('/token'));
  const challenge = crypto.createHash('sha256').update(exchange.init.body.get('code_verifier')).digest('base64url');
  assert.equal(challenge, url.searchParams.get('code_challenge'));
  assert.ok(!/access-secret|refresh-secret|private-code|client-secret/.test(done.data));
  assert.equal(done.headers.get('referrer-policy'), 'no-referrer');
  assert.equal((await f.callback(url)).status, 400);
  const expired = await f.start('sheets'); const count = f.calls.length; f.advance(1001);
  assert.equal((await f.callback(expired)).status, 400); assert.equal(f.calls.length, count);
});

test('OAuth state cannot move between server sessions and rejects canceled consent', async t => {
  const a = await fixture(t), b = await fixture(t); const url = await a.start('drive');
  assert.equal((await b.callback(url)).status, 400);
  assert.equal((await a.api(`/oauth/callback?state=${url.searchParams.get('state')}&error=access_denied`, { key: null })).status, 400);
  assert.equal((await a.callback(url)).status, 400); assert.equal(a.calls.length, 0);
});

test('cumulative granular scopes; email only with Gmail; encrypted persistence', async t => {
  const f = await fixture(t); await f.connect('drive');
  let status = (await f.api('/status')).data;
  assert.deepEqual(status, { connected: true, email: null, scopes: SCOPES.drive, services: { gmail: false, sheets: false, drive: true } });
  assert.equal(f.calls.filter(c => c.url.endsWith('/profile')).length, 0);
  await f.connect('gmail'); await f.connect('sheets');
  status = (await f.api('/status')).data;
  assert.deepEqual(status.services, { gmail: true, sheets: true, drive: true });
  assert.equal(status.email, 'demo@example.com');
  assert.equal(status.scopes.length, 4);
  const persisted = fs.readFileSync(f.tokenPath, 'utf8');
  assert.ok(!/access-secret|refresh-secret|demo@example/.test(persisted));
  assert.equal(fs.statSync(f.tokenPath).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(status).includes('secret'));
});

test('partial or missing granted scopes never connects; missing refresh token rejected', async t => {
  const f = await fixture(t);
  f.setMock(call => call.url.endsWith('/token') ? json({ access_token: 'x', refresh_token: 'y', expires_in: 3600, scope: SCOPES.gmail[0] }) : null);
  const url = await f.start('gmail'); assert.equal((await f.callback(url)).status, 400);
  assert.equal((await f.api('/status')).data.connected, false); assert.equal(fs.existsSync(f.tokenPath), false);
  f.setMock(call => call.url.endsWith('/token') ? json({ access_token: 'x', expires_in: 3600, scope: SCOPES.drive.join(' ') }) : null);
  assert.equal((await f.callback(await f.start('drive'))).status, 400);
});

test('refresh preserves refresh token, refreshes before mutations, does not expose tokens', async t => {
  const f = await fixture(t); await f.connect('sheets'); f.advance(3600000);
  const payload = { type: 'google_sheets', config: { action: 'append', spreadsheetId: 'abc_123', range: 'Sheet1!A:Z', values: '[["hi",42]]' } };
  assert.equal((await f.api('/execute', { method: 'POST', body: payload })).status, 200);
  let refresh = f.calls.filter(c => c.url.endsWith('/token') && c.init.body.get('grant_type') === 'refresh_token');
  assert.equal(refresh.length, 1); assert.equal(refresh[0].init.body.get('refresh_token'), 'refresh-secret');
  const mutation = f.calls.find(c => c.url.includes(':append'));
  assert.equal(mutation.init.headers.Authorization, 'Bearer refreshed-access-secret');
  f.advance(3600000); await f.api('/execute', { method: 'POST', body: payload });
  refresh = f.calls.filter(c => c.init.body instanceof URLSearchParams && c.init.body.get('grant_type') === 'refresh_token');
  assert.equal(refresh[1].init.body.get('refresh_token'), 'refresh-secret');
  assert.ok(!JSON.stringify((await f.api('/status')).data).includes('secret'));
});

test('GET retries 401 once; mutations never retry; Google errors stay Google-specific', async t => {
  const f = await fixture(t); await f.connect('sheets'); let reads = 0;
  f.setMock(call => call.url.includes('/values/') && !call.init.method ? (++reads === 1 ? json({ error: 'sensitive provider text' }, 401) : json({ values: [[1]] })) : null);
  const config = { action: 'read', spreadsheetId: 'abc', range: 'Sheet1!A1' };
  assert.deepEqual((await f.api('/execute', { method: 'POST', body: { type: 'google_sheets', config } })).data.values, [[1]]); assert.equal(reads, 2);
  let writes = 0; f.setMock(call => call.url.includes(':append') ? (++writes, json({ error: 'secret response' }, 401)) : null);
  const result = await f.api('/execute', { method: 'POST', body: { type: 'google_sheets', config: { ...config, action: 'append', values: [[1]] } } });
  assert.equal(writes, 1); assert.equal(result.status, 401); assert.match(result.data.error, /Google/); assert.ok(!/Discord|secret response/.test(result.data.error));
});

test('revoked refresh produces actionable reconnect error without a mutation', async t => {
  const f = await fixture(t); await f.connect('drive'); f.advance(3600000);
  f.setMock(call => call.url.endsWith('/token') ? json({ error: 'invalid_grant', error_description: 'provider secret' }, 400) : null);
  const r = await f.api('/execute', { method: 'POST', body: { type: 'google_drive', config: { action: 'upload' } } });
  assert.equal(r.status, 401); assert.match(r.data.error, /reconnect/i); assert.ok(!r.data.error.includes('provider secret'));
  assert.equal(f.calls.filter(c => c.url.includes('/upload/')).length, 0);
});

test('Gmail Unicode MIME attachment, plain body decoding and full message shape', async t => {
  const f = await fixture(t); await f.connect('gmail');
  const body = { type: 'gmail_send', config: { to: 'friend@example.com', subject: 'Hello résumé 🌏', body: 'नमस्ते', attachData: true, fileName: 'résumé.json' }, input: { text: '🎉' } };
  assert.equal((await f.api('/execute', { method: 'POST', body })).status, 200);
  const send = f.calls.find(c => c.url.endsWith('/messages/send'));
  const mime = Buffer.from(JSON.parse(send.init.body).raw, 'base64url').toString('utf8');
  assert.ok(mime.includes(Buffer.from('Hello résumé 🌏').toString('base64')));
  assert.match(mime, /filename\*=UTF-8''r%C3%A9sum%C3%A9.json/);
  assert.ok(mime.includes(Buffer.from(JSON.stringify(body.input)).toString('base64')));
  f.setMock(call => call.url.includes('/messages?') ? json({ messages: [{ id: 'm1' }], resultSizeEstimate: 1, nextPageToken: 'gmail-next' }) : call.url.includes('/messages/m1?format=full') ? json({ id: 'm1', snippet: 'preview', payload: { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Hello 🌏').toString('base64url') } }] } }) : null);
  const read = await f.api('/execute', { method: 'POST', body: { type: 'gmail_read', config: { query: 'from:a@example.com & subject:hello', maxResults: 2, pageToken: 'gmail-page2' } } });
  assert.equal(read.data.messages[0].body, 'Hello 🌏'); assert.ok(read.data.messages[0].payload.parts);
  const list = new URL(f.calls.find(c => c.url.includes('/messages?')).url); assert.equal(list.searchParams.get('q'), 'from:a@example.com & subject:hello');
  assert.equal(list.searchParams.get('pageToken'), 'gmail-page2'); assert.equal(read.data.nextPageToken, 'gmail-next');
});

test('Sheets RAW append accepts JSON or input 2D array, escapes ranges, rejects invalid values', async t => {
  const f = await fixture(t); await f.connect('sheets');
  const config = { action: 'append', spreadsheetId: 'sheet-id', range: 'Sheet 1!A:Z' };
  assert.equal((await f.api('/execute', { method: 'POST', body: { type: 'google_sheets', config: { ...config, values: '' }, input: [['=not-a-formula', 2]] } })).status, 200);
  const append = f.calls.find(c => c.url.includes(':append'));
  assert.equal(new URL(append.url).searchParams.get('valueInputOption'), 'RAW');
  assert.ok(append.url.includes('Sheet%201!A%3AZ'));
  assert.deepEqual(JSON.parse(append.init.body).values, [['=not-a-formula', 2]]);
  for (const values of ['{bad', '[1]', [[{}]], [], [[[]]]]) assert.equal((await f.api('/execute', { method: 'POST', body: { type: 'google_sheets', config: { ...config, values } } })).status, 400);
});

test('Drive multipart UTF8 metadata, content fallback, parent; constrained list with page token', async t => {
  const f = await fixture(t); await f.connect('drive');
  const input = { hello: 'こんにちは' };
  assert.equal((await f.api('/execute', { method: 'POST', body: { type: 'google_drive', input, config: { action: 'upload', fileName: 'data.json', mimeType: 'application/json', folderId: 'folder_1', content: '' } } })).status, 200);
  const upload = f.calls.find(c => c.url.includes('/upload/'));
  const multipart = upload.init.body.toString('utf8');
  assert.ok(multipart.includes('"parents":["folder_1"]')); assert.ok(multipart.includes(JSON.stringify(input)));
  assert.match(upload.init.headers['Content-Type'], /^multipart\/related; boundary=flow_/);
  f.setMock(call => call.url.includes('/drive/v3/files?') ? json({ files: [{ id: 'file' }], nextPageToken: 'page2' }) : null);
  const listed = await f.api('/execute', { method: 'POST', body: { type: 'google_drive', config: { action: 'list', query: "name contains 'résumé'", maxResults: 100, pageToken: 'drive-page2' } } });
  assert.equal(listed.data.nextPageToken, 'page2');
  const list = new URL(f.calls.find(c => c.url.startsWith('https://www.googleapis.com/drive/v3/files?')).url); assert.equal(list.searchParams.get('pageSize'), '100'); assert.equal(list.searchParams.get('q'), "name contains 'résumé'");
  assert.equal(list.searchParams.get('pageToken'), 'drive-page2');
});

test('execute validation rejects injection, limits, malformed actions and missing service grants before Google calls', async t => {
  const f = await fixture(t); await f.connect('gmail'); await f.connect('sheets'); await f.connect('drive'); const count = f.calls.length;
  const bad = [
    { type: '__proto__' }, { type: 'gmail_send', config: { to: 'a@example.com\r\nBcc:evil@example.com' } },
    { type: 'gmail_send', config: { to: 'a@example.com', subject: 'Hi\r\nBcc:x' } },
    { type: 'gmail_send', config: { to: 'a@example.com', attachData: true, fileName: '../x' } },
    { type: 'gmail_send', config: { to: 'a@example.com', attachData: true }, input: 'x'.repeat(2 * 1024 * 1024 + 1) },
    { type: 'gmail_read', config: { maxResults: 21 } },
    { type: 'gmail_read', config: { pageToken: '\r\nbad' } },
    { type: 'google_sheets', config: { action: 'delete' } },
    { type: 'google_sheets', config: { action: 'read', spreadsheetId: '../bad', range: 'A1' } },
    { type: 'google_drive', config: { action: 'list', maxResults: 101 } },
    { type: 'google_drive', config: { action: 'list', pageToken: 'x'.repeat(4097) } },
    { type: 'google_drive', config: { action: 'upload', mimeType: 'text/plain\r\nHeader:x' } },
    { type: 'google_drive', config: { action: 'upload', fileName: 'evil\r\nname' } },
    { type: 'google_drive', config: { action: 'delete' } },
    { type: 'google_drive', config: [] },
  ];
  for (const body of bad) assert.equal((await f.api('/execute', { method: 'POST', body })).status, 400, JSON.stringify(body).slice(0, 200));
  assert.equal(f.calls.length, count);
  const other = await fixture(t); await other.connect('sheets');
  assert.equal((await other.api('/execute', { method: 'POST', body: { type: 'gmail_read' } })).status, 403);
});

test('disconnect revokes and deletes encrypted store, invalidates outstanding states', async t => {
  const f = await fixture(t); await f.connect('drive'); const pending = await f.start('sheets');
  const r = await f.api('/connection', { method: 'DELETE' }); assert.equal(r.status, 200);
  assert.equal(fs.existsSync(f.tokenPath), false); assert.equal((await f.api('/status')).data.connected, false);
  assert.equal((await f.callback(pending)).status, 400);
  const revoke = f.calls.find(c => c.url.endsWith('/revoke')); assert.equal(revoke.init.body.get('token'), 'refresh-secret');
  assert.ok(!revoke.url.includes('secret'));
});

test('failed revocation still deletes local connection; decryption failures are recoverable', async t => {
  const f = await fixture(t); await f.connect('drive'); f.setMock(call => call.url.endsWith('/revoke') ? json({}, 503) : null);
  assert.equal((await f.api('/connection', { method: 'DELETE' })).status, 502); assert.equal(fs.existsSync(f.tokenPath), false);
  // New router instance reads a corrupt encrypted file rather than cached data.
  fs.mkdirSync(path.dirname(f.tokenPath), { recursive: true }); fs.writeFileSync(f.tokenPath, '{}');
  const app = express().use('/api/google', createGoogleRouter(f.googleOptions)); const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const headers = { Authorization: `Bearer ${f.env.GOOGLE_DEMO_API_KEY}` }; const base = `http://127.0.0.1:${server.address().port}/api/google`;
  assert.equal((await fetch(`${base}/status`, { headers })).status, 503);
  assert.equal((await fetch(`${base}/connection`, { method: 'DELETE', headers })).status, 200);
});

test('full server supports Google-only offline Discord and strict configured origin', async t => {
  const f = await fixture(t, { full: true });
  const discord = await fetch(`${f.origin}/api/discord/status`); assert.deepEqual(await discord.json(), { ready: false, bot: null });
  const denied = await f.api('/status', { headers: { Origin: 'https://evil.example' } }); assert.equal(denied.status, 403); assert.ok(!denied.data.error.includes('Discord'));
  const allowed = await f.api('/status', { headers: { Origin: 'http://localhost:8081' } }); assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:8081');
});

test('MIME long Unicode subjects are folded into bounded encoded words without splitting characters', () => {
  const subject = '🌏résumé'.repeat(30); const mime = mimeMessage({ to: 'a@example.com', subject, body: 'test' });
  const words = mime.match(/=\?UTF-8\?B\?([^?]+)\?=/g);
  assert.ok(words.every(word => word.length <= 75));
  assert.equal(words.map(word => Buffer.from(word.slice(10, -2), 'base64').toString('utf8')).join(''), subject);
});

test('stored AES-GCM connection survives restart with the same encryption key', async t => {
  const f = await fixture(t); await f.connect('drive');
  const app = express().use('/api/google', createGoogleRouter(f.googleOptions)); const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/google/status`, { headers: { Authorization: `Bearer ${f.env.GOOGLE_DEMO_API_KEY}` } });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).services, { gmail: false, sheets: false, drive: true });
});

test('parallel requests share one refresh; disconnect prevents in-flight refresh resurrecting tokens', async t => {
  const f = await fixture(t); await f.connect('drive'); f.advance(3600000);
  let release; let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.setMock(async call => {
    if (call.url.endsWith('/token')) {
      entered(); await new Promise(resolve => { release = resolve; });
      return json({ access_token: 'new-access', expires_in: 3600 });
    }
    return null;
  });
  const execute = () => f.api('/execute', { method: 'POST', body: { type: 'google_drive', config: { action: 'list' } } });
  const first = execute(); await ready;
  const second = execute();
  // The second request must reach the router before the pending refresh resolves.
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(f.calls.filter(c => c.url.endsWith('/token') && c.init.body.get('grant_type') === 'refresh_token').length, 1);
  await f.api('/connection', { method: 'DELETE' }); release();
  assert.equal((await first).status, 409); assert.equal((await second).status, 409);
  assert.equal(fs.existsSync(f.tokenPath), false); assert.equal((await f.api('/status')).data.connected, false);
});

test('narrowed refresh scopes block the operation and update status', async t => {
  const f = await fixture(t); await f.connect('gmail'); f.advance(3600000);
  f.setMock(call => call.url.endsWith('/token') ? json({ access_token: 'new-access', scope: SCOPES.gmail[0], expires_in: 3600 }) : null);
  const r = await f.api('/execute', { method: 'POST', body: { type: 'gmail_read' } });
  assert.equal(r.status, 403); assert.equal((await f.api('/status')).data.services.gmail, false);
  assert.equal(f.calls.filter(c => c.url.includes('/messages?')).length, 0);
});

test('redirects cannot be overridden by client; explicit configured HTTPS callbacks are accepted', async t => {
  const f = await fixture(t);
  const started = await f.api('/auth/start', { method: 'POST', body: { service: 'drive', redirect_uri: 'https://evil.example/callback', scopes: ['everything'] } });
  const url = new URL(started.data.url); assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/api/google/oauth/callback'); assert.equal(url.searchParams.get('scope'), SCOPES.drive[0]);
  const redirect = 'https://demo.example:8443/api/google/oauth/callback';
  const remote = await fixture(t, { env: { GOOGLE_REDIRECT_URI: redirect } });
  const remoteUrl = await remote.start('drive');
  assert.equal(remoteUrl.searchParams.get('redirect_uri'), redirect);
  assert.equal((await remote.callback(remoteUrl)).status, 200);
  assert.equal(remote.calls.find(c => c.url.endsWith('/token')).init.body.get('redirect_uri'), redirect);
});

test('configured callbacks reject remote HTTP, credentials, wrong paths, query and fragments', async t => {
  for (const redirect of ['http://demo.example/api/google/oauth/callback', 'https://user:pass@demo.example/api/google/oauth/callback', 'https://demo.example/wrong', 'https://demo.example/api/google/oauth/callback?next=evil', 'https://demo.example/api/google/oauth/callback#fragment', 'ftp://localhost/api/google/oauth/callback']) {
    const bad = await fixture(t, { env: { GOOGLE_REDIRECT_URI: redirect } });
    assert.equal((await bad.api('/auth/start', { method: 'POST', body: { service: 'drive' } })).status, 503, redirect);
    assert.equal(bad.calls.length, 0);
  }
  const local = await fixture(t, { env: { GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3000/api/google/oauth/callback' } });
  assert.equal((await local.start('drive')).searchParams.get('redirect_uri'), local.env.GOOGLE_REDIRECT_URI);
});

test('Sheets defaults to read and Sheet1!A:Z; Drive defaults to list; maxResults remains integer-only', async t => {
  const f = await fixture(t); await f.connect('sheets'); await f.connect('drive'); await f.connect('gmail');
  for (const defaults of [{}, { action: '', range: '' }]) {
    const result = await f.api('/execute', { method: 'POST', body: { type: 'google_sheets', config: { spreadsheetId: 'sheet-id', ...defaults } } });
    assert.equal(result.status, 200);
    const call = f.calls.at(-1);
    assert.equal(call.url, 'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Sheet1!A%3AZ');
    assert.equal(call.init.method, undefined);
  }
  for (const config of [undefined, { action: '' }]) {
    assert.equal((await f.api('/execute', { method: 'POST', body: { type: 'google_drive', config } })).status, 200);
    const url = new URL(f.calls.at(-1).url);
    assert.equal(url.pathname, '/drive/v3/files'); assert.equal(url.searchParams.get('pageSize'), '20');
  }
  const count = f.calls.length;
  for (const type of ['gmail_read', 'google_drive']) {
    assert.equal((await f.api('/execute', { method: 'POST', body: { type, config: { maxResults: '10' } } })).status, 400);
  }
  assert.equal(f.calls.length, count);
});

test('successful reconnect cannot reuse a previous account refresh token', async t => {
  const f = await fixture(t); await f.connect('drive');
  const url = await f.start('drive');
  f.setMock(call => call.url.endsWith('/token') ? json({ access_token: 'different-account-access', expires_in: 3600, scope: SCOPES.drive.join(' ') }) : null);
  assert.equal((await f.callback(url)).status, 400);
  f.setMock(null); f.advance(3600000);
  assert.equal((await f.api('/execute', { method: 'POST', body: { type: 'google_drive', config: { action: 'list' } } })).status, 200);
  const refresh = f.calls.find(c => c.url.endsWith('/token') && c.init.body.get('grant_type') === 'refresh_token');
  assert.equal(refresh.init.body.get('refresh_token'), 'refresh-secret');
});
