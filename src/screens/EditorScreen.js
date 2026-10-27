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

import React, { useState, useRef, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import WorkflowNode from '../components/WorkflowNode';
import NodePicker from '../components/NodePicker';
import { saveWorkflowToFirestore } from '../services/workflowService';


/* ───────────────────────── tokens (shared with the other screens) ───────────────────────── */
const C = {
  bg: '#0B0B0C',
  barBg: '#0B0B0C',
  line: '#232327',
  lineSoft: '#2C2C31',
  cardBorder: '#4A4A50',
  text: '#FFFFFF',
  muted: '#B4B4BC',
  label: '#8C8C94',
  purple: '#A855F7',
  cable: '#8B1FE0',
  hover: '#8000FF',
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

/* ───────────────────────── icons + toolbar button ───────────────────────── */
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

function SaveIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" {...ip}>
      <Path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}

function PlayIcon({ color }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" {...ip}>
      <Path d="M7 5l12 7-12 7z" stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}

// solid = white (purple on hover), ghost = outlined (white on hover)
function ToolbarButton({ onPress, solid, disabled, icon, children }) {
  const [hover, setHover] = useState(false);
  const bg = solid ? (hover ? C.hover : '#fff') : hover ? '#fff' : 'transparent';
  const border = solid ? (hover ? C.hover : '#fff') : '#fff';
  const fg = solid ? (hover ? '#fff' : '#000') : hover ? '#000' : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.tBtn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.6 : 1 }]}
    >
      {icon ? icon(fg) : null}
      <Text style={[styles.tBtnText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 110;
const HORIZONTAL_SPACING = 110;
const VERTICAL_SPACING = 140;
const CANVAS_BASELINE_Y = 400;
const BASE_CANVAS_HEIGHT = 1600;
const BASE_CANVAS_WIDTH = 3400;

const DEFAULT_JS_CODE = `return items.map(user => {
  const digits = (user.phone || '').replace(/\\D/g, '');
  return {
    name: user.name,
    phone: digits.length === 10 ? \`+1\${digits}\` : null,
    status: digits.length === 10 ? 'normalized' : 'invalid'
  };
});`;

const DEFAULT_TRIGGER = [
  {
    id: `node_${Date.now()}`,
    type: 'manual_trigger',
    label: 'Manual Trigger',
    parentId: null,
    targetBranch: null,
    config: {},
  },
];

export default function EditorScreen({ navigation, route }) {
  const incoming = route.params?.workflow;
  const { width: winWidth } = useWindowDimensions();
  const isNarrow = winWidth < 760;

  // Hide the navigator's default header (this screen draws its own)
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [workflowId] = useState(incoming?.id || `wf_${Date.now()}`);
  const [name, setName] = useState(incoming?.name || 'New Custom Automation');
  const [description, setDescription] = useState(
    incoming?.description || 'Custom pipeline description'
  );

  // Normalize nodes with fallback parentIds
  const [nodes, setNodes] = useState(() => {
    const raw = incoming?.nodes || DEFAULT_TRIGGER;
    return raw.map((n, i) => {
      let pId = n.parentId;
      if (pId === undefined && i > 0) {
        if (n.targetBranch) {
          for (let prev = i - 1; prev >= 0; prev--) {
            if (raw[prev].targetBranch === n.targetBranch || raw[prev].type === 'if_condition') {
              pId = raw[prev].id;
              break;
            }
          }
        } else {
          pId = raw[i - 1].id;
        }
      }
      return { ...n, parentId: pId ?? null };
    });
  });

  // Manual custom positions { [nodeId]: { x, y } }
  const [customPositions, setCustomPositions] = useState(incoming?.customPositions || {});
  const [pickerVisible, setPickerVisible] = useState(false);
  const [attachContext, setAttachContext] = useState({ parentId: null, branch: null });
  const [saving, setSaving] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [isDraggingNode, setIsDraggingNode] = useState(false);

  // Refs for zero-latency pointer dragging
  const dragRef = useRef({
    nodeId: null,
    startX: 0,
    startY: 0,
    originNodeX: 0,
    originNodeY: 0,
    hasMoved: false,
  });

  const zoomIn = () => setZoomScale((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 1.6));
  const zoomOut = () => setZoomScale((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.4));
  const resetZoom = () => setZoomScale(1);

  const openPickerForLeaf = (parentId, branch) => {
    setAttachContext({ parentId, branch });
    setPickerVisible(true);
  };

  const handleAddNode = (selected) => {
    let initialConfig = {};

    if (selected.type === 'http_request') {
      initialConfig = { method: 'GET', url: 'https://jsonplaceholder.typicode.com/users' };
    } else if (selected.type === 'if_condition') {
      initialConfig = { operator: '==', compareValue: 'true' };
    } else if (selected.type === 'javascript_code') {
      initialConfig = { code: DEFAULT_JS_CODE };
    } else if (selected.type === 'wait_for_approval') {
      initialConfig = {
        prompt: 'Manager approval required for expense',
        approverEmail: 'manager@company.com',
      };
    } else if (selected.type === 'csv_to_json') {
      initialConfig = {
        csvText: `Client Name, Email, Item, Amount\nWayne Enterprises, bruce@waynecorp.com, Security Suite, 12500.00`,
      };
    } else if (selected.type === 'gmail_send') {
      initialConfig = {
        webhookUrl: '', 
        to: 'test@example.com',
        subject: 'Workflow Alert',
        body: 'Data processed: {{prev.output}}',
        attachData: false,
        fileName: 'workflow_output.json'
      };
    } else if (selected.type === 'inbound_email') {
      initialConfig = {
        webhookUrl: '', 
      };
    }

    const parentId = attachContext.parentId || (nodes.length > 0 ? nodes[nodes.length - 1].id : null);
    const parentNode = nodes.find((n) => n.id === parentId);
    const branch = attachContext.branch || (parentNode?.targetBranch ?? null);

    const newNode = {
      id: `n_${Date.now()}`,
      type: selected.type,
      label: selected.label,
      parentId,
      targetBranch: branch,
      config: initialConfig,
    };

    setNodes((prev) => [...prev, newNode]);
    setAttachContext({ parentId: null, branch: null });
    setPickerVisible(false);
  };

  const handleDeleteNode = (id) => {
    setNodes((prev) => {
      const target = prev.find((n) => n.id === id);
      const fallbackParent = target?.parentId || null;
      return prev
        .filter((node) => node.id !== id)
        .map((node) => (node.parentId === id ? { ...node, parentId: fallbackParent } : node));
    });
    setCustomPositions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const moveNodeUp = (index) => {
    if (index === 0) return;
    const updated = [...nodes];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setNodes(updated);
  };

  const moveNodeDown = (index) => {
    if (index === nodes.length - 1) return;
    const updated = [...nodes];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setNodes(updated);
  };

  const handleToggleBranch = (nodeId) => {
    setNodes((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        let nextBranch = null;
        if (!node.targetBranch) nextBranch = 'true';
        else if (node.targetBranch === 'true') nextBranch = 'false';
        else nextBranch = null;
        return { ...node, targetBranch: nextBranch };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      id: workflowId,
      name,
      description,
      enabled: incoming?.enabled ?? true,
      nodes,
      customPositions,
      updatedAt: new Date().toISOString(),
    };

    await saveWorkflowToFirestore(payload);
    setSaving(false);
    navigation.goBack();
  };

  // -------------------------------------------------------------
  // Coords & Auto-Layout Pipeline
  // -------------------------------------------------------------
  const coordsMap = new Map();
  const placedNodes = [];

  nodes.forEach((node, i) => {
    if (customPositions[node.id]) {
      const pos = { id: node.id, ...customPositions[node.id], parentId: node.parentId };
      coordsMap.set(node.id, pos);
      placedNodes.push(pos);
      return;
    }

    if (i === 0 || !node.parentId || !coordsMap.has(node.parentId)) {
      const pos = { id: node.id, x: 70, y: CANVAS_BASELINE_Y, parentId: null };
      coordsMap.set(node.id, pos);
      placedNodes.push(pos);
      return;
    }

    const parentPos = coordsMap.get(node.parentId);
    const parentNode = nodes.find((n) => n.id === node.parentId);

    let targetX = parentPos.x + NODE_WIDTH + HORIZONTAL_SPACING;
    let targetY = parentPos.y;

    if (parentNode && parentNode.type === 'if_condition') {
      if (node.targetBranch === 'true') {
        targetY = parentPos.y - VERTICAL_SPACING;
      } else if (node.targetBranch === 'false') {
        targetY = parentPos.y + VERTICAL_SPACING;
      }
    }

    let hasCollision = true;
    while (hasCollision) {
      hasCollision = placedNodes.some((p) => {
        const xDist = Math.abs(p.x - targetX);
        const yDist = Math.abs(p.y - targetY);
        return xDist < NODE_WIDTH * 0.9 && yDist < VERTICAL_SPACING * 0.8;
      });

      if (hasCollision) {
        if (node.targetBranch === 'true') {
          targetY -= VERTICAL_SPACING;
        } else {
          targetY += VERTICAL_SPACING;
        }
      }
    }

    const resolvedPos = { id: node.id, x: targetX, y: targetY, parentId: node.parentId };
    coordsMap.set(node.id, resolvedPos);
    placedNodes.push(resolvedPos);
  });

  const nodePositions = nodes.map((node) => coordsMap.get(node.id));

  // Determine Leaves & Port Indicators
  const leafNodes = [];
  nodes.forEach((node) => {
    const pos = coordsMap.get(node.id);
    if (!pos) return;

    if (node.type === 'if_condition') {
      const hasTrue = nodes.some((n) => n.parentId === node.id && n.targetBranch === 'true');
      const hasFalse = nodes.some((n) => n.parentId === node.id && n.targetBranch === 'false');

      if (!hasTrue) {
        leafNodes.push({
          id: `${node.id}_leaf_true`,
          parentId: node.id,
          x: pos.x,
          sourceY: pos.y + 43,
          branch: 'true',
        });
      }
      if (!hasFalse) {
        leafNodes.push({
          id: `${node.id}_leaf_false`,
          parentId: node.id,
          x: pos.x,
          sourceY: pos.y + 73,
          branch: 'false',
        });
      }
    }

    const hasAnyChild = nodes.some((n) => n.parentId === node.id);
    if (!hasAnyChild && node.type !== 'if_condition') {
      leafNodes.push({
        id: `${node.id}_leaf`,
        parentId: node.id,
        x: pos.x,
        sourceY: pos.y + NODE_HEIGHT / 2,
        branch: node.targetBranch || null,
      });
    }
  });

  // -------------------------------------------------------------
  // Reliable Native Web Pointer-Drag Handlers (No Teleportation)
  // -------------------------------------------------------------
  const handlePointerDown = useCallback((e, nodeId) => {
    // Only drag on primary mouse click or touch
    if (e.button !== undefined && e.button !== 0) return;

    // Do not initiate drag if tapping interactive footer buttons
    const targetTag = e.target?.tagName?.toLowerCase();
    if (targetTag === 'button' || targetTag === 'input' || targetTag === 'a') return;

    const currentPos = coordsMap.get(nodeId) || { x: 70, y: CANVAS_BASELINE_Y };

    dragRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      originNodeX: currentPos.x,
      originNodeY: currentPos.y,
      hasMoved: false,
    };

    setIsDraggingNode(true);

    const onPointerMove = (moveEvent) => {
      if (!dragRef.current.nodeId) return;

      const deltaX = (moveEvent.clientX - dragRef.current.startX) / zoomScale;
      const deltaY = (moveEvent.clientY - dragRef.current.startY) / zoomScale;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        dragRef.current.hasMoved = true;
      }

      const nextX = Math.max(20, Math.round(dragRef.current.originNodeX + deltaX));
      const nextY = Math.max(20, Math.round(dragRef.current.originNodeY + deltaY));

      setCustomPositions((prev) => ({
        ...prev,
        [dragRef.current.nodeId]: { x: nextX, y: nextY },
      }));
    };

    const onPointerUp = () => {
      setIsDraggingNode(false);
      dragRef.current.nodeId = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
  }, [coordsMap, zoomScale]);

  const maxNodeX = Math.max(...nodePositions.map((p) => (p ? p.x : 100)), 100);
  const maxNodeY = Math.max(...nodePositions.map((p) => (p ? p.y : CANVAS_BASELINE_Y)), CANVAS_BASELINE_Y);

  const totalCanvasWidth = Math.max(BASE_CANVAS_WIDTH, maxNodeX + NODE_WIDTH + 600);
  const totalCanvasHeight = Math.max(BASE_CANVAS_HEIGHT, maxNodeY + NODE_HEIGHT + 600);

  return (
    <View style={styles.container}>
      {/* Studio Header Bar */}
      <View style={[styles.actionBar, isNarrow && styles.actionBarNarrow]}>
        <View style={styles.leftGroup}>
          <TouchableOpacity style={styles.row} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <BackIcon />
            <View style={{ width: 14 }} />
            <Logo size={26} />
            {!isNarrow && <Text style={styles.brand}>FlowAutomate</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.titleContainer}>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Workflow Name"
              placeholderTextColor={C.label}
            />
            <TextInput
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Description..."
              placeholderTextColor={C.label}
            />
          </View>
        </View>

        <View style={styles.btnRow}>
          {/* Zoom In/Out Toolbar */}
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut}>
              <Text style={styles.zoomBtnText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomReset} onPress={resetZoom}>
              <Text style={styles.zoomResetText}>{Math.round(zoomScale * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn}>
              <Text style={styles.zoomBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <ToolbarButton
            solid
            onPress={handleSave}
            disabled={saving}
            icon={(fg) => <SaveIcon color={fg} />}
          >
            {saving ? 'Saving...' : 'Save'}
          </ToolbarButton>

          <ToolbarButton
            onPress={() => navigation.navigate('Execution', { nodes, workflowName: name })}
            icon={(fg) => <PlayIcon color={fg} />}
          >
            Test
          </ToolbarButton>
        </View>
      </View>

      {/* Infinite Viewport */}
      <ScrollView
        horizontal
        scrollEnabled={!isDraggingNode}
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalScroll}
        contentContainerStyle={{
          width: totalCanvasWidth * zoomScale,
          minHeight: totalCanvasHeight * zoomScale,
        }}
      >
        <ScrollView
          scrollEnabled={!isDraggingNode}
          showsVerticalScrollIndicator={false}
          style={styles.verticalScroll}
          contentContainerStyle={{
            width: totalCanvasWidth * zoomScale,
            minHeight: totalCanvasHeight * zoomScale,
          }}
        >
          {/* Scaled Dot-Matrix Canvas Layer */}
          <View
            style={[
              styles.canvasPlane,
              {
                width: totalCanvasWidth,
                height: totalCanvasHeight,
                transform: [{ scale: zoomScale }],
                transformOrigin: 'top left',
              },
            ]}
          >
            {/* SVG Wire Layer */}
            <Svg width={totalCanvasWidth} height={totalCanvasHeight} style={styles.svgOverlay}>
              {nodePositions.map((pos) => {
                if (!pos || !pos.parentId) return null;
                const parentPos = coordsMap.get(pos.parentId);
                const currentNode = nodes.find((n) => n.id === pos.id);
                const parentNode = nodes.find((n) => n.id === pos.parentId);
                if (!parentPos || !currentNode || !parentNode) return null;

                const startX = parentPos.x + NODE_WIDTH + 7;
                let startY = parentPos.y + NODE_HEIGHT / 2;

                if (parentNode.type === 'if_condition') {
                  if (currentNode.targetBranch === 'true') {
                    startY = parentPos.y + 43;
                  } else if (currentNode.targetBranch === 'false') {
                    startY = parentPos.y + 73;
                  }
                }

                const endX = pos.x - 7;
                const endY = pos.y + NODE_HEIGHT / 2;

                const distanceX = Math.max(Math.abs(endX - startX) * 0.5, 35);
                const pathData = `M ${startX} ${startY} C ${startX + distanceX} ${startY}, ${endX - distanceX} ${endY}, ${endX} ${endY}`;

                const cableColor =
                  currentNode.targetBranch === 'true'
                    ? C.ok
                    : currentNode.targetBranch === 'false'
                    ? C.fail
                    : C.cable;

                return (
                  <React.Fragment key={`cable_${parentNode.id}_${currentNode.id}`}>
                    <Path
                      d={pathData}
                      fill="none"
                      stroke={cableColor}
                      strokeWidth="6"
                      strokeOpacity="0.25"
                    />
                    <Path
                      d={pathData}
                      fill="none"
                      stroke={cableColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </React.Fragment>
                );
              })}

              {/* Guide Lines to Leaf '+' Buttons */}
              {leafNodes.map((leaf) => {
                const startX = leaf.x + NODE_WIDTH + 7;
                const startY = leaf.sourceY;
                const endX = startX + 32;

                return (
                  <Line
                    key={`leaf_line_${leaf.id}`}
                    x1={startX}
                    y1={startY}
                    x2={endX}
                    y2={startY}
                    stroke="#3A3A40"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                );
              })}
            </Svg>

            {/* Draggable Node Cards */}
            {nodes.map((node, index) => {
              const pos = coordsMap.get(node.id) || { x: 70, y: CANVAS_BASELINE_Y };

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => handlePointerDown(e, node.id)}
                  style={{
                    position: 'absolute',
                    left: `${pos.x}px`,
                    top: `${pos.y}px`,
                    width: `${NODE_WIDTH}px`,
                    height: `${NODE_HEIGHT}px`,
                    zIndex: 10,
                    cursor: 'grab',
                    touchAction: 'none',
                    userSelect: 'none',
                  }}
                >
                  <WorkflowNode
                    node={node}
                    index={index}
                    totalNodes={nodes.length}
                    onConfigure={(selectedNode) => {
                      if (!dragRef.current.hasMoved) {
                        navigation.navigate('NodeConfig', {
                          node: selectedNode,
                          onSave: (updatedNode) => {
                            setNodes((prev) =>
                              prev.map((n) =>
                                n.id === updatedNode.id
                                  ? {
                                      ...n,
                                      ...updatedNode,
                                      config: {
                                        ...(n.config || {}),
                                        ...(updatedNode.config || {}),
                                      },
                                    }
                                  : n
                              )
                            );
                          },
                        });
                      }
                    }}
                    onDelete={handleDeleteNode}
                    onMoveUp={() => moveNodeUp(index)}
                    onMoveDown={() => moveNodeDown(index)}
                    onToggleBranch={handleToggleBranch}
                  />
                </div>
              );
            })}

            {/* '+' Buttons Anchored to Leaves */}
            {leafNodes.map((leaf) => {
              const buttonX = leaf.x + NODE_WIDTH + 40;
              const buttonY = leaf.sourceY - 16;

              return (
                <TouchableOpacity
                  key={`add_btn_${leaf.id}`}
                  activeOpacity={0.8}
                  style={[
                    styles.addStepHandle,
                    {
                      left: buttonX,
                      top: buttonY,
                    },
                  ]}
                  onPress={() => openPickerForLeaf(leaf.parentId, leaf.branch)}
                >
                  <Text style={styles.addStepHandlePlus}>+</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>

      <NodePicker
        visible={pickerVisible}
        onClose={() => {
          setPickerVisible(false);
          setAttachContext({ parentId: null, branch: null });
        }}
        onSelectNode={handleAddNode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },

  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 84,
    backgroundColor: C.barBg,
    borderBottomWidth: 1,
    borderColor: C.line,
    zIndex: 100,
    gap: 16,
  },
  actionBarNarrow: { flexWrap: 'wrap', paddingHorizontal: 16 },
  leftGroup: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 260 },
  brand: { color: '#fff', fontSize: 24, fontWeight: '500', fontFamily: SANS, marginLeft: 10, letterSpacing: -0.5 },
  divider: { width: 1, height: 40, backgroundColor: C.line, marginHorizontal: 22 },
  titleContainer: { flex: 1 },
  nameInput: {
    color: C.text,
    fontSize: 22,
    fontWeight: '300',
    fontFamily: SANS,
    letterSpacing: -0.5,
    padding: 0,
    marginBottom: 3,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  descInput: {
    color: C.label,
    fontSize: 13,
    fontFamily: SANS,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },

  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  zoomBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  zoomBtnText: { color: C.muted, fontSize: 18, fontFamily: SANS },
  zoomReset: {
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: C.cardBorder,
  },
  zoomResetText: { color: C.text, fontSize: 12, fontFamily: MONO, minWidth: 34, textAlign: 'center' },

  tBtn: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  tBtnText: { fontSize: 16, fontFamily: SANS },

  horizontalScroll: { flex: 1 },
  verticalScroll: { flex: 1 },
  canvasPlane: {
    position: 'relative',
    backgroundColor: C.bg,
    backgroundImage: 'radial-gradient(#2A2A2F 1.5px, transparent 1.5px)',
    backgroundSize: '24px 24px',
  },
  svgOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
    pointerEvents: 'none',
  },
  addStepHandle: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    borderWidth: 1.5,
    borderColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.purple,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 15,
  },
  addStepHandlePlus: { color: C.purple, fontSize: 18, lineHeight: 20, fontWeight: 'bold' },
});