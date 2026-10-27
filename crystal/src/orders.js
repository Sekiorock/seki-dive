// crystal/src/orders.js
// 注文モードの24段階（全体の仕様書 8章）。教科書 p.65〜71 の例題・類題・問の形をすべて含む。
// どの注文も、
//   start：実験台のはじめの状態、anim：実験で動かすもの（温度を下げる、水を蒸発させる など）と、その行き先、
//   result(最後の状態, はじめの状態)：実験の結果の数値（予想と比べる）、unit・digits：答えの単位と小数の桁、
//   tol：[ 150 ヒヤマになる差, 80 ヒヤマになる差 ]（g の問題は 0.5 g と 2 g）、
//   vars()：問題文に入れる数値、how(結果)：解き方の説明に入れる数値。
// 問題文と解き方の文は shared/i18n の cr.o.{id}.q と cr.o.{id}.how。数値はデータ（溶解度の表）から計算するので、
// 表を書きかえても、問題文と答えがずれない。

import { equilibrium, curvePoint, solubility, TABLE, TEMPS, HYD } from './solubility.js';
import { dissolve } from './gas.js';
import { concentrations } from './conc.js';
import { GAS_TABLE, GAS_TEMPS, GASES, CONC_SOLUTES, GAS_CONST } from './config.js';

const P0 = 1.013e5;
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const fs = (x) => (Number.isInteger(x) ? String(x) : String(x));
const S = (id, T) => solubility(id, T);
const gasS = (id, T) => GAS_TABLE[id][GAS_TEMPS.indexOf(T)];

/** 溶解度が s になる温度（KNO₃ のように温度とともに増える物質） */
function tempFor(id, s) {
  const tb = TABLE[id];
  for (let i = 0; i < TEMPS.length - 1; i++) {
    if (s <= tb[i + 1]) return TEMPS[i] + ((s - tb[i]) / (tb[i + 1] - tb[i])) * 10;
  }
  return TEMPS[TEMPS.length - 1];
}

// ── 実験台の状態を作る ──
export function solidState(p) {
  const water = Math.max(1e-4, p.water);
  return { solute: p.solute, mass: p.mass, water, temp: p.temp, superSat: false, eq: equilibrium(p.solute, p.mass, water, p.temp), point: curvePoint(p.solute, p.mass, water) };
}
export function gasState(p) {
  return { gas: p.gas, pressure: p.P / 1e5, temp: p.temp, volume: p.volume, eq: dissolve(p.gas, p.P, p.temp, p.volume), released: null };
}
export function concState(p) {
  return { solute: p.solute, solute_g: p.solute_g, solvent: p.solvent, density: p.density, eq: concentrations(p.solute, p.solute_g, p.solvent, p.density) };
}
export function buildState(bench, p) {
  return bench === 'solid' ? solidState(p) : bench === 'gas' ? gasState(p) : concState(p);
}

// 飽和溶液 m g の中の水と溶質（溶解度 s）
const satSplit = (m, s) => ({ water: (m * 100) / (100 + s), mass: (m * s) / (100 + s) });

// 差の幅：グラフを目で読んで計算しても届くように、g の問題は 2 g 以内で「ぴったり」、10 g 以内で「おしい」
const G = { unit: 'g', digits: 1, tol: [2, 10] };

