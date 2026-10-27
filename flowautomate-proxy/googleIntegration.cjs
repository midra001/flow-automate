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
// Single-user demo with a shared API key, not production multi-user authentication.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const SCOPES = Object.freeze({
  gmail: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
  sheets: ['https://www.googleapis.com/auth/spreadsheets'],
  // Deliberately limited to files created by / explicitly opened with this app.
  drive: ['https://www.googleapis.com/auth/drive.file'],
});
const error = (status, message) => Object.assign(new Error(message), { status });
const text = (value, name, max = 1000, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || value.includes('\0')) throw error(400, `Invalid ${name}.`);
  return value;
};
const id = value => { text(value, 'Google file ID', 200); if (!/^[A-Za-z0-9_-]+$/.test(value)) throw error(400, 'Invalid Google file ID.'); return value; };
const filename = value => { text(value, 'file name', 150); if (/[\\/\r\n\x00-\x1f\x7f]/.test(value)) throw error(400, 'Use a plain file name without control characters.'); return value; };
const serialize = value => typeof value === 'string' ? value : JSON.stringify(value ?? null);
function services(scopes) { return Object.fromEntries(Object.entries(SCOPES).map(([name, required]) => [name, required.every(s => scopes.includes(s))])); }
function limit(value, fallback, max) { if (value === undefined) return fallback; if (!Number.isInteger(value) || value < 1 || value > max) throw error(400, `maxResults must be 1–${max}.`); return value; }
function pagination(query, value) {
  if (value === undefined || value === '') return;
  const token = text(value, 'page token', 4096);
  if (/[\x00-\x20\x7f]/.test(token)) throw error(400, 'Invalid page token.');
  query.set('pageToken', token);
}
function mimeMessage(config, input) {
  const to = text(config.to, 'recipient', 254);
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(to)) throw error(400, 'Enter one valid recipient email address.');
  const subject = text(config.subject ?? '', 'subject', 500, false);
  if (/[\r\n\x00-\x1f\x7f]/.test(subject)) throw error(400, 'Invalid subject header.');
  const body = text(config.body ?? '', 'body', 1024 * 1024, false);
  if (config.attachData !== undefined && typeof config.attachData !== 'boolean') throw error(400, 'attachData must be a boolean.');
  const encodedSubject = Array.from(subject).reduce((chunks, char) => {
    if (!chunks.length || Buffer.byteLength(chunks[chunks.length - 1] + char) > 42) chunks.push(char); else chunks[chunks.length - 1] += char;
    return chunks;
  }, []).map(chunk => `=?UTF-8?B?${Buffer.from(chunk).toString('base64')}?=`).join('\r\n ');
  const b64 = value => Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
  const headers = [`To: ${to}`, `Subject: ${encodedSubject}`, 'MIME-Version: 1.0'];
  if (!config.attachData) return headers.concat('Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(body)).join('\r\n');
  const name = filename(config.fileName || 'workflow_output.json');
  const content = serialize(input);
  if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw error(400, 'Attachment limit is 2 MiB.');
  const boundary = `flow_${crypto.randomBytes(18).toString('hex')}`;
  const encodedName = encodeURIComponent(name).replace(/['()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  return headers.concat(`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(body), `--${boundary}`, 'Content-Type: application/octet-stream', `Content-Disposition: attachment; filename="attachment"; filename*=UTF-8''${encodedName}`, 'Content-Transfer-Encoding: base64', '', b64(content), `--${boundary}--`, '').join('\r\n');
}
function plainBody(payload) {
  if (payload?.mimeType === 'text/plain' && payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  return (payload?.parts || []).map(plainBody).filter(Boolean).join('\n');
}

function createGoogleRouter({ env = process.env, fetchImpl = globalThis.fetch, tokenPath = path.join(__dirname, '.data', 'google-tokens.enc'), now = Date.now, stateTtlMs = 5 * 60 * 1000 } = {}) {
  const router = express.Router();
  const states = new Map();
  let tokens = null, loaded = false, refreshing = null, generation = 0;
  const apiKey = env.GOOGLE_DEMO_API_KEY || '';
  const keyHash = value => crypto.createHash('sha256').update(value).digest();
  const configuredKeyHash = keyHash(apiKey);
  function encryptionKey() {
    if (!/^[a-f\d]{64}$/i.test(env.GOOGLE_TOKEN_ENCRYPTION_KEY || '')) throw error(503, 'Configure GOOGLE_TOKEN_ENCRYPTION_KEY as 32 random bytes in hex.');
    return Buffer.from(env.GOOGLE_TOKEN_ENCRYPTION_KEY, 'hex');
  }
  function oauthConfig() {
    encryptionKey();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw error(503, 'Configure Google OAuth client ID and secret on the backend.');
    const redirect = env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google/oauth/callback';
    let u; try { u = new URL(redirect); } catch { throw error(503, 'Invalid Google redirect URI configuration.'); }
    const secureTransport = u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname));
    if (!secureTransport || u.pathname !== '/api/google/oauth/callback' || u.search || u.hash || u.username || u.password) throw error(503, 'Google demo redirect must be a fixed HTTPS callback or HTTP localhost callback at /api/google/oauth/callback, without credentials, query or fragment.');
    return redirect;
  }
  function load() {
    const key = encryptionKey();
    if (loaded) return tokens;
    if (fs.existsSync(tokenPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'base64'));
        decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
        tokens = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data, 'base64')), decipher.final()]).toString('utf8'));
      } catch { throw error(503, 'Cannot decrypt Google connection. Restore the encryption key or disconnect to reset.'); }
    }
    loaded = true;
    return tokens;
  }
  function save(value) {
    const key = encryptionKey();
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
    const temporary = `${tokenPath}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }), { mode: 0o600 });
    fs.renameSync(temporary, tokenPath); tokens = value; loaded = true;
  }
  async function google(url, options = {}) {
    let response;
    try { response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(20000) }); }
    catch { throw error(502, 'Google request could not be completed. For a send, append, or upload, check Google before retrying.'); }
    let data;
    try {
      // Bound Gmail full-message responses as well as ordinary API results.
      let size = 0; const chunks = [];
      for await (const chunk of response.body || []) {
        size += chunk.byteLength;
        if (size > 12 * 1024 * 1024) throw error(502, 'Google response exceeds the 12 MiB demo limit.');
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      data = raw ? JSON.parse(raw) : {};
    } catch (e) { if (e.status) throw e; throw error(502, 'Google returned an unreadable response. Check Google before retrying a send, append, or upload.'); }
    if (!response.ok) {
      const e = error(response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
        response.status === 401 ? 'Google authorization expired or was revoked. Reconnect Google.' : response.status === 403 ? 'Google denied this operation. Check granted scopes, API enablement and file access.' : 'Google request failed. Check configuration and, for mutations, check Google before retrying.');
      e.googleStatus = response.status; e.invalidGrant = data?.error === 'invalid_grant'; throw e;
    }
    return data;
  }
  async function refresh() {
    if (refreshing) return refreshing;
    oauthConfig();
    const original = load(), version = generation;
    if (!original?.refresh_token) throw error(401, 'Reconnect Google to grant offline access.');
    refreshing = (async () => {
      let result;
      try { result = await google('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: original.refresh_token, grant_type: 'refresh_token' }) }); }
      catch (e) { if (e.invalidGrant) throw error(401, 'Google connection was revoked or expired. Disconnect and reconnect.'); throw e; }
      if (generation !== version) throw error(409, 'Google connection changed. Run the workflow again.');
      if (!result.access_token || !Number.isFinite(result.expires_in)) throw error(502, 'Google returned an invalid token response.');
      const scopes = result.scope ? result.scope.split(' ') : original.scopes;
      save({ ...original, ...result, scopes, refresh_token: result.refresh_token || original.refresh_token, expires_at: now() + result.expires_in * 1000 });
      if (!original.scopes.every(scope => scopes.includes(scope))) throw error(403, 'Google permissions changed. Reconnect and grant the requested services.');
      return tokens;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  async function request(url, options = {}) {
    let current = load();
    if (!current) throw error(401, 'Connect Google first.');
    if (current.expires_at <= now() + 60000) current = await refresh();
    const send = value => google(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${value.access_token}` } });
    try { return await send(current); } catch (e) {
      // Never retry an ambiguous mutation, even on an authorization error.
      if (e.googleStatus === 401 && (!options.method || options.method === 'GET')) return send(await refresh());
      throw e;
    }
  }
  const protect = (req, res, next) => {
    if (apiKey.length < 32) return res.status(503).json({ error: 'Set GOOGLE_DEMO_API_KEY to a random secret of at least 32 characters.' });
    const supplied = req.get('authorization') || '';
    if (!supplied.startsWith('Bearer ') || !crypto.timingSafeEqual(keyHash(supplied.slice(7)), configuredKeyHash)) return res.status(401).json({ error: 'Google demo API authorization required.' });
    next();
  };
  const wrap = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
  // Callback is the sole route authorized by one-time state rather than the API key.
  router.get('/oauth/callback', wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const pending = typeof req.query.state === 'string' ? states.get(req.query.state) : null;
    if (pending) states.delete(req.query.state);
    let ok = false;
    try {
      if (!pending || pending.expires <= now() || pending.initiator !== configuredKeyHash.toString('hex') || pending.generation !== generation || req.query.error || typeof req.query.code !== 'string' || req.query.code.length > 4096) throw error(400, 'Invalid OAuth callback.');
      const result = await google('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: oauthConfig(), code: req.query.code, code_verifier: pending.verifier, grant_type: 'authorization_code' }) });
      const scopes = typeof result.scope === 'string' ? result.scope.split(' ').filter(Boolean) : [];
      if (!pending.scopes.every(scope => scopes.includes(scope))) throw error(403, 'Requested Google permissions were not all granted.');
      // A fresh consent must return its own refresh token. Never combine an old
      // account's refresh token with a newly selected account's access token.
      if (!result.access_token || !Number.isFinite(result.expires_in) || !result.refresh_token) throw error(502, 'Missing Google offline authorization.');
      let email = null;
      if (scopes.includes(SCOPES.gmail[1])) {
        const profile = await google('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${result.access_token}` } });
        email = typeof profile.emailAddress === 'string' ? profile.emailAddress : null;
      }
      if (pending.generation !== generation) throw error(409, 'Connection changed.');
      save({ access_token: result.access_token, refresh_token: result.refresh_token, expires_at: now() + result.expires_in * 1000, scopes, email });
      generation++; states.clear(); ok = true;
    } catch { /* Never expose Google responses, codes, tokens, or query strings in HTML/logs. */ }
    res.status(ok ? 200 : 400).type('html').send(`<!doctype html><meta charset="utf-8"><title>Google connection</title><h1>${ok ? 'Google connected' : 'Google connection not completed'}</h1><p>${ok ? 'You can close this window and return to the app.' : 'Close this window, return to the app, and start Connect again. Grant all selected permissions.'}</p>`);
  }));
  router.use(protect);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/auth/start', wrap(async (req, res) => {
    const service = req.body?.service;
    if (!Object.hasOwn(SCOPES, service || '')) throw error(400, 'Select gmail, sheets, or drive.');
    const redirect = oauthConfig(), previous = load();
    const scopes = [...new Set([...(previous?.scopes || []), ...SCOPES[service]])];
    for (const [key, value] of states) if (value.expires <= now()) states.delete(key);
    if (states.size >= 20) throw error(429, 'Too many pending connections. Wait five minutes.');
    const state = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(32).toString('base64url');
    states.set(state, { verifier, scopes, expires: now() + stateTtlMs, initiator: configuredKeyHash.toString('hex'), generation });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: scopes.join(' '), state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' }).toString();
    res.json({ url: url.toString() });
  }));
  router.get('/status', wrap(async (req, res) => {
    const current = load(), scopes = current?.scopes || [];
    res.json({ connected: !!current, email: current?.email || null, scopes, services: services(scopes) });
  }));
  router.delete('/connection', wrap(async (req, res) => {
    let current; try { current = load(); } catch { /* Allow a local reset even with an unreadable store. */ }
    generation++; states.clear(); tokens = null; loaded = true;
    fs.rmSync(tokenPath, { force: true });
    if (current) {
      try { await google('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: current.refresh_token || current.access_token }) }); }
      catch { return res.status(502).json({ error: 'Local connection deleted; Google revocation could not be confirmed. Remove app access in your Google account.' }); }
    }
    res.json({ disconnected: true });
  }));
  router.post('/execute', wrap(async (req, res) => {
    const { type, config = {}, input } = req.body || {};
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw error(400, 'config must be an object.');
    const types = { gmail_send: 'gmail', gmail_read: 'gmail', google_sheets: 'sheets', google_drive: 'drive' };
    const service = typeof type === 'string' && Object.hasOwn(types, type) ? types[type] : null;
    if (!service) throw error(400, 'Unsupported Google workflow type.');
    const current = load();
    if (!current) throw error(401, 'Connect Google first.');
    if (!services(current.scopes)[service]) throw error(403, `Connect Google ${service} and grant all requested permissions.`);
    let result;
    if (type === 'gmail_send') {
      const raw = Buffer.from(mimeMessage(config, input)).toString('base64url');
      result = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
    } else if (type === 'gmail_read') {
      const query = new URLSearchParams({ q: text(config.query ?? '', 'Gmail query', 1000, false), maxResults: String(limit(config.maxResults, 10, 20)) });
      pagination(query, config.pageToken);
      const list = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`);
      const messages = []; let messageBytes = 0;
      for (const item of (list.messages || []).slice(0, Number(query.get('maxResults')))) {
        const message = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`);
        const decoded = { ...message, body: plainBody(message.payload) };
        messageBytes += Buffer.byteLength(JSON.stringify(decoded));
        if (messageBytes > 12 * 1024 * 1024) throw error(502, 'Gmail results exceed the 12 MiB demo limit. Narrow the query or reduce maxResults.');
        messages.push(decoded);
      }
      result = { messages, nextPageToken: list.nextPageToken || null, resultSizeEstimate: list.resultSizeEstimate || 0 };
    } else if (type === 'google_sheets') {
      const action = config.action || 'read';
      if (!['read', 'append'].includes(action)) throw error(400, 'Sheets action must be read or append.');
      const sheet = id(config.spreadsheetId), range = text(config.range || 'Sheet1!A:Z', 'spreadsheet range', 500);
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${encodeURIComponent(range)}`;
      if (action === 'read') result = await request(base);
      else {
        let values = config.values;
        if (typeof values === 'string') { try { values = values.trim() ? JSON.parse(values) : input; } catch { throw error(400, 'Sheets values must be a JSON 2D array.'); } }
        if (values === undefined || values === null) values = input;
        if (!Array.isArray(values) || !values.length || values.length > 1000 || !values.every(row => Array.isArray(row) && row.length > 0 && row.length <= 100 && row.every(cell => cell === null || ['string', 'number', 'boolean'].includes(typeof cell))) || Buffer.byteLength(JSON.stringify(values)) > 1024 * 1024) throw error(400, 'Sheets values must be a nonempty 2D array of scalar cells (up to 1000 rows, 100 columns, 1 MiB).');
        result = await request(`${base}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) });
      }
    } else {
      const action = config.action || 'list';
      if (!['list', 'upload'].includes(action)) throw error(400, 'Drive action must be list or upload.');
      if (action === 'list') {
        const query = new URLSearchParams({ q: text(config.query ?? 'trashed = false', 'Drive query', 1000, false), pageSize: String(limit(config.maxResults, 20, 100)), fields: 'files(id,name,mimeType,webViewLink,size),nextPageToken' });
        pagination(query, config.pageToken);
        result = await request(`https://www.googleapis.com/drive/v3/files?${query}`);
      } else {
        const name = filename(config.fileName || 'workflow_output.json');
        const mimeType = text(config.mimeType || 'application/json', 'MIME type', 150);
        if (!/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(mimeType)) throw error(400, 'Invalid MIME type.');
        const content = config.content === undefined || config.content === '' ? serialize(input) : text(config.content, 'file content', 2 * 1024 * 1024, false);
        if (Buffer.byteLength(content) > 2 * 1024 * 1024) throw error(400, 'Upload limit is 2 MiB.');
        const metadata = { name, mimeType };
        if (config.folderId) metadata.parents = [id(config.folderId)];
        const boundary = `flow_${crypto.randomBytes(18).toString('hex')}`;
        const body = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--\r\n`, 'utf8');
        result = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      }
    }
    res.json(result);
  }));
  router.use((err, req, res, next) => res.status(err.status >= 400 && err.status <= 599 ? err.status : 500).json({ error: err.status ? err.message : 'Google integration failed. Check local backend configuration.' }));
  return router;
}
module.exports = { createGoogleRouter, SCOPES, mimeMessage, plainBody };
