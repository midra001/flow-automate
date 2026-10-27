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

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { runWorkflow } from '../engine/WorkflowEngine';

/* ───────────────────────── tokens (shared with the other screens) ───────────────────────── */
const C = {
  bg: '#0B0B0C',
  cardBg: '#000000',
  line: '#232327',
  lineSoft: '#2C2C31',
  cardBorder: '#4A4A50',
  text: '#FFFFFF',
  muted: '#B4B4BC',
  label: '#8C8C94',
  purple: '#A855F7',
  ok: '#3ECF9E',
  fail: '#F87171',
  wait: '#FBBF24',
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

// How the step cards are revealed (milliseconds). Tweak these to speed up / slow down the sequence.
const STEP_MS = 650;     // how long each step shows its loading state
const STEP_JITTER = 450; // random extra time per step, so it feels like real work
const SKIP_MS = 220;     // skipped steps resolve quickly
const GAP_MS = 140;      // pause between one card finishing and the next appearing

const USE_NATIVE = Platform.OS !== 'web';

const STATUS_COLOR = {
  success: C.ok,
  waiting: C.wait,
  failed: C.fail,
  skipped: C.label,
};

/* ───────────────────────── small pieces ───────────────────────── */
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
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5l-7 7 7 7" stroke="#fff" strokeWidth={2} />
    </Svg>
  );
}

function PauseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} stroke={C.wait} strokeWidth={1.8} />
      <Path d="M10 9v6M14 9v6" stroke={C.wait} strokeWidth={1.8} />
    </Svg>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || C.label;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{String(status).toUpperCase()}</Text>
    </View>
  );
}

/* ───────────────────────── loading + reveal pieces ───────────────────────── */
// fade + slide-up when it mounts
function FadeIn({ style, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function Spinner({ size = 18 }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: USE_NATIVE })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  return (
    <Animated.View
      style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={9} stroke={C.lineSoft} strokeWidth={2.4} />
        <Path d="M12 3a9 9 0 0 1 9 9" stroke={C.purple} strokeWidth={2.4} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// pulsing grey bar that stands in for the output while a step "runs"
function SkeletonLine({ width, delay = 0 }) {
  const pulse = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.7, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE }),
          Animated.timing(pulse, { toValue: 0.25, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE }),
        ])
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [pulse, delay]);
  return <Animated.View style={[styles.skel, { width, opacity: pulse }]} />;
}

function RunningBadge() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: USE_NATIVE }),
        Animated.timing(pulse, { toValue: 0.35, duration: 520, useNativeDriver: USE_NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[styles.badge, styles.runningBadge]}>
      <Animated.View style={[styles.runDot, { opacity: pulse }]} />
      <Text style={[styles.badgeText, { color: C.wait }]}>RUNNING</Text>
    </View>
  );
}

