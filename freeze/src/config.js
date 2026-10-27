// freeze/src/config.js
// ③ フリーズ・ガードの数値の設定（全体の仕様書 9章）。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'freeze v0.3.0';

// ── 計算に使う定数（教科書の値） ──
export const CONST = {
  Kf: 1.85,             // 水のモル凝固点降下 K·kg/mol
  Kb: 0.515,            // 水のモル沸点上昇 K·kg/mol
  waterPrice: 6,        // ステージ4：真水 1 kg の値段（pt）
  R: 8.31e3,            // 気体定数 Pa·L/(mol·K)
  pressPrice: 2,        // ステージ6：圧力 1×10⁵ Pa ぶんの電気代（pt）
  benzeneKf: 5.12,      // ステージ7：ベンゼンのモル凝固点降下 K·kg/mol
  benzeneFp: 5.53,      // ベンゼンの凝固点 ℃
};

// ── 撒く物質：M（モル質量 g/mol）、i（1 mol が水の中で何 mol の粒子になるか）、price（1 mol あたりの資材の値段 pt） ──
export const SUBSTANCES = {
  urea: { formula: 'CO(NH₂)₂', M: 60, i: 1, price: 10, color: '#ffffff' },
  glucose: { formula: 'C₆H₁₂O₆', M: 180, i: 1, price: 24, color: '#FFC074' },
  NaCl: { formula: 'NaCl', M: 58.5, i: 2, price: 12, color: '#cfe0ff' },
  CaCl2: { formula: 'CaCl₂', M: 111, i: 3, price: 13, color: '#8FF3FA' },
  // ステージ7の候補（撒く物質ではない）
  sucrose: { formula: 'C₁₂H₂₂O₁₁', M: 342, i: 1, price: 0 },
  glycerol: { formula: 'C₃H₈O₃', M: 92, i: 1, price: 0 },
  egly: { formula: 'C₂H₆O₂', M: 62, i: 1, price: 0 },
  naph: { formula: 'C₁₀H₈', M: 128, i: 1, price: 0 },
};

