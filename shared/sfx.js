// shared/sfx.js  効果音（音のファイルは使わず、Web Audio でその場で作る）
//   和風の音階（ヨナ抜き：ド・レ・ミ・ソ・ラ）で、琴のように「ポロン」と鳴らす。
//   correct：正解（上がる3音＋きらめき） combo：連続正解（音が1つずつ高くなる） wrong：おしい（低い2音）
//   clear：エリアを抜けた（5音のアルペジオと鈴） find：見つけた（鈴） tap：ボタン（小さく）
//   消音は、端末ごとに覚える（localStorage の sekidive.sound）。音はブラウザの決まりで、最初に画面をさわったあとから鳴る。

const KEY = 'sekidive.sound';
let ctx = null;
let master = null;
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } })();

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// 最初にさわったときに、音を出せるようにしておく
if (typeof window !== 'undefined') {
  const unlock = () => { if (on) ac(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}

const BASE = 523.25;   // ド（C5）
const YONA = [0, 2, 4, 7, 9];  // ヨナ抜き音階（半音の数）
const note = (step) => BASE * 2 ** ((YONA[((step % 5) + 5) % 5] + 12 * Math.floor(step / 5)) / 12);

/** 琴のような音（はじいて、すぐ減る） */
function pluck(freq, at = 0, dur = 0.9, vol = 0.5, type = 'triangle') {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
  const g = c.createGain(); const g2 = c.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g2.gain.setValueAtTime(0.0001, t0); g2.gain.exponentialRampToValueAtTime(vol * 0.3, t0 + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.5);
  o.connect(g).connect(master); o2.connect(g2).connect(master);
  o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
}
/** 鈴（高い音が2つ重なって、ゆれる） */
function bell(at = 0, vol = 0.25) {
  const c = ac(); if (!c) return;
  [2637, 3520, 4186].forEach((f, i) => pluck(f, at + i * 0.04, 0.6, vol * (1 - i * 0.25), 'sine'));
}
/** 低い「ポン」 */
function thud(freq, at = 0, vol = 0.45) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq * 0.6, t0 + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + 0.4);
}

export const sfx = {
  get on() { return on; },
  setOn(v) { on = !!v; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* 何もしない */ } if (on) ac(); },
  /** 正解。combo：連続の数（1から）。続くほど音が高くなる */
  correct(combo = 1) {
    if (!on) return;
    const s = Math.min(6, combo - 1);
    [0, 2, 4].forEach((k, i) => pluck(note(5 + s + k), i * 0.09, 1.0, 0.45));
    bell(0.3, 0.18);
  },
  wrong() { if (!on) return; thud(220, 0, 0.35); thud(185, 0.13, 0.3); },
  clear() {
    if (!on) return;
    [0, 1, 2, 3, 4, 5, 7].forEach((k, i) => pluck(note(3 + k), i * 0.11, 1.4, 0.42));
    bell(0.85, 0.25); bell(1.1, 0.2);
  },
  find() { if (!on) return; bell(0, 0.22); pluck(note(9), 0.05, 0.8, 0.25, 'sine'); },
  tap() { if (!on) return; pluck(note(7), 0, 0.18, 0.12, 'sine'); },
};
