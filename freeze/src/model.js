// freeze/src/model.js
// 希薄溶液の計算と、1夜の判定・朝の解説（全体の仕様書 9章、教科書 p.72〜75）。
//   凝固点降下 Δt = K_f × m、沸点上昇 Δt = K_b × m、蒸気圧降下（粒子の質量モル濃度が大きいほど蒸気圧が下がり、乾きにくい）
//   m：質量モル濃度（溶媒 1 kg あたりの、溶けている粒子の物質量）。電解質は電離して粒子が増える（NaCl ×2、CaCl₂ ×3）。
// ステージの kind ごとに、区間（6つ）の中身と、合格の決まりがちがう。
//   freeze：路面の凝固点 ≦ 最低気温 なら守れる
//   curve ：すでに溶けている塩の分（冷却曲線から読む）に、撒いた分を足した凝固点 ≦ 最低気温 なら守れる
//   vapor ：真水を足して、布の粒子の質量モル濃度 ≦ 上限 なら乾く
//   boil  ：湯の沸点 ≧ 必要な沸点 なら煮立つ

import { CONST, SUBSTANCES, STAGES, DIAG, NIGHT, DRY, BOIL } from './config.js';

const ceil10 = (x) => Math.ceil(x / 10 - 1e-9) * 10;
const near = (x, y, slack = DIAG.ionSlack) => Math.abs(x / y - 1) <= slack;

/** 区間の中身を、kind ごとの形にする */
function sectionOf(kind, row, i) {
  if (kind === 'curve') { const [water, low, fp0, sc] = row; return { i, water, low, fp0, sc }; }
  if (kind === 'vapor') { const [csub, cg, water, mMax] = row; return { i, csub, cg, water, mMax }; }
  if (kind === 'boil') { const [water, rise] = row; return { i, water, rise, target: 100 + rise }; }
  const [water, low] = row; return { i, water, low };
}

/** 撒く・溶かす物質で、必要な粒子の物質量（mol） */
function particlesNeeded(kind, sec) {
  if (kind === 'freeze') return (Math.max(0, -sec.low) / CONST.Kf) * sec.water;
  if (kind === 'curve') return (Math.max(0, sec.fp0 - sec.low) / CONST.Kf) * sec.water;
  if (kind === 'boil') return (sec.rise / CONST.Kb) * sec.water;
  return 0;
}
/** ステージ4：足す真水（kg） */
function waterNeeded(sec) {
  const S = SUBSTANCES[sec.csub];
  const np = (sec.cg / S.M) * S.i;
  return Math.max(0, np / sec.mMax - sec.water);
}

/** その区間に、物質 sub をちょうどの量だけ撒く・溶かすときの質量 g（ステージ4は真水の kg） */
export function needed(kind, sec, sub) {
  if (kind === 'vapor') return waterNeeded(sec);
  const S = SUBSTANCES[sub];
  return (particlesNeeded(kind, sec) / S.i) * S.M;
}

export function cost(kind, sub, amount) {
  if (!(amount > 0)) return 0;
  if (kind === 'vapor') return amount * CONST.waterPrice;
  if (!sub) return 0;
  const S = SUBSTANCES[sub];
  return (amount / S.M) * S.price;
}

/** 1夜の中身：区間と予算 */
export function nightOf(stageIdx, nightIdx) {
  const st = STAGES[stageIdx];
  const kind = st.kind;
  const sections = st.nights[nightIdx].map((row, i) => sectionOf(kind, row, i));
  let budget;
  if (kind === 'vapor') budget = ceil10(sections.reduce((a, s) => a + waterNeeded(s), 0) * CONST.waterPrice * st.budgetPerKg);
  else budget = ceil10(sections.reduce((a, s) => a + particlesNeeded(kind, s), 0) * st.budgetPerMol);
  return { stage: st.id, night: nightIdx + 1, kind, substances: st.substances, sections, budget };
}

