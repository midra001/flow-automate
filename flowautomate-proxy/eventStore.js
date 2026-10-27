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

const { randomUUID } = require('node:crypto');

// In-memory listeners exist only during active test runs, not after shutdown.
class EventStore {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.sessions = new Map();
    this.seen = new Set();
  }
  prune() {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= this.now()) this.sessions.delete(id);
    }
  }
  create({ channelId, mode, timeoutSeconds }) {
    this.prune();
    if (this.sessions.size >= 50) throw new Error('Too many active listeners. Wait for existing runs to finish.');
    const id = randomUUID();
    this.sessions.set(id, { channelId, mode, queue: [], expiresAt: this.now() + (timeoutSeconds + 60) * 1000 });
    return id;
  }
  publish(event) {
    this.prune();
    if (this.seen.has(event.messageId)) return;
    this.seen.add(event.messageId);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
    for (const session of this.sessions.values()) {
      if (session.channelId !== event.channelId) continue;
      if (session.mode === 'attachment' && !event.attachments.length) continue;
      if (session.queue.length < 100) session.queue.push(event);
    }
  }
  next(id) {
    this.prune();
    const session = this.sessions.get(id);
    return session ? { exists: true, event: session.queue.shift() || null } : { exists: false };
  }
  close(id) { this.sessions.delete(id); }
}

function normalizeMessage(message) {
  if (!message.author || message.author.bot || message.webhookId) return null;
  const attachments = [...message.attachments.values()].map(file => ({
    id: file.id, fileName: file.name, url: file.url,
    contentType: file.contentType || null, size: file.size,
  }));
  return {
    messageId: message.id, channelId: message.channelId,
    guildId: message.guildId || null, senderId: message.author.id,
    sender: message.author.username, messageText: message.content || '',
    messageContent: message.content || '', attachments,
    // Preserve the existing resume-extraction workflow's first-file fields.
    fileName: attachments[0]?.fileName || null,
    fileUrl: attachments[0]?.url || null,
    attachmentUrl: attachments[0]?.url || null,
    receivedAt: new Date(message.createdTimestamp).toISOString(),
  };
}

module.exports = { EventStore, normalizeMessage };
