// home/src/config.js
// ホームワールドの数値の設定。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'home v0.5.3';

// QRコードで配る公開URL。
// 空のままなら、いま開いているページのURL（例 https://ユーザー名.github.io/seki-dive/）を自動で使う。
// 別のURLを配りたいときだけ、'https://sekiorock.github.io/seki-dive/' のように書き込む。
export const PUBLIC_URL = '';

// 3Dを軽く保つ決まり（仕様書 12章）
export const RENDER = {
  maxPixelRatio: 2,     // 画素の倍率は最大2
  idleFps: 30,          // 何も触っていないときの描き直しの回数（1秒あたり。電池のため少なめ）
  exposure: 1.0,        // 明るさ
  fov: 50,              // カメラの視野（縦方向、度）
};

// 広場の大きさ（単位：m。人の大きさの世界）
export const PLAZA = {
  radius: 13,           // 和柄の円い広場の半径
  lanternRadius: 12.3,  // 縁の石灯籠（8つ）を置く半径
  groundSize: 160,      // 広場の外の地面の大きさ
  fogColor: '#0A1030',  // 奥が溶けていく夜の霧の色
  fogNearOffset: 6,     // 霧が始まる距離（カメラから広場の中心までの距離に足す）
  fogFarOffset: 46,     // 霧で見えなくなる距離（同上）
};

// カメラ（指でなぞって広場を見回す）
export const CAMERA = {
  startAzimuthDeg: 45,  // 最初の向き（0 で南から北を見る。45 で南東から見て4つの門がすべて入る）
  pitchDeg: 54,         // 見下ろす角度
  minPitchDeg: 20,
  fitRadius: 13.2,      // 画面の幅にこの半径の円がほぼ収まる距離にする
  maxPitchDeg: 70,
  distance: 30,         // 広場の中心からの距離（画面の幅に合わせて自動で調整）
  minDistance: 18,
  screenShiftY: 0.03,   // 広場を画面の下へずらす割合（上の帯と題名の分）
  maxDistance: 60,
  dragSpeed: 0.006,     // なぞったときの回る速さ
  tapMovePx: 8,         // これより指が動かなければ「タップ」とみなす
};

// 4つの門。東西南北に1つずつ（angleDeg：北が0、東が90）
export const GATE = {
  distanceFromCenter: 11.5,
  pillarHeight: 4.2,
  pillarRadius: 0.28,   // 八角の柱の太さ
  width: 3.6,           // 柱と柱の間
  beamOverhang: 0.8,    // 笠木（いちばん上の横木）のはみ出し
  kasagiLift: 0.22,     // 笠木の両端の反り上がり
  labelHeight: 6.3,     // 門の名札の高さ
}

export const GATES = [
  { id: 'hydration', angleDeg: 0 },    // 北  ① ハイドレーション・ビート
  { id: 'crystal',   angleDeg: 90 },   // 東  ② クリスタル・ラボ
  { id: 'freeze',    angleDeg: 180 },  // 南  ③ フリーズ・ガード
  { id: 'colloid',   angleDeg: 270 },  // 西  ④ コロイド・ミスト
];

// できあがっているワールド（門から、そのワールドのページへ移る）。できたら足していく
export const READY_WORLDS = ['hydration'];

export const UI = {
  toastMs: 3600,        // 短いお知らせを出しておく時間（ミリ秒）
};

// 中央の政府庁舎（三重の塔）と、宙に浮かぶ国庫の掲示板
export const GOV = {
  baseRadius: 2.4,      // 八角の基壇
  tiers: [              // 各階の幅と高さ（下から）
    { size: 2.2, height: 1.3 },
    { size: 1.7, height: 0.9 },
    { size: 1.25, height: 0.75 },
  ],
  ringRadius: 2.0,      // 塔のまわりを回る光の帯
  ringHeight: 2.6,
  boardHeight: 7.0,     // 国庫の掲示板の高さ
};

// 演出（ゲームらしい動き）
export const FX = {
  particles: 140,       // 浮かぶ光の粒の数
  particleHeight: 7,    // 粒が昇る高さ
  wavePeriod: 4.5,      // 床を走る光の輪が1回広がる秒数
};

// 政府庁舎の前に立つ広報官キタロー（切り絵のような板）
export const STANDEE = {
  id: 'tsukasa',
  height: 2.8,          // 板の高さ（m）。門の柱は 4.2 m（見やすさのため人より少し大きめ）
  angleDeg: 135,        // 政府庁舎から見た向き（南東＝最初のカメラの側）
  distance: 3.1,        // 政府庁舎の中心からの距離
  plazaLines: 3,        // 広場でタップしたときのセリフの数（char.tsukasa.line.plaza1〜3）
};

// 広場の施設。門と門の間に置く（angleDeg：北が0、東が90）。南東は v1.0 までに書庫・対戦の広場を置くため空けておく
export const FACILITY = {
  distanceFromCenter: 8.2,
  width: 3.4,           // 建物の間口
  depth: 2.4,
  wallHeight: 2.2,
  roofHeight: 1.2,
  labelHeight: 4.6,     // 名札の高さ
};
export const FACILITIES = [
  { id: 'bank',   angleDeg: 45,  keeper: 'tsukasa' },  // 北東  銀行（番人：キタロー兼任）
  { id: 'gofuku', angleDeg: 315, keeper: 'eta' },      // 北西  呉服屋（番人：タロー）
  { id: 'dougu',  angleDeg: 225, keeper: 'karin' },    // 南西  道具屋（番人：ユウタロー兼任）
];

// 初めて起動したときの流れ
export const ONBOARDING = {
  talkLines: 5,         // キタローの説明のセリフの数（char.tsukasa.line.onboard1〜5）
  grantLine: 4,         // 開国交付金を支給する場面（4場面目）
};