// ── ステージ（各ステージ3夜）。kind で、1夜の中身が変わる ──
//   freeze：sections は [路面の水 kg, 今夜の最低気温の予報 ℃]
//   curve ：[路面の水 kg, 最低気温 ℃, すでに溶けている塩による凝固点 ℃, 過冷却の深さ ℃]（凝固点は冷却曲線から読む）
//   vapor ：[布にしみた物質, その質量 g, 布の水 kg, 今夜乾くための粒子の質量モル濃度の上限 mol/kg]（真水を足して薄める）
//   boil  ：[湯の水 kg, 必要な沸点の上昇 K]（沸点を上げる）
// budgetPerMol：予算 ＝ 6区間を守るのに必要な粒子の物質量の合計 × この数（10 pt きざみに切り上げ）
//   ステージ1：尿素だけで守れば予算の半分以上が残る。グルコースだけだと予算が足りない。
//   ステージ2：尿素やグルコースだけでは予算が足りない。電離して粒子が増える NaCl・CaCl₂ を使う。CaCl₂ なら半分以上残せる。
export const STAGES = [
  {
    id: 1, kind: 'freeze', substances: ['urea', 'glucose'], budgetPerMol: 22,
    nights: [
      [[1.0, -1.0], [2.0, -2.0], [2.0, -3.0]],
      [[2.0, -2.0], [1.5, -2.5], [1.0, -4.0]],
      [[2.5, -3.0], [2.0, -4.0], [1.5, -5.0]],
    ],
  },
  {
    id: 2, kind: 'freeze', substances: ['urea', 'glucose', 'NaCl', 'CaCl2'], budgetPerMol: 9.6,
    nights: [
      [[2.0, -3.0], [2.0, -4.0], [1.5, -5.0]],
      [[3.0, -4.0], [2.0, -6.0], [1.5, -6.0]],
      [[3.0, -6.0], [2.5, -7.0], [2.0, -8.0]],
    ],
  },
  {
    // 冷却曲線の観測所：路面の水には、前の夜の塩がすでに溶けている。その凝固点を、過冷却のある冷却曲線から読み取って、足りない分だけ撒く
    id: 3, kind: 'curve', substances: ['urea', 'NaCl', 'CaCl2'], budgetPerMol: 9.6,
    nights: [
      [[2.0, -3.0, -0.8, 0.7], [2.5, -4.0, -1.2, 0.9], [2.0, -5.0, -1.5, 1.0]],
      [[3.0, -4.5, -1.1, 0.8], [2.0, -5.5, -1.8, 1.1], [3.0, -6.0, -2.0, 1.2]],
      [[3.0, -6.0, -1.6, 1.0], [2.5, -7.0, -2.2, 1.2], [2.0, -8.0, -2.5, 1.3]],
    ],
  },
  {
    // 港の物干し場：海水などがしみた布は乾きにくい（蒸気圧降下）。真水で薄めて、今夜のうちに乾くようにする
    id: 4, kind: 'vapor', substances: [], budgetPerKg: 2.2,
    nights: [
      [['NaCl', 35, 1.0, 0.6], ['glucose', 90, 1.0, 0.3], ['NaCl', 58.5, 2.0, 0.5]],
      [['NaCl', 46.8, 1.2, 0.5], ['CaCl2', 22.2, 1.0, 0.4], ['urea', 48, 1.6, 0.3]],
      [['CaCl2', 44.4, 1.0, 0.4], ['NaCl', 87.75, 2.5, 0.5], ['glucose', 144, 2.0, 0.2]],
    ],
  },
  {
    // 温泉宿の湯：宿の釜の湯を、決められた温度で煮立たせる（沸点上昇）。溶かす物質で沸点を上げる
    id: 5, kind: 'boil', substances: ['urea', 'glucose', 'NaCl', 'CaCl2'], budgetPerMol: 9.6,
    nights: [
      [[2.0, 0.30], [1.5, 0.50], [1.0, 0.80]],
      [[2.0, 0.80], [2.5, 1.00], [1.5, 1.20]],
      [[3.0, 1.20], [2.5, 1.50], [2.0, 1.80]],
    ],
  },
  {
    // 海水淡水化プラント：浸透圧 Π = i c R T。海水側に浸透圧以上の圧力をかけると、水だけが半透膜を通って真水がとれる（逆浸透）
    // sections：[溶けている物質, モル濃度 mol/L, 温度 ℃]
    id: 6, kind: 'osmo', substances: [], budgetPerBar: 2.2,
    nights: [
      [['NaCl', 0.50, 25], ['glucose', 0.80, 27], ['NaCl', 0.30, 7]],
      [['NaCl', 0.55, 25], ['CaCl2', 0.20, 17], ['urea', 1.20, 37]],
      [['NaCl', 0.60, 30], ['CaCl2', 0.35, 25], ['NaCl', 0.45, 2]],
    ],
  },
  {
    // 正体不明の物質：凝固点降下や浸透圧から分子量を求め、物質を特定する（1問 150 ヒヤマ）
    // sections：fp（水の凝固点降下）[溶質 g, 水 g, 答え] ／ fpb（ベンゼン）[溶質 g, ベンゼン g, 答え] ／ osm（浸透圧）[溶質 g, 溶液 L, 温度 ℃, 答え]
    id: 7, kind: 'mm', substances: [],
    candidates: ['urea', 'egly', 'glycerol', 'naph', 'glucose', 'sucrose'],
    nights: [
      [['fp', 9.0, 100, 'glucose'], ['fp', 3.0, 200, 'urea'], ['fp', 17.1, 100, 'sucrose']],
      [['fpb', 1.28, 50, 'naph'], ['fp', 4.6, 100, 'glycerol'], ['osm', 1.8, 0.1, 27, 'glucose']],
      [['osm', 3.42, 0.5, 17, 'sucrose'], ['fp', 6.2, 250, 'egly'], ['osm', 0.6, 0.2, 37, 'urea']],
    ],
  },
];
export const LOCKED_STAGES = [];

// ── 夜（早回し） ──
export const NIGHT = {
  durSec: 40,           // 夜の長さ（秒）。22:00 → 6:00
  fastSec: 10,          // 「早送り」を押したときの長さ
  startTemp: 2,         // 夜のはじめの気温（℃）
  lowAt: 0.72,          // 最低気温になる時刻（夜の長さに対する割合）
  endRise: 0.15,        // 朝にかけて、最低気温から少し上がる割合
  startHour: 22,
  hours: 8,
};

// ── 報酬（全体の仕様書 9章） ──
export const REWARD = {
  night: 60,            // 1夜を守り切る（3区間すべて）
  bonus: 40,            // 予算を半分以上残した
  identify: 150,        // ステージ7：物質を1つ正しく特定した（その問題で初めてのとき）
};

// ── 解き方の説明（アニメーション） ──
export const TUTORIAL = {
  stepSec: 1.4,         // 1つの手順が出てくる間かく（秒）
};

// ── 朝の解説で、まき方の傾向を見分ける幅 ──
export const DIAG = {
  near: 0.9,            // 必要な量の 90% 以上 100% 未満：「少し足りない（切り上げよう）」
  ionSlack: 0.12,       // 電離の数をまちがえたとみなす幅（比の ±12%）
  waste: 1.6,           // 必要な量のこの倍以上まいたら「多すぎ（予算のむだ）」
  readSlack: 0.15,      // ステージ3：読み取った凝固点を見分ける幅（℃）
};

// ── 夜の動き（ステージ4・5） ──
export const DRY = { failAt: 0.62 };                      // 乾かなかった布の、朝の乾き具合（0〜1）
export const BOIL = { startTemp: 20, heatEnd: 0.7 };      // 湯をわかしはじめる温度、湯がわくまでの時刻（夜の長さに対する割合）

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,
  fov: 42,
  snow: 260,            // 降る雪の粒の数
};
