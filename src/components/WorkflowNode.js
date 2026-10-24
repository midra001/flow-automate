// src/components/WorkflowNode.js
// Restyled to match the FlowAutomate screens: black rounded node card with a hover
// border, SVG icons instead of emoji, outlined mini action buttons, outlined branch pill.
// Geometry is unchanged (220x120 wrapper, 110px card, port offsets) so the cables and
// "+" handles drawn by EditorScreen still line up exactly.
// Props are unchanged: node, index, totalNodes, onConfigure, onDelete, onMoveUp,
// onMoveDown, onToggleBranch.
// Requires: react-native-svg

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import Svg, { Path, Circle, Ellipse, Rect, Line } from 'react-native-svg';

const C = {
  cardBg: '#000000',
  nodeBg: '#1A1A1F', // lifted from pure black so nodes stand out on the canvas
  line: '#2F2F36',
  lineSoft: '#3A3A42',
  cardBorder: '#5C5C66',
  cardBorderHover: '#A0A0AA',
  text: '#FFFFFF',
  muted: '#B4B4BC',
  label: '#A0A0AA',
  port: '#8B1FE0',
  ok: '#3ECF9E',
  fail: '#F87171',
};
const SANS = Platform.select({
  web: 'Inter, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});
const MONO = Platform.select({
  web: '"SF Mono", Menlo, Consolas, "Courier New", monospace',
  default: 'monospace',
});

// icon = key into <NodeIcon />, color = accent used on the icon tile
const NODE_THEMES = {
  manual_trigger: { color: '#F59E0B', icon: 'bolt', category: 'Trigger' },
  timer_trigger: { color: '#F59E0B', icon: 'clock', category: 'Schedule' },
  csv_to_json: { color: '#06B6D4', icon: 'file', category: 'Data Parser' },
  loop_invoice_generator: { color: '#8B5CF6', icon: 'loop', category: 'Iterator' },
  javascript_code: { color: '#EC4899', icon: 'code', category: 'Code / Script' },
  wait_for_approval: { color: '#EAB308', icon: 'person', category: 'HITL Gate' },
  battery_sensor: { color: '#10B981', icon: 'battery', category: 'Device Sensor' },
  network_status: { color: '#3B82F6', icon: 'wifi', category: 'Network' },
  device_info: { color: '#6366F1', icon: 'device', category: 'Device' },
  local_storage: { color: '#14B8A6', icon: 'storage', category: 'Storage' },
  set_data: { color: '#94A3B8', icon: 'box', category: 'Set Data' },
  http_request: { color: '#3B82F6', icon: 'globe', category: 'REST API' },
  json_transform: { color: '#8B5CF6', icon: 'search', category: 'Extract' },
  if_condition: { color: '#10B981', icon: 'branch', category: 'Conditional' },
  notification: { color: '#F43F5E', icon: 'bell', category: 'Alert' },
  // not themed in the original, added so they don't fall back to the generic gear
  gmail_send: { color: '#F43F5E', icon: 'mail', category: 'Email' },
  inbound_email: { color: '#06B6D4', icon: 'inbox', category: 'Email Listener' },
};
const DEFAULT_THEME = { color: '#94A3B8', icon: 'gear', category: 'Action' };

/* ───────────────────────── icons ───────────────────────── */
function NodeIcon({ name, color, size = 20 }) {
  const p = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'bolt' && <Path d="M13 3L5 14h6l-1 7 8-11h-6z" {...p} />}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Path d="M12 7v5l3 2" {...p} />
        </>
      )}
      {name === 'file' && <Path d="M7 3h7l4 4v14H7zM14 3v4h4M10 13h5M10 17h5" {...p} />}
      {name === 'loop' && <Path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5" {...p} />}
      {name === 'code' && <Path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12" {...p} />}
      {name === 'person' && (
        <>
          <Circle cx={12} cy={8} r={4} {...p} />
          <Path d="M4 20c0-4 4-6 8-6s8 2 8 6" {...p} />
        </>
      )}
      {name === 'battery' && (
        <>
          <Rect x={3} y={8} width={16} height={8} rx={2} {...p} />
          <Path d="M21 11v2M6 11v2" {...p} />
        </>
      )}
      {name === 'wifi' && (
        <>
          <Path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0" {...p} />
          <Circle cx={12} cy={19} r={1} {...p} />
        </>
      )}
      {name === 'device' && (
        <>
          <Rect x={7} y={3} width={10} height={18} rx={2} {...p} />
          <Path d="M11 18h2" {...p} />
        </>
      )}
      {name === 'storage' && (
        <>
          <Ellipse cx={12} cy={6} rx={7} ry={3} {...p} />
          <Path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" {...p} />
        </>
      )}
      {name === 'box' && <Path d="M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8" {...p} />}
      {name === 'globe' && (
        <>
          <Circle cx={12} cy={12} r={9} {...p} />
          <Ellipse cx={12} cy={12} rx={4} ry={9} {...p} />
          <Line x1={3} y1={12} x2={21} y2={12} {...p} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={6} {...p} />
          <Path d="M20 20l-4-4" {...p} />
        </>
      )}
      {name === 'branch' && <Path d="M5 5v14M5 12h6a4 4 0 0 1 4 4v3M5 12h6a4 4 0 0 0 4-4V5" {...p} />}
      {name === 'bell' && <Path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" {...p} />}
      {name === 'mail' && (
        <>
          <Rect x={3} y={5} width={18} height={14} rx={2} {...p} />
          <Path d="M3 7l9 6 9-6" {...p} />
        </>
      )}
      {name === 'inbox' && <Path d="M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5" {...p} />}
      {name === 'gear' && (
        <>
          <Circle cx={12} cy={12} r={3} {...p} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3" {...p} />
        </>
      )}
    </Svg>
  );
}

function MiniIcon({ name, color }) {
  const p = { stroke: color, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      {name === 'left' && <Path d="M15 6l-6 6 6 6" {...p} />}
      {name === 'right' && <Path d="M9 6l6 6-6 6" {...p} />}
      {name === 'branch' && <Path d="M5 5v14M5 12h6a4 4 0 0 1 4 4v3M5 12h6a4 4 0 0 0 4-4V5" {...p} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...p} />}
    </Svg>
  );
}

