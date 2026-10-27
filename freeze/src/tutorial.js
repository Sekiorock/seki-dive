// freeze/src/tutorial.js
// 解き方の説明（v0.4 で作り直し：生徒が「わかる」ことを優先）。
//   ① しくみ：絵で見る（粒がまざると、水が氷になりにくい など）。電解質は粒が分かれるようすも。
//   ② ためしてみよう：スライダーで粒を増やすと、凍る温度がどう動くかを自分で動かして見る。
//   ③ 計算のレシピ：℃ → 1 kg あたりの粒 → この区間の粒 → g、と「単位の変わり方」を矢印でつなぎ、1手順ずつタップで進める。
//   失敗した朝の「かんたん解説」は、③を、その区間の本当の数値で見せる（自分の撒いた量との比べも）。
// 式の中の数は、色で出どころを分ける：問題の数＝白群、決まった数（定数・モル質量）＝金、計算した数＝白。

import { CONST, SUBSTANCES } from './config.js';

const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const r2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const r3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
const r4 = (x) => (Math.round(x * 10000) / 10000).toFixed(4);
const sg = (x) => (x < -1e-9 ? `−${r1(-x)}` : r1(Math.abs(x)));
const g = (x) => `<i class="c-g">${x}</i>`;        // 問題の数
const k = (x) => `<i class="c-k">${x}</i>`;        // 決まった数
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

/** 電解質の粒の分かれ方（しくみの絵に出す） */
export const IONS = {
  NaCl: ['Na⁺', 'Cl⁻'],
  CaCl2: ['Ca²⁺', 'Cl⁻', 'Cl⁻'],
};
/** ステージで、電解質の分かれ方を見せるか */
export const SHOW_IONS = { 2: true, 3: true, 5: true, 6: true };

/** しくみの絵の種類 */
export function pictureOf(kind) {
  if (kind === 'boil' || kind === 'vapor') return 'vapor';
  if (kind === 'osmo') return 'osmo';
  return 'ice';
}

/**
 * ②ためしてみよう：スライダー1本で動かす。compute(x) → { txt：大きな数, pct：0〜1（メーター）, dots：粒の数, ok：合格の色にするか, note }
 */
export function demoOf(kind) {
  if (kind === 'boil') {
    return { min: 0, max: 3, step: 0.1, start: 0, inUnit: 'mol/kg', outKey: 'bp',
      compute: (x) => ({ txt: `${r2(100 + CONST.Kb * x)}℃`, pct: x / 3, dots: Math.round(x * 6), up: true }) };
  }
  if (kind === 'vapor') {
    // 布：粒 1.20 mol、水 1.0 kg。真水を足していくと、粒の濃さが下がり、0.60 以下で乾く
    return { min: 0, max: 2, step: 0.1, start: 0, inUnit: 'kg', outKey: 'vp',
      compute: (x) => { const m = 1.2 / (1 + x); return { txt: `${r2(m)} mol/kg`, pct: m / 1.2, dots: 12, spread: 1 + x, ok: m <= 0.6 + 1e-9 }; } };
  }
  if (kind === 'osmo') {
    return { min: 0, max: 1, step: 0.05, start: 0, inUnit: 'mol/L', outKey: 'os',
      compute: (x) => { const p = (x * CONST.R * 298) / 1e5; return { txt: `${r1(p)}×10⁵ Pa`, pct: x, dots: Math.round(x * 12), up: true }; } };
  }
  if (kind === 'mm') {
    // 9.0 g を水 100 g に。分子量が大きいほど、粒（mol）が少なく、凍る温度はあまり下がらない
    return { min: 50, max: 350, step: 10, start: 60, inUnit: '', outKey: 'mm',
      compute: (x) => { const dt = CONST.Kf * (9 / x) / 0.1; return { txt: `−${r2(dt)}℃`, pct: dt / 3.4, dots: Math.round((9 / x) * 80) }; } };
  }
  return { min: 0, max: 3, step: 0.1, start: 0, inUnit: 'mol/kg', outKey: 'fp',
    compute: (x) => ({ txt: `${sg(-CONST.Kf * x)}℃`, pct: x / 3, dots: Math.round(x * 6) }) };
}

