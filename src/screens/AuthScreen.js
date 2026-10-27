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

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

/* ───────────────────────── tokens (shared with the other screens) ───────────────────────── */
const C = {
  bg: '#0B0B0C',
  card: '#121214',
  cardBorder: '#2A2A2E',
  field: '#1D1D20',
  fieldBorder: '#3A3A3F',
  text: '#FFFFFF',
  muted: '#B4B4BC',
  label: '#8C8C94',
  purple: '#A855F7',
  hover: '#8000FF',
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

/* ───────────────────────── interactive shader background (web) ───────────────────────── */
// Ported from the portfolio site: a full-screen fragment shader (domain-warped flow +
// ray-marched "egg-carton" sphere) that reacts to the mouse, plus a field of drifting
// particles that parallax with the cursor. Runs on raw WebGL (no three.js needed) and is
// recoloured to the FlowAutomate purple / mint theme.
// Web only (react-native-web). On native, or if WebGL is unavailable, a static gradient is shown.

// 1.0 = the small orb you see on the portfolio home page.
// 0.3-0.5 = camera sits inside the sphere (the big swirling arcs from the portfolio's inner pages).
const ORB_OPACITY = 0.4;
const MAX_PIXELS = 1.6e6; // render-resolution cap, keeps it smooth on big screens
// Softness of the noise the clouds are built from (blur radius in texels). Higher = smoother, cleaner;
// ~0.6 = grainy / blocky, 1.4 = soft haze, 2.2+ = very smooth, big slow clouds.
const NOISE_SMOOTH = 1.4;

const BG_VERT = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const BG_FRAG = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform float iTime;
  uniform vec2  iResolution;
  uniform vec2  iMouse;
  uniform float uPx;
  uniform float audio1;
  uniform float adj;
  uniform sampler2D iChannel0;
  uniform float orbOpacity;

  #define R(p,a) p = p*cos(a)+vec2(-p.y,p.x)*sin(a)
  #define time (iTime*0.1)
  #define tau  6.2831853

  mat2 makem2(in float theta){float c=cos(theta);float s=sin(theta);return mat2(c,-s,s,c);}
  float noise(in vec2 x){ return texture2D(iChannel0,x*.01).x; }
  mat2 m2 = mat2(.80,.80,-.80,.80);

  float grid(vec2 p){ return sin(p.x)*cos(p.y); }

  float flow(in vec2 p){
    float z=4.; float rz=0.;
    vec2 bp=p;
    for(float i=1.;i<8.;i++){
      bp += time*1.5;
      vec2 gr = vec2(grid(p*3.-time*2.),grid(p*3.+4.-time))*0.4;
      gr = normalize(gr)*0.4;
      gr *= makem2((p.x+p.y)*.3+time*10.);
      p += gr*0.2;
      rz += (sin(noise(p)*2.)*.5+.5)/z;
      p  = mix(bp,p,.5);
      z  *= 1.5;
      p  *= 2.5; p*=m2;
      bp *= 2.5; bp*=m2;
    }
    return rz;
  }

  float spiral(vec2 p,float scl){
    float r=length(p); r=log(r);
    float a=atan(p.y,p.y);
    return abs(mod(scl*(r-2./scl*a),tau)-1.)*1.;
  }

  float Sin01(float t){ return .5+.5*sin(6.28319*t); }

  float SineEggCarton(vec3 p){
    return 0.0+abs(sin(p.x)-cos(p.y)+sin(p.z))*1.2*orbOpacity;
  }
  float Map(vec3 p,float scale){
    float dSphere=length(p)-1.0;
    return max(dSphere,(.9-SineEggCarton(scale*p))/scale);
  }
  vec3 GetColor(vec3 p){
    float amount=clamp((1.5-length(p))/2.0,0.0,1.0);
    vec3 col=0.5+0.5*cos(6.28319*(vec3(0.2,0.0,0.0)+amount*(audio1*.6)*vec3(.9,.9,.8)));
    return col*amount*orbOpacity;
  }

  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

  void main(){
    vec2 coord = gl_FragCoord.xy;
    coord.x -= iMouse.x*.003*uPx;
    coord.y += iMouse.y*.003*uPx;

    vec2 p = coord/iResolution.xy - .5;
    p.x *= iResolution.x/iResolution.y;
    p *= 2.0;
    p.y += 1.5;

    float rz = flow(p);
    p /= exp(mod(2.1,2.1));
    rz *= (3.2-spiral(p,.5))*.7*audio1;

    vec3 col = vec3(.02,.045,.09)/rz;
    col = pow(abs(col),vec3(1.01))-(abs(iMouse.x)*.00005);
    vec4 outc = vec4(col,1.0);

    vec3 rd = normalize(vec3(2.0*coord - iResolution.xy, -iResolution.y));
    vec3 ro = vec3(
      -iMouse.x*.0003,
       iMouse.y*.0002,
      -1.4*(1.0-orbOpacity)-.5+mix(2.5,2.0,adj+Sin01(.05*iTime))
    );
    R(rd.xz, .2*iTime);  R(ro.xz, .2*iTime);
    R(rd.yz, .1*iTime);  R(ro.yz, .1*iTime);

    float t=0.0;
    float scale=mix(.5,20.0*(orbOpacity*orbOpacity),Sin01(.1*iTime*.01));
    for(int i=0;i<60;i++){
      vec3 sp = ro+t*rd;
      float d = Map(sp,scale);
      if(t>20.0||d<0.0001) break;
      t += .7*d;
      outc.rgb += (.05*GetColor(sp)*(audio1*.6))*orbOpacity;
      outc.r   -= abs(iMouse.x)*.00003;
    }

    // ── theme grade: original navy / red / teal  ->  purple / magenta / lavender-mint ──
    vec3 c = max(outc.rgb, 0.0);
    vec3 g = vec3(dot(c, vec3(.7,.2,.9)), dot(c, vec3(.0,.7,.15)), dot(c, vec3(.5,.2,1.3))) * 2.5;
    g = 1.0 - exp(-pow(g, vec3(2.2)) * 1.3);
    g += (hash(gl_FragCoord.xy) - .5) / 255.0;   // dither, avoids banding in the dark
    gl_FragColor = vec4(g, 1.0);
  }
`;

const PT_VERT = `
  attribute vec3 position;
  uniform mat4 uMV;
  uniform mat4 uP;
  uniform float uSize;
  uniform float uScale;
  void main() {
    vec4 mv = uMV * vec4(position, 1.0);
    gl_Position = uP * mv;
    gl_PointSize = uSize * (uScale / -mv.z);
  }
`;

const PT_FRAG = `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = clamp(1.0 - d, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

// tiny column-major mat4 helpers
const m4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    return o;
  },
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  translate(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
};

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + log);
  }
  return sh;
}

