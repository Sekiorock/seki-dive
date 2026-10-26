// crystal/src/lab.js
// 固体の実験台の状態と、自由実験の「発見」の見張り（全体の仕様書 8章）。
//   ・溶質の種類・溶質の質量・水の質量・温度を変えるたびに、溶けている量と結晶の量を計算しなおす。
//   ・高温の溶液を急に冷やすと、まれに過飽和（結晶が出ない）になる。「種結晶を落とす」で一気に結晶が出る。
//   ・初めて見た現象（発見）を知らせる。

import { equilibrium, curvePoint } from './solubility.js';
import { RANGE, SUPER, DISCOVERY } from './config.js';

export function createLab({ onDiscover = () => {}, random = Math.random } = {}) {
  const s = {
    solute: 'KNO3',
    mass: RANGE.solute.start,
    water: RANGE.water.start,
    temp: RANGE.temp.start,
    superSat: false,
    eq: null,
    // 発見の見張りに使う、少し前の状態
    prevCrystal: 0,
    tempLog: [],          // 最近の温度 { t, T }（急に冷やしたかを調べる）
    naclMin: null, naclMax: null,
  };

  function compute() {
    s.eq = equilibrium(s.solute, s.mass, s.water, s.temp, { superSat: s.superSat });
    s.point = curvePoint(s.solute, s.mass, s.water);
    // 過飽和は、溶けきれる状態に戻ったら終わる
    if (s.superSat && s.eq.state !== 'supersaturated') s.superSat = false;
    return s.eq;
  }

  function check(cause) {
    const e = s.eq;
    if (e.state === 'unsaturated' && s.mass >= DISCOVERY.minMass) onDiscover('allDissolved');
    if (e.state === 'saturated' && e.crystal > 0.5 && cause !== 'temp') onDiscover('saturated');
    if (cause === 'temp' && s.prevCrystal < 0.05 && e.crystal > 0.5 && e.state === 'saturated') onDiscover('precipitate');
    if (cause === 'temp' && s.prevCrystal > 0.5 && e.crystal < 0.05) onDiscover('redissolve');
    if (e.state === 'supersaturated') onDiscover('supersat');
    if (s.solute === 'CuSO4H' && e.addedWater >= 5 && e.parts[0].dissolved > 0) onDiscover('hydrateWater');
    if (s.solute === 'MIX') {
      const k = e.parts.find((p) => p.id === 'KNO3'), c = e.parts.find((p) => p.id === 'CuSO4');
      if (k.crystal > 1 && c.crystal < 0.01) onDiscover('mixSeparate');
    }
    // NaCl：溶け残りがあるまま、温度を大きく動かす
    if (s.solute === 'NaCl' && e.state === 'saturated') {
      s.naclMin = s.naclMin === null ? s.temp : Math.min(s.naclMin, s.temp);
      s.naclMax = s.naclMax === null ? s.temp : Math.max(s.naclMax, s.temp);
      if (s.naclMax - s.naclMin >= DISCOVERY.naclSpan) onDiscover('naclFlat');
    } else { s.naclMin = null; s.naclMax = null; }
    s.prevCrystal = e.crystal;
  }

  compute();
  s.prevCrystal = s.eq.crystal;

  return {
    get state() { return s; },
    setSolute(id) {
      s.solute = id; s.superSat = false; s.naclMin = null; s.naclMax = null;
      compute(); s.prevCrystal = s.eq.crystal; check('solute');
    },
    setMass(m) { s.mass = m; if (s.superSat) s.superSat = false; compute(); check('mass'); },
    setWater(w) { s.water = w; compute(); check('water'); },
    setTemp(T, nowMs = performance.now()) {
      const before = s.temp;
      s.tempLog.push({ t: nowMs, T: before });
      s.tempLog = s.tempLog.filter((x) => nowMs - x.t <= SUPER.withinMs);
      s.temp = T;
      // 急に冷やして、結晶が出はじめるところを越えたら、まれに過飽和
      if (!s.superSat && T < before) {
        const peak = Math.max(...s.tempLog.map((x) => x.T), before);
        const wouldCrystal = equilibrium(s.solute, s.mass, s.water, T).crystal;
        const hadCrystal = equilibrium(s.solute, s.mass, s.water, before).crystal;
        if (peak - T >= SUPER.fastDrop && hadCrystal < 0.05 && wouldCrystal > 0.5 && random() < SUPER.chance) s.superSat = true;
      }
      compute(); check('temp');
    },
    /** 種結晶を落とす：過飽和が一気にこわれて、結晶が出る */
    seed() {
      if (!s.superSat) return false;
      s.superSat = false;
      s.prevCrystal = 0;
      compute();
      onDiscover('seed');
      check('seed');
      return true;
    },
    /** 確かめるとき用：過飽和にする */
    forceSuper() { s.superSat = true; compute(); check('temp'); },
  };
}
