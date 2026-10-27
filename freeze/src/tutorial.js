// freeze/src/tutorial.js
// 公式への値の代入のしかたを、順番にアニメーションで見せる（生徒の声をうけて v0.3 で追加）。
//   ・各ステージの はじめ：例の数値で「何を、どの式に、どう入れるか」を1手順ずつ見せる。
//   ・失敗した朝：失敗した区間の本当の数値で、もう一度かんたんに見せる。
// 式の中の数は、色で出どころを分ける：条件（区間の数値）＝白群、定数＝金、計算した答え＝白の太字。

import { CONST, SUBSTANCES } from './config.js';

const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const r2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const r3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
const r4 = (x) => (Math.round(x * 10000) / 10000).toFixed(4);
const sg = (x) => (x < 0 ? `−${r1(-x)}` : r1(x));
const g = (x) => `<i class="c-g">${x}</i>`;        // 条件（与えられた数）
const k = (x) => `<i class="c-k">${x}</i>`;        // 定数
const a = (x) => `<i class="c-a">${x}</i>`;        // 答え
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (e) => String(e).split('').map((c) => SUP[c] || c).join('');

/** ステージのはじめに見せる例 */
export const EXAMPLES = {
  1: { kind: 'freeze', water: 2.0, low: -3.0, sub: 'urea' },
  2: { kind: 'freeze', water: 2.0, low: -3.0, sub: 'CaCl2' },
  3: { kind: 'curve', water: 2.0, low: -3.0, fp0: -0.8, sub: 'CaCl2' },
  4: { kind: 'vapor', csub: 'NaCl', cg: 35, water: 1.0, mMax: 0.6 },
  5: { kind: 'boil', water: 2.0, rise: 0.5, target: 100.5, sub: 'NaCl' },
  6: { kind: 'osmo', csub: 'NaCl', c: 0.5, tc: 25 },
  7: { kind: 'mm', q: 'fp', g: 9.0, sg: 100, dt: 0.93, kf: CONST.Kf },
};

/** 粒子の物質量 → 撒く物質の質量（i で割って、モル質量をかける） */
function toMass(t, np, sub, steps) {
  const S = SUBSTANCES[sub];
  let n = np;
  if (S.i > 1) {
    n = np / S.i;
    steps.push({ h: t('fz.tut.ion', { f: S.formula, i: S.i }), eq: `${S.formula} = ${a(r2(np))} ÷ ${g(S.i)} = ${a(r2(n))} mol` });
  }
  const mass = n * S.M;
  steps.push({ h: t('fz.tut.mass', { f: S.formula }), eq: `${a(r2(n))} mol × ${k(S.M)} g/mol = ${a(r1(mass))} g`, note: t('fz.tut.roundUp', { g: Math.ceil(mass) }) });
}

/**
 * 手順を作る。ex：区間（または例）の数値。sub：撒く物質（freeze・curve・boil）
 * 返り値：{ formula, steps: [{ h, eq, note }] }
 */