function makeProgram(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

// Random noise, blurred a little (wrapping at the edges, so it still tiles) and stretched back to 0..1.
// The shader builds its clouds from this; raw per-pixel randomness reads as blocky squares.
function makeSmoothNoise(N, sigma) {
  let a = new Float32Array(N * N);
  for (let i = 0; i < a.length; i++) a[i] = Math.random();
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-0.5 * (i / sigma) * (i / sigma));
    k.push(w);
    sum += w;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let acc = 0;
        for (let i = -r; i <= r; i++) {
          const xx = pass === 0 ? (x + i + N) % N : x;
          const yy = pass === 0 ? y : (y + i + N) % N;
          acc += a[yy * N + xx] * k[i + r];
        }
        b[y * N + x] = acc;
      }
    }
    a = b;
  }
  const sorted = Float32Array.from(a).sort();
  const lo = sorted[Math.floor(N * N * 0.01)];
  const hi = sorted[Math.floor(N * N * 0.99)];
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = Math.max(0, Math.min(1, (a[i] - lo) / (hi - lo || 1))) * 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function WebGLField({ onFail }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let gl;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL not available');
    } catch (e) {
      onFail();
      return undefined;
    }

    let bgProg;
    let ptProg;
    try {
      bgProg = makeProgram(gl, BG_VERT, BG_FRAG);
      ptProg = makeProgram(gl, PT_VERT, PT_FRAG);
    } catch (e) {
      console.warn(e.message);
      onFail();
      return undefined;
    }

    // full-screen triangle
    const triBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // smooth noise texture, filtered LINEAR + mipmaps so the clouds have no hard edges
    const N = 256;
    const noise = makeSmoothNoise(N, NOISE_SMOOTH);
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // particle field (350 points in a 60-unit cube)
    const COUNT = 350;
    const pts = new Float32Array(COUNT * 3);
    for (let i = 0; i < pts.length; i++) pts[i] = Math.random() * 60 - 30;
    const ptBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW);
    const rot = { x: Math.random() * 6, y: Math.random() * 6, z: Math.random() * 6 };

    const U = (prog, name) => gl.getUniformLocation(prog, name);
    const bg = {
      pos: gl.getAttribLocation(bgProg, 'position'),
      iTime: U(bgProg, 'iTime'), iRes: U(bgProg, 'iResolution'), iMouse: U(bgProg, 'iMouse'),
      uPx: U(bgProg, 'uPx'), audio1: U(bgProg, 'audio1'), adj: U(bgProg, 'adj'),
      orb: U(bgProg, 'orbOpacity'), tex: U(bgProg, 'iChannel0'),
    };
    const pt = {
      pos: gl.getAttribLocation(ptProg, 'position'),
      mv: U(ptProg, 'uMV'), p: U(ptProg, 'uP'), size: U(ptProg, 'uSize'), scale: U(ptProg, 'uScale'),
      color: U(ptProg, 'uColor'), opacity: U(ptProg, 'uOpacity'),
    };

    // state
    let iTime = 100.0;
    const mouse = { x: 0, y: 0 };
    const sm = { x: 0, y: 0 };           // smoothed mouse (iMouse)
    const cam = { x: 0, y: 0 };          // camera parallax for the particles
    let bw = 1, bh = 1, cssW = 1, cssH = 1, px = 1;
    let raf = 0;
    let last = performance.now();
    let shown = false;

    const resize = () => {
      cssW = Math.max(1, canvas.clientWidth);
      cssH = Math.max(1, canvas.clientHeight);
      px = Math.min(1, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
      bw = Math.max(1, Math.floor(cssW * px));
      bh = Math.max(1, Math.floor(cssH * px));
      canvas.width = bw;
      canvas.height = bh;
    };
    resize();

    const onMouse = (e) => {
      mouse.x = e.clientX - window.innerWidth / 2;
      mouse.y = e.clientY - window.innerHeight / 2;
    };
    const onTouch = (e) => {
      if (e.touches && e.touches[0]) {
        mouse.x = e.touches[0].clientX - window.innerWidth / 2;
        mouse.y = e.touches[0].clientY - window.innerHeight / 2;
      }
    };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('resize', resize);

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      iTime += dt;
      sm.x += (mouse.x - sm.x) * 0.05;
      sm.y += (mouse.y - sm.y) * 0.05;
      cam.x += (-mouse.x * 0.01 - cam.x) * 0.05;
      cam.y += (mouse.y * 0.01 - cam.y) * 0.05;
      rot.z -= 0.03 * dt;

      gl.viewport(0, 0, bw, bh);

      // 1) background shader
      gl.disable(gl.BLEND);
      gl.useProgram(bgProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
      gl.enableVertexAttribArray(bg.pos);
      gl.vertexAttribPointer(bg.pos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(bg.tex, 0);
      gl.uniform1f(bg.iTime, iTime);
      gl.uniform2f(bg.iRes, bw, bh);
      gl.uniform2f(bg.iMouse, sm.x, sm.y);
      gl.uniform1f(bg.uPx, px);
      gl.uniform1f(bg.audio1, 128.0 / 48.0 + Math.random() * 0.1);
      gl.uniform1f(bg.adj, 0.2 - cssH / cssW);
      gl.uniform1f(bg.orb, ORB_OPACITY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(bg.pos);

      // 2) particles (additive)
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(ptProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, ptBuf);
      gl.enableVertexAttribArray(pt.pos);
      gl.vertexAttribPointer(pt.pos, 3, gl.FLOAT, false, 0, 0);
      const model = m4.mul(m4.mul(m4.rotX(rot.x), m4.rotY(rot.y)), m4.rotZ(rot.z));
      const mv = m4.mul(m4.translate(-cam.x, -cam.y, -50), model);
      gl.uniformMatrix4fv(pt.mv, false, mv);
      gl.uniformMatrix4fv(pt.p, false, m4.persp(Math.PI / 2, bw / bh, 1, 1000));
      gl.uniform1f(pt.size, 0.3);
      gl.uniform1f(pt.scale, bh / 2);
      gl.uniform3f(pt.color, 0.75, 0.55, 1.0);
      gl.uniform1f(pt.opacity, 0.5);
      gl.drawArrays(gl.POINTS, 0, COUNT);
      gl.disableVertexAttribArray(pt.pos);

      if (!shown) {
        shown = true;
        canvas.style.opacity = '1'; // fade in once the first frame is drawn
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('resize', resize);
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    };
  }, [onFail]);

  // a raw <canvas> works because react-native-web renders to the DOM
  return React.createElement('canvas', {
    ref: canvasRef,
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      display: 'block',
      opacity: 0,
      transition: 'opacity 1s ease-in',
    },
  });
}