/** 区間の結果の値：freeze・curve は凝固点、vapor は粒子の質量モル濃度、boil は沸点 */
export function valueOf(kind, sec, pick) {
  const amt = Number(pick && pick.mass) || 0;
  if (kind === 'vapor') {
    const S = SUBSTANCES[sec.csub];
    return ((sec.cg / S.M) * S.i) / (sec.water + amt);
  }
  const S = pick && pick.sub ? SUBSTANCES[pick.sub] : null;
  const mp = S && amt > 0 ? ((amt / S.M) * S.i) / sec.water : 0;
  if (kind === 'freeze') return -CONST.Kf * mp;
  if (kind === 'curve') return sec.fp0 - CONST.Kf * mp;
  return 100 + CONST.Kb * mp;
}
/** 合格しなかったか（凍った・乾かなかった・煮立たなかった） */
export function failed(kind, sec, v) {
  if (kind === 'vapor') return v > sec.mMax + 1e-6;
  if (kind === 'boil') return v < sec.target - 1e-6;
  return sec.low < v - 1e-6;
}

/** 準備の中身から、区間ごとの値と費用 */
export function plan(night, picks) {
  const rows = night.sections.map((sec, k) => {
    const p = picks[k] || {};
    const amount = Number(p.mass) || 0;
    return { ...sec, sub: p.sub, mass: amount, value: valueOf(night.kind, sec, p), cost: cost(night.kind, p.sub, amount) };
  });
  const used = rows.reduce((a, r) => a + r.cost, 0);
  return { rows, used, left: night.budget - used, over: used > night.budget + 1e-9 };
}

/** 夜が明けたときの判定 */
export function judge(night, picks) {
  const p = plan(night, picks);
  const rows = p.rows.map((r) => {
    const fail = failed(night.kind, r, r.value);
    return { ...r, fail, frozen: fail, diag: diagnose(night.kind, r, fail) };
  });
  const safe = rows.filter((r) => !r.fail).length;
  return { rows, safe, all: safe === rows.length, used: p.used, left: p.left, budget: night.budget, half: p.left >= night.budget / 2 - 1e-9 };
}

/**
 * 朝の解説：どこで計算がずれたか。ratio：撒いた量 ÷ ちょうどの量
 *   共通：none（何もしない）、unit（g と kg：約1/1000）、ionMore・ionNon（電離の数を多く数えた）、near（少し足りない）、short、
 *         forgotIon（電離を忘れて約 i 倍：むだ）、waste（多すぎ）、good
 *   curve：readMin（過冷却のいちばん低い温度を凝固点と読んだ）、ignoredResidual（すでに溶けている塩を数えなかった：むだ）
 *   vapor：ionForgotW（電離を忘れて、真水が足りない）、noSubtract（布の水を引き忘れた：むだ）
 *   boil ：usedKf（K_b ではなく K_f を使った）
 */
export function diagnose(kind, r, fail) {
  const amt = r.mass || 0;
  if (kind === 'vapor') {
    const S = SUBSTANCES[r.csub];
    const need = waterNeeded(r);
    if (need <= 1e-9) return { kind: 'good', ratio: 1, need };
    if (!(amt > 0)) return { kind: fail ? 'none' : 'good', ratio: 0, need };
    const ratio = amt / need;
    if (fail) {
      const n = r.cg / S.M;
      const asIfI1 = Math.max(0, n / r.mMax - r.water);    // 電離を忘れたときの答え
      if (S.i > 1 && asIfI1 > 0 && near(amt, asIfI1)) return { kind: 'ionForgotW', ratio, need };
      if (ratio >= DIAG.near) return { kind: 'near', ratio, need };
      return { kind: 'short', ratio, need };
    }
    const total = (r.cg / S.M) * S.i / r.mMax;              // 布の水を引かなかったときの答え
    if (near(amt, total)) return { kind: 'noSubtract', ratio, need };
    if (ratio >= DIAG.waste) return { kind: 'waste', ratio, need };
    return { kind: 'good', ratio, need };
  }
  if (!r.sub || !(amt > 0)) return { kind: fail ? 'none' : 'good', ratio: 0 };
  const S = SUBSTANCES[r.sub];
  const need = needed(kind, r, r.sub);
  const ratio = need > 0 ? amt / need : Infinity;
  if (kind === 'curve') {
    // 撒いた量から、その人が「凝固点は何℃」と読んだかを逆算する
    const drop = CONST.Kf * ((amt / S.M) * S.i) / r.water;
    const readFp = r.low + drop;
    if (fail && Math.abs(readFp - (r.fp0 - r.sc)) <= DIAG.readSlack) return { kind: 'readMin', ratio, need, read: readFp };
    if (!fail && Math.abs(readFp) <= DIAG.readSlack && r.fp0 < -DIAG.readSlack) return { kind: 'ignoredResidual', ratio, need, read: readFp };
  }
  if (kind === 'boil' && fail && near(ratio, CONST.Kb / CONST.Kf)) return { kind: 'usedKf', ratio, need };
  if (fail) {
    if (ratio < 0.004) return { kind: 'unit', ratio, need };
    for (const wrongI of [2, 3]) {
      if (wrongI > S.i && near(ratio, S.i / wrongI)) return { kind: S.i === 1 ? 'ionNon' : 'ionMore', ratio, need, wrongI };
    }
    if (ratio >= DIAG.near) return { kind: 'near', ratio, need };
    return { kind: 'short', ratio, need };
  }
  if (S.i > 1 && near(ratio, S.i)) return { kind: 'forgotIon', ratio, need };
  if (ratio >= DIAG.waste) return { kind: 'waste', ratio, need };
  return { kind: 'good', ratio, need };
}