// One step card. While `loading` it shows a spinner + shimmering lines;
// when loading flips to false the real status badge and output fade in.
function StepCard({ log, index, loading, placeholder }) {
  const reveal = useRef(new Animated.Value(loading ? 0 : 1)).current;
  const wasLoading = useRef(loading);

  useEffect(() => {
    if (wasLoading.current && !loading) {
      reveal.setValue(0);
      Animated.timing(reveal, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE }).start();
    }
    wasLoading.current = loading;
  }, [loading, reveal]);

  return (
    <FadeIn style={[styles.card, loading && styles.cardLoading]}>
      <View style={styles.cardHeader}>
        <View style={[styles.row, { flex: 1, paddingRight: 12 }]}>
          {!placeholder && <Text style={styles.nodeIndex}>#{index + 1}</Text>}
          <Text style={styles.nodeTitle}>{log.nodeLabel}</Text>
        </View>
        {loading ? (
          <RunningBadge />
        ) : (
          <Animated.View style={{ opacity: reveal }}>
            <StatusBadge status={log.status} />
          </Animated.View>
        )}
      </View>

      {/* Inner Scrollable Output Box */}
      <View style={styles.outputBox}>
        <View style={styles.outputTop}>
          <Text style={[styles.outputHeader, { marginBottom: 0 }]}>OUTPUT</Text>
          {loading ? <Spinner size={16} /> : null}
        </View>

        {loading ? (
          <View style={{ gap: 8, paddingTop: 4, paddingBottom: 2 }}>
            <SkeletonLine width="88%" />
            <SkeletonLine width="64%" delay={120} />
            <SkeletonLine width="42%" delay={240} />
          </View>
        ) : (
          <Animated.View style={{ opacity: reveal }}>
            <ScrollView style={styles.outputScroll} nestedScrollEnabled={true} showsVerticalScrollIndicator={false}>
              <Text style={styles.outputContent} selectable={true}>
                {log.status === 'failed' && log.error ? String(log.error) : (typeof log.output === 'object' ? JSON.stringify(log.output, null, 2) : String(log.output))}
              </Text>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </FadeIn>
  );
}

// variants: ghost (outlined, white on hover), approve (mint), deny (red outline)
function Btn({ variant = 'ghost', onPress, disabled, children, style }) {
  const [hover, setHover] = useState(false);
  let bg = 'transparent';
  let border = '#fff';
  let fg = '#fff';
  if (variant === 'ghost' && hover) { bg = '#fff'; fg = '#000'; }
  if (variant === 'approve') { bg = hover ? '#fff' : C.ok; border = bg; fg = '#000'; }
  if (variant === 'deny') {
    border = C.fail; fg = C.fail;
    if (hover) { bg = C.fail; fg = '#000'; }
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Text style={[styles.btnText, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function ExecutionScreen({ route, navigation }) {
  const { width } = useWindowDimensions();
  const padX = width < 640 ? 20 : 28;

  // Hide the navigator's default header (this screen draws its own)
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const { nodes, workflowName } = route.params;
  const [logs, setLogs] = useState([]);
  const [suspensionState, setSuspensionState] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [liveMessage, setLiveMessage] = useState('Preparing workflow...');

  // reveal state: how many cards are on screen, and how many of those have finished "running"
  const [visibleCount, setVisibleCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const doneRef = useRef(0);
  const scrollRef = useRef(null);

  const startWorkflow = async () => {
    setIsRunning(true);
    setLiveMessage('Preparing workflow...');
    setLogs([]);
    setSuspensionState(null);

    const result = await runWorkflow(nodes, (nodeId, status, output) => {
      if (status === 'running') {
        const label = nodes.find(item => item.id === nodeId)?.label || 'workflow step';
        setLiveMessage(output?.message || ('Running ' + label + '...'));
      }
    });

    if (result.status === 'suspended') {
      setLogs(result.snapshot.logs);
      setSuspensionState(result.snapshot);
    } else {
      setLogs(result.logs);
    }
    setIsRunning(false);
  };

  const handleResumeDecision = async (decision) => {
    if (!suspensionState) return;
    setIsRunning(true);

    const resumeContext = {
      ...suspensionState,
      resumeIndex: suspensionState.resumeIndex + 1,
      decisionPayload: {
        decision,
        decidedAt: new Date().toLocaleTimeString(),
        approver: 'manager@company.com',
      },
    };

    resumeContext.logs = resumeContext.logs.map((log) =>
      log.status === 'waiting'
        ? { ...log, status: 'success', output: resumeContext.decisionPayload }
        : log
    );

    const stepNumber = suspensionState.resumeIndex + 1;
    resumeContext.stepOutputs[stepNumber] = resumeContext.decisionPayload;
    resumeContext.previousOutput = resumeContext.decisionPayload;

    setSuspensionState(null);

    const result = await runWorkflow(nodes, null, resumeContext);
    setLogs(result.logs);
    setIsRunning(false);
  };

  useEffect(() => {
    startWorkflow();
  }, []);

  // Reveal the logs one card at a time. A fresh run (logs cleared) starts from zero;
  // after an approval the list grows, so we carry on from where we left off.
  useEffect(() => {
    if (logs.length === 0) {
      doneRef.current = 0;
      setVisibleCount(0);
      setDoneCount(0);
      return undefined;
    }
    let cancelled = false;
    const timers = [];
    const sleep = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)));

    (async () => {
      for (let i = doneRef.current; i < logs.length; i++) {
        if (cancelled) return;
        setVisibleCount(i + 1); // card slides in, in its loading state
        await sleep(logs[i].status === 'skipped' ? SKIP_MS : STEP_MS + Math.random() * STEP_JITTER);
        if (cancelled) return;
        doneRef.current = i + 1;
        setDoneCount(i + 1); // card resolves to its real status + output
        await sleep(GAP_MS);
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [logs]);

  const isRevealing = logs.length > 0 && doneCount < logs.length;
  const busy = isRunning || isRevealing;
  const showApproval = !!suspensionState && !isRevealing;

  // keep the newest card in view as the list grows
  useEffect(() => {
    if (visibleCount === 0 && !showApproval) return undefined;
    const t = setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 140);
    return () => clearTimeout(t);
  }, [visibleCount, showApproval]);

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* header region with the landing-page purple glow */}
        <View style={styles.headerWrap}>
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

          <View style={[styles.nav, { paddingHorizontal: padX }]}>
            <TouchableOpacity style={styles.row} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <BackIcon />
              <View style={{ width: 14 }} />
              <Logo />
              <Text style={styles.brand}>FlowAutomate</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.titleRow, { paddingHorizontal: padX }]}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.eyebrow}>TEST RUN</Text>
              <Text style={[styles.title, width < 640 && { fontSize: 32 }]}>{workflowName}</Text>
              <View style={[styles.row, { marginTop: 10 }]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: busy || suspensionState ? C.wait : C.ok },
                  ]}
                />
                <Text style={[styles.subtitle, { color: busy || suspensionState ? C.wait : C.ok }]}>
                  {isRevealing
                    ? `Running step ${Math.min(doneCount + 1, logs.length)} of ${logs.length}...`
                    : isRunning
                    ? liveMessage
                    : suspensionState
                    ? 'Paused, awaiting decision'
                    : `${logs.length} ${logs.length === 1 ? 'step' : 'steps'} completed`}
                </Text>
              </View>
            </View>

            <Btn onPress={startWorkflow} disabled={busy}>
              Run again
            </Btn>
          </View>
        </View>

        <View style={[styles.centeredWrapper, { paddingHorizontal: padX }]}>
          {/* while the engine is working and nothing has come back yet */}
          {isRunning && logs.length === 0 && (
            <StepCard key="placeholder" placeholder loading log={{ nodeLabel: liveMessage }} />
          )}

          {/* cards appear one after another */}
          {logs.slice(0, visibleCount).map((log, index) => (
            <StepCard key={log.nodeId + index} log={log} index={index} loading={index >= doneCount} />
          ))}

          {/* Human-in-the-Loop Decision Prompt */}
          {showApproval && (
            <FadeIn style={styles.approvalBox}>
              <View style={styles.row}>
                <PauseIcon />
                <Text style={styles.approvalTitle}>Workflow paused: awaiting decision</Text>
              </View>
              <Text style={styles.approvalDesc}>
                A manager decision is required before subsequent actions continue.
              </Text>
              <View style={styles.buttonRow}>
                <Btn variant="approve" style={{ flex: 1 }} onPress={() => handleResumeDecision('approved')} disabled={isRunning}>
                  Approve expense
                </Btn>
                <Btn variant="deny" style={{ flex: 1 }} onPress={() => handleResumeDecision('denied')} disabled={isRunning}>
                  Deny
                </Btn>
              </View>
            </FadeIn>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 60 },
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
  eyebrow: { color: C.purple, fontSize: 12, letterSpacing: 1.4, fontFamily: MONO, marginBottom: 10 },
  title: { color: C.text, fontSize: 48, fontWeight: '300', fontFamily: SANS, letterSpacing: -1.5 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  subtitle: { fontSize: 14, fontFamily: SANS },

  centeredWrapper: { width: '100%', maxWidth: 860, paddingTop: 28 },

  card: {
    backgroundColor: C.cardBg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 24,
    marginBottom: 16,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  nodeIndex: { color: C.label, fontSize: 14, fontFamily: MONO, marginRight: 12 },
  nodeTitle: { color: C.text, fontSize: 22, fontWeight: '500', fontFamily: SANS, letterSpacing: -0.4, flexShrink: 1 },

  cardLoading: { borderColor: '#6D1CC4' },

  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  runningBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: C.wait },
  runDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.wait },
  badgeText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, fontFamily: SANS },

  outputBox: {
    backgroundColor: C.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
  },
  outputTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  outputHeader: { color: C.label, fontSize: 10, letterSpacing: 1, fontFamily: MONO, marginBottom: 8 },
  skel: { height: 10, borderRadius: 5, backgroundColor: '#2C2C31' },
  outputScroll: { maxHeight: 200 },
  outputContent: { color: C.code, fontFamily: MONO, fontSize: 13, lineHeight: 20 },

  approvalBox: {
    backgroundColor: C.cardBg,
    borderColor: C.wait,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    marginTop: 8,
  },
  approvalTitle: { color: C.wait, fontSize: 20, fontWeight: '500', fontFamily: SANS, marginLeft: 10, letterSpacing: -0.3 },
  approvalDesc: { color: C.muted, fontSize: 15, lineHeight: 22, fontFamily: SANS, marginTop: 10, marginBottom: 20 },
  buttonRow: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },

  btn: {
    height: 48,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  btnText: { fontSize: 16, fontFamily: SANS },
});