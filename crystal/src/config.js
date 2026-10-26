// crystal/src/config.js
// ② クリスタル・ラボの数値の設定。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'crystal v0.1.0';

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
};
export const DISCOVERIES = ['allDissolved', 'saturated', 'precipitate', 'redissolve', 'supersat', 'seed', 'hydrateWater', 'naclFlat', 'mixSeparate'];

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,
  shiftUp: 0.2,         // 縦長の画面で、3Dの絵を上へずらす割合（画面の高さに対して）
  zoomOut: 1.22,        // カメラを少し離す（1 より大きいほど小さく見える）
  maxCrystals: 50,      // 結晶のかけらは同時に50個まで（全体の仕様書：物体は60個まで）
  gramsPerPiece: 3,     // 結晶のかけら1つが表す質量（g）。多いときは1つを大きくする
  beakerMl: 500,        // ビーカーの大きさ（mL）。水の高さの目安
  fov: 40,
  ease: 6,              // 結晶の量が新しい値に近づく速さ（大きいほど速い）
};