function ShaderBackground() {
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const useGL = Platform.OS === 'web' && !failed;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: C.bg },
        Platform.OS === 'web' && {
          backgroundImage: 'radial-gradient(circle at 15% 10%, #2A0B4A 0%, #0B0B0C 55%)',
        },
      ]}
      pointerEvents="none"
    >
      {useGL ? <WebGLField onFail={onFail} /> : null}
    </View>
  );
}

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

function CheckMark() {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 6.5l2.6 2.6L10 3.5" stroke="#fff" strokeWidth={1.8} />
    </Svg>
  );
}

// Flat input (placeholder only), like the reference. Semi-transparent so the background shows through.
function Field({ placeholder, secure, value, onChangeText, onSubmitEditing, ...rest }) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={[styles.field, focused && { borderColor: C.purple }]}>
      <TextInput
        {...rest}
        style={styles.fieldInput}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry={secure && !shown}
        placeholderTextColor="#8C8C94"
      />
      {secure ? (
        <TouchableOpacity onPress={() => setShown((v) => !v)} hitSlop={8}>
          <Text style={styles.showText}>{shown ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function GoogleG({ size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  );
}

function GoogleButton({ onPress, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[styles.google, { backgroundColor: hover ? '#E9E9EC' : '#fff', opacity: disabled ? 0.6 : 1 }]}
    >
      <GoogleG />
      <Text style={styles.googleText}>Continue with Google</Text>
    </Pressable>
  );
}

function OrDivider() {
  return (
    <View style={styles.orRow}>
      <View style={styles.orLine} />
      <Text style={styles.orText}>OR</Text>
      <View style={styles.orLine} />
    </View>
  );
}

function Checkbox({ checked, onPress, children }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>{checked ? <CheckMark /> : null}</View>
      <Text style={styles.checkText}>{children}</Text>
    </TouchableOpacity>
  );
}

function SubmitButton({ onPress, disabled, children }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={[
        styles.submit,
        {
          backgroundColor: hover ? C.hover : 'rgba(255,255,255,0.09)',
          borderColor: hover ? C.hover : 'rgba(255,255,255,0.1)',
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={styles.submitText}>{children}</Text>
    </Pressable>
  );
}

/* ───────────────────────── screen ───────────────────────── */
export default function AuthScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const padX = width < 640 ? 20 : 28;

  const [mode, setMode] = useState(route?.params?.mode === 'signup' ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [terms, setTerms] = useState(false);
  const [news, setNews] = useState(false);
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  // Hide the navigator's default header (this screen draws its own)
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // follow the mode passed from the landing page buttons
  useEffect(() => {
    if (route?.params?.mode) setMode(route.params.mode === 'signup' ? 'signup' : 'login');
  }, [route?.params?.mode]);

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError('');
    setPassword('');
    setConfirm('');
  };

  const goBack = () => {
    if (navigation.canGoBack && navigation.canGoBack()) navigation.goBack();
  };

  const handleSubmit = async () => {
    if (loading) return;
    setError('');

    // ---- fake validation (replace with real checks / server errors later) ----
    if (isSignup && !name.trim()) return setError('Please enter your full name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Please enter a valid email address.');
    if (!password) return setError('Please enter your password.');
    if (isSignup) {
      if (password.length < 6) return setError('Password must be at least 6 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
      if (!terms) return setError('Please accept the Terms of Service to continue.');
    }

    await finish();
  };

  // fake sign-in used by both the form and the Google button
  const finish = async () => {
    setLoading(true);
    // ---- REAL AUTH GOES HERE (sign in / create account / Google), then continue ----
    await new Promise((r) => setTimeout(r, 700)); // fake network delay
    setLoading(false);

    if (navigation.replace) navigation.replace('Home');
    else navigation.navigate('Home');
  };

  const handleGoogle = async () => {
    if (loading) return;
    setError('');
    await finish();
  };

  return (
    <View style={styles.container}>
      <ShaderBackground />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: padX }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* top bar: back + logo */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.row} onPress={goBack} activeOpacity={0.7}>
            <BackIcon />
            <View style={{ width: 14 }} />
            <Logo />
            <Text style={styles.brand}>FlowAutomate</Text>
          </TouchableOpacity>
        </View>

        {/* centred form: no box, so the background shows through */}
        <View style={styles.stack}>
          <View style={{ alignItems: 'center', marginBottom: 22 }}>
            <Logo size={34} />
          </View>
          <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.subtitle}>{isSignup ? 'Start automating for free' : 'Log in to FlowAutomate'}</Text>

          <GoogleButton onPress={handleGoogle} disabled={loading} />
          <OrDivider />

          {isSignup && (
            <Field
              placeholder="Full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
          )}
          <Field
            placeholder="Work email..."
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />
          <Field
            placeholder="Password"
            secure
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            onSubmitEditing={isSignup ? undefined : handleSubmit}
          />
          {isSignup && (
            <Field
              placeholder="Confirm password"
              secure
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="none"
              onSubmitEditing={handleSubmit}
            />
          )}

          <View style={{ marginTop: 4, marginBottom: 6 }}>
            {isSignup ? (
              <>
                <Checkbox checked={terms} onPress={() => setTerms((v) => !v)}>
                  I agree to the <Text style={styles.link}>Terms of Service</Text> and{' '}
                  <Text style={styles.link}>Privacy Policy</Text>
                </Checkbox>
                <Checkbox checked={news} onPress={() => setNews((v) => !v)}>
                  Send me product updates and the FlowAutomate newsletter
                </Checkbox>
              </>
            ) : (
              <Checkbox checked={keep} onPress={() => setKeep((v) => !v)}>
                Keep me signed in on this device
              </Checkbox>
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <SubmitButton onPress={handleSubmit} disabled={loading}>
            {loading ? 'Please wait...' : 'Continue'}
          </SubmitButton>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{isSignup ? 'Already have an account?' : "Don't have an account?"}</Text>
            <TouchableOpacity onPress={switchMode} hitSlop={8}>
              <Text style={styles.switchLink}>{isSignup ? 'Log in' : 'Sign up'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.demo}>DEMO MODE · NO REAL AUTHENTICATION YET</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ───────────────────────── styles ───────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 48 },

  topBar: { width: '100%', height: 84, justifyContent: 'center' },
  brand: { color: '#fff', fontSize: 28, fontWeight: '500', fontFamily: SANS, marginLeft: 10, letterSpacing: -0.5 },

  // centred stack: no box, so the shader shows through. paddingBottom offsets the top bar so it is truly centred.
  stack: { width: '100%', maxWidth: 320, flexGrow: 1, justifyContent: 'center', paddingBottom: 84 },
  title: {
    color: C.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    fontFamily: SANS,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: C.label,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    fontFamily: SANS,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 32,
  },

  google: {
    height: 40,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleText: { color: '#111', fontSize: 14, fontWeight: '500', fontFamily: SANS },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  orText: { color: C.label, fontSize: 11, letterSpacing: 0.6, fontFamily: SANS },

  field: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(12,12,14,0.55)',
    paddingHorizontal: 12,
    marginBottom: 12,
    ...Platform.select({ web: { backdropFilter: 'blur(8px)' }, default: {} }),
  },
  fieldInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontFamily: SANS,
    paddingVertical: 0,
    paddingHorizontal: 0,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  showText: { color: C.purple, fontSize: 12, fontWeight: '600', fontFamily: SANS },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkBoxOn: { backgroundColor: C.hover, borderColor: C.hover },
  checkText: { flex: 1, color: C.muted, fontSize: 12.5, lineHeight: 18, fontWeight: '400', fontFamily: SANS },
  link: { color: C.purple, textDecorationLine: 'underline' },

  error: { color: C.fail, fontSize: 13, fontFamily: SANS, textAlign: 'center', marginBottom: 10 },

  submit: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: SANS },

  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 22 },
  switchText: { color: C.muted, fontSize: 14, fontFamily: SANS },
  switchLink: { color: C.purple, fontSize: 14, fontWeight: '600', fontFamily: SANS, textDecorationLine: 'underline' },

  demo: { color: '#55555C', fontSize: 10, letterSpacing: 1, fontFamily: MONO, textAlign: 'center', marginTop: 22 },
});