export const ORDERS = [
  // ── 溶解度と溶ける量 ──
  { id: 'o01', type: 'ex', bench: 'solid', ...G,
    start: { solute: 'KNO3', mass: 0, water: 100, temp: 60 }, anim: { key: 'mass', to: 150 },
    vars: () => ({ s: fs(S('KNO3', 60)) }),
    result: (st) => st.eq.dissolved, how: (r) => ({ s: fs(S('KNO3', 60)), r: f1(r) }) },
  { id: 'o02', type: 'sim', bench: 'solid', ...G,
    start: { solute: 'KNO3', mass: 0, water: 250, temp: 40 }, anim: { key: 'mass', to: 200 },
    vars: () => ({ s: fs(S('KNO3', 40)) }),
    result: (st) => st.eq.dissolved, how: (r) => ({ s: fs(S('KNO3', 40)), r: f1(r) }) },
  { id: 'o03', type: 'q', bench: 'solid', ...G,
    start: { solute: 'KNO3', ...satSplit(105, S('KNO3', 60)), temp: 60 }, anim: { key: 'water', to: 0 },
    vars: () => ({ s: fs(S('KNO3', 60)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s: fs(S('KNO3', 60)), t: fs(100 + S('KNO3', 60)), r: f1(r) }) },
  // ── 冷却による析出 ──
  { id: 'o04', type: 'ex', bench: 'solid', ...G,
    start: { solute: 'KNO3', mass: S('KNO3', 60), water: 100, temp: 60 }, anim: { key: 'temp', to: 20 },
    vars: () => ({ m: fs(100 + S('KNO3', 60)), s60: fs(S('KNO3', 60)), s20: fs(S('KNO3', 20)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s60: fs(S('KNO3', 60)), s20: fs(S('KNO3', 20)), r: f1(r) }) },
  { id: 'o05', type: 'sim', bench: 'solid', ...G,
    start: { solute: 'KNO3', ...satSplit(100, S('KNO3', 60)), temp: 60 }, anim: { key: 'temp', to: 10 },
    vars: () => ({ s60: fs(S('KNO3', 60)), s10: fs(S('KNO3', 10)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s60: fs(S('KNO3', 60)), s10: fs(S('KNO3', 10)), t: fs(100 + S('KNO3', 60)), d: fs(S('KNO3', 60) - S('KNO3', 10)), r: f1(r) }) },
  { id: 'o06', type: 'sim', bench: 'solid', ...G,
    start: { solute: 'KCl', mass: S('KCl', 80) * 2, water: 200, temp: 80 }, anim: { key: 'temp', to: 0 },
    vars: () => ({ m: fs(200 + S('KCl', 80) * 2), s80: fs(S('KCl', 80)), s0: fs(S('KCl', 0)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s80: fs(S('KCl', 80)), s0: fs(S('KCl', 0)), r: f1(r) }) },
  { id: 'o07', type: 'q', bench: 'solid', ...G,
    start: { solute: 'KNO3', mass: 50, water: 100, temp: 60 }, anim: { key: 'temp', to: 20 },
    vars: () => ({ s20: fs(S('KNO3', 20)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s20: fs(S('KNO3', 20)), r: f1(r) }) },
  { id: 'o08', type: 'q', bench: 'solid', ...G,
    start: { solute: 'KNO3', mass: 100, water: 200, temp: 70 }, anim: { key: 'temp', to: 10 },
    vars: () => ({ s10: fs(S('KNO3', 10)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s10: fs(S('KNO3', 10)), c: fs(S('KNO3', 10) * 2), r: f1(r) }) },
  // ── 結晶が出はじめる温度 ──
  { id: 'o09', type: 'q', bench: 'solid', unit: '℃', digits: 1, tol: [2, 8],
    start: { solute: 'KNO3', mass: 64, water: 100, temp: 80 }, anim: { key: 'temp', to: tempFor('KNO3', 64) },
    vars: () => ({}),
    result: (st) => st.temp, how: (r) => ({ r: f1(r) }) },
  { id: 'o10', type: 'q', bench: 'solid', unit: '℃', digits: 1, tol: [2, 8],
    start: { solute: 'KNO3', mass: 100, water: 100, temp: 80 }, anim: { key: 'temp', to: tempFor('KNO3', 100) },
    vars: () => ({ s50: fs(S('KNO3', 50)), s60: fs(S('KNO3', 60)) }),
    result: (st) => st.temp, how: (r) => ({ s50: fs(S('KNO3', 50)), s60: fs(S('KNO3', 60)), r: f1(r) }) },
  // ── 蒸発による析出 ──
  { id: 'o11', type: 'sim', bench: 'solid', ...G,
    start: { solute: 'KNO3', mass: S('KNO3', 60), water: 100, temp: 60 }, anim: { key: 'water', to: 60 },
    vars: () => ({ m: fs(100 + S('KNO3', 60)), s: fs(S('KNO3', 60)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s: fs(S('KNO3', 60)), r: f1(r) }) },
  { id: 'o12', type: 'q', bench: 'solid', unit: 'g', digits: 1, tol: [1, 3],
    start: { solute: 'NaCl', mass: S('NaCl', 80), water: 100, temp: 80 }, anim: { key: 'temp', to: 0 },
    vars: () => ({ m: f1(100 + S('NaCl', 80)), s80: f1(S('NaCl', 80)), s0: f1(S('NaCl', 0)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s80: f1(S('NaCl', 80)), s0: f1(S('NaCl', 0)), r: f1(r) }) },
  // ── 水和物 ──
  { id: 'o13', type: 'ex', bench: 'solid', ...G,
    start: { solute: 'CuSO4H', mass: 0, water: 100, temp: 60 }, anim: { key: 'mass', to: 50 },
    vars: () => ({}),
    result: (st) => st.eq.water, how: (r) => ({ w: f1(50 * HYD.b), r: f1(r) }) },
  { id: 'o14', type: 'q', bench: 'solid', ...G,
    start: { solute: 'CuSO4H', mass: 0, water: 100, temp: 20 }, anim: { key: 'mass', to: 60 },
    vars: () => ({ s: fs(S('CuSO4', 20)) }),
    result: (st) => st.mass - st.eq.crystal, how: (r) => ({ s: fs(S('CuSO4', 20)), r: f1(r) }) },
  { id: 'o15', type: 'ex', bench: 'solid', ...G,
    start: { solute: 'CuSO4', mass: S('CuSO4', 60), water: 100, temp: 60 }, anim: { key: 'temp', to: 10 },
    vars: () => ({ m: fs(100 + S('CuSO4', 60)), s60: fs(S('CuSO4', 60)), s10: fs(S('CuSO4', 10)) }),
    result: (st) => st.eq.crystal, how: (r) => ({ s60: fs(S('CuSO4', 60)), s10: fs(S('CuSO4', 10)), r: f1(r) }) },
  { id: 'o16', type: 'q', bench: 'solid', ...G,
    start: { solute: 'MIX', mass: 100, water: 100, temp: 60 }, anim: { key: 'temp', to: 10 },
    vars: () => ({ s10: fs(S('KNO3', 10)), c10: fs(S('CuSO4', 10)) }),
    result: (st) => st.eq.parts.find((p) => p.id === 'KNO3').crystal,
    how: (r) => ({ w: f1(10 * HYD.b), c: f1(10 * HYD.a), s10: fs(S('KNO3', 10)), r: f1(r) }) },
  // ── 気体（ヘンリーの法則） ──
  { id: 'o17', type: 'ex', bench: 'gas', unit: 'mg', digits: 1, tol: [2, 10],
    start: { gas: 'N2', P: P0, temp: 0, volume: 1 }, anim: { key: 'P', to: P0 * 3 },
    vars: () => ({ s: f2(gasS('N2', 0)) }),
    result: (st) => st.eq.mass * 1000, how: (r) => ({ s: f2(gasS('N2', 0)), M: GASES.N2.M, r: f1(r) }) },
  { id: 'o18', type: 'q', bench: 'gas', unit: 'mL', digits: 1, tol: [1, 4],
    start: { gas: 'N2', P: P0, temp: 0, volume: 1 }, anim: { key: 'P', to: P0 * 3 },
    vars: () => ({ s: f2(gasS('N2', 0)) }),
    result: (st) => st.eq.volP * 1000, how: (r) => ({ s: f2(gasS('N2', 0)), r: f1(r) }) },
  { id: 'o19', type: 'q', bench: 'gas', unit: 'mg', digits: 1, tol: [2, 10],
    start: { gas: 'AIR', P: P0, temp: 20, volume: 1 }, anim: { key: 'volume', to: 10 },
    vars: () => ({ s: f2(gasS('O2', 20)) }),
    result: (st) => st.eq.parts.find((p) => p.id === 'O2').mass * 1000, how: (r) => ({ s: f2(gasS('O2', 20)), r: f1(r) }) },
  { id: 'o20', type: 'q', bench: 'gas', unit: '×10⁻³ mol', digits: 1, tol: [2, 8],
    start: { gas: 'CO2', P: P0 * 2, temp: 20, volume: 1 }, anim: { key: 'temp', to: 60 },
    vars: () => ({ s20: f1(gasS('CO2', 20)), s60: f1(gasS('CO2', 60)) }),
    result: (st, st0) => (st0.eq.n - st.eq.n) * 1000, how: (r) => ({ s20: f1(gasS('CO2', 20)), s60: f1(gasS('CO2', 60)), r: f1(r) }) },
  // ── 濃度 ──
  { id: 'o21', type: 'sim', bench: 'conc', unit: '%', digits: 1, tol: [0.5, 2],
    start: { solute: 'NaCl', solute_g: 0, solvent: 180, density: 1.07 }, anim: { key: 'solute_g', to: 20 },
    vars: () => ({}),
    result: (st) => st.eq.percent, how: (r) => ({ r: f1(r) }) },
  { id: 'o22', type: 'q', bench: 'conc', unit: 'mol/kg', digits: 2, tol: [0.05, 0.2],
    start: { solute: 'GLU', solute_g: 0, solvent: 250, density: 1.04 }, anim: { key: 'solute_g', to: 36 },
    vars: () => ({ M: CONC_SOLUTES.GLU.M }),
    result: (st) => st.eq.molality, how: (r) => ({ n: f2(36 / CONC_SOLUTES.GLU.M), r: f2(r) }) },
  { id: 'o23', type: 'q', bench: 'conc', unit: 'mol/L', digits: 2, tol: [0.1, 0.4],
    start: { solute: 'NaCl', solute_g: 0, solvent: 180, density: 1.07 }, anim: { key: 'solute_g', to: 20 },
    vars: () => ({ M: CONC_SOLUTES.NaCl.M }),
    result: (st) => st.eq.molarity, how: (r) => ({ v: f1(200 / 1.07), n: (20 / CONC_SOLUTES.NaCl.M).toFixed(3), r: f2(r) }) },
  { id: 'o24', type: 'ex', bench: 'conc', unit: 'mol/L', digits: 1, tol: [0.5, 2],
    start: { solute: 'H2SO4', solute_g: 0, solvent: 2, density: 1.84 }, anim: { key: 'solute_g', to: 98 },
    vars: () => ({ M: CONC_SOLUTES.H2SO4.M }),
    result: (st) => st.eq.molarity, how: (r) => ({ r: f1(r) }) },
];

/** 実験を動かした最後の状態と、結果の数値 */
export function runOrder(o) {
  const st0 = buildState(o.bench, o.start);
  const st = buildState(o.bench, { ...o.start, [o.anim.key]: o.anim.to });
  return { st0, st, value: o.result(st, st0) };
}

/** 予想と結果の差から、ランク（0：いちばん近い、1、2） */
export function rankOf(o, guess, value) {
  const k = 10 ** o.digits;
  const d = Math.abs(guess - Math.round(value * k) / k);
  return d <= o.tol[0] + 1e-9 ? 0 : d <= o.tol[1] + 1e-9 ? 1 : 2;
}

export { GAS_CONST };
