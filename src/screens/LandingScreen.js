// src/screens/LandingScreen.js
// FlowAutomate landing screen. Typewriter headline over a full-bleed Three.js / WebGL
// landscape (glowing cube on reflective water, cliffs, stars, bloom) – see src/components/HeroScene.js.
// Requires: npm i react-native-svg three   (expo: npx expo install react-native-svg && npm i three)
//
// Animations:
//  1. Typewriter headline: types forward with a "glitch" character trailing the
//     cursor, holds, then backspaces (also with glitch chars), then pauses empty.
//  2. Per-character purple -> mint gradient on the rotating word, on a fixed scale
//     (short words stay mostly purple, long ones reach mint).
//  3. Dim block cursor that blinks after the word.
//  4. Each time the word is cleared, the scene on the right pulses (ring on the
//     water, scan line up the cube, face patterns morph).
//  5. Hover: "Start for free" goes purple.

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import HeroScene from '../components/HeroScene';

/* ───────────────────────── tokens ───────────────────────── */
const C = {
  bg: '#0B0B0C',
  line: '#232327',
  text: '#FFFFFF',
  purple: '#A855F7',
  mint: '#A7F3D0',
  hover: '#8000FF',
};
const SANS = Platform.select({
  web: 'Inter, "Helvetica Neue", Arial, sans-serif',
  default: undefined,
});

const ROTATING_TEXT = [
  'approvals',
  'invoice runs',
  'lead follow-ups',
  'weekly reports',
  'data syncs',
  'team alerts',
];
const GLITCH = '>]/\\|_<[';
const randGlitch = () => GLITCH[Math.floor(Math.random() * GLITCH.length)];

// typewriter timings (ms)
const T_TYPE = 62;
const T_DELETE = 32;
const T_EMPTY = 450;
const T_HOLD = 2600;

/* ───────────── per-character gradient (RN has no text gradient) ───────────── */
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
};

// Fixed scale: colour depends on character position, not word length,
// so partially typed words stay purple like in the video.
function GradientText({ text, style }) {
  return (
    <Text style={style}>
      {text.split('').map((ch, i) => (
        <Text key={i} style={{ color: mix(C.purple, C.mint, Math.min(i / 13, 1)) }}>
          {ch}
        </Text>
      ))}
    </Text>
  );
}

/* ───────────────────────── small svg pieces ───────────────────────── */
function Logo({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <Path d="M6 20 C6 10 14 18 22 8" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
      <Circle cx={6} cy={20} r={4} fill="#fff" />
      <Circle cx={22} cy={8} r={4} fill="#fff" />
    </Svg>
  );
}

