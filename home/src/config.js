// home/src/config.js
// ホームワールドの数値の設定。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'home v0.1.0';

// QRコードで配る公開URL。
// 空のままなら、いま開いているページのURL（例 https://ユーザー名.github.io/seki-dive/）を自動で使う。
// 別のURLを配りたいときだけ、'https://sekiorock.github.io/seki-dive/' のように書き込む。
export const PUBLIC_URL = '';

// 3Dを軽く保つ決まり（仕様書 12章）
export const RENDER = {
  maxPixelRatio: 2,     // 画素の倍率は最大2
  fov: 50,              // カメラの視野（縦方向、度）
};

// 広場の大きさ（単位：m。人の大きさの世界）
export const PLAZA = {
  radius: 13,           // 白い石畳の円の半径
  ringCount: 4,         // 石畳の同心円の数
  spokeCount: 24,       // 石畳の放射状の目地の数
  groundSize: 160,      // 広場の外の淡い灰の地面の一辺
  centerRadius: 2.2,    // 中央の台座（v0.4 で政府庁舎を建てる場所）
  centerHeight: 0.35,
  fogNearOffset: 4,     // 霧が始まる距離（カメラから広場の中心までの距離に足す）
  fogFarOffset: 40,     // 霧で真っ白になる距離（同上）
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
  pillarSize: 0.42,
  width: 3.6,           // 柱と柱の間
  beamOverhang: 0.9,    // 笠木（いちばん上の横木）のはみ出し
  bandHeight: 0.5,      // 柱に巻く差し色の帯の高さ
  labelHeight: 6.2,     // 門の名札の高さ
};

export const GATES = [
  { id: 'hydration', angleDeg: 0 },    // 北  ① ハイドレーション・ビート
  { id: 'crystal',   angleDeg: 90 },   // 東  ② クリスタル・ラボ
  { id: 'freeze',    angleDeg: 180 },  // 南  ③ フリーズ・ガード
  { id: 'colloid',   angleDeg: 270 },  // 西  ④ コロイド・ミスト
];

export const UI = {
  toastMs: 2400,        // 短いお知らせを出しておく時間
};
