// freeze/src/model.js
// 凝固点降下の計算と、1夜の判定・朝の解説（全体の仕様書 9章、教科書 p.74〜75）。
//   Δt = K_f × m      m：質量モル濃度（溶媒 1 kg あたりの、溶けている粒子の物質量）
//   電解質は電離して粒子が増える：NaCl → Na⁺ + Cl⁻（2倍）、CaCl₂ → Ca²⁺ + 2Cl⁻（3倍）
//   区間の溶液の凝固点 ＝ 0 − Δt。夜の気温がこれより下がると、路面が凍る。

import { CONST, SUBSTANCES, STAGES, DIAG } from './config.js';

const ceil10 = (x) => Math.ceil(x / 10 - 1e-9) * 10;

/** 区間の凝固点（℃）。mass：撒いた質量 g、water：路面の水 kg */
export function freezingPoint(sub, mass, water) {
  if (!sub || !(mass > 0)) return 0;
  const s = SUBSTANCES[sub];
  const n = mass / s.M;
  return -CONST.Kf * s.i * (n / water);
}

/** その区間を守るのに必要な、ちょうどの質量 g（最低気温 low℃ でちょうど凍らない） */
export function neededMass(sub, water, low) {
  const s = SUBSTANCES[sub];
  const m = Math.max(0, -low) / CONST.Kf;           // 必要な粒子の質量モル濃度
  return (m * water / s.i) * s.M;
}

export function cost(sub, mass) {
  if (!sub || !(mass > 0)) return 0;
  const s = SUBSTANCES[sub];
  return (mass / s.M) * s.price;
}

/** 1夜の中身：区間と予算 */
export function nightOf(stageIdx, nightIdx) {
  const st = STAGES[stageIdx];
  const sections = st.nights[nightIdx].map(([water, low], i) => ({ i, water, low }));
  const particles = sections.reduce((a, s) => a + (-s.low / CONST.Kf) * s.water, 0);
  return { stage: st.id, night: nightIdx + 1, substances: st.substances, sections, budget: ceil10(particles * st.budgetPerMol) };
}

/** 準備の中身から、区間ごとの凝固点と費用 */
export function plan(night, picks) {
  const rows = night.sections.map((sec, k) => {
    const p = picks[k] || {};
    const fp = freezingPoint(p.sub, p.mass, sec.water);
    return { ...sec, sub: p.sub, mass: p.mass || 0, fp, cost: cost(p.sub, p.mass) };
  });
  const used = rows.reduce((a, r) => a + r.cost, 0);
  return { rows, used, left: night.budget - used, over: used > night.budget + 1e-9 };
}

/** 夜が明けたときの判定 */
export function judge(night, picks) {
  const p = plan(night, picks);
  const rows = p.rows.map((r) => {
    const frozen = r.low < r.fp - 1e-6;
    return { ...r, frozen, diag: diagnose(r, frozen) };
  });
  const safe = rows.filter((r) => !r.frozen).length;
  return { rows, safe, all: safe === rows.length, used: p.used, left: p.left, budget: night.budget, half: p.left >= night.budget / 2 - 1e-9 };
}

/**
 * 朝の解説：どこで計算がずれたか。
 *   ratio：撒いた粒子 ÷ 必要な粒子
 *   凍った区間：none（何も撒かない）、unit（g と kg の取りちがえ：約1/1000）、
 *              ionMore（電離の数を多く数えた：NaCl を3倍、尿素を2倍などと考えた）、near（少し足りない）、short（足りない）
 *   守った区間：forgotIon（電離を忘れて、必要の約 i 倍まいた：予算のむだ）、waste（多すぎ）、good
 */
export function diagnose(r, frozen) {
  if (!r.sub || !(r.mass > 0)) return { kind: frozen ? 'none' : 'good', ratio: 0 };
  const s = SUBSTANCES[r.sub];
  const need = neededMass(r.sub, r.water, r.low);
  const ratio = need > 0 ? r.mass / need : Infinity;
  const near = (x, y) => Math.abs(x / y - 1) <= DIAG.ionSlack;
  if (frozen) {
    if (ratio < 0.004) return { kind: 'unit', ratio, need };
    for (const wrongI of [2, 3]) {
      if (wrongI > s.i && near(ratio, s.i / wrongI)) return { kind: s.i === 1 ? 'ionNon' : 'ionMore', ratio, need, wrongI };
    }
    if (ratio >= DIAG.near) return { kind: 'near', ratio, need };
    return { kind: 'short', ratio, need };
  }
  if (s.i > 1 && near(ratio, s.i)) return { kind: 'forgotIon', ratio, need };
  if (ratio >= DIAG.waste) return { kind: 'waste', ratio, need };
  return { kind: 'good', ratio, need };
}

/** 夜の気温（t：0〜1） */
export function tempAt(low, t, N) {
  const k = t < N.lowAt ? Math.sin((t / N.lowAt) * Math.PI / 2) : 1 - N.endRise * ((t - N.lowAt) / (1 - N.lowAt));
  return N.startTemp + (low - N.startTemp) * k;
}