function Chevron({ color = '#000' }) {
  return (
    <Svg width={8} height={12} viewBox="0 0 8 12" fill="none">
      <Path d="M1.5 1.5L6 6l-4.5 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ───────────────────────── hover buttons ───────────────────────── */
function PrimaryButton({ onPress, children }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[s.primary, hover && { backgroundColor: C.hover, borderColor: C.hover }]}
    >
      <Text style={[s.primaryText, hover && { color: '#fff' }]}>{children}</Text>
      <Chevron color={hover ? '#fff' : '#000'} />
    </Pressable>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function LandingScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 1000;
  const isTiny = width < 560;

  const [display, setDisplay] = useState(ROTATING_TEXT[0]);
  const [cursorOn, setCursorOn] = useState(true);
  const [pulseTick, setPulseTick] = useState(0); // bumped each time the word is cleared -> scene pulses

  // typewriter loop
  useEffect(() => {
    let cancelled = false;
    let timer;
    const sleep = (ms) => new Promise((r) => (timer = setTimeout(r, ms)));

    (async () => {
      let wi = 0;
      await sleep(T_HOLD);
      while (!cancelled) {
        const word = ROTATING_TEXT[wi];
        // backspace with a glitch char trailing the cursor
        for (let n = word.length - 1; n > 0 && !cancelled; n--) {
          setDisplay(word.slice(0, n) + randGlitch());
          await sleep(T_DELETE);
        }
        if (cancelled) return;
        setDisplay('');
        setPulseTick((t) => t + 1);
        await sleep(T_EMPTY);

        wi = (wi + 1) % ROTATING_TEXT.length;
        const next = ROTATING_TEXT[wi];
        for (let n = 1; n <= next.length && !cancelled; n++) {
          setDisplay(next.slice(0, n) + (n < next.length ? randGlitch() : ''));
          await sleep(T_TYPE);
        }
        await sleep(T_HOLD);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // cursor blink
  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 530);
    return () => clearInterval(blink);
  }, []);

  const headSize = isWide ? Math.min(88, width * 0.047) : isTiny ? 40 : 56;
  const headLine = Math.round(headSize * 1.14);
  const padX = isWide ? Math.max(40, width * 0.064) : 24;
  // Sign in / Get started / Start for free all open the (fake) auth screen first
  const goAuth = (mode) => () => navigation && navigation.navigate('Auth', { mode });

  const headStyle = {
    fontFamily: SANS,
    fontSize: headSize,
    lineHeight: headLine,
    fontWeight: '300',
    letterSpacing: -headSize * 0.03,
  };

  return (
    <View style={s.screen}>
      {/* nav */}
      <View style={s.nav}>
        <View style={[s.row, { paddingLeft: isWide ? 28 : 20 }]}>
          <Logo />
          <Text style={s.brand}>FlowAutomate</Text>
        </View>

        <View style={{ flex: 1 }} />

        <View style={[s.row, { alignSelf: 'stretch' }]}>
          {isWide && (
            <TouchableOpacity activeOpacity={0.6} style={{ marginRight: 40 }} onPress={goAuth('login')}>
              <Text style={s.navLink}>Sign in</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.85} onPress={goAuth('signup')} style={s.navCta}>
            <Text style={s.navCtaText}>Get started</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* hero */}
      <View style={s.hero}>
        {/* full-bleed WebGL landscape behind everything (web only) */}
        {Platform.OS === 'web' && <HeroScene pulseSignal={pulseTick} style={StyleSheet.absoluteFill} />}

        {/* dark wash on the left so the headline stays readable over the scene */}
        {Platform.OS === 'web' && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage:
                  'linear-gradient(90deg, rgba(8,5,14,0.82) 0%, rgba(8,5,14,0.55) 38%, rgba(8,5,14,0) 70%)',
              },
            ]}
          />
        )}

        <View style={[s.copy, { paddingHorizontal: padX }]}>
          <Text style={[headStyle, { color: C.text, maxWidth: isWide ? width * 0.5 : '100%' }]}>
            Stop repeating yourself
            automate your
          </Text>

          {/* fixed-height row so the layout doesn't jump when the word is empty */}
          <View style={[s.row, { height: headLine }]}>
            <GradientText text={display} style={headStyle} />
            <View
              style={{
                width: headSize * 0.42,
                height: headSize * 0.8,
                marginLeft: headSize * 0.08,
                backgroundColor: 'rgba(255,255,255,0.14)',
                opacity: cursorOn ? 1 : 0.35,
              }}
            />
          </View>

          <Text style={[s.sub, { fontSize: isTiny ? 18 : 24, lineHeight: isTiny ? 28 : 36 }]}>
            Intuitive infrastructure to build, run, and scale any workflow or agent from your first trigger to your
            billionth.
          </Text>

          <View style={s.buttons}>
            <PrimaryButton onPress={goAuth('signup')}>Start</PrimaryButton>
          </View>
        </View>

      
      </View>
    </View>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },

  nav: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.bg,
    zIndex: 5,
  },
  brand: { color: '#fff', fontSize: 28, fontWeight: '500', fontFamily: SANS, marginLeft: 10, letterSpacing: -0.5 },
  navLink: { color: '#fff', fontSize: 18, fontFamily: SANS },
  navCta: { backgroundColor: '#fff', paddingHorizontal: 38, justifyContent: 'center', alignSelf: 'stretch' },
  navCtaText: { color: '#000', fontSize: 18, fontFamily: SANS },

  hero: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  copy: { paddingBottom: 40, zIndex: 2 },
  sub: { color: '#fff', fontFamily: SANS, fontWeight: '300', marginTop: 56, maxWidth: 680 },

  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 52 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    height: 60,
    paddingHorizontal: 30,
    borderWidth: 1,
    borderColor: '#fff',
  },
  primaryText: { color: '#000', fontSize: 20, fontFamily: SANS },

  /* right-hand scene area */
  visual: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '48%', minWidth: 560 },

  theme: {
    position: 'absolute',
    right: 54,
    bottom: 26,
    width: 56,
    height: 56,
    borderWidth: 1,
    borderColor: '#fff',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});