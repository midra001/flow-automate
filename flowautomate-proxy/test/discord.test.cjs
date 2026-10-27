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

const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { EventStore, normalizeMessage } = require('../eventStore');
const { createApp } = require('../server');

const channelId = '123456789012345678';
const userId = '223456789012345678';
function message(overrides = {}) {
  return { id: '323456789012345678', channelId, guildId: '423456789012345678',
    author: { id: userId, username: 'Student', bot: false }, content: 'Resume attached',
    attachments: new Map([['f', { id: 'f', name: 'resume.pdf', url: 'https://example.test/resume.pdf', size: 500, contentType: 'application/pdf' }]]),
    createdTimestamp: 1700000000000, ...overrides };
}

test('normalize events: preserve resume fields, all attachments, and sender metadata', () => {
  const event = normalizeMessage(message());
  assert.equal(event.fileName, 'resume.pdf');
  assert.equal(event.fileUrl, 'https://example.test/resume.pdf');
  assert.equal(event.messageText, 'Resume attached');
  assert.equal(event.senderId, userId);
  assert.equal(event.attachments.length, 1);
});
test('ignore bots and webhooks to prevent feedback loops', () => {
  assert.equal(normalizeMessage(message({ author: { bot: true } })), null);
  assert.equal(normalizeMessage(message({ webhookId: 'webhook' })), null);
});
test('new listeners do not replay old messages; consume a new event once', () => {
  const store = new EventStore();
  store.publish(normalizeMessage(message()));
  const id = store.create({ channelId, mode: 'attachment', timeoutSeconds: 10 });
  assert.equal(store.next(id).event, null);
  const event = normalizeMessage(message({ id: 'new' }));
  store.publish(event); store.publish(event);
  assert.equal(store.next(id).event.messageId, 'new');
  assert.equal(store.next(id).event, null);
});
test('filter channel and file mode; concurrent workflow listeners receive independent copies', () => {
  const store = new EventStore();
  const file = store.create({ channelId, mode: 'attachment', timeoutSeconds: 10 });
  const text = store.create({ channelId, mode: 'message', timeoutSeconds: 10 });
  const other = store.create({ channelId: 'other', mode: 'message', timeoutSeconds: 10 });
  store.publish(normalizeMessage(message({ attachments: new Map() })));
  assert.equal(store.next(file).event, null);
  assert.equal(store.next(text).event.messageText, 'Resume attached');
  assert.equal(store.next(other).event, null);
  store.publish(normalizeMessage(message({ id: 'file' })));
  assert.equal(store.next(file).event.messageId, 'file');
  assert.equal(store.next(text).event.messageId, 'file');
});
test('listeners expire and can be closed', () => {
  let now = 100;
  const store = new EventStore({ now: () => now });
  const id = store.create({ channelId, mode: 'message', timeoutSeconds: 10 });
  now += 71000;
  assert.equal(store.next(id).exists, false);
  const second = store.create({ channelId, mode: 'message', timeoutSeconds: 10 });
  store.close(second);
  assert.equal(store.next(second).exists, false);
});

let server, base, store, ready = true, sent, sendFailure;
const channel = { isTextBased: () => true, isSendable: () => true,
  guild: {}, permissionsFor: () => ({ has: () => true }),
  async send(payload) {
    if (sendFailure) throw sendFailure;
    sent = payload;
    return { id: 'sent', channelId, content: payload.content, url: 'https://discord.test/message', attachments: new Map() };
  } };
