// hydration/src/config.js
// ① ハイドレーション・ビートの数値の設定。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'hydration v1.0.0';

// ── 判定の幅（ミリ秒。ノーツが判定リングに来た瞬間からのずれ） ──
export const JUDGE = {
  perfect: 50,
  great: 90,
  good: 130,
  // 端末ごとの音とタップのずれ（ミリ秒）のはじめの値。v0.3 からは、タイミング調整の画面で測った値を
  // その端末に覚えておいて使う（測っていない端末では、この値）
  inputOffsetMs: 0,
  // 見逃し（MISS）と決めるまでの待ち時間（ミリ秒）。描画が重い端末で、タップの知らせが遅れて届いても
  // 正しく判定できるように、判定の幅を過ぎてから少しだけ待つ（判定の幅そのものは変わらない）
  missGraceMs: 120,
  // 同時押し：左右のボタンを、この時間の内に両方押せば「同時」とみなす（ミリ秒）
  simulMs: 90,
};

// ── 難易度（ハイドレーション・ビート仕様書 4章）──
//   assist    補助輪の段階。1：色と文字（陽イオン など）／2：色だけ／3：色も消え、化学式と白黒の模型だけ
//   approachSec  奥から判定リングまで飛んでくる秒数（長いほど遅く、粒子どうしの間隔が広く見える）
//   thin      true なら、8分音符の裏拍のノーツを抜いて、続けて押すところを減らす
//   chainStep 糖（-OH が多い）の同時押しの連続の間隔（拍）。大きいほどゆっくり
//   hclGap    HCl の O のあと、Cl⁻（H）が来るまでの間隔（拍）
//   reward    1曲の報酬の目安（ヒヤマ）。v0.5 からは shared/economy.js の hbRewardEasy などを使う
//             （先生が管理画面から変えられるようにするため。ここは説明のための値）
export const DIFFICULTY = {
  easy:   { assist: 1, approachSec: 3.2, thin: true,  chainStep: 1, hclGap: 1,   reward: 30 },
  normal: { assist: 2, approachSec: 2.7, thin: false, chainStep: 1, hclGap: 0.5, reward: 80 },
  hard:   { assist: 3, approachSec: 2.2, thin: false, chainStep: 0.5, hclGap: 0.5, reward: 200 },
};
export const DEFAULT_DIFFICULTY = 'easy';

// ── 水和ゲージ（ハイドレーション・ビート仕様書 2章：曲の終わりに clearPct % 以上ならクリア） ──
//   1つのノーツで増える量は「gain × 1目盛り」。1目盛りは、ノーツ全体の fullAt の割合を
//   Perfect で取ったときにちょうど 100% になる大きさ（ノーツの数が違う曲でも同じ感覚になる）
export const GAUGE = {
  clearPct: 70,
  startPct: 0,
  fullAt: 0.8,
  gain: { perfect: 1.0, great: 0.9, good: 0.6, miss: -1.0, wrong: -1.2 },
};

// ── タイミング調整（ハイドレーション・ビート仕様書 4章：メトロノームに合わせて8回タップ） ──
export const CALIB = {
  bpm: 100,             // メトロノームの速さ
  taps: 8,              // たたく回数
  leadBeats: 4,         // たたき始める前に鳴らす拍の数（数えるため）
  limitMs: 250,         // 補正の上限（これより大きいずれは、上限で止める）
  spreadWarnMs: 60,     // たたいたずれのばらつきがこれより大きいと「もう一度」をすすめる
  stepMs: 10,           // 手で直すボタン（−／＋）の1回分
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
  approachSec: 2.7,     // 奥から判定リングまで飛んでくる秒数（難易度の approachSec で上書きする）
  spawnZ: -36,          // 現れる場所（奥）
  judgeZ: 0,            // 判定リングの場所
  passZ: 4,             // 見逃したノーツが消える場所（手前）
  leadInSec: 2.0,       // 曲が始まるまでの待ち時間
};

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,     // 画素の倍率は最大2
  maxMolecules: 40,     // 画面に出す分子は同時に40個まで（ハイドレーション・ビート仕様書 9章）
  // カメラ：v0.2 で、高く・遠くから、狭い画角（望遠）で道を見下ろすようにした。
  // 遠近の差が小さくなり、奥の粒子も大きめに、粒子どうしの間隔も広く見える
  fov: 32,
  cameraY: 14,
  cameraZ: 22,
  lookAtY: 0,
  lookAtZ: -4.6,
  fogNear: 48,          // 霧が始まる距離（カメラからの距離）
  fogFar: 86,
  noteScale: 1.15,      // 粒子の大きさの倍率
  labelScale: 1.6,      // 化学式の札の大きさの倍率
};

