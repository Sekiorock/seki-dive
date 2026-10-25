// hydration/src/config.js
// ① ハイドレーション・ビートの数値の設定。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'hydration v0.1.0';

// ── 判定の幅（ミリ秒。ノーツが判定リングに来た瞬間からのずれ） ──
export const JUDGE = {
  perfect: 50,
  great: 90,
  good: 130,
  // 端末ごとの音と画面のずれ（ミリ秒）。v0.3 のタイミング調整の画面で測って入れるようにする
  inputOffsetMs: 0,
  // 見逃し（MISS）と決めるまでの待ち時間（ミリ秒）。描画が重い端末で、タップの知らせが遅れて届いても
  // 正しく判定できるように、判定の幅を過ぎてから少しだけ待つ（判定の幅そのものは変わらない）
  missGraceMs: 120,
};

// ── 点数（1曲の満点は 1,000,000 点。ノーツ1個の点数 × 判定ごとの割合） ──
export const SCORE = {
  max: 1000000,
  rate: { perfect: 1.0, great: 0.7, good: 0.4, miss: 0, wrong: 0 },
};

// コンボが続くと曲の音が厚くなる（このコンボ数を超えるたびに、楽器が1つずつ増える）
export const COMBO_LAYERS = [10, 20, 40];

// Perfect のときの画面の反転（ハイドレーション・ビート仕様書 8章）。
// 点滅が続くと体調を崩す人がいるため、間隔をあけ、短く弱めにする。0 にすると反転しない
export const FLASH = {
  minGapMs: 1500,       // これより短い間隔では反転しない
  durationMs: 60,
  strength: 0.7,        // 反転の強さ（0〜1）
};

// アバターの立ち絵がカットインするコンボの間隔（全体の仕様書 7章：コンボ30ごと）
export const CUTIN_EVERY = 30;

// ── ノーツの動き ──
export const NOTE = {
  approachSec: 2.4,     // 奥から判定リングまで飛んでくる秒数（v0.2 からは難易度で変える）
  spawnZ: -46,          // 現れる場所（奥）
  judgeZ: 0,            // 判定リングの場所
  passZ: 4,             // 見逃したノーツが消える場所（手前）
  leadInSec: 2.0,       // 曲が始まるまでの待ち時間
};

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,     // 画素の倍率は最大2
  maxMolecules: 40,     // 画面に出す分子は同時に40個まで（ハイドレーション・ビート仕様書 9章）
  fov: 58,
  fogNear: 14,
  fogFar: 52,
};

// 背景の NaCl の結晶（正しく水和させるたびにイオンが1個ずつはがれる）
export const CRYSTAL = {
  size: 3,              // 3×3×3 = 27個のイオン
  spacing: 1.15,
  position: [5.5, 6.5, -30],
};

// 音量（0〜1）
export const AUDIO = {
  master: 0.8,
  music: 0.75,
  sfx: 0.6,
  scheduleAheadSec: 0.25,   // 音を先に予約しておく長さ
};
