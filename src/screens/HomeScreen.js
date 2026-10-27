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

import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Switch,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { scheduler } from '../services/schedulerService';
import {
  fetchWorkflows,
  toggleWorkflowStatus,
  deleteWorkflowFromFirestore,
  saveWorkflowToFirestore,
} from '../services/workflowService';

/* ───────────────────────── tokens (shared with LandingScreen) ───────────────────────── */
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
  hover: '#8000FF',
  activeBorder: '#6D1CC4',
  ok: '#3ECF9E',
};
const SANS = Platform.select({
  web: 'Inter, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

/* ───────────────────────── icons ───────────────────────── */
function Logo({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path d="M6 20 C6 10 14 18 22 8" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
      <Circle cx={6} cy={20} r={4} fill="#fff" />
      <Circle cx={22} cy={8} r={4} fill="#fff" />
    </Svg>
  );
}

const iconProps = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

function DownloadIcon({ color = '#fff', size = 15 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...iconProps}>
      <Path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 20h16" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function ShareIcon({ color = '#B4B4BC', size = 17 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...iconProps}>
      <Path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4 14v6h16v-6" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function TrashIcon({ color = '#B4B4BC', size = 17 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...iconProps}>
      <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function FlowIcon({ color = '#fff', size = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...iconProps}>
      <Rect x={3} y={4} width={7} height={6} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Rect x={14} y={14} width={7} height={6} rx={1.5} stroke={color} strokeWidth={1.8} />
      <Path d="M10 7h4a3 3 0 0 1 3 3v4" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" {...iconProps}>
      <Path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

/* ───────────────────────── small UI pieces ───────────────────────── */
// "solid" = white (turns purple on hover), "ghost" = outlined (turns white on hover)
function HeaderButton({ onPress, variant = 'ghost', icon, children }) {
  const [hover, setHover] = useState(false);
  const solid = variant === 'solid';
  const bg = solid ? (hover ? C.hover : '#fff') : hover ? '#fff' : 'transparent';
  const border = solid ? (hover ? C.hover : '#fff') : '#fff';
  const fg = solid ? (hover ? '#fff' : '#000') : hover ? '#000' : '#fff';
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[s.hBtn, { backgroundColor: bg, borderColor: border }]}
    >
      {icon ? icon(fg) : null}
      <Text style={[s.hBtnText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

function SortChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function WorkflowCard({ item, onOpen, onToggle, onDelete, onExport }) {
  const [hover, setHover] = useState(false);
  const nodeCount = item.nodes ? item.nodes.length : 0;
  const borderColor = hover ? C.cardBorderHover : item.enabled ? C.activeBorder : C.cardBorder;

  return (
    <Pressable
      onPress={onOpen}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[s.card, { borderColor }]}
    >
      <FlowIcon color={item.enabled ? C.ok : '#fff'} />

      <Text style={s.cardTitle} numberOfLines={3}>
        {item.name}
      </Text>
      <Text style={s.cardDesc} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={{ flex: 1, minHeight: 24 }} />

      <View style={s.metaRow}>
        <Text style={s.metaText}>
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
        </Text>
        <Text style={[s.statusText, { color: item.enabled ? C.ok : C.label }]}>
          {item.enabled ? 'ACTIVE' : 'PAUSED'}
        </Text>
      </View>

      <View style={s.cardBottom}>
        {/* pill inverts when the card is hovered */}
        <View style={[s.pill, hover && { backgroundColor: '#fff', borderColor: '#fff' }]}>
          <Text style={[s.pillText, hover && { color: '#000' }]}>Open editor</Text>
        </View>

        <View style={s.actions}>
          <TouchableOpacity style={s.iconBtn} onPress={onExport} hitSlop={8}>
            <ShareIcon />
          </TouchableOpacity>

          <Switch
            value={!!item.enabled}
            onValueChange={onToggle}
            trackColor={{ false: C.lineSoft, true: C.hover }}
            thumbColor="#FFFFFF"
            activeThumbColor="#FFFFFF"
          />

          <TouchableOpacity style={s.iconBtn} onPress={onDelete} hitSlop={8}>
            <TrashIcon />
          </TouchableOpacity>
        </View>
      </View>
    </Pressable>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function HomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const cols = width >= 1400 ? 4 : width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const isNarrow = width < 640;

  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'az', 'za'
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  // Hide the navigator's default header (this screen draws its own)
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Reloads data whenever navigating back to the Home screen
  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      async function load() {
        setLoading(true);
        const data = await fetchWorkflows();
        if (isMounted) {
          setWorkflows(data);
          setLoading(false);
          scheduler.syncActiveWorkflows(data);
        }
      }
      load();
      return () => {
        isMounted = false;
      };
    }, [])
  );

  // Sync scheduler whenever workflows change
  useEffect(() => {
    if (workflows.length > 0) {
      scheduler.syncActiveWorkflows(workflows);
    }
  }, [workflows]);

  const handleToggle = async (id, currentStatus) => {
    const updated = workflows.map((item) =>
      item.id === id ? { ...item, enabled: !currentStatus } : item
    );
    setWorkflows(updated);
    scheduler.syncActiveWorkflows(updated);
    await toggleWorkflowStatus(id, currentStatus);
  };

  const handleDelete = async (id) => {
    const updated = workflows.filter((item) => item.id !== id);
    setWorkflows(updated);
    scheduler.syncActiveWorkflows(updated);
    await deleteWorkflowFromFirestore(id);
  };

  // Export Workflow to JSON (Clipboard or download)
  const handleExport = (workflow) => {
    const exportData = JSON.stringify(workflow, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(exportData);
      alert(`Exported "${workflow.name}" JSON to clipboard!`);
    } else {
      console.log('Export JSON:', exportData);
      alert(`Workflow JSON printed to console!`);
    }
  };

  // Import Workflow from JSON text
  const handleImport = async () => {
    try {
      const parsed = JSON.parse(importJsonText.trim());
      if (!parsed.name || !Array.isArray(parsed.nodes)) {
        alert('Invalid workflow format. JSON must include "name" and "nodes".');
        return;
      }

      const importedWorkflow = {
        ...parsed,
        id: `wf_${Date.now()}`,
        name: `${parsed.name} (Imported)`,
        enabled: false,
        updatedAt: new Date().toISOString(),
      };

      await saveWorkflowToFirestore(importedWorkflow);
      const refreshed = await fetchWorkflows();
      setWorkflows(refreshed);
      setImportModalVisible(false);
      setImportJsonText('');
      alert(`Successfully imported "${importedWorkflow.name}"!`);
    } catch (err) {
      alert('Failed to parse JSON: ' + err.message);
    }
  };

  // Sorted list derived from active sort setting
  const sortedWorkflows = useMemo(() => {
    const list = [...workflows];
    switch (sortBy) {
      case 'az':
        return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      case 'za':
        return list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      case 'oldest':
        return list.sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
      case 'newest':
      default:
        return list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }
  }, [workflows, sortBy]);

  // pad the last row with invisible spacers so cards keep an equal width in the grid
  const gridData = useMemo(() => {
    const list = [...sortedWorkflows];
    const rem = list.length % cols;
    if (cols > 1 && rem) {
      for (let i = 0; i < cols - rem; i++) list.push({ id: `__spacer_${i}`, spacer: true });
    }
    return list;
  }, [sortedWorkflows, cols]);

  const goBack = () => {
    if (navigation.canGoBack && navigation.canGoBack()) navigation.goBack();
  };

  const padX = isNarrow ? 20 : 28;

  return (
    <View style={s.container}>
      {/* header region with the landing-page purple glow */}
      <View style={s.headerWrap}>
        {Platform.OS === 'web' && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage:
                  'radial-gradient(ellipse 55% 140% at 0% 0%, rgba(88,28,135,0.55), rgba(11,11,12,0) 70%)',
              },
            ]}
          />
        )}

        {/* nav: back + logo + wordmark */}
        <View style={[s.nav, { paddingHorizontal: padX }]}>
          <TouchableOpacity style={s.row} onPress={goBack} activeOpacity={0.7}>
            <BackIcon />
            <View style={{ width: 14 }} />
            <Logo />
            <Text style={s.brand}>FlowAutomate</Text>
          </TouchableOpacity>
        </View>

        {/* title + actions */}
        <View style={[s.titleRow, { paddingHorizontal: padX }, isNarrow && s.titleRowNarrow]}>
          <View>
            <Text style={[s.title, isNarrow && { fontSize: 34 }]}>Automations</Text>
            <View style={[s.row, { marginTop: 8 }]}>
              <View style={s.syncDot} />
              <Text style={s.subtitle}>Firestore Cloud Synced</Text>
            </View>
          </View>

          <View style={s.topBtnRow}>
            <HeaderButton
              onPress={() => setImportModalVisible(true)}
              icon={(fg) => <DownloadIcon color={fg} />}
            >
              Import
            </HeaderButton>
            <HeaderButton onPress={() => navigation.navigate('History')}>Logs</HeaderButton>
            <HeaderButton
              variant="solid"
              onPress={() => navigation.navigate('Editor', { workflow: null })}
            >
              + New
            </HeaderButton>
          </View>
        </View>
      </View>

      {/* sort bar */}
      <View style={[s.filterBar, { paddingHorizontal: padX }]}>
        <Text style={s.filterLabel}>Sort by</Text>
        <SortChip label="Newest" active={sortBy === 'newest'} onPress={() => setSortBy('newest')} />
        <SortChip label="Oldest" active={sortBy === 'oldest'} onPress={() => setSortBy('oldest')} />
        <SortChip label="A → Z" active={sortBy === 'az'} onPress={() => setSortBy('az')} />
        <SortChip label="Z → A" active={sortBy === 'za'} onPress={() => setSortBy('za')} />
      </View>

      {/* content */}
      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={C.purple} />
          <Text style={s.loadingText}>Syncing workflows with cloud...</Text>
        </View>
      ) : (
        <FlatList
          key={`cols-${cols}`}
          showsVerticalScrollIndicator={false}
          data={gridData}
          numColumns={cols}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={cols > 1 ? { gap: 20 } : undefined}
          contentContainerStyle={[s.list, { paddingHorizontal: padX }]}
          ListEmptyComponent={
            <Text style={s.emptyText}>
              No automations yet. Tap "+ New" or "Import" to create one.
            </Text>
          }
          renderItem={({ item }) =>
            item.spacer ? (
              <View style={{ flex: 1, marginBottom: 20 }} />
            ) : (
              <View style={{ flex: 1, marginBottom: 20 }}>
                <WorkflowCard
                  item={item}
                  onOpen={() => navigation.navigate('Editor', { workflow: item })}
                  onToggle={() => handleToggle(item.id, item.enabled)}
                  onDelete={() => handleDelete(item.id)}
                  onExport={() => handleExport(item)}
                />
              </View>
            )
          }
        />
      )}

      {/* import modal */}
      <Modal
        visible={importModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.importBox}>
            <View style={s.importHeader}>
              <Text style={s.importTitle}>Import workflow JSON</Text>
              <TouchableOpacity onPress={() => setImportModalVisible(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={s.jsonInput}
              multiline
              numberOfLines={8}
              placeholder="Paste exported workflow JSON here..."
              placeholderTextColor={C.label}
              value={importJsonText}
              onChangeText={setImportJsonText}
            />

            <View style={s.importActionRow}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setImportModalVisible(false)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <HeaderButton variant="solid" onPress={handleImport}>
                Import & Save
              </HeaderButton>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },

  headerWrap: { position: 'relative', overflow: 'hidden' },
  nav: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  brand: { color: '#fff', fontSize: 28, fontWeight: '500', fontFamily: SANS, marginLeft: 10, letterSpacing: -0.5 },

  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 36,
    paddingBottom: 32,
    gap: 20,
    flexWrap: 'wrap',
  },
  titleRowNarrow: { alignItems: 'flex-start' },
  title: { color: C.text, fontSize: 52, fontWeight: '300', fontFamily: SANS, letterSpacing: -1.5 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok, marginRight: 8 },
  subtitle: { color: C.ok, fontSize: 14, fontFamily: SANS },
  topBtnRow: { flexDirection: 'row', gap: 12 },

  hBtn: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  hBtnText: { fontSize: 16, fontFamily: SANS },

  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  filterLabel: { color: C.label, fontSize: 14, fontFamily: SANS, marginRight: 6 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: C.muted, fontSize: 14, fontFamily: SANS },
  chipTextActive: { color: '#000' },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: C.label, marginTop: 14, fontSize: 15, fontFamily: SANS },
  emptyText: { color: C.label, marginTop: 60, fontSize: 16, textAlign: 'center', fontFamily: SANS },

  list: { paddingTop: 28, paddingBottom: 40, width: '100%', maxWidth: 1480, alignSelf: 'center' },

  /* workflow card (matches the reference cards) */
  card: {
    flex: 1,
    minHeight: 300,
    backgroundColor: C.cardBg,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
  },
  cardTitle: {
    color: C.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '500',
    fontFamily: SANS,
    letterSpacing: -0.5,
    marginTop: 22,
  },
  cardDesc: { color: C.muted, fontSize: 14, lineHeight: 20, fontFamily: SANS, marginTop: 10 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  metaText: { color: C.label, fontSize: 13, fontFamily: SANS },
  statusText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, fontFamily: SANS },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  pill: {
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
    justifyContent: 'center',
  },
  pillText: { color: '#fff', fontSize: 16, fontFamily: SANS },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },

  /* import modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  importBox: {
    backgroundColor: C.bg,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 580,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  importHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  importTitle: { color: C.text, fontSize: 24, fontWeight: '400', fontFamily: SANS, letterSpacing: -0.5 },
  closeBtn: { color: C.muted, fontSize: 18 },
  jsonInput: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: C.lineSoft,
    borderRadius: 12,
    padding: 14,
    color: C.text,
    fontSize: 13,
    fontFamily: Platform.select({ web: 'Menlo, Consolas, monospace', default: 'monospace' }),
    minHeight: 140,
    textAlignVertical: 'top',
  },
  importActionRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 20 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  cancelBtnText: { color: C.muted, fontSize: 16, fontFamily: SANS },
});