// 背景の NaCl の結晶（正しく水和させるたびにイオンが1個ずつはがれる）
export const CRYSTAL = {
  size: 3,              // 3×3×3 = 27個のイオン
  spacing: 1.15,
  position: [4.2, 9, -34],
};

// 音量（0〜1）
export const AUDIO = {
  master: 0.8,
  music: 0.75,
  sfx: 0.6,
  scheduleAheadSec: 0.25,   // 音を先に予約しておく長さ
};

// ── v0.5：ショップの演出（ハイドレーション・ビート仕様書 7章：演出エフェクト 300〜3,000 ヒヤマ） ──
//   正しく水和させたときに、判定リングから飛び散る演出。買ったものから1つを選んで使う。値段に消費税がかかる
export const SHOP_FX = [
  { id: 'sakura', price: 500 },    // 桜の花びら
  { id: 'kin', price: 1000 },      // 金の輪
  { id: 'raiko', price: 1500 },    // 雷光（青白い火花）
  { id: 'hoshi', price: 3000 },    // 星くず（七色の星）
];

// ── v0.5：苦手ノーツの練習曲（道具屋の「苦手問題の練習券」を1枚使う） ──
export const WEAK = {
  bpm: 90,
  maxNotes: 4,          // 溶媒ごとに、間違いの多い溶質をこの数まで
  barsPerSolvent: 8,
};

// ── v0.9：バトルロイヤル（ハイドレーション・ビート仕様書 6章：3〜12人。水和ゲージが0になると脱落） ──
export const ROYALE = {
  minPlayers: 3,
  maxPlayers: 12,
  startPct: 50,         // 水和ゲージは半分から始まる（0 から始めると、すぐに脱落してしまうため）
  negMul: 3,            // ミスでゲージが減る量を、ひとりのときの何倍にするか（脱落が起きるように）
};

// ── v1.0：映えの演出（shared/glow.js）。ステージが進むほど景色が豪華になる（段階 1〜8） ──
// 段階：1 浮かぶ灯籠 2 光の泡 3 ネオンの鳥居と月 4 光の柱 5 光の和柄の輪 6 泡が昇る 7 光の文字と金箔 8 オーロラ
export const GLOW = {
  byStage: { stage1: 1, stage2: 2, stage3: 3, stage4: 4, stage5: 5, stage6: 7, parade: 8 },   // parade：全ステージをクリアしたあとの段階
  practice: 3,                  // 苦手ノーツの練習曲
  area: { box: true, x: [-6.5, 6.5], gap: 2.3, z: [-40, 2], h: [0.6, 3.2] },   // 道の左右（道の上はあけておく）
  // 鳥居は道をまたいで並ぶ（千本鳥居）。手前に置くと上の横木がノーツにかぶるので z は -16 より奥。上の横木は画面の外になるので、柱が道の両わきに並んで見える
  torii: [{ at: [0, 0, -16], s: 1.3, lv: 3 }, { at: [0, 0, -22], s: 1.3, lv: 4 }, { at: [0, 0, -28], s: 1.3, lv: 5 }, { at: [0, 0, -34], s: 1.3, lv: 7 }],
  sky: { moonTop: '24%', moonRight: '6%' },     // 月は、点数やゲージにかぶらない高さに
  kanji: '水和溶極性',
  fall: 'bubble',
  sparkle: '#8FF3FA',
  size: 1.6,
};
