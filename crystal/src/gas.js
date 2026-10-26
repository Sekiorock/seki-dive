// crystal/src/gas.js
// 気体の実験台：気体の溶解度とヘンリーの法則（全体の仕様書 8章、教科書 p.68〜69 表1・図10・図11）。
//   溶ける物質量 n = S(T) × (P ÷ 1.013×10⁵ Pa) × V(水のL)
//   S(T)：1.013×10⁵ Pa のもとで、水1 L に溶ける物質量（mol）。0・20・40・60℃の値の間は直線で補う。
//   溶けた気体の体積：溶かした圧力・温度のもとでは V = nRT/P（圧力を変えても同じ）、標準状態に直すと n × 22.4 L。
//   空気は、窒素と酸素が 4：1 の混合気体とし、それぞれの分圧で溶ける量を計算する。
//   HCl はとても溶けやすく、ヘンリーの法則に従わないので、計算の対象にしない。

import { GAS_RANGE, GAS_TABLE, GAS_TEMPS, GASES, GAS_CONST, DISCOVERY } from './config.js';

const P0 = 1.013e5;

/** 1.013×10⁵ Pa、T℃で、水1 L に溶ける物質量（mol） */
export function gasSolubility(id, T) {
  const row = GAS_TABLE[id];
  const x = Math.max(GAS_TEMPS[0], Math.min(GAS_TEMPS[GAS_TEMPS.length - 1], T));
  for (let i = 0; i < GAS_TEMPS.length - 1; i++) {
    const t0 = GAS_TEMPS[i], t1 = GAS_TEMPS[i + 1];
    if (x <= t1) return (row[i] + ((row[i + 1] - row[i]) * (x - t0)) / (t1 - t0)) * 1e-3;
  }
  return row[row.length - 1] * 1e-3;
}

/**
 * 溶ける気体の量を計算する。
 * @param gas  'H2' | 'N2' | 'O2' | 'CO2' | 'AIR' | 'HCl'
 * @param P    圧力（Pa）
 * @param T    温度（℃）
 * @param V    水の体積（L）
 * 返り値：{ henry: false } または
 *   { henry: true, parts: [{ id, frac, pp, S, n, mass, volP, volStd }], n, mass, volP, volStd }
 */
export function dissolve(gas, P, T, V) {
  const def = GASES[gas];
  if (!def.henry) return { henry: false, parts: [], n: 0, mass: 0, volP: 0, volStd: 0 };
  const TK = T + 273;
  const parts = def.mix.map(({ id, frac }) => {
    const pp = P * frac;                         // 分圧
    const S = gasSolubility(id, T);
    const n = S * (pp / P0) * V;
    const mass = n * GASES[id].M;
    const volP = (n * GAS_CONST.R * TK) / pp;    // その気体の分圧・温度のもとでの体積（L）
    const volStd = n * GAS_CONST.molarVolume;     // 標準状態（0℃、1.013×10⁵ Pa）での体積（L）
    return { id, frac, pp, S, n, mass, volP, volStd };
  });
  const sum = (k) => parts.reduce((a, p) => a + p[k], 0);
  return { henry: true, parts, n: sum('n'), mass: sum('mass'), volP: sum('volP'), volStd: sum('volStd') };
}

/** 気体の実験台の状態と、発見の見張り */
export function createGasLab({ onDiscover = () => {} } = {}) {
  const s = {
    gas: 'O2',
    pressure: GAS_RANGE.pressure.start,   // ×10⁵ Pa
    temp: GAS_RANGE.temp.start,
    volume: GAS_RANGE.volume.start,       // L
    eq: null,
    released: null,                       // 栓を開けたときに出てきた気体 { n, volStd, at }
    seenP: {}, seenT: {},
  };
  function compute() { s.eq = dissolve(s.gas, s.pressure * 1e5, s.temp, s.volume); return s.eq; }
  function check() {
    if (s.gas === 'HCl') { onDiscover('gasHCl'); return; }
    // 同じ気体・温度・水の量で、圧力を2倍以上に動かした → 溶ける量は圧力に比例
    const kp = `${s.gas}|${s.temp}|${s.volume}`;
    const rp = s.seenP[kp] || (s.seenP[kp] = { min: s.pressure, max: s.pressure });
    rp.min = Math.min(rp.min, s.pressure); rp.max = Math.max(rp.max, s.pressure);
    if (rp.max / rp.min >= DISCOVERY.gasPressureRatio - 1e-9) onDiscover('gasHenry');
    // 同じ気体・圧力・水の量で、温度を大きく動かした → 温度が高いほど溶けにくい
    const kt = `${s.gas}|${s.pressure}|${s.volume}`;
    const rt = s.seenT[kt] || (s.seenT[kt] = { min: s.temp, max: s.temp });
    rt.min = Math.min(rt.min, s.temp); rt.max = Math.max(rt.max, s.temp);
    if (rt.max - rt.min >= DISCOVERY.gasTempSpan) onDiscover('gasTemp');
    if (s.gas === 'AIR') onDiscover('gasAir');
  }
  compute();
  return {
    get state() { return s; },
    setGas(id) { s.gas = id; s.released = null; compute(); check(); },
    setPressure(p) { s.pressure = Math.round(p * 10) / 10; compute(); check(); },
    setTemp(T) { s.temp = T; compute(); check(); },
    setVolume(v) { s.volume = Math.round(v * 10) / 10; compute(); check(); },
    /** 栓を開ける：圧力が 1.0×10⁵ Pa に下がり、溶けきれなくなった分が泡になって出てくる */
    openCap() {
      if (!GASES[s.gas].henry) return null;
      const before = s.eq;
      const pBefore = s.pressure;
      s.pressure = GAS_RANGE.pressure.min;
      compute();
      const n = Math.max(0, before.n - s.eq.n);
      const volStd = Math.max(0, before.volStd - s.eq.volStd);
      s.released = { n, volStd, at: performance.now() };
      if (n > 0 && pBefore >= DISCOVERY.gasBubbleFrom - 1e-9) onDiscover('gasBubbles');
      check();
      return s.released;
    },
  };
}
