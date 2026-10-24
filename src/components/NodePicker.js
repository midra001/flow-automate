// src/components/NodePicker.js
// Restyled to match the FlowAutomate screens: black rounded dialog, outlined node
// cards in a grid with hover state, purple-focus search box.
// Includes the merged Gemini AI Extraction and Discord Action nodes.

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';

const C = {
  bg: '#0B0B0C',
  cardBg: '#000000',
  line: '#232327',
  lineSoft: '#2C2C31',
  cardBorder: '#4A4A50',
  cardBorderHover: '#8A8A92',
  text: '#FFFFFF',
  muted: '#B4B4BC',
  label: '#8C8C94',
  purple: '#A855F7',
};
const SANS = Platform.select({
  web: 'Inter, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});
const MONO = Platform.select({
  web: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
  default: 'monospace',
});

const NODE_CATALOG = [
  {
    type: 'manual_trigger',
    label: 'Manual Trigger',
    desc: 'Runs workflow on user tap',
  },
  {
    type: 'timer_trigger',
    label: 'Timer / Schedule Trigger',
    desc: 'Delayed or scheduled automation trigger',
  },
  {
    type: 'csv_to_json',
    label: 'Parse CSV Table',
    desc: 'Converts CSV lines/rows into a structured JSON array',
  },
  {
    type: 'loop_invoice_generator',
    label: 'Bulk Invoice Looper',
    desc: 'Iterates row-by-row through customer items to generate invoices',
  },
  {
    type: 'javascript_code',
    label: 'Code / JavaScript',
    desc: 'Transform, map, filter, or clean data using JS',
  },
  {
    type: 'gemini_extraction',
    label: 'Gemini AI Extraction',
    desc: 'Extracts structured JSON from unstructured text using Gemini AI',
  },
  {
    type: 'wait_for_approval',
    label: 'Wait for Approval',
    desc: 'Pauses workflow until an approver submits a decision',
  },
  {
    type: 'battery_sensor',
    label: 'Battery Monitor',
    desc: 'Reads live device battery % and charging state',
  },
  {
    type: 'network_status',
    label: 'Network Status',
    desc: 'Checks internet connectivity & link speed',
  },
  {
    type: 'device_info',
    label: 'Device Info',
    desc: 'Inspects platform, OS, and screen resolution',
  },
  {
    type: 'local_storage',
    label: 'Local Storage (Key/Value)',
    desc: 'Save or retrieve persistent state in storage',
  },
  {
    type: 'set_data',
    label: 'Set Data / Transform',
    desc: 'Define custom JSON variables or transforms',
  },
  {
    type: 'http_request',
    label: 'HTTP Request',
    desc: 'Fetch GET/POST data from REST APIs',
  },
  {
    type: 'json_transform',
    label: 'Extract JSON Key',
    desc: 'Pulls a specific key using dot notation',
  },
  {
    type: 'if_condition',
    label: 'IF Condition',
    desc: 'Check if output passes logical condition',
  },
  {
    type: 'notification',
    label: 'Send Notification',
    desc: 'Triggers local push or system alert',
  },
  {
    type: 'gmail_send',
    label: 'Send via Gmail',
    desc: 'Sends an email with optional attachments via Google Apps Script',
  },
  {
    type: 'inbound_email',
    label: 'Email / CSV Listener',
    desc: 'Polls for an inbound email and extracts CSV attachments',
  },
  {
    type: 'discord_trigger',
    label: 'Discord Trigger',
    desc: 'Wait for a new file upload in a Discord channel.',
  },
  {
    type: 'discord_action',
    label: 'Discord Action',
    desc: 'Send channel messages or direct messages via Discord Bot API',
  },
  {
    type: 'whatsapp_send',
    label: 'WhatsApp Message',
    desc: 'Sends a direct text message to a WhatsApp user via Cloud API',
  },
];

function NodeCard({ item, twoCol, onPress }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        styles.nodeItem,
        { width: twoCol ? '49%' : '100%', borderColor: hover ? C.cardBorderHover : C.cardBorder },
        hover && { backgroundColor: '#0F0F11' },
      ]}
    >
      <Text style={styles.nodeType}>{item.type}</Text>
      <Text style={styles.nodeLabel}>{item.label}</Text>
      <Text style={styles.nodeDesc}>{item.desc}</Text>
    </Pressable>
  );
}

export default function NodePicker({ visible, onClose, onSelectNode }) {
  const { width } = useWindowDimensions();
  const twoCol = width >= 700;
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  // clear the search each time the picker opens
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return NODE_CATALOG;
    return NODE_CATALOG.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.desc.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Select node to add</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.search, focused && { borderColor: C.purple }]}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search nodes..."
            placeholderTextColor={C.label}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {items.map((item) => (
                <NodeCard key={item.type} item={item} twoCol={twoCol} onPress={() => onSelectNode(item)} />
              ))}
            </View>
            {items.length === 0 && <Text style={styles.empty}>No nodes match "{query}".</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContainer: {
    backgroundColor: C.bg,
    borderRadius: 28,
    width: '100%',
    maxWidth: 820,
    maxHeight: '88%',
    padding: 28,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: { color: C.text, fontSize: 28, fontWeight: '300', fontFamily: SANS, letterSpacing: -0.8 },
  closeText: { color: C.muted, fontSize: 18 },

  search: {
    backgroundColor: C.cardBg,
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
    fontFamily: SANS,
    marginBottom: 18,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },

  list: { flexGrow: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  nodeItem: {
    backgroundColor: C.cardBg,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  nodeType: { color: C.label, fontSize: 10, letterSpacing: 1, fontFamily: MONO, marginBottom: 10 },
  nodeLabel: { color: C.text, fontSize: 18, fontWeight: '500', fontFamily: SANS, letterSpacing: -0.3 },
  nodeDesc: { color: C.muted, fontSize: 13, lineHeight: 19, fontFamily: SANS, marginTop: 6 },
  empty: { color: C.label, textAlign: 'center', marginTop: 30, marginBottom: 20, fontSize: 15, fontFamily: SANS },
});