before(async () => {
  store = new EventStore();
  const client = { isReady: () => ready, user: { username: 'FlowAutomate' }, channels: { fetch: async () => channel }, users: { fetch: async () => channel } };
  server = createApp({ client, store, origins: ['http://localhost:8081'] }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
async function call(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
test('API: create listener, wait, receive file, then clean up', async () => {
  const created = await call('/api/discord/listeners', 'POST', { channelId });
  assert.equal(created.status, 201);
  const path = `/api/discord/listeners/${created.data.listenerId}`;
  assert.equal((await call(path + '/events')).data.status, 'waiting');
  store.publish(normalizeMessage(message({ id: 'http-file' })));
  assert.equal((await call(path + '/events')).data.event.fileName, 'resume.pdf');
  assert.equal((await call(path + '/events')).data.status, 'waiting');
  assert.equal((await call(path, 'DELETE')).status, 204);
  assert.equal((await call(path + '/events')).status, 410);
});
test('API: send channel text, DM, Unicode attachment, and file-only output', async () => {
  for (const action of ['send_channel_message', 'send_direct_message']) {
    const result = await call('/api/discord/send', 'POST', { action, targetId: channelId, messageContent: 'Hello' });
    assert.equal(result.status, 200);
    assert.deepEqual(sent.allowedMentions, { parse: [] });
  }
  const text = 'Résumé — Dwayne 🙂';
  const result = await call('/api/discord/send', 'POST', { targetId: channelId, fileContent: Buffer.from(text).toString('base64'), fileName: 'result.txt' });
  assert.equal(result.status, 200);
  assert.equal(sent.files[0].attachment.toString(), text);
});
test('API: reject bad IDs, invalid mode/timeout, empty output, long text, and malformed attachments', async () => {
  for (const body of [{ channelId: 'bad' }, { channelId, mode: 'bad' }, { channelId, timeoutSeconds: 2 }]) {
    assert.equal((await call('/api/discord/listeners', 'POST', body)).status, 400);
  }
  for (const body of [{ targetId: channelId }, { targetId: channelId, messageContent: 'x'.repeat(2001) },
    { targetId: channelId, fileContent: '%invalid%' }, { targetId: channelId, fileContent: 'YQ==', fileName: '../bad.txt' },
    { targetId: channelId, messageContent: 'hi', action: 'delete_everything' }]) {
    assert.equal((await call('/api/discord/send', 'POST', body)).status, 400);
  }
});
test('API: helpful offline, permissions and DM refusal errors; status never returns credentials', async () => {
  ready = false;
  assert.equal((await call('/api/discord/listeners', 'POST', { channelId })).status, 503);
  ready = true;
  for (const code of [50013, 50007]) {
    sendFailure = Object.assign(new Error('raw internal details'), { code });
    const result = await call('/api/discord/send', 'POST', { targetId: channelId, messageContent: 'hi' });
    assert.equal(result.status, 400);
    assert.ok(!result.data.error.includes('raw internal details'));
  }
  sendFailure = null;
  assert.deepEqual((await call('/api/discord/status')).data, { ready: true, bot: 'FlowAutomate' });
});
test('API: reject unapproved browser origins and retire old history polling', async () => {
  assert.equal((await call('/api/discord/status', 'GET', undefined, { Origin: 'https://untrusted.test' })).status, 403);
  assert.equal((await call('/api/discord/status', 'GET', undefined, { Origin: 'http://localhost:8081' })).status, 200);
  assert.equal((await call('/api/discord/fetch', 'POST', {})).status, 410);
});
test('end-to-end locally: workflow engine → real HTTP listener → event store → real HTTP send', async () => {
  const { runWorkflow } = await import('../../src/engine/WorkflowEngine.js');
  let published = false;
  const result = await runWorkflow([
    { id: 't', type: 'discord_trigger', config: { channelId, backendUrl: base, eventMode: 'message' } },
    { id: 'a', type: 'discord_action', config: { backendUrl: base, targetId: channelId, message: 'Hello {{prev.output.sender}}: {{prev.output.messageText}}' } },
  ], (id, status, output) => {
    if (!published && output?.status === 'Listening') {
      published = true;
      store.publish(normalizeMessage(message({ id: 'end-to-end', content: 'Stock is low', attachments: new Map() })));
    }
  });
  assert.equal(result.status, 'success');
  assert.equal(sent.content, 'Hello Student: Stock is low');
  assert.equal(store.sessions.size, 0);
});
