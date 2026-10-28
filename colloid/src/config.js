// colloid/src/config.js
// ④ コロイド・ミストの数値の設定（全体の仕様書 10章）。数値はここに集め、プログラムの中に直接書かない。

export const VERSION = 'colloid v1.1.0';

// ── エリア：入るときに道具を1つ受け取り、謎を順に解く。全部解くとエリアを抜ける ──
export const AREAS = [
  { id: 1, tool: 'bell', puzzles: ['1-1', '1-2', '1-3'] },      // 霧の入江：チンダル現象
  { id: 2, tool: 'glasses', puzzles: ['2-1', '2-2', '2-3'] },   // 揺らぐ浅瀬：ブラウン運動、粒の大きさ
  { id: 3, tool: 'bag', puzzles: ['3-1', '3-2', '3-3'] },       // セロハンの関所：透析
  { id: 4, tool: 'pole', puzzles: ['4-1', '4-2', '4-3'] },      // 雷の祠：電気泳動
  { id: 5, tool: 'vial', puzzles: ['5-1', '5-2', '5-3'] },      // 濁り川：凝析と塩析
  { id: 6, tool: 'nigari', puzzles: ['6-1', '6-2', '6-3'] },    // 豆腐の里：ゾル・ゲル・キセロゲル
  { id: 7, tool: 'shield', puzzles: ['7-1', '7-2', '7-3'] },    // 墨の書庫：保護コロイド
  { id: 8, tool: null, puzzles: ['8-1', '8-2', '8-3', '8-4', '8-5', '8-6', '8-7'] },   // 湖の社：7つの道具をすべて使う
];
export const LOCKED_AREAS = [];
export const TOOLS = ['bell', 'glasses', 'bag', 'pole', 'vial', 'nigari', 'shield'];

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
  // v0.2
  clay: { beam: true, scope: 'brown', color: '#a08a6a', cloud: 0.55 },
  gelatin: { beam: true, scope: 'brown', color: '#f2e2b0', cloud: 0.15 },
  tonyu: { beam: true, scope: 'brown', color: '#f6f0de', cloud: 0.6 },
  tofu: { solid: 'gel', color: '#f8f6ee' },
  koya: { solid: 'xero', color: '#d8c49a' },
  carbon: { beam: true, scope: 'brown', color: '#202024', cloud: 0.95, coag: 'sink' },
  sumi: { beam: true, scope: 'brown', color: '#141418', cloud: 0.95, coag: 'stay' },
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
  // v0.2
  '4-1': { type: 'choice', use: 'pole', options: ['cathode', 'anode', 'stay'], answer: ['cathode'], prop: 'trough', scope: 'electro' },
  '4-2': { type: 'electro', prop: 'trough' },
  '4-3': { type: 'choice', options: ['anode', 'cathode', 'stay'], answer: ['anode'], prop: 'trough' },
  '5-1': { type: 'choice', options: ['Na2SO4', 'KI', 'CaCl2', 'AlNO3'], answer: ['Na2SO4'], prop: 'cup', items: [null, 'feoh', null], vial: true },
  '5-2': { type: 'choice', options: ['Na2SO4', 'KI', 'CaCl2', 'AlNO3'], answer: ['AlNO3'], prop: 'cup', items: [null, 'clay', null], vial: true },
  '5-3': { type: 'dose', options: ['much', 'little', 'bag'], answer: ['much'], prop: 'cup', items: ['feoh', null, 'gelatin'] },
  '6-1': { type: 'match', items: ['tonyu', 'tofu', 'koya'], terms: ['sol', 'gel', 'xero'], answer: ['sol', 'gel', 'xero'], prop: 'cup' },
  '6-2': { type: 'choice', options: ['tofu', 'jelly', 'milk', 'konnyaku', 'tonyu'], answer: ['tofu', 'jelly', 'konnyaku'], multi: true, prop: 'cup', items: ['tonyu', 'tofu', 'koya'] },
  '6-3': { type: 'choice', options: ['coag', 'dissolve', 'color'], answer: ['coag'], prop: 'cup', items: ['tonyu', 'tofu', 'koya'] },
  '7-1': { type: 'choice', options: ['protect', 'color', 'smell'], answer: ['protect'], prop: 'cup', items: [null, 'sumi', null] },
  '7-2': { type: 'probe', tools: ['vial'], items: ['carbon', 'sumi'], answer: ['sumi'], prop: 'cup' },
  '7-3': { type: 'choice', options: ['gelatin', 'feoh', 'carbon'], answer: ['gelatin'], prop: 'cup', items: [null, 'sumi', null] },
  // 湖の社：場面に合う道具を、7つの中から選ぶ
  '8-1': { type: 'tool', answer: 'bell', prop: 'altar' },
  '8-2': { type: 'tool', answer: 'glasses', prop: 'altar' },
  '8-3': { type: 'tool', answer: 'bag', prop: 'altar' },
  '8-4': { type: 'tool', answer: 'pole', prop: 'altar' },
  '8-5': { type: 'tool', answer: 'vial', prop: 'altar' },
  '8-6': { type: 'tool', answer: 'nigari', prop: 'altar' },
  '8-7': { type: 'tool', answer: 'shield', prop: 'altar' },
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
  shrine: 300,          // 湖の社の仕掛けを解く（はじめてのとき）
  place: 20,            // 標本を正しく置く（その標本で、はじめてのとき）
  full: 300,            // 9マスが全部うまる（はじめてのとき）
};