export function buildSteps(t, kind, ex) {
  const steps = [];
  if (kind === 'freeze' || kind === 'curve') {
    const base = kind === 'curve' ? ex.fp0 : 0;
    if (kind === 'curve') steps.push({ h: t('fz.tut.read'), eq: `${t('fz.tut.fpNow')} = ${g(`${sg(ex.fp0)}℃`)}`, note: t('fz.tut.readNote') });
    const dt = base - ex.low;
    steps.push({ h: t('fz.tut.goal'), eq: `Δt = ${g(sg(base))} − (${g(sg(ex.low))}) = ${a(r1(dt))} K` });
    const m = dt / CONST.Kf;
    steps.push({ h: t('fz.tut.subst', { K: 'K_f' }), eq: `${a(r1(dt))} = ${k('1.85')} × m　→　m = ${a(r1(dt))} ÷ ${k('1.85')} = ${a(r3(m))} mol/kg` });
    const np = m * ex.water;
    steps.push({ h: t('fz.tut.mol'), eq: `${a(r3(m))} × ${g(r1(ex.water))} kg = ${a(r2(np))} mol` });
    if (ex.sub) toMass(t, np, ex.sub, steps);
    return { formula: 'Δt = K_f × m', steps };
  }
  if (kind === 'boil') {
    const dt = ex.target - 100;
    steps.push({ h: t('fz.tut.goalB'), eq: `Δt = ${g(r2(ex.target))} − ${k('100')} = ${a(r2(dt))} K` });
    const m = dt / CONST.Kb;
    steps.push({ h: t('fz.tut.subst', { K: 'K_b' }), eq: `${a(r2(dt))} = ${k('0.515')} × m　→　m = ${a(r2(dt))} ÷ ${k('0.515')} = ${a(r3(m))} mol/kg` });
    const np = m * ex.water;
    steps.push({ h: t('fz.tut.mol'), eq: `${a(r3(m))} × ${g(r1(ex.water))} kg = ${a(r2(np))} mol` });
    if (ex.sub) toMass(t, np, ex.sub, steps);
    return { formula: 'Δt = K_b × m', steps };
  }
  if (kind === 'vapor') {
    const S = SUBSTANCES[ex.csub];
    const np = (ex.cg / S.M) * S.i;
    steps.push({ h: t('fz.tut.vp1', { f: S.formula, i: S.i }), eq: `(${g(ex.cg)} g ÷ ${k(S.M)}) × ${g(S.i)} = ${a(r2(np))} mol` });
    const total = np / ex.mMax;
    steps.push({ h: t('fz.tut.vp2'), eq: `${a(r2(np))} ÷ ${g(r2(ex.mMax))} = ${a(r2(total))} kg` });
    const add = Math.max(0, total - ex.water);
    steps.push({ h: t('fz.tut.vp3'), eq: `${a(r2(total))} − ${g(r1(ex.water))} = ${a(r2(add))} kg`, note: t('fz.tut.roundUpKg', { w: (Math.ceil(add * 100) / 100).toFixed(2) }) });
    return { formula: t('fz.tut.vpFormula'), steps };
  }
  if (kind === 'osmo') {
    const S = SUBSTANCES[ex.csub];
    const TK = ex.tc + 273;
    steps.push({ h: t('fz.tut.os1'), eq: `T = ${g(ex.tc)} + ${k('273')} = ${a(TK)} K` });
    const pi = (S.i * ex.c * CONST.R * TK) / 1e5;
    steps.push({ h: t('fz.tut.os2', { f: S.formula, i: S.i }), eq: `Π = ${g(S.i)} × ${g(r2(ex.c))} × ${k('8.31×10³')} × ${a(TK)} = ${a(r2(pi))}×10⁵ Pa` });
    steps.push({ h: t('fz.tut.os3'), eq: `${a(r2(pi))}×10⁵ Pa ${t('fz.tut.orMore')}`, note: t('fz.tut.roundUpP', { p: (Math.ceil(pi * 10) / 10).toFixed(1) }) });
    return { formula: 'Π = i c R T', steps };
  }
  // ステージ7：分子量
  if (ex.q === 'osm') {
    const TK = ex.tc + 273;
    steps.push({ h: t('fz.tut.os1'), eq: `T = ${g(ex.tc)} + ${k('273')} = ${a(TK)} K` });
    const n = (ex.measured * ex.V) / (CONST.R * TK);
    steps.push({ h: t('fz.tut.mm5'), eq: `n = ${g(`${ex.piMant}×10${sup(ex.piExp)}`)} × ${g(ex.V)} ÷ (${k('8.31×10³')} × ${a(TK)}) = ${a(r4(n))} mol` });
    steps.push({ h: t('fz.tut.mm4'), eq: `M = ${g(ex.g)} ÷ ${a(r4(n))} = ${a(r1(ex.g / n))}`, note: t('fz.tut.pick') });
    return { formula: 'Π V = n R T', steps };
  }
  const base = ex.q === 'fpb' ? CONST.benzeneFp : 0;
  const dt = ex.dt;
  steps.push({ h: t(ex.q === 'fpb' ? 'fz.tut.mm1b' : 'fz.tut.mm1'), eq: `Δt = ${k(r2(base))} − (${g(ex.q === 'fpb' ? r2(base - dt) : `−${r2(dt)}`)}) = ${a(r2(dt))} K` });
  const m = dt / ex.kf;
  steps.push({ h: t('fz.tut.mm2'), eq: `m = ${a(r2(dt))} ÷ ${k(ex.kf)} = ${a(r3(m))} mol/kg` });
  const n = m * (ex.sg / 1000);
  steps.push({ h: t('fz.tut.mm3'), eq: `n = ${a(r3(m))} × ${g((ex.sg / 1000).toFixed(3))} kg = ${a(r4(n))} mol` });
  steps.push({ h: t('fz.tut.mm4'), eq: `M = ${g(ex.g)} ÷ ${a(r4(n))} = ${a(r1(ex.g / n))}`, note: t('fz.tut.pick') });
  return { formula: 'Δt = K_f × m', steps };
}
