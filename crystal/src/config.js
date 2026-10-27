// crystal/src/config.js
// ② クリスタル・ラボの数値の設定。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'crystal v0.3.0';

// 実験台の並び
export const BENCHES = ['solid', 'gas', 'conc'];

// ── 固体の実験台で動かせる範囲（全体の仕様書 8章） ──
export const RANGE = {
  temp: { min: 0, max: 80, step: 1, start: 60 },          // ℃
  water: { min: 50, max: 300, step: 1, start: 100 },      // g
  solute: { min: 0, max: 200, step: 1, start: 60 },       // g
};
export const SOLUTE_ORDER = ['KNO3', 'KCl', 'NaCl', 'CuSO4', 'CuSO4H', 'MIX'];

// ── 過飽和（全体の仕様書 8章：高温の溶液を急に冷やすと、まれに過飽和になる） ──
export const SUPER = {
  fastDrop: 15,         // この温度（℃）以上を…
  withinMs: 1500,       // …この時間のうちに下げたら「急に冷やした」とみなす
  chance: 0.35,         // そのとき過飽和になる確率
};

// ── 発見（自由実験で、初めて見た現象ごとに報酬） ──
export const DISCOVERY = {
  reward: 20,           // 1つの発見の報酬（ヒヤマ）。所得税と1日の上限がかかる
  naclSpan: 50,         // NaCl：飽和のまま、この温度の幅（℃）を動かしたら「温度でほとんど変わらない」の発見
  minMass: 10,          // 「全部とけた」などの発見に必要な溶質の量（g）
  gasPressureRatio: 2,  // 気体：同じ条件で圧力をこの倍率以上に動かしたら「ヘンリーの法則」の発見
  gasTempSpan: 30,      // 気体：同じ条件で温度をこの幅（℃）以上動かしたら「温度が高いと溶けにくい」の発見
  gasBubbleFrom: 2.0,   // 気体：この圧力（×10⁵ Pa）以上から栓を開けたら「泡が出る」の発見
  concDensitySpan: 0.2, // 濃度：溶質と溶媒はそのままで、密度をこの幅以上動かしたら発見
  concDilutePercent: 2, // 濃度：この質量パーセント濃度（%）以下の水溶液で、モル濃度と質量モル濃度がほぼ同じなら発見
  concScaleRatio: 1.5,  // 濃度：割合を変えずに、溶液の量をこの倍率以上にしたら発見
};
// 発見の一覧（実験台ごと）
export const DISCOVERY_GROUPS = {
  solid: ['allDissolved', 'saturated', 'precipitate', 'redissolve', 'supersat', 'seed', 'hydrateWater', 'naclFlat', 'mixSeparate'],
  gas: ['gasHenry', 'gasTemp', 'gasBubbles', 'gasAir', 'gasHCl'],
  conc: ['concDensity', 'concDilute', 'concScale'],
};
export const DISCOVERIES = [...DISCOVERY_GROUPS.solid, ...DISCOVERY_GROUPS.gas, ...DISCOVERY_GROUPS.conc];

// ── 気体の実験台（全体の仕様書 8章、教科書 p.68〜69） ──
export const GAS_RANGE = {
  pressure: { min: 1.0, max: 3.0, step: 0.1, start: 1.0 },   // ×10⁵ Pa
  temp: { min: 0, max: 60, step: 1, start: 20 },            // ℃
  volume: { min: 1, max: 10, step: 0.5, start: 5 },          // 水の体積（L）
};
export const GAS_ORDER = ['H2', 'N2', 'O2', 'CO2', 'AIR', 'HCl'];
// 1.013×10⁵ Pa のもとで、水1 L に溶ける物質量（×10⁻³ mol）。左から 0・20・40・60℃。
// 教科書の表1の値と違うときは、ここを書きかえてください。
export const GAS_TEMPS = [0, 20, 40, 60];
export const GAS_TABLE = {
  H2: [0.97, 0.81, 0.73, 0.72],
  N2: [1.03, 0.69, 0.53, 0.45],
  O2: [2.18, 1.39, 1.03, 0.88],
  CO2: [76.5, 39.1, 23.6, 16.4],
};
// 気体ごとの決まり（M：モル質量 g/mol、mix：まざっている気体と物質量の割合、henry：ヘンリーの法則で計算するか）
export const GASES = {
  H2: { formula: 'H₂', M: 2.0, mix: [{ id: 'H2', frac: 1 }], henry: true, color: '#ffffff' },
  N2: { formula: 'N₂', M: 28, mix: [{ id: 'N2', frac: 1 }], henry: true, color: '#7fa8ff' },
  O2: { formula: 'O₂', M: 32, mix: [{ id: 'O2', frac: 1 }], henry: true, color: '#ff6b7d' },
  CO2: { formula: 'CO₂', M: 44, mix: [{ id: 'CO2', frac: 1 }], henry: true, color: '#c9ced8' },
  AIR: { formula: 'Air', M: 0, mix: [{ id: 'N2', frac: 0.8 }, { id: 'O2', frac: 0.2 }], henry: true, color: '#b8c8ff' },
  HCl: { formula: 'HCl', M: 36.5, mix: [], henry: false, color: '#c8ff8a' },
};
export const GAS_CONST = {
  R: 8.31e3,            // 気体定数 Pa·L/(mol·K)
  molarVolume: 22.4,    // 標準状態での 1 mol の体積（L）
};
// 3D の粒：水に溶けた気体の粒1つが表す物質量（気体ごと。20℃・1.0×10⁵ Pa・5 L で、粒がおよそ12個になるように）
export const GAS_VIEW = {
  dotsAt: { temp: 20, pressure: 1.0, volume: 5, dots: 12 },
  maxDots: 90,
  maxVolume: 10,        // 容器の水の高さの基準（L）
};

