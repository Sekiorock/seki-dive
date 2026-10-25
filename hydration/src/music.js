// hydration/src/music.js
// 曲の合成（Web Audio API でその場で作る。著作権の心配がなく、テンポを自由に変えられる）。
// ステージ1「極性のプレリュード」：D の短調の五音音階（D F G A C）で、和風の響きと電子音を合わせた曲。
//
// 楽器：太鼓（キック）、手拍子、ハイハット、ベース、和音（パッド）、琴のような音の分散和音、笛のような旋律。
// 曲の場面の energy（charts.js）と、コンボの数で、鳴る楽器が増える（コンボが続くと音が厚くなる）。

import { getAudio } from './audio.js';
import { sectionAt } from './charts.js';
import { AUDIO } from './config.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 4小節で1周する和音：Dm → B♭ → C → Am
const CHORDS = [
  { root: 38, pad: [62, 65, 69], arp: [74, 69, 77, 69, 74, 81, 77, 69] },
  { root: 34, pad: [58, 62, 65], arp: [70, 65, 74, 65, 70, 77, 74, 65] },
  { root: 36, pad: [60, 64, 67], arp: [72, 67, 76, 67, 72, 79, 76, 67] },
  { root: 33, pad: [57, 60, 64], arp: [69, 64, 72, 64, 69, 76, 72, 64] },
];
// 笛の旋律（4小節。1小節＝16分音符16個。null は休み）
const MELODY = [
  [74, null, null, 72, null, null, 69, null, 72, null, 74, null, null, null, null, null],
  [77, null, null, 74, null, null, 72, null, 69, null, null, null, 67, null, null, null],
  [69, null, null, 72, null, null, 74, null, 77, null, null, null, 79, null, null, null],
  [77, null, 74, null, 72, null, 69, null, 74, null, null, null, null, null, null, null],
];

let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(ctx, t, attack, decay, peak, dest) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

// ── 楽器 ──
function kick(ctx, t, dest, vol = 1) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  o.connect(env(ctx, t, 0.003, 0.32, 0.9 * vol, dest));
  o.start(t); o.stop(t + 0.4);
}
function clap(ctx, t, dest, vol = 1) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 0.8;
  s.connect(f); f.connect(env(ctx, t, 0.002, 0.16, 0.45 * vol, dest));
  s.start(t); s.stop(t + 0.2);
}
function hat(ctx, t, dest, vol = 1, open = false) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
  s.connect(f); f.connect(env(ctx, t, 0.001, open ? 0.18 : 0.04, 0.22 * vol, dest));
  s.start(t); s.stop(t + 0.25);
}
function bass(ctx, t, dest, midi, len) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(midi);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + len);
  o.connect(f); f.connect(env(ctx, t, 0.005, len, 0.32, dest));
  o.start(t); o.stop(t + len + 0.05);
}
function pad(ctx, t, dest, notes, len, vol = 1) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.07 * vol, t + 0.25);
  g.gain.setValueAtTime(0.07 * vol, t + len - 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
  f.connect(g); g.connect(dest);
  for (const m of notes) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + len + 0.05);
  }
}
/** 琴のような、はじく音（三角波に、短い減衰と少しの音程の下がり） */
function koto(ctx, t, dest, midi, vol = 1) {
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(mtof(midi) * 1.012, t);
  o.frequency.exponentialRampToValueAtTime(mtof(midi), t + 0.05);
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(midi) * 2;
  const g = env(ctx, t, 0.002, 0.45, 0.16 * vol, dest);
  const g2 = env(ctx, t, 0.002, 0.12, 0.05 * vol, dest);
  o.connect(g); o2.connect(g2);
  o.start(t); o.stop(t + 0.5); o2.start(t); o2.stop(t + 0.2);
}
/** 笛のような旋律（方形波を少しゆらして、やわらかくする） */
function flute(ctx, t, dest, midi, len) {
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = mtof(midi);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
  const lg = ctx.createGain(); lg.gain.value = 6;
  lfo.connect(lg); lg.connect(o.detune);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.04);
  g.gain.setValueAtTime(0.07, t + len * 0.7);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  o.connect(f); f.connect(g); g.connect(dest);
  o.start(t); o.stop(t + len + 0.05); lfo.start(t); lfo.stop(t + len + 0.05);
}

