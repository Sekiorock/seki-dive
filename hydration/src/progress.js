// hydration/src/progress.js
// ステージの記録と解放（ハイドレーション・ビート仕様書 4章、v0.3）。
//   ・前のステージを、どれかの難易度でクリアすると、次のステージが開く。STAGE 1 と練習曲はいつでも遊べる。
//   ・記録は、難易度ごとの最高点とクリアしたかどうか。本人の情報（shared/auth.js）に入れるので、
//     Firebase につながっていれば、ほかの端末で遊んでも続きから。
//   形：{ clears: { stage1: { easy: { best: 912345, clear: true }, ... }, ... }, saved: { cationH: 1700000000000, ... } }
//   v0.4：saved は図鑑に保存した解説（間違いの種類と、保存した時刻）
//   v0.5：weak は溶質ごとの間違いの回数（'water:Na' のように溶媒つき。苦手ノーツの練習曲に使う）、
//         pages は図鑑の特集ページ、fx はショップの演出 { owned: ['sakura'], on: 'sakura' }

import { STAGE_ORDER } from './charts.js';
import { getWorldData, setWorldData } from '../../shared/auth.js';

const WORLD = 'hydration';

function data() {
  const d = getWorldData(WORLD);
  d.clears = d.clears || {};
  return d;
}

/** その曲・難易度の記録（なければ null） */
export function recordOf(chartId, diffId) {
  const c = data().clears[chartId];
  return (c && c[diffId]) || null;
}

/** その曲を、どれかの難易度でクリアしたか */
export function isCleared(chartId) {
  const c = data().clears[chartId] || {};
  return Object.values(c).some((r) => r && r.clear);
}

/** 遊べるか。ステージは、ひとつ前のステージをクリアしていれば開く */
export function isUnlocked(chartId) {
  const i = STAGE_ORDER.indexOf(chartId);
  if (i <= 0) return true;                 // STAGE 1 と練習曲
  return isCleared(STAGE_ORDER[i - 1]);
}

/** ひとつ前のステージの番号（鍵の説明に使う） */
export function prevStageNo(chartId) { return Math.max(1, STAGE_ORDER.indexOf(chartId)); }

/**
 * 1曲の結果を記録する。
 * @returns {{ newRecord: boolean, firstClear: boolean, unlocked: string|null }}
 *   unlocked は、今回のクリアで新しく開いたステージ
 */
export function recordResult(chartId, diffId, score, clear) {
  const d = data();
  const c = d.clears[chartId] || {};
  const before = c[diffId] || { best: 0, clear: false };
  const i = STAGE_ORDER.indexOf(chartId);
  const next = i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
  const nextWasOpen = next ? isUnlocked(next) : true;
  const wasCleared = isCleared(chartId);
  const newRecord = score > before.best;
  c[diffId] = { best: Math.max(before.best, score), clear: before.clear || clear };
  d.clears[chartId] = c;
  setWorldData(WORLD, d);
  return {
    newRecord: newRecord && before.best > 0,
    firstClear: clear && !wasCleared,
    unlocked: next && !nextWasOpen && clear ? next : null,
  };
}

// ───────────── 図鑑に保存した解説（v0.4） ─────────────
/** 間違いの種類（図鑑に並べる順） */
export const MISTAKE_ORDER = ['cationH', 'anionO', 'ohOneSide', 'hclOrder', 'nonpolarHydrated', 'insolubleDissolved',
  'ionInHexane', 'polarInHexane', 'timing'];

export function isSaved(kind) { return !!(data().saved || {})[kind]; }
export function savedKinds() { return MISTAKE_ORDER.filter(isSaved); }
/** 解説を図鑑に保存する。新しく保存した数を返す */
export function saveExplanations(kinds) {
  const d = data();
  d.saved = d.saved || {};
  let n = 0;
  for (const k of kinds) if (MISTAKE_ORDER.includes(k) && !d.saved[k]) { d.saved[k] = Date.now(); n += 1; }
  if (n) setWorldData(WORLD, d);
  return n;
}

// ───────────── 苦手な溶質（v0.5） ─────────────
// 糖の2つ目からの -OH は糖に、HCl から分かれた Cl⁻ は HCl にまとめる
const WEAK_PARENT = { OHb: 'Glc', HClCl: 'HCl' };
/** 1曲の間違いを、苦手の記録に足す。notes は判定済みのノーツの列 */
export function addWeak(notes) {
  const d = data();
  d.weak = d.weak || {};
  let n = 0;
  for (const nt of notes) {
    if (nt.result !== 'wrong' && nt.result !== 'miss') continue;
    const id = WEAK_PARENT[nt.noteId] || nt.noteId;
    const key = `${nt.solvent || 'water'}:${id}`;
    d.weak[key] = (d.weak[key] || 0) + 1;
    n += 1;
  }
  if (n) setWorldData(WORLD, d);
}
/** 溶媒ごとの苦手な溶質（多い順） */
export function weakList(solvent, max) {
  const w = data().weak || {};
  return Object.entries(w).filter(([k]) => k.startsWith(`${solvent}:`))
    .sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k.split(':')[1]);
}
export function hasWeak() { return Object.keys(data().weak || {}).length > 0; }

// ───────────── 図鑑の特集ページ（v0.5：道具屋の「図鑑の追加ページ」を1枚使って開く） ─────────────
export const PAGES = ['hydration', 'philic', 'electrolyte', 'like', 'insoluble'];
export function isPageOpen(id) { return !!(data().pages || {})[id]; }
export function openPage(id) {
  const d = data();
  d.pages = d.pages || {};
  if (d.pages[id]) return;
  d.pages[id] = Date.now();
  setWorldData(WORLD, d);
}

// ───────────── ショップの演出（v0.5） ─────────────
export function fxState() { const f = data().fx || {}; return { owned: f.owned || [], on: f.on || '' }; }
export function addFx(id) {
  const d = data();
  const f = { owned: [], on: '', ...(d.fx || {}) };
  if (!f.owned.includes(id)) f.owned = [...f.owned, id];
  f.on = id;
  d.fx = f;
  setWorldData(WORLD, d);
}
export function useFx(id) {
  const d = data();
  const f = { owned: [], on: '', ...(d.fx || {}) };
  if (id && !f.owned.includes(id)) return;
  f.on = id;
  d.fx = f;
  setWorldData(WORLD, d);
}

/** その難易度で、はじめてクリアしたか（報酬が2倍になる） */
export function firstClearOf(chartId, diffId) { const r = recordOf(chartId, diffId); return !(r && r.clear); }