// ── 分散系の標本集め（v0.3、教科書 p.81 図19） ──
//   謎を解くと、その場所で標本が見つかる（from）。標本箱の9マスの表（分散質 × 分散媒）に置く。
//   phase：[分散質, 分散媒]（'gas' | 'liquid' | 'solid'）。none：コロイドにならない（気体どうしは均一にまざる）
//   fuda：正しく置くと、名前の札の問いが出る（エーロゾル・乳濁液・懸濁液）。phase がないものは、札の問いだけ（分子コロイド・会合コロイド）
export const PHASES = ['gas', 'liquid', 'solid'];
export const SPECIMENS = {
  mist: { from: '1-1', phase: ['liquid', 'gas'], fuda: 'aerosol', icon: '🌫' },
  cloud: { from: '1-2', phase: ['liquid', 'gas'], icon: '☁️' },
  soap: { from: '1-3', fuda: 'assoc', icon: '🧼' },
  milk: { from: '2-1', phase: ['liquid', 'liquid'], fuda: 'emulsion', icon: '🥛' },
  smoke: { from: '2-2', phase: ['solid', 'gas'], icon: '💨' },
  mud: { from: '2-3', phase: ['solid', 'liquid'], fuda: 'suspension', icon: '🟤' },
  gelatin: { from: '3-1', fuda: 'molecular', icon: '🧪' },
  air: { from: '3-3', phase: ['gas', 'gas'], none: true, icon: '🌬' },
  mayo: { from: '4-1', phase: ['liquid', 'liquid'], icon: '🥚' },
  foam: { from: '4-3', phase: ['gas', 'liquid'], icon: '🫧' },
  jelly: { from: '6-1', phase: ['liquid', 'solid'], icon: '🍮' },
  marsh: { from: '6-2', phase: ['gas', 'solid'], icon: '🍬' },
  sumi: { from: '7-1', phase: ['solid', 'liquid'], icon: '🖌' },
  glass: { from: '8-7', phase: ['solid', 'solid'], icon: '🔮' },
};
export const FUDA = ['aerosol', 'emulsion', 'suspension', 'molecular', 'assoc'];

// ── 映え（v0.2）：エリアが進むほど、景色が豪華になる。数字は「このエリアから出る」 ──
//   霧の色・光の色もエリアごとに変わる（藍の霧 → 若竹 → 菫 → 雷の紫 → 金の灯 → 桜 → 墨と金 → 夜明けのオーロラ）
export const GLOW = {
  lanterns: 1,          // 浮かぶ灯籠（エリアが進むほど数が増える）
  fireflies: 2,         // 蛍
  torii: 3,             // 湖に立つネオンの大鳥居（水面に映る）
  lightning: 4,         // 雷（ときどき紫に光る）
  river: 5,             // 灯籠流し
  petals: 6,            // 桜の花びら
  kanji: 7,             // 宙に浮かぶ光の文字と金箔
  aurora: 8,            // オーロラと大きな月（湖の社）
};
export const AMBIENCE = {
  1: { fog: '#0e2230', a: '#5CF2A8', b: '#7aa8ff' },
  2: { fog: '#0d2a2a', a: '#5CF2A8', b: '#c8ff6a' },
  3: { fog: '#1a1a34', a: '#A985FF', b: '#ff5e70' },
  4: { fog: '#1c1436', a: '#b07aff', b: '#5ce0ff' },
  5: { fog: '#1e1a20', a: '#FFC83A', b: '#ff8a4a' },
  6: { fog: '#2a1a2a', a: '#ff9ac8', b: '#FFC83A' },
  7: { fog: '#141018', a: '#E6B422', b: '#A985FF' },
  8: { fog: '#1a1a3a', a: '#5CF2A8', b: '#ff9ac8' },
};

// ── のぞき窓（限外の眼鏡で見たようす）の粒の数 ──
export const SCOPE = {
  electro: 22,          // 電気泳動の粒
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

// ── 対戦「チーム対抗レース」（v0.4、全体の仕様書 10章・11章） ──
//   2チームが、同じ関門の道を同時に進む。先に湖の社（最後の関門）に着いたチームの勝ち。
//   7つの道具は、チームの中でばらばらに配る。関門には、使う道具が決まっている。その道具を持つ人だけが問いに答えられるので、
//   「今はあなたの電極が要る」と呼び合って進む。相手チームに「霧の壁」を送ると、10秒間、光の鈴を持つ人にしか問いが見えない。
//   2〜3人のときは対抗戦ではなく、全員で1チーム。道具を分け合って、自分の最速記録に挑む（参加料・賞金なし）。
export const RACE = {
  minPlayers: 2,
  versusMin: 4,         // この人数から、2チームの対抗戦（それより少ないと、協力のタイムアタック）
  maxPlayers: 12,
  teamMax: 6,
  gates: 10,            // 関門の数（最後が湖の社）
  limitSec: 600,        // 制限時間（秒）。時間切れなら、進んだ関門が多いチームの勝ち（v1.1：480 → 600 秒）
  wrongLockSec: 3,      // まちがえると、この秒数は答えられない（v1.1：5 → 3 秒）
  fogSec: 10,           // 霧の壁が続く秒数
  fogPerTeam: 2,        // 1チームが送れる霧の壁の数
  pingSec: 4,           // 「呼ぶ」の知らせを出す秒数
  idleSec: 90,          // この秒数、何も操作しないと放置（罰金）
};

// ── v1.1：選択肢の問題で、この回数まちがえたら、まちがいの選択肢を1つずつ消していく（ヒント） ──
export const ELIM = { after: 2 };