/**
 * ③計算のレシピ：{ formula, nodes: [{ label, val, unit, calc }], ops: [{ op, why }], answer: { val, unit, note } }
 *   nodes[0] が出発点。ops[i] で nodes[i] から nodes[i+1] へ（矢印の横に、何をしたか）。
 */
export function chainOf(t, kind, ex) {
  const nodes = [];
  const ops = [];
  const add = (op, why, label, val, unit, calc = '') => { ops.push({ op, why }); nodes.push({ label, val, unit, calc }); };
  /** 粒の物質量 → 物質の質量 */
  const toMass = (np, sub) => {
    const S = SUBSTANCES[sub];
    let n = np;
    if (S.i > 1) {
      n = np / S.i;
      add(`÷ ${k(S.i)}`, t('fz.rc.ion', { f: S.formula, i: S.i }), t('fz.rc.nSub', { f: S.formula }), r2(n), 'mol');
    }
    const mass = n * S.M;
    add(`× ${k(S.M)} g`, t('fz.rc.molar', { f: S.formula, M: S.M }), t('fz.rc.mass', { f: S.formula }), r1(mass), 'g');
    return { val: String(Math.ceil(mass - 1e-9)), unit: 'g', note: t('fz.rc.roundUp', { v: Math.ceil(mass - 1e-9), u: 'g' }) };
  };
  if (kind === 'freeze' || kind === 'curve' || kind === 'boil') {
    const boil = kind === 'boil';
    const base = kind === 'curve' ? ex.fp0 : 0;
    const dt = boil ? ex.target - 100 : base - ex.low;
    const K = boil ? CONST.Kb : CONST.Kf;
    let calc;
    if (boil) calc = `${g(r2(ex.target))} − ${k('100')}`;
    else if (kind === 'curve') calc = `${g(sg(ex.fp0))} − (${g(sg(ex.low))})`;
    else calc = `${k('0')} − (${g(sg(ex.low))})`;
    if (kind === 'curve') nodes.push({ label: t('fz.rc.read'), val: sg(ex.fp0), unit: '℃', calc: t('fz.rc.readNote') });
    const dtNode = { label: t(boil ? 'fz.rc.up' : 'fz.rc.down'), val: boil ? r2(dt) : r1(dt), unit: 'K', calc };
    if (kind === 'curve') { ops.push({ op: '→', why: t('fz.rc.toLow', { low: sg(ex.low) }) }); nodes.push(dtNode); } else nodes.push(dtNode);
    const m = dt / K;
    add(`÷ ${k(boil ? '0.515' : '1.85')}`, t(boil ? 'fz.rc.byKb' : 'fz.rc.byKf'), t('fz.rc.per1kg'), r3(m), 'mol');
    const np = m * ex.water;
    add(`× ${g(r1(ex.water))} kg`, t(boil ? 'fz.rc.timesPot' : 'fz.rc.timesWater'), t('fz.rc.np'), r2(np), 'mol');
    const answer = ex.sub ? toMass(np, ex.sub) : null;
    return { formula: boil ? 'Δt = K_b × m' : 'Δt = K_f × m', nodes, ops, answer };
  }
  if (kind === 'vapor') {
    const S = SUBSTANCES[ex.csub];
    nodes.push({ label: t('fz.rc.cloth', { f: S.formula }), val: String(ex.cg), unit: 'g', calc: '' });
    const n = ex.cg / S.M;
    add(`÷ ${k(S.M)} g`, t('fz.rc.toMol', { f: S.formula, M: S.M }), t('fz.rc.nSub', { f: S.formula }), r3(n), 'mol');
    const np = n * S.i;
    if (S.i > 1) add(`× ${k(S.i)}`, t('fz.rc.ionUp', { f: S.formula, i: S.i }), t('fz.rc.np'), r2(np), 'mol');
    const total = np / ex.mMax;
    add(`÷ ${g(r2(ex.mMax))}`, t('fz.rc.byMax'), t('fz.rc.waterAll'), r2(total), 'kg');
    const addW = Math.max(0, total - ex.water);
    add(`− ${g(r1(ex.water))} kg`, t('fz.rc.minusCloth'), t('fz.rc.addWater'), r2(addW), 'kg');
    const up = (Math.ceil(addW * 100 - 1e-9) / 100).toFixed(2);
    return { formula: t('fz.tut.vpFormula'), nodes, ops, answer: { val: up, unit: 'kg', note: t('fz.rc.roundUp', { v: up, u: 'kg' }) } };
  }
  if (kind === 'osmo') {
    const S = SUBSTANCES[ex.csub];
    const TK = ex.tc + 273;
    nodes.push({ label: t('fz.rc.sea', { f: S.formula }), val: r2(ex.c), unit: 'mol/L', calc: '' });
    const ci = S.i * ex.c;
    if (S.i > 1) add(`× ${k(S.i)}`, t('fz.rc.ionUp', { f: S.formula, i: S.i }), t('fz.rc.ci'), r2(ci), 'mol/L');
    const pi = (ci * CONST.R * TK) / 1e5;
    add(`× ${k('8.31×10³')} × (${g(ex.tc)} + ${k('273')})`, t('fz.rc.timesRT', { T: ex.tc, TK }), t('fz.rc.pi'), r2(pi), '×10⁵ Pa');
    const up = (Math.ceil(pi * 10 - 1e-9) / 10).toFixed(1);
    return { formula: 'Π = i c R T', nodes, ops, answer: { val: up, unit: '×10⁵ Pa', note: t('fz.rc.roundUpP', { v: up }) } };
  }
  // ステージ7：分子量
  if (ex.q === 'osm') {
    const TK = ex.tc + 273;
    nodes.push({ label: t('fz.rc.temp'), val: String(ex.tc), unit: '℃', calc: '' });
    add(`+ ${k('273')}`, t('fz.rc.toK'), t('fz.rc.tempK'), String(TK), 'K');
    const n = (ex.measured * ex.V) / (CONST.R * TK);
    add(`${g(`${ex.piMant}×10${sup(ex.piExp)}`)} × ${g(ex.V)} ÷ (${k('8.31×10³')} × ${TK})`, t('fz.rc.nFromPi'), t('fz.rc.nAll'), r4(n), 'mol');
    const M = ex.g / n;
    add(`${g(ex.g)} g ÷`, t('fz.rc.gPerMol'), t('fz.rc.M'), r1(M), '');
    return { formula: 'Π V = n R T', nodes, ops, answer: { val: r1(M), unit: '', note: t('fz.rc.pick') } };
  }
  const benz = ex.q === 'fpb';
  const base = benz ? CONST.benzeneFp : 0;
  nodes.push({ label: t('fz.rc.down'), val: r2(ex.dt), unit: 'K', calc: `${k(benz ? r2(base) : '0')} − (${g(benz ? r2(base - ex.dt) : `−${r2(ex.dt)}`)})` });
  const m = ex.dt / ex.kf;
  add(`÷ ${k(ex.kf)}`, t(benz ? 'fz.rc.byKfB' : 'fz.rc.byKf'), t('fz.rc.per1kgS'), r3(m), 'mol');
  const n = m * (ex.sg / 1000);
  add(`× ${g((ex.sg / 1000).toFixed(3))} kg`, t('fz.rc.timesSolvent'), t('fz.rc.nAll'), r4(n), 'mol');
  const M = ex.g / n;
  add(`${g(ex.g)} g ÷`, t('fz.rc.gPerMol'), t('fz.rc.M'), r1(M), '');
  return { formula: 'Δt = K_f × m', nodes, ops, answer: { val: r1(M), unit: '', note: t('fz.rc.pick') } };
}
