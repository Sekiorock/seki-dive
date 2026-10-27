// colloid/src/config.js
// ④ コロイド・ミストの数値の設定（全体の仕様書 10章）。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'colloid v0.1.0';

// ── エリア：入るときに道具を1つ受け取り、謎を順に解く。全部解くとエリアを抜ける ──
export const AREAS = [
  { id: 1, tool: 'bell', puzzles: ['1-1', '1-2', '1-3'] },      // 霧の入江：チンダル現象
  { id: 2, tool: 'glasses', puzzles: ['2-1', '2-2', '2-3'] },   // 揺らぐ浅瀬：ブラウン運動、粒の大きさ
  { id: 3, tool: 'bag', puzzles: ['3-1', '3-2', '3-3'] },       // セロハンの関所：透析
];
export const LOCKED_AREAS = [
  { id: 4, ver: 'v0.2' }, { id: 5, ver: 'v0.2' }, { id: 6, ver: 'v0.2' }, { id: 7, ver: 'v0.2' },
];

// ── 液体（標本）：beam 光の通り道が見えるか、scope 限外の眼鏡で見たようす（none 何も見えない／brown 光の点が不規則に動く／mud 大きな粒が沈む） ──
//   color：3D の液の色、cloud：にごり（0〜1）
export const LIQUIDS = {
  water: { beam: false, scope: 'none', color: '#bfe6ff', cloud: 0 },
  sugar: { beam: false, scope: 'none', color: '#d8f0ff', cloud: 0 },
  salt: { beam: false, scope: 'none', color: '#d8f0ff', cloud: 0 },
  starch: { beam: true, scope: 'brown', color: '#e6f4ff', cloud: 0.12 },
  soap: { beam: true, scope: 'brown', color: '#eef6ff', cloud: 0.18 },
  milk: { beam: true, scope: 'brown', color: '#f4f4ee', cloud: 0.35 },
  feoh: { beam: true, scope: 'brown', color: '#b4542a', cloud: 0.2 },
  mud: { beam: false, scope: 'mud', color: '#8a6a46', cloud: 0.7 },
};

// ── 謎（1つずつ） ──
//   probe ：道具で items を調べてから、answer を選ぶ（multi：いくつでも選ぶ）。hidden：名前を伏せる（調べると分かる）
//   choice：選択肢から1つ。multi：いくつでも
//   order ：小さい順にタップ
//   dialysis：透析（袋を水に入れる → 待つ → 水を替える → 確かめる）
export const PUZZLES = {
  '1-1': { type: 'probe', tools: ['bell'], items: ['sugar', 'starch', 'water'], answer: ['starch'], hidden: true, prop: 'pool' },
  '1-2': { type: 'choice', options: ['scatter', 'absorb', 'emit'], answer: ['scatter'], prop: 'fog' },
  '1-3': { type: 'probe', tools: ['bell'], items: ['soap', 'salt', 'milk'], answer: ['soap', 'milk'], multi: true, prop: 'cup' },
  '2-1': { type: 'choice', options: ['hit', 'swim', 'light'], answer: ['hit'], scope: 'brown', prop: 'shoal' },
  '2-2': { type: 'order', items: ['colloid', 'mud', 'ion'], answer: ['ion', 'colloid', 'mud'], prop: 'shoal' },
  '2-3': { type: 'probe', tools: ['bell', 'glasses'], items: ['salt', 'feoh', 'mud'], answer: ['feoh'], prop: 'cup' },
  '3-1': { type: 'choice', options: ['cello', 'poly', 'cloth'], answer: ['cello'], prop: 'gate' },
  '3-2': { type: 'choice', options: ['H', 'Cl', 'FeOH'], answer: ['H', 'Cl'], multi: true, prop: 'gate' },
  '3-3': { type: 'dialysis', prop: 'gate' },
};

// ── 透析（3-3）：袋の中のイオンの量（はじめ 100）。待つと、袋の中と外で同じ濃さになるまでイオンが出る ──
export const DIALYSIS = {
  start: 100,
  bagShare: 0.3,        // 同じ濃さになったとき、袋の中に残る割合（袋の中の水 ÷ 全部の水）
  clean: 5,             // 袋の中のイオンがこれ以下なら、鍵が清まる
  waitSec: 2.2,         // 「待つ」のアニメーションの長さ（秒）
};

// ── 報酬（全体の仕様書 10章） ──
export const REWARD = {
  area: 100,            // エリアを抜ける（はじめてのとき）
};

// ── のぞき窓（限外の眼鏡で見たようす）の粒の数 ──
export const SCOPE = {
  dots: 26,             // コロイド粒子
  molecules: 70,        // 水分子（「ぶつかる」を見せるとき）
  ions: 40,             // 透析のイオンの最大の数
  colloid: 9,           // 透析の袋の中のコロイド粒子
};

// ── 3D ──
export const RENDER = {
  maxPixelRatio: 2,
  fov: 50,
  mist: 160,            // 漂う霧の粒の数
};
