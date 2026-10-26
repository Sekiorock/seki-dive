// hydration/src/notes.js
// 溶質ノーツの一覧（ハイドレーション・ビート仕様書 3章、溶媒が水のとき）。譜面はこの一覧から選んで並べる。
// v0.4：溶媒がヘキサンのとき（ステージ5・6）の正解は answerIn(def, 'hexane')。
//   無極性分子（ヨウ素、ナフタレン、ベンゼン、四塩化炭素、ヘキサン）：'M' = 中央の「なじむ」ボタン
//   それ以外（イオン、糖など極性の大きい分子）：'PASS'（ヘキサンには溶けにくいので見送る）
//
//   formula   化学式（どちらの言語でも同じ表記）
//   answer    正解の入力
//               'O'    = 左ボタン（水の O を向ける）
//               'H'    = 右ボタン（水の H を向ける）
//               'OH'   = 左右の同時押し（-OH などで、水と水素結合する）
//               'PASS' = 押さない（見送る。水和しない）
//               'M'    = 中央の「なじむ」ボタン（溶媒がヘキサンのときだけ）
//   group     種類（補助輪の文字、間違いの種類、色分けに使う）
//               cation 陽イオン / anion 陰イオン / hydroxy -OH をもつ分子 / sugar 糖（-OH がたくさん）
//               polar 極性分子（一部だけ電離する弱電解質）/ hcl HCl（電離ノーツ）/ nonpolar 無極性分子
//               insoluble 溶けにくい結晶
//   model     3Dの分子模型（scene3d.js が作る）
//   chainKey  糖のように「同時押しの連続」になるノーツ：-OH の数（charts.js が展開する）
//   charge    イオンの電荷（模型の色と記号）

export const NOTES = {
  // ── 陽イオン：水の O（δ−）を向ける ──
  Na: { formula: 'Na⁺', answer: 'O', group: 'cation', model: 'ion', r: 0.36, charge: '+' },
  K: { formula: 'K⁺', answer: 'O', group: 'cation', model: 'ion', r: 0.44, charge: '+' },
  Cu: { formula: 'Cu²⁺', answer: 'O', group: 'cation', model: 'ion', r: 0.34, charge: '2+' },
  // ── 陰イオン：水の H（δ+）を向ける ──
  Cl: { formula: 'Cl⁻', answer: 'H', group: 'anion', model: 'ion', r: 0.5, charge: '−' },
  I: { formula: 'I⁻', answer: 'H', group: 'anion', model: 'ion', r: 0.6, charge: '−' },
  OH: { formula: 'OH⁻', answer: 'H', group: 'anion', model: 'hydroxide', r: 0.4, charge: '−' },
  SO4: { formula: 'SO₄²⁻', answer: 'H', group: 'anion', model: 'sulfate', r: 0.5, charge: '2−' },
  // ── -OH をもつ分子：同時押し ──
  EtOH: { formula: 'C₂H₅OH', answer: 'OH', group: 'hydroxy', model: 'ethanol', r: 0.5 },
  Glc: { formula: 'C₆H₁₂O₆', answer: 'OH', group: 'sugar', model: 'glucose', r: 0.6, chain: 5 },
  Suc: { formula: 'C₁₂H₂₂O₁₁', answer: 'OH', group: 'sugar', model: 'sucrose', r: 0.7, chain: 8 },
  OHb: { formula: '−OH', answer: 'OH', group: 'sugarOH', model: 'ohBead', r: 0.3 },   // 糖の2つ目からの -OH
  // ── 極性分子（弱電解質）：同時押し ──
  NH3: { formula: 'NH₃', answer: 'OH', group: 'polar', model: 'ammonia', r: 0.4 },
  AcOH: { formula: 'CH₃COOH', answer: 'OH', group: 'polar', model: 'acetic', r: 0.5 },
  // ── HCl（電離ノーツ）：左（O）→ 直後に右（H） ──
  HCl: { formula: 'HCl', answer: 'O', group: 'hcl', model: 'hcl', r: 0.45 },
  HClCl: { formula: 'Cl⁻', answer: 'H', group: 'hclCl', model: 'ion', r: 0.46, charge: '−' },
  // ── 無極性分子：見送る ──
  Hex: { formula: 'C₆H₁₄', answer: 'PASS', group: 'nonpolar', model: 'hexane', r: 0.6, nameKey: 'hb.sub.hexane' },
  Bz: { formula: 'C₆H₆', answer: 'PASS', group: 'nonpolar', model: 'benzene', r: 0.55, nameKey: 'hb.sub.benzene' },
  CCl4: { formula: 'CCl₄', answer: 'PASS', group: 'nonpolar', model: 'ccl4', r: 0.55 },
  I2: { formula: 'I₂', answer: 'PASS', group: 'nonpolar', model: 'iodine', r: 0.55 },
  Nap: { formula: 'C₁₀H₈', answer: 'PASS', group: 'nonpolar', model: 'naphthalene', r: 0.65, nameKey: 'hb.sub.naphthalene' },
  // ── 溶けにくいイオン結晶：見送る ──
  AgCl: { formula: 'AgCl', answer: 'PASS', group: 'insoluble', model: 'crystal', r: 0.5 },
  BaSO4: { formula: 'BaSO₄', answer: 'PASS', group: 'insoluble', model: 'crystal', r: 0.5 },
  CaCO3: { formula: 'CaCO₃', answer: 'PASS', group: 'insoluble', model: 'crystal', r: 0.5 },
};
for (const [id, d] of Object.entries(NOTES)) {
  d.id = id;
  d.nameKey = d.nameKey || `hb.name.${id}`;
}

