// freeze/src/config.js
// ③ フリーズ・ガードの数値の設定（全体の仕様書 9章）。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'freeze v0.1.0';

// ── 計算に使う定数（教科書の値） ──
export const CONST = {
  Kf: 1.85,             // 水のモル凝固点降下 K·kg/mol
};

// ── 撒く物質：M（モル質量 g/mol）、i（1 mol が水の中で何 mol の粒子になるか）、price（1 mol あたりの資材の値段 pt） ──
export const SUBSTANCES = {
  urea: { formula: 'CO(NH₂)₂', M: 60, i: 1, price: 10, color: '#ffffff' },
  glucose: { formula: 'C₆H₁₂O₆', M: 180, i: 1, price: 24, color: '#FFC074' },
  NaCl: { formula: 'NaCl', M: 58.5, i: 2, price: 12, color: '#cfe0ff' },
  CaCl2: { formula: 'CaCl₂', M: 111, i: 3, price: 13, color: '#8FF3FA' },
};

// ── ステージ（各ステージ3夜）。sections：6つの区間の [路面の水 kg, 今夜の最低気温の予報 ℃] ──
// budgetPerMol：予算 ＝ 6区間を守るのに必要な粒子の物質量の合計 × この数（10 pt きざみに切り上げ）
//   ステージ1：尿素だけで守れば予算の半分以上が残る。グルコースだけだと予算が足りない。
//   ステージ2：尿素やグルコースだけでは予算が足りない。電離して粒子が増える NaCl・CaCl₂ を使う。CaCl₂ なら半分以上残せる。
export const STAGES = [
  {
    id: 1, substances: ['urea', 'glucose'], budgetPerMol: 22,
    nights: [
      [[1.0, -1.0], [1.5, -1.5], [2.0, -2.0], [1.0, -2.5], [2.5, -1.0], [2.0, -3.0]],
      [[2.0, -2.0], [2.0, -3.0], [1.5, -2.5], [3.0, -1.5], [1.0, -4.0], [2.5, -2.0]],
      [[2.5, -3.0], [3.0, -2.5], [2.0, -4.0], [1.5, -5.0], [2.0, -3.5], [3.0, -2.0]],
    ],
  },
  {
    id: 2, substances: ['urea', 'glucose', 'NaCl', 'CaCl2'], budgetPerMol: 9.6,
    nights: [
      [[2.0, -3.0], [2.0, -4.0], [2.5, -2.5], [1.5, -5.0], [3.0, -3.0], [2.0, -4.5]],
      [[3.0, -4.0], [2.5, -5.0], [2.0, -6.0], [3.0, -3.5], [1.5, -6.0], [2.5, -4.0]],
      [[3.0, -6.0], [3.0, -5.5], [2.5, -7.0], [3.0, -6.5], [2.0, -8.0], [3.0, -6.0]],
    ],
  },
];
export const LOCKED_STAGES = [
  { id: 3, ver: 'freeze v0.2' }, { id: 4, ver: 'freeze v0.2' }, { id: 5, ver: 'freeze v0.2' },
  { id: 6, ver: 'freeze v0.3' }, { id: 7, ver: 'freeze v0.3' },
];

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
  night: 60,            // 1夜を守り切る（6区間すべて）
  bonus: 40,            // 予算を半分以上残した
};

// ── 朝の解説で、まき方の傾向を見分ける幅 ──
export const DIAG = {
  near: 0.9,            // 必要な量の 90% 以上 100% 未満：「少し足りない（切り上げよう）」
  ionSlack: 0.12,       // 電離の数をまちがえたとみなす幅（比の ±12%）
  waste: 1.6,           // 必要な量のこの倍以上まいたら「多すぎ（予算のむだ）」
};

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,
  fov: 42,
  snow: 260,            // 降る雪の粒の数
};
