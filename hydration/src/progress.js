// hydration/src/progress.js
// ステージの記録と解放（ハイドレーション・ビート仕様書 4章、v0.3）。
//   ・前のステージを、どれかの難易度でクリアすると、次のステージが開く。STAGE 1 と練習曲はいつでも遊べる。
//   ・記録は、難易度ごとの最高点とクリアしたかどうか。本人の情報（shared/auth.js）に入れるので、
//     Firebase につながっていれば、ほかの端末で遊んでも続きから。
//   形：{ clears: { stage1: { easy: { best: 912345, clear: true }, ... }, ... }, saved: { cationH: 1700000000000, ... } }
//   v0.4：saved は図鑑に保存した解説（間違いの種類と、保存した時刻）

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
