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

import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { fetchExecutionLogs } from '../services/workflowService';

/* ───────────────────────── tokens (shared with Landing/Home) ───────────────────────── */
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
  ok: '#3ECF9E',
  fail: '#F87171',
  code: '#A7F3D0',
};
const SANS = Platform.select({
  web: 'Inter, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});
const MONO = Platform.select({
  web: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
  default: 'monospace',
});

/* ───────────────────────── icons ───────────────────────── */
const ip = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

function Logo({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path d="M6 20 C6 10 14 18 22 8" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
      <Circle cx={6} cy={20} r={4} fill="#fff" />
      <Circle cx={22} cy={8} r={4} fill="#fff" />
    </Svg>
  );
}

function BackIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" {...ip}>
      <Path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

function StatusIcon({ ok, size = 24 }) {
  const color = ok ? C.ok : C.fail;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...ip}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.8} />
      {ok ? (
        <Path d="M8 12.5l2.8 2.8L16 9.5" stroke={color} strokeWidth={1.8} />
      ) : (
        <Path d="M9 9l6 6M15 9l-6 6" stroke={color} strokeWidth={1.8} />
      )}
    </Svg>
  );
}

/* ───────────────────────── small UI pieces ───────────────────────── */
function HeaderButton({ onPress, children }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[s.hBtn, { backgroundColor: hover ? '#fff' : 'transparent' }]}
    >
      <Text style={[s.hBtnText, { color: hover ? '#000' : '#fff' }]}>{children}</Text>
    </Pressable>
  );
}

function FilterChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatusBadge({ ok, label }) {
  const color = ok ? C.ok : C.fail;
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function RunCard({ item, onOpen }) {
  const [hover, setHover] = useState(false);
  const ok = item.status === 'success';

  return (
    <Pressable
      onPress={onOpen}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[s.card, { borderColor: hover ? C.cardBorderHover : C.cardBorder }]}
    >
      <StatusIcon ok={ok} />

      <Text style={s.cardTitle} numberOfLines={3}>
        {item.workflowName}
      </Text>
      <Text style={s.cardTime}>{item.timestamp}</Text>

      <View style={{ flex: 1, minHeight: 24 }} />

      <View style={s.metaRow}>
        <Text style={s.metaText}>{item.stepsCount} steps evaluated</Text>
        <Text style={[s.statusText, { color: ok ? C.ok : C.fail }]}>{ok ? 'SUCCESS' : 'FAILED'}</Text>
      </View>

      <View style={[s.pill, hover && { backgroundColor: '#fff', borderColor: '#fff' }]}>
        <Text style={[s.pillText, hover && { color: '#000' }]}>View payloads</Text>
      </View>
    </Pressable>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function HistoryScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const cols = width >= 1400 ? 4 : width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  const isNarrow = width < 640;
  const padX = isNarrow ? 20 : 28;

  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' | 'success' | 'failed'

  // Hide the navigator's default header (this screen draws its own)
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    async function loadLogs() {
      setLoading(true);
      const data = await fetchExecutionLogs();
      setHistory(data);
      setLoading(false);
    }
    loadLogs();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'success') return history.filter((h) => h.status === 'success');
    if (filter === 'failed') return history.filter((h) => h.status !== 'success');
    return history;
  }, [history, filter]);

  // pad the last row with invisible spacers so cards keep an equal width in the grid
  const gridData = useMemo(() => {
    const list = [...filtered];
    const rem = list.length % cols;
    if (cols > 1 && rem) {
      for (let i = 0; i < cols - rem; i++) list.push({ id: `__spacer_${i}`, spacer: true });
    }
    return list;
  }, [filtered, cols]);

  const goBack = () => {
    if (navigation.canGoBack && navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Home');
  };

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

        <View style={[s.nav, { paddingHorizontal: padX }]}>
          <TouchableOpacity style={s.row} onPress={goBack} activeOpacity={0.7}>
            <BackIcon />
            <View style={{ width: 14 }} />
            <Logo />
            <Text style={s.brand}>FlowAutomate</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.titleRow, { paddingHorizontal: padX }, isNarrow && { alignItems: 'flex-start' }]}>
          <View>
            <Text style={[s.title, isNarrow && { fontSize: 34 }]}>Execution History</Text>
            <View style={[s.row, { marginTop: 8 }]}>
              <View style={s.syncDot} />
              <Text style={s.subtitle}>
                {loading ? 'Fetching cloud logs...' : `${history.length} cloud runs recorded`}
              </Text>
            </View>
          </View>

          <HeaderButton onPress={() => navigation.navigate('Home')}>Dashboard</HeaderButton>
        </View>
      </View>

      {/* filter bar */}
      <View style={[s.filterBar, { paddingHorizontal: padX }]}>
        <Text style={s.filterLabel}>Show</Text>
        <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip label="Success" active={filter === 'success'} onPress={() => setFilter('success')} />
        <FilterChip label="Failed" active={filter === 'failed'} onPress={() => setFilter('failed')} />
      </View>

      {/* content */}
      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={C.purple} />
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
              {history.length === 0
                ? 'No executions logged yet. Run a workflow to see logs.'
                : 'No runs match this filter.'}
            </Text>
          }
          renderItem={({ item }) =>
            item.spacer ? (
              <View style={{ flex: 1, marginBottom: 20 }} />
            ) : (
              <View style={{ flex: 1, marginBottom: 20 }}>
                <RunCard item={item} onOpen={() => setSelectedRun(item)} />
              </View>
            )
          }
        />
      )}

      {/* payload details modal */}
      <Modal
        visible={!!selectedRun}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedRun(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.modalTitle}>{selectedRun?.workflowName}</Text>
                <Text style={s.modalSubtitle}>
                  Run ID: {selectedRun?.id} • {selectedRun?.timestamp}
                </Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedRun(null)}>
                <Text style={s.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.modalLogsList} showsVerticalScrollIndicator={false}>
              {selectedRun?.logs && selectedRun.logs.length > 0 ? (
                selectedRun.logs.map((step, idx) => {
                  const stepOk = step.status === 'success';
                  return (
                    <View key={step.nodeId || idx} style={s.stepCard}>
                      <View style={s.stepHeader}>
                        <Text style={s.stepIndex}>#{idx + 1}</Text>
                        <Text style={s.stepLabel}>{step.nodeLabel || step.nodeId}</Text>
                        <StatusBadge ok={stepOk} label={step.status?.toUpperCase()} />
                      </View>

                      {step.error && (
                        <View style={s.errorBox}>
                          <Text style={s.errorText}>Error: {step.error}</Text>
                        </View>
                      )}

                      {step.output !== undefined && (
                        <View style={s.payloadBox}>
                          <Text style={s.payloadLabel}>OUTPUT PAYLOAD</Text>
                          <Text style={s.payloadJson}>
                            {typeof step.output === 'object'
                              ? JSON.stringify(step.output, null, 2)
                              : String(step.output)}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              ) : (
                <Text style={s.emptyText}>No granular step logs recorded for this run.</Text>
              )}
            </ScrollView>
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
  title: { color: C.text, fontSize: 52, fontWeight: '300', fontFamily: SANS, letterSpacing: -1.5 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok, marginRight: 8 },
  subtitle: { color: C.ok, fontSize: 14, fontFamily: SANS },

  hBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#fff',
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
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.cardBorder },
  chipActive: { backgroundColor: '#fff', borderColor: '#fff' },
  chipText: { color: C.muted, fontSize: 14, fontFamily: SANS },
  chipTextActive: { color: '#000' },

  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: C.label, marginTop: 60, fontSize: 16, textAlign: 'center', fontFamily: SANS },

  list: { paddingTop: 28, paddingBottom: 40, width: '100%', maxWidth: 1480, alignSelf: 'center' },

  /* run card */
  card: {
    flex: 1,
    minHeight: 280,
    backgroundColor: C.cardBg,
    borderRadius: 28,
    borderWidth: 1,
    padding: 28,
  },
  cardTitle: {
    color: C.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '500',
    fontFamily: SANS,
    letterSpacing: -0.5,
    marginTop: 22,
  },
  cardTime: { color: C.label, fontSize: 13, fontFamily: SANS, marginTop: 8 },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  metaText: { color: C.label, fontSize: 13, fontFamily: SANS },
  statusText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, fontFamily: SANS },

  pill: {
    alignSelf: 'flex-start',
    height: 46,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.cardBg,
    justifyContent: 'center',
  },
  pillText: { color: '#fff', fontSize: 16, fontFamily: SANS },

  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, fontFamily: SANS },

  /* modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: {
    backgroundColor: C.bg,
    borderRadius: 24,
    width: '100%',
    maxWidth: 680,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  modalTitle: { color: C.text, fontSize: 24, fontWeight: '400', fontFamily: SANS, letterSpacing: -0.5 },
  modalSubtitle: { color: C.label, fontSize: 13, marginTop: 4, fontFamily: SANS },
  closeBtn: { padding: 6 },
  closeBtnText: { color: C.muted, fontSize: 18 },
  modalLogsList: { padding: 20 },

  stepCard: {
    backgroundColor: C.cardBg,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepIndex: { color: C.label, fontSize: 13, fontFamily: MONO },
  stepLabel: { color: C.text, fontSize: 16, fontWeight: '500', fontFamily: SANS, flex: 1 },

  payloadBox: {
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    marginTop: 12,
  },
  payloadLabel: { color: C.label, fontSize: 10, letterSpacing: 1, fontFamily: MONO, marginBottom: 6 },
  payloadJson: { color: C.code, fontFamily: MONO, fontSize: 12, lineHeight: 18 },

  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
  },
  errorText: { color: C.fail, fontSize: 13, fontFamily: SANS },
});