// ── 効果音 ──
export function playHit(judgement) {
  const { ctx, bus } = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const base = { perfect: 88, great: 84, good: 81 }[judgement] || 81;
  for (const [m, d, v] of [[base, 0.35, 0.18], [base + 7, 0.25, 0.08], [base + 12, 0.2, 0.05]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
    o.connect(env(ctx, t, 0.002, d, v, bus.sfx)); o.start(t); o.stop(t + d + 0.05);
  }
}
export function playWrong() {
  const { ctx, bus } = getAudio();
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  o.connect(f); f.connect(env(ctx, t, 0.003, 0.22, 0.2, bus.sfx));
  o.start(t); o.stop(t + 0.3);
}

/**
 * 曲を作る。start(t0) で、AudioContext の時刻 t0 に1小節目が始まる。
 * 少し先の分だけを予約していく（長い曲を一度に予約すると、スマホが重くなるため）。
 */
export function createSong(chart, expanded) {
  const { ctx, bus } = getAudio();
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(bus.music);
  const stepSec = expanded.barSec / 16;     // 16分音符
  const totalSteps = expanded.totalBars * 16;
  let t0 = 0, next = 0, layers = 0, timer = 0, running = false;

  function scheduleStep(s) {
    const t = t0 + s * stepSec;
    const bar = Math.floor(s / 16), i = s % 16;
    const sec = sectionAt(chart, bar);
    const e = sec.energy;
    const ch = CHORDS[bar % 4];
    const last = bar === expanded.totalBars - 1;
    // パッド（小節の頭で1小節分）
    if (i === 0) pad(ctx, t, out, ch.pad, expanded.barSec * (last ? 1.6 : 1), e === 0 ? 0.8 : 1);
    if (last) { if (i === 0) { kick(ctx, t, out, 0.8); koto(ctx, t, out, 74); } return; }
    // 太鼓
    if (e >= 1 && i % 4 === 0) kick(ctx, t, out, 1);
    if (e === 0 && sec.name === 'intro' && i === 0) kick(ctx, t, out, 0.6);
    if (e >= 2 && i === 14 && bar % 2 === 1) kick(ctx, t, out, 0.6);
    // 手拍子（2拍目と4拍目）
    if (e >= 1 && (i === 4 || i === 12)) clap(ctx, t, out, 1);
    // ハイハット：8分（コンボ1段目から16分）
    if (e >= 1 || sec.name === 'break') {
      if (i % 2 === 0) hat(ctx, t, out, i % 4 === 2 ? 1 : 0.6, i === 14 && e >= 2);
      else if (layers >= 1 && e >= 1) hat(ctx, t, out, 0.35);
    }
    // ベース（8分音符でルートとオクターブ）
    if (e >= 1 && i % 2 === 0) bass(ctx, t, out, ch.root + (i % 8 === 4 ? 12 : 0), stepSec * 1.8);
    // 琴の分散和音（場面が盛り上がったとき、またはコンボ2段目から）
    if ((e >= 2 || layers >= 2) && i % 2 === 0 && e >= 1) koto(ctx, t, out, ch.arp[i / 2], e >= 3 ? 1 : 0.8);
    // 笛の旋律（いちばん盛り上がった場面、またはコンボ3段目から）
    if ((e >= 3 || layers >= 3) && e >= 1) {
      const m = MELODY[bar % 4][i];
      if (m) flute(ctx, t, out, m, stepSec * 2.6);
    }
  }

  function pump() {
    if (!running) return;
    const until = ctx.currentTime + AUDIO.scheduleAheadSec;
    while (next < totalSteps && t0 + next * stepSec < until) { scheduleStep(next); next += 1; }
  }

  return {
    start(startAt) {
      t0 = startAt; next = 0; running = true;
      pump();
      timer = setInterval(pump, 25);
    },
    stop() {
      running = false;
      clearInterval(timer);
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => out.disconnect(), 500);
    },
    /** コンボの段（0〜3） */
    setLayers(n) { layers = n; },
  };
}
