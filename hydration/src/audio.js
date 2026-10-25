// hydration/src/audio.js
// 音の時計（ハイドレーション・ビート仕様書 2章：タイミングの基準は、画面の時計ではなく音の時計）。
//
// 「今、耳に聞こえている音の時刻」を、AudioContext の時刻で返す。
// ・getOutputTimestamp() があれば、スピーカーから実際に出ている音の時刻を使う（いちばん正確）。
// ・なければ currentTime から、音が出るまでの遅れ（outputLatency）を引く。
// 画面のノーツの位置も、タップの判定も、この同じ時計で決める。
//
// v0.3：タイミング調整（ハイドレーション・ビート仕様書 4章）。メトロノームに合わせて8回たたいてもらい、
// 「聞こえた音」と「たたいた瞬間」のずれのまん中の値（中央値）を、その端末の補正にする。
// 補正はその端末だけのものなので、端末に覚えておく（ほかの端末では測り直す）。

import { AUDIO, CALIB } from './config.js';

let ctx = null;
const bus = { master: null, music: null, sfx: null };

export function getAudio() { return { ctx, bus }; }

/** 最初のタップのときに呼ぶ（スマホは、タップしないと音を出せない決まりがある） */
export async function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    bus.master = ctx.createGain();
    bus.master.gain.value = AUDIO.master;
    bus.music = ctx.createGain();
    bus.music.gain.value = AUDIO.music;
    bus.sfx = ctx.createGain();
    bus.sfx.gain.value = AUDIO.sfx;
    bus.music.connect(bus.master);
    bus.sfx.connect(bus.master);
    bus.master.connect(comp);
    comp.connect(ctx.destination);
    // iPhone で無音のまま止まらないように、ごく短い無音を1回鳴らしておく
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
  }
  if (ctx.state !== 'running') await ctx.resume();
  return ctx;
}

function latency() { return (ctx.outputLatency || 0) || (ctx.baseLatency || 0); }

/** 今、耳に聞こえている音の時刻（秒） */
export function heardTime() {
  return heardTimeAt(performance.now());
}

/**
 * 画面の時計（performance.now() やイベントの timeStamp）を、聞こえている音の時刻に直す。
 * タップの瞬間を正確に知るために、イベントが起きた時刻（timeStamp）を使う。
 */
export function heardTimeAt(perfMs) {
  if (!ctx) return 0;
  if (ctx.state === 'running' && typeof ctx.getOutputTimestamp === 'function') {
    const ts = ctx.getOutputTimestamp();
    if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
  }
  return ctx.currentTime - latency() - (performance.now() - perfMs) / 1000;
}

export async function pauseAudio() { if (ctx && ctx.state === 'running') await ctx.suspend(); }
export async function resumeAudio() { if (ctx && ctx.state === 'suspended') await ctx.resume(); }

// ───────────── タイミング調整 ─────────────
const OFFSET_KEY = 'sekidive.hb.offsetMs';

/** この端末で測った補正（ミリ秒）。まだ測っていなければ null */
export function savedOffset() {
  try {
    const v = localStorage.getItem(OFFSET_KEY);
    return v === null ? null : Number(v) || 0;
  } catch (e) { return null; }
}
export function saveOffset(ms) {
  try { localStorage.setItem(OFFSET_KEY, String(Math.round(ms))); } catch (e) { /* 覚えておけない端末 */ }
}

/** メトロノームの「カッ」という音。accent は数え始めの拍（高い音） */
function click(at, accent, dest) {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = accent ? 1760 : 1320;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  o.connect(g); g.connect(dest);
  o.start(at); o.stop(at + 0.07);
}

/**
 * タイミング調整を1回分始める。
 *   beats      … 鳴らす拍の時刻（聞こえる音の時刻）の列。はじめの CALIB.leadBeats 拍は数えるだけ
 *   tap(ms)    … たたいたとき（イベントの timeStamp）。{ count, done, offsetMs, spreadMs } を返す
 *   stop()     … やめる
 */
export function startCalibration() {
  const beat = 60 / CALIB.bpm;
  const total = CALIB.leadBeats + CALIB.taps + 4;   // 少し多めに鳴らしておく
  const t0 = ctx.currentTime + 0.6;
  const out = ctx.createGain();
  out.connect(bus.sfx);
  const beats = [];
  for (let i = 0; i < total; i++) {
    const at = t0 + i * beat;
    beats.push(at);
    click(at, i < CALIB.leadBeats ? i === 0 : (i - CALIB.leadBeats) % 4 === 0, out);
  }
  const diffs = [];
  let stopped = false;
  const firstTapBeat = beats[CALIB.leadBeats];
  return {
    beats, beatSec: beat, leadBeats: CALIB.leadBeats,
    tap(perfMs) {
      if (stopped || diffs.length >= CALIB.taps) return null;
      const t = heardTimeAt(perfMs);
      if (t < firstTapBeat - beat / 2) return { count: diffs.length, done: false, early: true };
      // いちばん近い拍とのずれ
      let best = Infinity;
      for (const b of beats) if (Math.abs(t - b) < Math.abs(best)) best = t - b;
      diffs.push(best * 1000);
      const done = diffs.length >= CALIB.taps;
      const sorted = [...diffs].sort((a, b) => a - b);
      const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      const spread = sorted.length > 1 ? Math.sqrt(sorted.reduce((a, d) => a + (d - mid) ** 2, 0) / sorted.length) : 0;
      return {
        count: diffs.length, done,
        offsetMs: Math.max(-CALIB.limitMs, Math.min(CALIB.limitMs, Math.round(mid))),
        spreadMs: Math.round(spread),
      };
    },
    stop() { stopped = true; out.gain.value = 0; setTimeout(() => out.disconnect(), 100); },
  };
}
