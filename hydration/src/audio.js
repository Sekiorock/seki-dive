// hydration/src/audio.js
// 音の時計（ハイドレーション・ビート仕様書 2章：タイミングの基準は、画面の時計ではなく音の時計）。
//
// 「今、耳に聞こえている音の時刻」を、AudioContext の時刻で返す。
// ・getOutputTimestamp() があれば、スピーカーから実際に出ている音の時刻を使う（いちばん正確）。
// ・なければ currentTime から、音が出るまでの遅れ（outputLatency）を引く。
// 画面のノーツの位置も、タップの判定も、この同じ時計で決める。

import { AUDIO } from './config.js';

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
