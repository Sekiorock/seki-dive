// crystal/src/refine.js
// 精製モードの計算（全体の仕様書 8章）：KNO₃ と CuSO₄·5H₂O の混合物を、
//   ① 温めた水に溶かす → ② 冷やして KNO₃ を析出させる → ③ ろ過する → ④ 冷水で洗う（何回か） → ⑤ 乾かす
// ろ過した結晶には、母液（CuSO₄ が溶けている液）が少ししみこんで残る。乾かすと、その中の CuSO₄ が不純物になる。
// 冷水で洗うと、しみこんだ母液が薄まって不純物が減るが、KNO₃ の結晶も少し溶けて減る。

import { SOLUTES, HYD, equilibrium, solubility } from './solubility.js';
import { REFINE } from './config.js';

/** その段階の混合物を、実験台の溶質 'REF' として使えるようにする */
export function defineMix(level) {
  const total = level.kno3 + level.cuh;
  SOLUTES.REF = {
    parts: [{ id: 'KNO3', frac: level.kno3 / total }, { id: 'CuSO4', frac: level.cuh / total, form: 'hydrate' }],
    formula: 'KNO₃ + CuSO₄·5H₂O',
  };
  return total;
}

export function mixEq(level, water, T) {
  return equilibrium('REF', defineMix(level), water, T);
}

/** ろ過：結晶と、しみこんだ母液 */
export function filter(eq) {
  const k = eq.parts.find((p) => p.id === 'KNO3');
  const c = eq.parts.find((p) => p.id === 'CuSO4');
  const L = eq.water + k.dissolved + c.dissolved;
  const a = REFINE.adhere * (k.crystal + c.crystal);
  return {
    k: k.crystal, c: c.crystal,            // KNO₃ の結晶、CuSO₄·5H₂O の結晶
    adh: { w: (a * eq.water) / L, k: (a * k.dissolved) / L, cu: (a * c.dissolved) / L },   // しみこんだ液（cu は無水物の質量）
    washes: 0, lost: 0,
  };
}

/** 冷水 ww g で洗う */
export function wash(cake, ww) {
  const T = REFINE.washTemp;
  const dk = Math.min(cake.k, (solubility('KNO3', T) * ww / 100) * REFINE.washEff);
  const dc = Math.min(cake.c, ((solubility('CuSO4', T) / HYD.a) * ww / 100) * REFINE.washEff);
  const k = cake.k - dk, c = cake.c - dc;
  const water = cake.adh.w + ww + dc * HYD.b;
  const K = cake.adh.k + dk, Cu = cake.adh.cu + dc * HYD.a;
  const total = water + K + Cu;
  const keep = total > 0 ? Math.min(1, (REFINE.adhere * (k + c)) / total) : 0;
  return { k, c, adh: { w: water * keep, k: K * keep, cu: Cu * keep }, washes: cake.washes + 1, lost: cake.lost + dk };
}

/** 乾かす：取り出せた KNO₃ と不純物（CuSO₄·5H₂O として）、純度 */
export function dry(cake) {
  const kno3 = cake.k + cake.adh.k;
  const imp = cake.c + cake.adh.cu / HYD.a;
  const purity = kno3 + imp > 0 ? (kno3 / (kno3 + imp)) * 100 : 0;
  return { kno3, imp, purity };
}
