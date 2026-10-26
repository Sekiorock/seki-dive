// crystal/src/solubility.js
// 溶解度のデータと、ビーカーの中で「どれだけ溶けて、どれだけ結晶になるか」の計算（全体の仕様書 8章）。
// 溶解度は g / 水100 g。間の温度は直線で補う（教科書の例題と合う値）。
//
// 硫酸銅(II)：溶解度は無水物 CuSO₄ の質量で表す。水溶液から出てくる結晶は五水和物 CuSO₄·5H₂O（青い結晶）。
//   五水和物を溶かすと、結晶の中の水（質量の約36%）が溶媒の水に加わる。
//   析出する五水和物 x g は、溶けている無水物の質量 A、水の質量 W、溶解度 S から
//   (A − a·x) / (W − b·x) = S / 100   ⇒   x = (100A − S·W) / (100a − S·b)
//   （a = CuSO₄ / CuSO₄·5H₂O = 159.6 / 249.7、b = 5H₂O / CuSO₄·5H₂O = 90.1 / 249.7）

export const TEMPS = [0, 10, 20, 30, 40, 50, 60, 70, 80];
export const TABLE = {
  KNO3: [13, 22, 32, 46, 64, 85, 110, 138, 169],
  KCl: [28, 31, 34, 37, 40, 43, 46, 48, 51],
  NaCl: [35.7, 35.8, 35.9, 36.1, 36.3, 36.7, 37.1, 37.5, 38.0],
  CuSO4: [14, 17, 20, 25, 29, 34, 40, 47, 56],
};
export const HYD = { a: 159.6 / 249.7, b: 90.1 / 249.7 };   // 五水和物の中の無水物と水の割合

/** 溶解度（g / 水100 g）。0〜80℃ の外は端の値 */
export function solubility(id, T) {
  const tb = TABLE[id];
  if (T <= TEMPS[0]) return tb[0];
  if (T >= TEMPS[TEMPS.length - 1]) return tb[tb.length - 1];
  const i = Math.floor(T / 10);
  const k = (T - TEMPS[i]) / 10;
  return tb[i] + (tb[i + 1] - tb[i]) * k;
}

/**
 * 実験台に入れる溶質の種類。parts：どの物質がどれだけの割合で入っているか。
 *   form 'anhydrous'：無水物として入れる（CuSO₄ の白い粉）、'hydrate'：五水和物として入れる（青い結晶）
 */
export const SOLUTES = {
  KNO3: { parts: [{ id: 'KNO3', frac: 1 }], formula: 'KNO₃' },
  KCl: { parts: [{ id: 'KCl', frac: 1 }], formula: 'KCl' },
  NaCl: { parts: [{ id: 'NaCl', frac: 1 }], formula: 'NaCl' },
  CuSO4: { parts: [{ id: 'CuSO4', frac: 1, form: 'anhydrous' }], formula: 'CuSO₄' },
  CuSO4H: { parts: [{ id: 'CuSO4', frac: 1, form: 'hydrate' }], formula: 'CuSO₄·5H₂O' },
  MIX: { parts: [{ id: 'KNO3', frac: 0.9 }, { id: 'CuSO4', frac: 0.1, form: 'hydrate' }], formula: 'KNO₃ + CuSO₄·5H₂O' },
};

/**
 * ビーカーの中のつり合い（溶けきるか、どれだけ結晶になるか）。
 * @param {string} soluteId SOLUTES の鍵
 * @param {number} mass 入れた溶質の質量 g
 * @param {number} water 入れた水の質量 g
 * @param {number} T 温度 ℃
 * @param {object} [opt] { superSat: true なら結晶を出さない（過飽和） }
 * @returns {{
 *   water: number,          溶液の中の水（五水和物から加わった水も含む、析出した結晶の中の水は除く）
 *   addedWater: number,     五水和物を溶かして加わった水
 *   parts: [{ id, total, dissolved, crystal, crystalForm, S, saturated, over }],
 *   crystal: number,        結晶の合計 g（析出した形の質量）
 *   dissolved: number,      溶けている溶質の合計 g（無水物として）
 *   solution: number,       溶液の質量 g
 *   state: 'empty' | 'unsaturated' | 'saturated' | 'supersaturated'
 * }}
 */
export function equilibrium(soluteId, mass, water, T, opt = {}) {
  const sol = SOLUTES[soluteId];
  let W = water;
  let addedWater = 0;
  const parts = sol.parts.map((p) => {
    const m = mass * p.frac;
    const anhyd = p.form === 'hydrate' ? m * HYD.a : m;
    const wIn = p.form === 'hydrate' ? m * HYD.b : 0;
    addedWater += wIn;
    return { id: p.id, form: p.form, given: m, total: anhyd, waterIn: wIn };
  });
  W += addedWater;
  const out = [];
  // 硫酸銅（水和物として析出し、水を持っていく）を先に計算し、残りの水で硝酸カリウムなどを計算する
  const order = [...parts].sort((a, b) => (a.id === 'CuSO4' ? -1 : 0) - (b.id === 'CuSO4' ? -1 : 0));
  let Wsol = W;
  for (const p of order) {
    const S = solubility(p.id, T);
    let dissolved = p.total, crystal = 0, crystalForm = p.id === 'CuSO4' ? 'hydrate' : 'anhydrous';
    const capacity = (S * Wsol) / 100;
    const over = p.total > capacity + 1e-9;
    if (over && !opt.superSat) {
      if (p.id === 'CuSO4') {
        const x = Math.max(0, (100 * p.total - S * Wsol) / (100 * HYD.a - S * HYD.b));
        crystal = x;
        dissolved = p.total - HYD.a * x;
        Wsol -= HYD.b * x;
      } else {
        dissolved = capacity;
        crystal = p.total - capacity;
      }
    }
    out.push({ id: p.id, total: p.total, given: p.given, dissolved, crystal, crystalForm, S, saturated: over && !opt.superSat, over });
  }
  const crystal = out.reduce((s, p) => s + p.crystal, 0);
  const dissolved = out.reduce((s, p) => s + p.dissolved, 0);
  const anyOver = out.some((p) => p.over);
  let state = 'unsaturated';
  if (mass <= 0) state = 'empty';
  else if (anyOver && opt.superSat) state = 'supersaturated';
  else if (anyOver) state = 'saturated';
  // 並び順を元の順番に戻す
  const parts2 = sol.parts.map((p) => out.find((o) => o.id === p.id));
  return { water: Wsol, addedWater, parts: parts2, crystal, dissolved, solution: Wsol + dissolved, state };
}

/** 溶解度曲線の上の「今の状態」の点：水100 g あたりに入れた溶質（無水物）の質量 */
export function curvePoint(soluteId, mass, water) {
  const sol = SOLUTES[soluteId];
  const p = sol.parts[0];
  const m = mass * p.frac;
  const anhyd = p.form === 'hydrate' ? m * HYD.a : m;
  const wAdd = sol.parts.reduce((s, q) => s + (q.form === 'hydrate' ? mass * q.frac * HYD.b : 0), 0);
  return { id: p.id, y: (anhyd / (water + wAdd)) * 100 };
}