/** 図鑑に並べる溶質（糖の2つ目からの -OH と、HCl から分かれた Cl⁻ は除く） */
export const ZUKAN_ORDER = ['Na', 'K', 'Cu', 'Cl', 'I', 'OH', 'SO4', 'EtOH', 'Glc', 'Suc', 'NH3', 'AcOH', 'HCl',
  'Hex', 'Bz', 'CCl4', 'I2', 'Nap', 'AgCl', 'BaSO4', 'CaCO3'];

/** 溶媒ごとの正解の入力 */
export function answerIn(def, solvent) {
  if (solvent !== 'hexane') return def.answer;
  return def.group === 'nonpolar' ? 'M' : 'PASS';
}

/** 補助輪の文字の鍵（溶媒がヘキサンのときは、ヘキサンでの見分け方） */
export function kindKeyIn(def, solvent) {
  if (solvent !== 'hexane') return `hb.kind.${def.group}`;
  if (def.group === 'nonpolar') return 'hb.kindHex.nonpolar';
  if (def.group === 'cation' || def.group === 'anion' || def.group === 'hclCl') return 'hb.kindHex.ion';
  return 'hb.kindHex.polar';
}

/** 補助輪の段階1で出す文字の i18n の鍵 */
export function kindKey(def) { return `hb.kind.${def.group}`; }

/**
 * 間違いの種類（v0.4 の結果画面で、種類ごとに解説を出す。ハイドレーション・ビート仕様書 5章）
 *   input：押したボタン。'none' は「同時押しのノーツで片方しか押さなかった」
 */
export function mistakeKind(def, input, solvent = 'water') {
  if (solvent === 'hexane') {
    if (def.group === 'nonpolar') return 'timing';
    if (def.group === 'cation' || def.group === 'anion' || def.group === 'hclCl') return 'ionInHexane';
    return 'polarInHexane';
  }
  switch (def.group) {
    case 'cation': return input === 'H' ? 'cationH' : 'timing';
    case 'anion': case 'hclCl': return input === 'O' ? 'anionO' : 'timing';
    case 'hydroxy': case 'sugar': case 'sugarOH': case 'polar': return 'ohOneSide';
    case 'hcl': return 'hclOrder';
    case 'nonpolar': return 'nonpolarHydrated';
    case 'insoluble': return 'insolubleDissolved';
    default: return 'timing';
  }
}

/** 模型の色分け：陽イオン側（δ+）か陰イオン側（δ−）か */
export function chargeSide(def) {
  if (def.group === 'cation') return 'plus';
  if (def.group === 'anion' || def.group === 'hclCl') return 'minus';
  return 'neutral';
}