/* ───────────────────────── mini action button ───────────────────────── */
function MiniBtn({ icon, onPress, danger }) {
  const [hover, setHover] = useState(false);
  const hoverBorder = danger ? C.fail : '#fff';
  const color = hover ? (danger ? C.fail : '#fff') : C.label;
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.miniBtn, hover && { borderColor: hoverBorder }]}
    >
      <MiniIcon name={icon} color={color} />
    </Pressable>
  );
}

/* ───────────────────────── node ───────────────────────── */
export default function WorkflowNode({
  node,
  index,
  totalNodes,
  onConfigure,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleBranch,
}) {
  const [hover, setHover] = useState(false);
  const theme = NODE_THEMES[node.type] || DEFAULT_THEME;
  const isIf = node.type === 'if_condition';
  const isTrigger = index === 0 || node.type.includes('trigger');

  const branchColor = node.targetBranch === 'true' ? C.ok : C.fail;
  const cardBorder = node.targetBranch
    ? branchColor
    : hover
    ? C.cardBorderHover
    : C.cardBorder;

  return (
    <View style={styles.nodeWrapper}>
      {/* Input Port (Left) */}
      {!isTrigger && (
        <View style={styles.portLeft}>
          <View style={styles.portCircle} />
        </View>
      )}

      {/* Main Node Card */}
      <Pressable
        style={[styles.nodeCard, { borderColor: cardBorder }]}
        onPress={() => onConfigure(node)}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
      >
        {/* Branch Route Badge */}
        {node.targetBranch && (
          <View style={[styles.branchPill, { borderColor: branchColor }]}>
            <Text style={[styles.branchPillText, { color: branchColor }]}>
              BRANCH: {node.targetBranch.toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: `${theme.color}26`, borderColor: `${theme.color}77` },
            ]}
          >
            <NodeIcon name={theme.icon} color={theme.color} />
          </View>
          <View style={styles.textDetails}>
            <Text style={styles.categoryText}>{theme.category}</Text>
            <Text style={styles.nodeLabel} numberOfLines={1}>
              {node.label}
            </Text>
          </View>
        </View>

        {/* Node Bottom Action Bar */}
        <View style={styles.footerRow}>
          <Text style={styles.stepNum}>#{index + 1}</Text>
          <View style={styles.actionBtns}>
            {index > 0 && <MiniBtn icon="left" onPress={onMoveUp} />}
            {index < totalNodes - 1 && <MiniBtn icon="right" onPress={onMoveDown} />}
            <MiniBtn icon="branch" onPress={() => onToggleBranch(node.id)} />
            <MiniBtn icon="close" danger onPress={() => onDelete(node.id)} />
          </View>
        </View>
      </Pressable>

      {/* Output Port(s) (Right) */}
      {isIf ? (
        <View style={styles.dualPortsRight}>
          <View style={[styles.portCircle, { borderColor: C.ok }]} />
          <View style={[styles.portCircle, { borderColor: C.fail }]} />
        </View>
      ) : (
        <View style={styles.portRight}>
          <View style={styles.portCircle} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // geometry below is intentionally identical to the original
  nodeWrapper: {
    width: 220,
    height: 120,
    position: 'relative',
    justifyContent: 'center',
  },
  nodeCard: {
    backgroundColor: C.nodeBg,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 110,
    justifyContent: 'space-between',
  },
  branchPill: {
    position: 'absolute',
    top: -9,
    right: 14,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#111114',
  },
  branchPillText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
    fontFamily: MONO,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textDetails: { flex: 1 },
  categoryText: {
    color: C.label,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: MONO,
  },
  nodeLabel: {
    color: C.text,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: SANS,
    marginTop: 3,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
  },
  stepNum: { color: C.label, fontSize: 11, fontFamily: MONO },
  actionBtns: { flexDirection: 'row', gap: 4 },
  miniBtn: {
    width: 24,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portLeft: { position: 'absolute', left: -7, top: 53, zIndex: 10 },
  portRight: { position: 'absolute', right: -7, top: 53, zIndex: 10 },
  dualPortsRight: { position: 'absolute', right: -7, top: 36, zIndex: 10, gap: 16 },
  portCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.nodeBg,
    borderWidth: 2,
    borderColor: C.port,
  },
});