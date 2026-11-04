/*
 * This file is part of FlowAutomate.
 *
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
 */

const keys = new Map();
const KEY_PREFIX = 'flowautomate.google.demoKey:';
// Keep backend access keys out of workflow documents and execution logs.
// On web, sessionStorage survives reloads in this tab, not closing the tab.
function sessionStore() {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; }
  catch { return null; } // Storage may be disabled; memory still works.
}
const DEFAULT_BACKEND = process.env.EXPO_PUBLIC_FLOWAUTOMATE_API_URL || 'http://localhost:3000';
export const GOOGLE_NODE_TYPES = ['gmail_send', 'gmail_read', 'google_sheets', 'google_drive'];
export function googleBackendUrl(config = {}) {
  const url = String(config.backendUrl || DEFAULT_BACKEND).trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Enter a valid Google backend URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Backend URL must be an http(s) origin without credentials, a path, or query.');
  }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Use HTTPS for a remote Google backend; HTTP is allowed only on localhost.');
  }
  return parsed.origin;
}
export function setGoogleDemoKey(config, value) {
  const base = googleBackendUrl(config);
  const key = value.trim();
  if (key) keys.set(base, key); else keys.delete(base);
  try {
    const storage = sessionStore();
    if (key) storage?.setItem(KEY_PREFIX + base, key);
    else storage?.removeItem(KEY_PREFIX + base);
  } catch { /* Keep the current app session usable when storage is blocked. */ }
}
export function getGoogleDemoKey(config = {}) {
  const base = googleBackendUrl(config);
  if (keys.has(base)) return keys.get(base);
  try {
    const key = sessionStore()?.getItem(KEY_PREFIX + base) || '';
    if (key) keys.set(base, key);
    return key;
  } catch { return ''; }
}
export function hasGoogleDemoKey(config) { return !!getGoogleDemoKey(config); }
export function usesGoogleOAuth(node) {
  return GOOGLE_NODE_TYPES.includes(node.type) && !(node.type === 'gmail_send' && (node.config?.googleProvider === 'legacy' || (node.config?.webhookUrl && !node.config?.googleProvider)));
}
export async function googleRequest(config, path, options = {}) {
  const base = googleBackendUrl(config);
  const key = getGoogleDemoKey(config);
  if (!key) throw new Error('Open a Google node configuration, enter your backend demo access key, and save. Keys last for this browser tab session (or the current native app session).');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${base}/api/google${path}`, {
      ...options, signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Google backend returned HTTP ${response.status}.`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Google request timed out. Check execution results before retrying a send, append, or upload to avoid duplicates.');
    if (error instanceof TypeError) throw new Error('Cannot reach Google backend. Check the server address and FRONTEND_ORIGINS.');
    throw error;
  } finally { clearTimeout(timer); }
}
// Explicit allowlist prevents old saved config secrets from reaching the backend.
export async function executeGoogleNode(node, input, resolve = value => value) {
  const allowed = ['to', 'subject', 'body', 'attachData', 'fileName', 'query', 'maxResults', 'pageToken', 'action', 'spreadsheetId', 'range', 'values', 'mimeType', 'content', 'folderId'];
  const config = {};
  for (const field of allowed) {
    if (node.config?.[field] !== undefined) config[field] = resolve(node.config[field]);
  }
  // TextInput values are strings; normalize before the strict backend validator.
  if (config.maxResults === '' || (typeof config.maxResults === 'string' && !config.maxResults.trim())) delete config.maxResults;
  if (config.maxResults !== undefined) {
    const raw = String(config.maxResults).trim();
    const maximum = node.type === 'gmail_read' ? 20 : 100;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1 || Number(raw) > maximum) {
      throw new Error(`Maximum results must be a whole number from 1 to ${maximum}.`);
    }
    config.maxResults = Number(raw);
  }
  if (node.type === 'google_sheets') {
    config.action = config.action || 'read';
    config.range = String(config.range || '').trim() || 'Sheet1!A:Z';
    if (typeof config.spreadsheetId === 'string') config.spreadsheetId = config.spreadsheetId.trim();
  }
  if (node.type === 'google_drive') {
    config.action = config.action || 'list';
    if (!config.query) delete config.query;
  }
  return googleRequest(node.config || {}, '/execute', {
    method: 'POST', body: JSON.stringify({ type: node.type, config, input }),
  });
}