// ── 濃度の実験台（全体の仕様書 8章、教科書 p.70〜71） ──
export const CONC_RANGE = {
  solute: { min: 0, max: 200, step: 1, start: 20 },          // 溶質の質量（g）
  solvent: { min: 50, max: 1000, step: 10, start: 200 },      // 溶媒（水）の質量（g）
  density: { min: 1.0, max: 1.84, step: 0.01, start: 1.05 },  // 溶液の密度（g/cm³）
};
export const CONC_ORDER = ['NaCl', 'GLU', 'H2SO4'];
// M：モル質量（g/mol）。density：その溶質を選んだときの、はじめの密度
export const CONC_SOLUTES = {
  NaCl: { formula: 'NaCl', M: 58.5, density: 1.05, color: '#ffffff' },
  GLU: { formula: 'C₆H₁₂O₆', M: 180, density: 1.04, color: '#FFC074' },
  H2SO4: { formula: 'H₂SO₄', M: 98, density: 1.3, color: '#8FF3FA' },
};
export const CONC_VIEW = {
  molPerDot: 0.05,      // 溶質の粒1つが表す物質量（mol）
  maxDots: 80,
  cylinderMl: 1300,     // メスシリンダーの目盛りのいちばん上（mL）
};

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,
  maxCrystals: 50,      // 結晶のかけらは同時に50個まで（全体の仕様書：物体は60個まで）
  gramsPerPiece: 3,     // 結晶のかけら1つが表す質量（g）。多いときは1つを大きくする
  beakerMl: 500,        // ビーカーの大きさ（mL）。水の高さの目安
  fov: 40,
  ease: 6,              // 結晶の量が新しい値に近づく速さ（大きいほど速い）
};

// ── カメラ（指で回す・ピンチで寄る・2本指で動かす・視点のボタン） ──
export const CAMERA = {
  margin: 1.12,         // 見せたいものの周りに残す余白（1 より大きいほど引く）
  zoomMin: 0.22,        // いちばん寄ったとき（視点の距離の倍率）
  zoomMax: 2.2,         // いちばん引いたとき
  elMin: -0.05,         // 見上げる限界（ラジアン）
  elMax: 1.45,          // 真上近くまで
  panMax: 3,            // 2本指で動かせる範囲
  rotateSpeed: 0.007,
  ease: 7,              // 視点が新しい位置に近づく速さ
  doubleTapMs: 320,     // ダブルタップで視点を元に戻す
};

// ── 注文モード（全体の仕様書 8章：予想を数値で入れてから実験し、予想と結果の差で報酬が決まる） ──
export const ORDER = {
  rewards: [150, 80, 20],     // 差が tol[0] 以内／tol[1] 以内／それ以外（g の問題は 0.5 g と 2 g）
  durMs: 2800,                // 実験の動き（温度を下げる、水を蒸発させる など）の長さ
};

// ── 精製モード（全体の仕様書 8章：KNO₃ と CuSO₄·5H₂O の混合物から、指定の純度と質量の KNO₃ を取り出す） ──
export const REFINE = {
  reward: 120,                // その段階を初めて達成したときの報酬
  adhere: 0.15,               // ろ過したあと、結晶にしみこんで残る液（母液）の割合（結晶の質量に対して）
  washTemp: 0,                // 洗うのに使う冷水の温度（℃）
  washEff: 0.5,               // 洗う水が、どれだけ結晶を溶かしてしまうか（溶解度いっぱいを 1 とする）
  washMax: 3,                 // 洗える回数
  wash: { min: 0, max: 50, step: 5, start: 20 },   // 1回に使う冷水（g）
  // 段階：混合物の中身（g）と、目標（取り出す KNO₃ の質量 g 以上、純度 % 以上）
  levels: [
    { kno3: 90, cuh: 10, mass: 50, purity: 99.0 },
    { kno3: 80, cuh: 20, mass: 45, purity: 99.0 },
    { kno3: 70, cuh: 30, mass: 38, purity: 99.5 },
    { kno3: 60, cuh: 40, mass: 28, purity: 99.5 },
    { kno3: 100, cuh: 20, mass: 70, purity: 99.8 },
  ],
};
