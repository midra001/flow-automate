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

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { googleRequest, googleBackendUrl, hasGoogleDemoKey, setGoogleDemoKey } from '../services/googleService';

const styles = StyleSheet.create({
  box: { gap: 14 }, label: { color: '#FFFFFF', fontSize: 13, marginBottom: 6 },
  hint: { color: '#B4B4BC', fontSize: 12, lineHeight: 19 },
  input: { color: '#FFFFFF', backgroundColor: '#0B0B0C', borderColor: '#3A3A42', borderWidth: 1, borderRadius: 10, padding: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderColor: '#A855F7', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  active: { backgroundColor: '#58208A' }, buttonText: { color: '#FFFFFF', fontSize: 12 },
});
function Field({ label, hint, multiline = false, ...props }) {
  return <View><Text style={styles.label}>{label}</Text>{hint ? <Text style={styles.hint}>{hint}</Text> : null}<TextInput {...props} style={[styles.input, multiline && { minHeight: 90 }]} multiline={multiline} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#777780" /></View>;
}
function Button({ label, onPress, active, disabled }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, active && styles.active, disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
}

export default function GoogleNodeFields({ type, config, setConfig }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const polling = useRef(null);
  const service = type.startsWith('gmail') ? 'gmail' : type === 'google_sheets' ? 'sheets' : 'drive';
  const legacy = type === 'gmail_send' && (config.googleProvider === 'legacy' || (config.webhookUrl && !config.googleProvider));
  const update = field => value => setConfig(previous => ({ ...previous, [field]: value }));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearInterval(polling.current); }; }, []);
  useEffect(() => { setStatus(null); setKey(''); setMessage(''); clearInterval(polling.current); setBusy(false); }, [config.backendUrl]);
  function prepare() {
    googleBackendUrl(config);
    if (key.trim()) setGoogleDemoKey(config, key);
    if (!hasGoogleDemoKey(config)) throw new Error('Enter GOOGLE_DEMO_API_KEY from your backend .env.');
  }
  async function check() {
    try { prepare(); const value = await googleRequest(config, '/status'); if (mounted.current) { setStatus(value); setMessage(value.services?.[service] ? 'Ready for this Google service.' : 'Connect this service below.'); } }
    catch (error) { if (mounted.current) setMessage(error.message); }
  }
  async function connect() {
    let popup = null;
    try {
      prepare();
      // Open synchronously so browsers do not block the OAuth popup after fetch.
      if (Platform.OS === 'web') {
        popup = window.open('about:blank', '_blank', 'width=600,height=740');
        if (!popup) throw new Error('Allow popups for this app, then click Connect again.');
        popup.opener = null;
      }
      setBusy(true); setMessage('Complete Google consent in the opened window, then return here.');
      const { url } = await googleRequest(config, '/auth/start', { method: 'POST', body: JSON.stringify({ service }) });
      const authorization = new URL(url);
      if (authorization.origin !== 'https://accounts.google.com') throw new Error('Backend returned an unexpected Google authorization address.');
      if (popup) popup.location.href = url; else await Linking.openURL(url);
      clearInterval(polling.current);
      const deadline = Date.now() + 180000;
      let checking = false;
      polling.current = setInterval(async () => {
        if (Date.now() > deadline) { clearInterval(polling.current); if (mounted.current) { setBusy(false); setMessage('Consent wait ended. Use Check connection after completing Google consent.'); } return; }
        if (checking) return;
        checking = true;
        try {
          const value = await googleRequest(config, '/status');
          if (mounted.current) setStatus(value);
          if (value.services?.[service]) { clearInterval(polling.current); if (mounted.current) { setBusy(false); setMessage('Google connected. You can close the consent window.'); } }
        } catch (error) { clearInterval(polling.current); if (mounted.current) { setBusy(false); setMessage(error.message); } }
        finally { checking = false; }
      }, 2000);
    } catch (error) { popup?.close(); if (mounted.current) { setBusy(false); setMessage(error.message); } }
  }
  async function disconnect() {
    try { prepare(); clearInterval(polling.current); setBusy(true); await googleRequest(config, '/connection', { method: 'DELETE' }); if (mounted.current) { setStatus(null); setMessage('Google disconnected for all workflows on this backend.'); } }
    catch (error) { if (mounted.current) setMessage(error.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  const field = (name, label, placeholder, hint, multiline = false) => <Field key={name} label={label} placeholder={placeholder} hint={hint} multiline={multiline} value={String(config[name] ?? '')} onChangeText={update(name)} />;
  const options = (name, choices, fallback) => <View style={styles.row}>{choices.map(([value, label]) => <Button key={String(value)} label={label} active={(config[name] ?? fallback) === value} onPress={() => update(name)(value)} />)}</View>;
  return <View style={styles.box}>
    {type === 'gmail_send' && options('googleProvider', [['oauth', 'Google OAuth'], ['legacy', 'Legacy Apps Script']], legacy ? 'legacy' : 'oauth')}
    {legacy ? field('webhookUrl', 'Apps Script URL', 'https://script.google.com/macros/s/...') : <>
      <Text style={styles.hint}>Local, single-user demo: one Google account is shared by workflows on this backend. Google credentials stay on the server. Connect each service you need.</Text>
      {field('backendUrl', 'Google backend URL', 'http://localhost:3000', 'For a remote backend, HTTPS is required.')}
      <Field label="Demo access key" hint="Backend GOOGLE_DEMO_API_KEY. Kept only in app memory; re-enter after a reload. Never put Google client secrets here." value={key} onChangeText={setKey} secureTextEntry placeholder="Enter backend demo access key" />
      <View style={styles.row}><Button label={busy ? 'Waiting…' : `Connect ${service === 'gmail' ? 'Gmail' : service === 'sheets' ? 'Sheets' : 'Drive'}`} onPress={connect} disabled={busy} /><Button label="Check connection" onPress={check} /><Button label="Disconnect all Google services" onPress={disconnect} disabled={busy || !status?.connected} /></View>
      {status ? <Text style={styles.hint}>{status.connected ? `Connected${status.email ? `: ${status.email}` : ''}` : 'Not connected'} · {Object.entries(status.services || {}).filter(([, value]) => value).map(([name]) => name).join(', ') || 'No service permissions'}</Text> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{message}</Text> : null}
    </>}
    {type === 'gmail_send' && <>
      {field('to', 'Recipient email', 'student@example.com')}{field('subject', 'Subject', 'Workflow result')}
      {field('body', 'Plain text body', 'Hello, {{prev.output}}', 'Supports {{prev.output}} and {{step1.output.field}}.', true)}
      <Text style={styles.label}>Attach previous workflow output?</Text>{options('attachData', [[true, 'Yes'], [false, 'No']], false)}
      {config.attachData && field('fileName', 'Attachment name', 'workflow_output.json')}
    </>}
    {type === 'gmail_read' && <>
      {field('query', 'Gmail search query', 'is:unread has:attachment', 'Runs a search when this node executes; it is not a live email trigger.')}
      {field('maxResults', 'Maximum messages (1–20)', '10')}
      {field('pageToken', 'Page token (optional)', '', 'Use nextPageToken from a previous search to fetch another page.')}
    </>}
    {type === 'google_sheets' && <>
      {options('action', [['read', 'Read rows'], ['append', 'Append rows']], 'read')}
      {field('spreadsheetId', 'Spreadsheet ID', 'ID between /d/ and /edit in the Sheets URL')}
      {field('range', 'A1 range', 'Sheet1!A1:D20', 'Default: Sheet1!A:Z. Use a sheet/tab name and range.')}
      {config.action === 'append' && field('values', 'Rows as a JSON 2D array', '[["Alice",42],["Bob",17]]', 'Leave blank to use a previous output that is already a 2D array. Values are appended as RAW, not evaluated as formulas.', true)}
    </>}
    {type === 'google_drive' && <>
      {options('action', [['list', 'List files'], ['upload', 'Upload text / JSON']], 'list')}
      <Text style={styles.hint}>Uses limited drive.file permissions: only files created by or explicitly opened with this app, not your entire Drive. No Google file picker is included in this patch.</Text>
      {(config.action || 'list') === 'list' ? <>
        {field('query', 'Drive search query (optional)', "name contains 'report'", 'Google Drive query syntax; defaults to trashed = false.')}
        {field('maxResults', 'Maximum files per page (1–100)', '20')}
        {field('pageToken', 'Page token (optional)', '', 'Use nextPageToken from a previous list result.')}
      </> : <>
        {field('fileName', 'New file name', 'workflow_output.json')}
        {field('mimeType', 'MIME type', 'application/json', 'Examples: text/plain, text/csv, application/json.')}
        {field('folderId', 'Parent folder ID (optional)', 'Accessible Drive folder ID')}
        {field('content', 'UTF-8 file content', '{{prev.output}}', 'Leave blank to serialize the previous output. Uploads text/JSON, not binary files.', true)}
      </>}
    </>}
  </View>;
}