/** 夜の気温（t：0〜1） */
export function tempAt(low, t, N = NIGHT) {
  const k = t < N.lowAt ? Math.sin((t / N.lowAt) * Math.PI / 2) : 1 - N.endRise * ((t - N.lowAt) / (1 - N.lowAt));
  return N.startTemp + (low - N.startTemp) * k;
}

/** 夜の途中の、区間のようす（t：0〜1）。{ shown：表示する数値, failNow：もう失敗の見た目か, progress：0〜1 } */
export function nightState(kind, row, t) {
  if (kind === 'vapor') {
    const p = Math.min(1, t / 0.85);
    return { shown: (row.fail ? Math.min(p, DRY.failAt) : p), failNow: row.fail && p >= DRY.failAt, progress: row.fail ? Math.min(p, DRY.failAt) : p };
  }
  if (kind === 'boil') {
    const top = row.target + 0.6;
    const k = Math.min(1, t / BOIL.heatEnd);
    const T = Math.min(row.value, BOIL.startTemp + (top - BOIL.startTemp) * (1 - (1 - k) ** 2));
    const boiling = T >= row.value - 1e-6;
    return { shown: T, boiling, failNow: row.fail && t >= BOIL.heatEnd, progress: k };
  }
  const T = tempAt(row.low, t);
  return { shown: T, failNow: row.fail && T < row.value - 1e-6, progress: t };
}

/**
 * ステージ3の冷却曲線：時刻（分）と温度の点の列。
 *   ① 水が冷えていく（直線）→ ② 凝固点 fp0 を過ぎても凍らずに冷える（過冷却、深さ sc）→
 *   ③ 凍りはじめて温度がはね上がる → ④ 溶液が濃くなりながら、ゆっくり下がる（傾いた直線）。
 *   凝固点は、④の直線を左にのばして、①の直線と交わる点の温度。
 */
export function coolingCurve(sec) {
  const a = 0.5;                 // ① の冷え方（℃/分）
  const T0 = 2;
  const t0 = (T0 - sec.fp0) / a;            // ① が凝固点に届く時刻
  const tsc = t0 + sec.sc / a;              // 過冷却のいちばん低いところ
  const s = 0.06;                           // ④ の傾き（℃/分）
  const pts = [];
  for (let t = 0; t <= tsc + 1e-9; t += 0.25) pts.push([t, T0 - a * t]);
  const trise = tsc + 0.6;                  // はね上がって④の直線にのる時刻
  const line4 = (t) => sec.fp0 - s * (t - t0);
  for (let k = 1; k <= 6; k++) { const t = tsc + (0.6 * k) / 6; const y = (T0 - a * tsc) + (line4(trise) - (T0 - a * tsc)) * Math.sin((k / 6) * Math.PI / 2); pts.push([t, y]); }
  for (let t = trise + 0.25; t <= trise + 9; t += 0.25) pts.push([t, line4(t)]);
  return { pts, t0, tsc, line1: (t) => T0 - a * t, line4, tEnd: trise + 9 };
}
