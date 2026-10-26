// crystal/src/conc.js
// 濃度の実験台：3つの濃度を同時に見る（全体の仕様書 8章、教科書 p.70〜71 例題3）。
//   質量パーセント濃度（%）  = 溶質の質量 ÷ 溶液の質量 × 100
//   モル濃度（mol/L）       = 溶質の物質量 ÷ 溶液の体積（L）
//   質量モル濃度（mol/kg）  = 溶質の物質量 ÷ 溶媒の質量（kg）
//   溶液の体積（mL）         = 溶液の質量（g） ÷ 密度（g/cm³）

import { CONC_RANGE, CONC_SOLUTES, DISCOVERY } from './config.js';

export function concentrations(soluteId, solute, solvent, density) {
  const M = CONC_SOLUTES[soluteId].M;
  const mass = solute + solvent;
  const n = solute / M;
  const volMl = mass / density;
  return {
    M, n, mass, volMl,
    percent: mass > 0 ? (solute / mass) * 100 : 0,
    molarity: volMl > 0 ? n / (volMl / 1000) : 0,
    molality: solvent > 0 ? n / (solvent / 1000) : 0,
  };
}

export function createConcLab({ onDiscover = () => {} } = {}) {
  const s = {
    solute: 'NaCl',
    solute_g: CONC_RANGE.solute.start,
    solvent: CONC_RANGE.solvent.start,
    density: CONC_RANGE.density.start,
    eq: null,
    densityFrom: null,        // 溶質と溶媒をそのままにして、密度だけを動かしはじめたときの値
    samples: [],              // 溶質と溶媒の割合の記録（「両方を同じ倍率にする」の発見）
  };
  function compute() { s.eq = concentrations(s.solute, s.solute_g, s.solvent, s.density); return s.eq; }
  function check(cause, prev) {
    const e = s.eq;
    if (s.solute_g <= 0) return;
    // 密度だけを大きく動かした → モル濃度だけが変わる
    if (cause === 'density') {
      if (s.densityFrom === null) s.densityFrom = prev;
      if (Math.abs(s.density - s.densityFrom) >= DISCOVERY.concDensitySpan - 1e-9) onDiscover('concDensity');
    } else s.densityFrom = null;
    // うすい水溶液では、モル濃度と質量モル濃度がほとんど同じ
    if (e.percent <= DISCOVERY.concDilutePercent && Math.abs(s.density - 1) <= 0.02 && Math.abs(e.molarity - e.molality) / e.molality <= 0.05) onDiscover('concDilute');
    // 溶質と溶媒を同じ倍率にした → 3つの濃度は変わらない
    const ratio = s.solute_g / s.solvent;
    for (const p of s.samples) {
      if (p.solute === s.solute && Math.abs(p.ratio - ratio) / ratio <= 0.01 && Math.abs(p.density - s.density) < 1e-9
        && Math.max(p.mass, e.mass) / Math.min(p.mass, e.mass) >= DISCOVERY.concScaleRatio) { onDiscover('concScale'); break; }
    }
    s.samples.push({ solute: s.solute, ratio, mass: e.mass, density: s.density });
    if (s.samples.length > 200) s.samples.shift();
  }
  compute();
  return {
    get state() { return s; },
    setSolute(id) { s.solute = id; s.density = CONC_SOLUTES[id].density; compute(); check('solute'); },
    setSoluteMass(g) { s.solute_g = g; compute(); check('solute_g'); },
    setSolvent(g) { s.solvent = g; compute(); check('solvent'); },
    setDensity(d) { const prev = s.density; s.density = Math.round(d * 100) / 100; compute(); check('density', prev); },
  };
}
