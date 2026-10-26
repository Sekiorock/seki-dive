// hydration/src/charts.js
// 譜面（ハイドレーション・ビート仕様書 4章）。
//   ステージ1「極性のプレリュード」：Na⁺ と Cl⁻（90 BPM）
//   ステージ2「結晶ほどき」：K⁺、Cu²⁺、I⁻、OH⁻、SO₄²⁻（100 BPM）            ← v0.3
//   ステージ3「ハイドロキシ・グルーヴ」：エタノール、グルコース、スクロース（105 BPM） ← v0.3
//   ステージ4「電離のブレイク」：HCl、NH₃、酢酸、無極性分子（115 BPM）         ← v0.3
//   練習曲「ノーツ・パレード」：3章のすべての溶質ノーツを順番に試せる曲（いつでも遊べる）
//   ステージ5「ヘキサンの夜」：溶媒がヘキサンに交代（110 BPM）                ← v0.4
//   ステージ6「溶解性マトリクス」：全種類＋溶けにくい結晶。溶媒が何度も入れかわる（125 BPM） ← v0.4
//
// 溶媒：chart.solvents に、小節の範囲ごとの溶媒（'water' / 'hexane'）を書く。書いていない小節は水。
//   ヘキサンのときの正解は notes.js の answerIn（無極性分子は「なじむ」、それ以外は見送る）。
//   溶媒が入れかわるところには、ノーツのない2小節を置き、その頭で入れかわる
//   （ボタンが変わってから、新しい溶媒のノーツが判定リングに来るまで2小節ある）。
// 前のステージをどの難易度でもクリアすると、次のステージが開く（4章）。
//
// 1小節は8分音符8つ分。1文字が8分音符1つ（. は何もない）：
//   N Na⁺  K K⁺  U Cu²⁺        （左：O）
//   C Cl⁻  I I⁻  O OH⁻  S SO₄²⁻ （右：H）
//   E エタノール  A NH₃  V 酢酸 （同時押し）
//   G グルコース（-OH ×5）  Z スクロース（-OH ×8）：同時押しの連続。後ろの拍をあけておく
//   H HCl：O のすぐあとに Cl⁻ が来る（H）。後ろの8分音符1つ（やさしいでは1拍）をあけておく
//   X ヘキサン  B ベンゼン  T 四塩化炭素  J ヨウ素  P ナフタレン（見送る）
//   Y AgCl  W BaSO₄  Q CaCO₃（溶けにくい結晶。見送る）

import { NOTES, answerIn } from './notes.js';

export const SYMBOLS = {
  N: 'Na', K: 'K', U: 'Cu', C: 'Cl', I: 'I', O: 'OH', S: 'SO4',
  E: 'EtOH', A: 'NH3', V: 'AcOH', G: 'Glc', Z: 'Suc', H: 'HCl',
  X: 'Hex', B: 'Bz', T: 'CCl4', J: 'I2', P: 'Nap', Y: 'AgCl', W: 'BaSO4', Q: 'CaCO3',
};

const STAGE1_BARS = [
  // イントロ（2小節）
  '........', '........',
  // A（8小節）：1拍目と3拍目に、Na⁺ と Cl⁻ が交互に
  'N...C...', 'N...C...', 'C...N...', 'C...N...',
  'N...N...', 'C...C...', 'N...C...', 'C...N...',
  // B（8小節）：毎拍
  'N.N.C.C.', 'N.C.N.C.', 'C.C.N.N.', 'C.N.C.N.',
  'N.C.C.N.', 'C.N.N.C.', 'N.N.C.C.', 'N.C.N...',
  // 間奏（2小節）
  'C.......', 'N.......',
  // C（8小節）：8分音符が2つ続くところがある（やさしいでは抜く）
  'N.C.N.CC', 'N.C.N.C.', 'C.N.C.NN', 'C.N.C.N.',
  'N.NC..C.', 'C.CN..N.', 'N.C.NC..', 'C.N.CN..',
  // D（4小節）：いちばん盛り上がる。続けて押すのは2つまで
  'NC..CN..', 'NN..CC..', 'CN..NC..', 'CC..NN..',
  // 終わり（2小節）
  'N...C...', 'N.......',
];

const PARADE_BARS = [
  '........', '........',
  // 陽イオンと陰イオン
  'N...K...', 'U...N...', 'C...I...', 'O...S...', 'N.C.K.I.', 'U.S.N.O.',
  // -OH をもつ分子（同時押し）
  'E...E...', 'N...E...', 'C...E...',
  // 極性分子（弱電解質）
  'A...V...', 'A...N...', 'V...C...',
  // HCl の電離（O → H）
  'H.......', 'H...N...', 'C...H...',
  // 無極性分子（見送る）
  'X...B...', 'T...J...', 'P...N...',
  // 溶けにくい結晶（見送る）
  'Y...W...', 'Q...C...',
  // 糖（同時押しの連続）
  'G.......', '..N.....', 'Z.......', '........', '..C.....',
  // まとめ
  'N.C.E...', 'H...A...', 'K.I.B...', 'U.S.V...', 'X...O...', 'N.......',
];

const STAGE2_BARS = [
  '........', '........',
  // A：新しいイオンを1つずつ
  'K...I...', 'K...I...', 'I...K...', 'U...C...', 'U...S...', 'N...O...', 'K...S...', 'O...U...',
  // B：毎拍
  'K.I.U.S.', 'N.O.K.C.', 'S.U.I.K.', 'O.N.S.U.', 'K.K.I.I.', 'U.S.U.S.', 'N.O.O.N.', 'K.I.S...',
  // 間奏
  'U.......', 'S.......',
  // C：8分音符が2つ続くところ（やさしいでは抜く）
  'K.I.U.SS', 'N.O.K.CC', 'I.K.SU..', 'O.N.UK..', 'K.II..U.', 'S.UU..O.', 'N.C.KI..', 'U.S.OK..',
  // D：いちばん盛り上がる
  'KI..SU..', 'OO..NN..', 'UK..IS..', 'SS..KK..', 'NO..UC..', 'IK..SU..',
  'K...S...', 'U.......',
];

const STAGE3_BARS = [
  '........', '........',
  // A：エタノールの同時押し
  'E...E...', 'N...E...', 'E...C...', 'K...E...', 'E.E.N...', 'C...E.E.', 'E...I...', 'U...E...',
  // B：グルコース（-OH が5つ）
  'G.......', '..N...C.', 'E...E...', 'G.......', '..K...I.', 'N.E.C.E.', 'E.N.E.C.', 'E...E...',
  'E.......', '........',
  // C：スクロース（-OH が8つ）
  'Z.......', '........', '..C...N.', 'E.EN..C.', 'Z.......', '........', '..I...K.', 'E.E.E...',
  // D
  'EE..NC..', 'EE..KI..', 'G.......', '..EE..N.', 'CN..EE..', 'E...E...',
  'E...N...', 'E.......',
];

const STAGE4_BARS = [
  '........', '........',
  // A：HCl の電離（左 → 右）、極性分子、見送る無極性分子
  'H...N...', 'C...H...', 'A...A...', 'V...C...', 'H...A...', 'X...N...', 'B...V...', 'H...T...',
  // B
  'N.C.H...', 'A.X.V.J.', 'H...K.I.', 'P.A.H...', 'N.B.C.T.', 'V.A.H...', 'X.N.J.C.', 'H...H...',
  'A.......', 'V.......',
  // C
  'H...N.CC', 'A.X.V.JA', 'H...I.KK', 'P.V.H...', 'N.CB.T..', 'A.A.H...', 'X.H...N.', 'V.J.H...',
  // D
  'H...NC..', 'AV..XB..', 'H...CN..', 'TJ..AA..', 'H...H...', 'NC..VA..', 'PX..H...', 'H...N...',
  'H...C...', 'A.......',
];

const STAGE5_BARS = [
  '........', '........',
  // 水（ふだんどおり）
  'N...C...', 'K...I...', 'N.C.U.S.', 'K...O...', 'N.C.K.I.', 'U...S...',
  // 溶媒交代 → ヘキサン（2小節あける）
  '........', '........',
  // ヘキサン A：無極性分子は「なじむ」、イオンや糖は見送る
  'J...P...', 'B...T...', 'J...N...', 'P...C...', 'B.J.T.P.', 'G...J...', 'T...K...', 'P.B.J...',
  '........', 'J.......',
  // ヘキサン B
  'J.P.B.T.', 'N.J.C.P.', 'B.B.Z...', 'T.J.P.U.', 'J.PJ..B.', 'I.T.BP..', 'G...J.T.', 'P.J.B...',
  // ヘキサン C：いちばん盛り上がる
  'JP..BT..', 'NJ..PC..', 'TB..JP..', 'G...JB..', 'PJ..TK..', 'BT..JP..',
  'J...P...', 'B.......',
];

const STAGE6_BARS = [
  '........', '........',
  // 水 1：イオンと -OH
  'N...C...', 'K.I.E...', 'U.S.N.O.', 'E...A...', 'N.C.V.I.', 'H...K...', 'E.E.N.C.', 'H...U...',
  '........', '........',
  // ヘキサン 1
  'J...N...', 'P.B.C...', 'T...G...', 'J.P.K.B.', 'I...T.J.', 'P...B...',
  '........', '........',
  // 水 2：見送る分子と、溶けにくい結晶
  'X...N...', 'Y...C...', 'B.E.W...', 'N.C.Q.K.', 'H...J...', 'T.A.Y.V.', 'NC..EE..', 'W...H...',
  '........', '........',
  // ヘキサン 2
  'JP..NB..', 'T.J.C.P.', 'G...JT..', 'BP..KJ..', 'N.T.B.P.', 'J...T...',
  '........', '........',
  // 水 3：まとめ
  'N.C.E.X.', 'H...Y...', 'K.I.A.B.', 'U.S.V.Q.', 'NC..EE..', 'H...N...',
  'C...E...', 'N.......',
];

export const CHARTS = {
  stage1: {
    id: 'stage1', stageNo: 1, titleKey: 'hb.stage1.title', bpm: 90, stepsPerBar: 8, bars: STAGE1_BARS,
    newIds: ['Na', 'Cl'], music: { transpose: 0, chords: 'a' },
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 9, name: 'A', energy: 1 },
      { from: 10, to: 17, name: 'B', energy: 2 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 2 },
      { from: 28, to: 31, name: 'D', energy: 3 },
      { from: 32, to: 33, name: 'outro', energy: 1 },
    ],
    tailBars: 1,
  },
  stage2: {
    id: 'stage2', stageNo: 2, titleKey: 'hb.stage2.title', bpm: 100, stepsPerBar: 8, bars: STAGE2_BARS,
    newIds: ['K', 'Cu', 'I', 'OH', 'SO4'], music: { transpose: 2, chords: 'b' },
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 9, name: 'A', energy: 1 },
      { from: 10, to: 17, name: 'B', energy: 2 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 2 },
      { from: 28, to: 33, name: 'D', energy: 3 },
      { from: 34, to: 35, name: 'outro', energy: 1 },
    ],
    tailBars: 1,
  },
  stage3: {
    id: 'stage3', stageNo: 3, titleKey: 'hb.stage3.title', bpm: 105, stepsPerBar: 8, bars: STAGE3_BARS,
    newIds: ['EtOH', 'Glc', 'Suc'], music: { transpose: -3, chords: 'c' },
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 9, name: 'A', energy: 1 },
      { from: 10, to: 17, name: 'B', energy: 2 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 2 },
      { from: 28, to: 33, name: 'D', energy: 3 },
      { from: 34, to: 35, name: 'outro', energy: 1 },
    ],
    tailBars: 2,
  },
  stage4: {
    id: 'stage4', stageNo: 4, titleKey: 'hb.stage4.title', bpm: 115, stepsPerBar: 8, bars: STAGE4_BARS,
    newIds: ['HCl', 'NH3', 'AcOH', 'Hex', 'Bz', 'CCl4', 'I2', 'Nap'], music: { transpose: 5, chords: 'b' },
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 9, name: 'A', energy: 1 },
      { from: 10, to: 17, name: 'B', energy: 2 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 2 },
      { from: 28, to: 35, name: 'D', energy: 3 },
      { from: 36, to: 37, name: 'outro', energy: 1 },
    ],
    tailBars: 1,
  },
  stage5: {
    id: 'stage5', stageNo: 5, titleKey: 'hb.stage5.title', bpm: 110, stepsPerBar: 8, bars: STAGE5_BARS,
    newIds: ['Hex'], newKey: 'hb.chartNewHex', music: { transpose: -2, chords: 'd' },
    solvents: [{ from: 8, to: 35, solvent: 'hexane' }],   // 溶媒は、ノーツのない2小節の頭で入れかわる
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 7, name: 'A', energy: 1 },
      { from: 8, to: 9, name: 'break', energy: 0 },
      { from: 10, to: 17, name: 'B', energy: 1 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 2 },
      { from: 28, to: 33, name: 'D', energy: 3 },
      { from: 34, to: 35, name: 'outro', energy: 1 },
    ],
    tailBars: 1,
  },
  stage6: {
    id: 'stage6', stageNo: 6, titleKey: 'hb.stage6.title', bpm: 125, stepsPerBar: 8, bars: STAGE6_BARS,
    newIds: ['AgCl', 'BaSO4', 'CaCO3'], newKey: 'hb.chartNewAll', music: { transpose: 3, chords: 'c' },
    solvents: [{ from: 10, to: 17, solvent: 'hexane' }, { from: 28, to: 35, solvent: 'hexane' }],
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 9, name: 'A', energy: 2 },
      { from: 10, to: 11, name: 'break', energy: 0 },
      { from: 12, to: 17, name: 'B', energy: 2 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 3 },
      { from: 28, to: 29, name: 'break', energy: 0 },
      { from: 30, to: 35, name: 'B', energy: 2 },
      { from: 36, to: 37, name: 'break', energy: 0 },
      { from: 38, to: 43, name: 'D', energy: 3 },
      { from: 44, to: 45, name: 'outro', energy: 1 },
    ],
    tailBars: 1,
  },
  parade: {
    id: 'parade', stageNo: 0, titleKey: 'hb.parade.title', bpm: 96, stepsPerBar: 8, bars: PARADE_BARS,
    newIds: null, music: { transpose: 0, chords: 'a' },
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 7, name: 'A', energy: 1 },
      { from: 8, to: 16, name: 'B', energy: 2 },
      { from: 17, to: 21, name: 'break', energy: 1 },
      { from: 22, to: 26, name: 'C', energy: 2 },
      { from: 27, to: 32, name: 'D', energy: 3 },
    ],
    tailBars: 1,
  },
};
/** タイトルの画面に並べる順。ステージは STAGE_ORDER の順に開いていく */
export const STAGE_ORDER = ['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6'];
export const CHART_ORDER = [...STAGE_ORDER, 'parade'];

/**
 * 譜面を、時刻つきのノーツの列に直す（難易度で、間引きや間隔が変わる）。
 * @param chart 譜面
 * @param diff  config.js の DIFFICULTY の1つ
 * @returns {{ notes: {t, noteId, chain?, chainIdx?}[], barSec, totalBars, lengthSec }}  t は曲の始まりからの秒
 */
export function expandChart(chart, diff) {
  const beat = 60 / chart.bpm;
  const barSec = beat * 4;
  const stepSec = barSec / chart.stepsPerBar;
  const notes = [];
  let chainNo = 0;
  chart.bars.forEach((row, bar) => {
    [...row].forEach((ch, i) => {
      const id = SYMBOLS[ch];
      if (!id) return;
      const t = bar * barSec + i * stepSec;
      const def = NOTES[id];
      const solvent = solventAt(chart, bar);
      // やさしい：裏拍（8分音符の奇数番目）のノーツは抜く
      if (diff.thin && i % 2 === 1) return;
      // ヘキサンの中の糖は、水和しないので1つのノーツ（見送る）
      if (def.chain && solvent === 'hexane') { notes.push({ t, noteId: id, solvent, answer: 'PASS' }); return; }
      if (def.chain) {
        chainNo += 1;
        for (let k = 0; k < def.chain; k++) {
          notes.push({ t: t + k * diff.chainStep * beat, noteId: k === 0 ? id : 'OHb', chain: chainNo, chainIdx: k, chainLen: def.chain, solvent, answer: 'OH' });
        }
        return;
      }
      notes.push({ t, noteId: id, solvent, answer: answerIn(def, solvent) });
      if (id === 'HCl' && solvent === 'water') notes.push({ t: t + diff.hclGap * beat, noteId: 'HClCl', parentT: t, solvent, answer: 'H' });
    });
  });
  notes.sort((a, b) => a.t - b.t);
  const totalBars = chart.bars.length + (chart.tailBars || 0);
  // 溶媒が入れかわる時刻（main.js がボタンと3Dの見た目を切りかえる）
  const switches = [];
  let prev = 'water';
  for (let bar = 0; bar < chart.bars.length; bar++) {
    const sv = solventAt(chart, bar);
    if (sv !== prev) { switches.push({ t: bar * barSec, solvent: sv }); prev = sv; }
  }
  return { notes, barSec, totalBars, lengthSec: totalBars * barSec, switches };
}

/** その小節の溶媒 */
export function solventAt(chart, bar) {
  const r = (chart.solvents || []).find((x) => bar >= x.from && bar <= x.to);
  return r ? r.solvent : 'water';
}

/** その小節の場面 */
export function sectionAt(chart, bar) {
  return chart.sections.find((s) => bar >= s.from && bar <= s.to) || { name: 'outro', energy: 1 };
}

/** 曲に出てくる溶質の化学式（タイトルの画面に並べる）。ステージは新しく出るものだけ */
export function chartFormulas(chart) {
  if (chart.newIds) return chart.newIds.map((id) => NOTES[id].formula);
  const ids = new Set();
  chart.bars.forEach((row) => [...row].forEach((ch) => { if (SYMBOLS[ch]) ids.add(SYMBOLS[ch]); }));
  return [...ids].map((id) => NOTES[id].formula);
}

/**
 * v0.5：苦手ノーツの練習曲を作る（道具屋の「苦手問題の練習券」）。
 * @param {{ water: string[], hexane: string[] }} weak  溶媒ごとの苦手な溶質
 * @param {{ bpm: number, barsPerSolvent: number }} opt
 */
export function makeWeakChart(weak, opt) {
  const sym = Object.fromEntries(Object.entries(SYMBOLS).map(([k, v]) => [v, k]));
  const bars = ['........', '........'];
  const solvents = [];
  const sections = [{ from: 0, to: 1, name: 'intro', energy: 0 }];
  const part = (ids, solvent) => {
    if (!ids.length) return;
    // 前のパートのあとと、ヘキサンの前には、ノーツのない2小節（ボタンが変わるのを待つ）
    const gap = bars.length > 2 || solvent === 'hexane';
    if (gap) { bars.push('........', '........'); sections.push({ from: bars.length - 2, to: bars.length - 1, name: 'break', energy: 0 }); }
    const from = bars.length - (gap ? 2 : 0);
    let i = 0;
    const start = bars.length;
    const chain = (id) => solvent === 'water' && NOTES[id].chain;
    while (bars.length - start < opt.barsPerSolvent) {
      const a = ids[i % ids.length]; i += 1;
      // 糖は -OH の数だけ続くので、それだけで2小節
      if (chain(a)) { bars.push(`${sym[a]}.......`, '........'); continue; }
      const b = ids[i % ids.length];
      if (chain(b) || ids.length === 1) { bars.push(`${sym[a]}...${ids.length === 1 ? sym[a] : '.'}...`); continue; }
      i += 1;
      bars.push(`${sym[a]}...${sym[b]}...`);
    }
    sections.push({ from: start, to: bars.length - 1, name: 'A', energy: 2 });
    if (solvent === 'hexane') solvents.push({ from, to: bars.length - 1, solvent });
  };
  part(weak.water || [], 'water');
  part(weak.hexane || [], 'hexane');
  bars.push('........');
  sections.push({ from: bars.length - 1, to: bars.length - 1, name: 'outro', energy: 1 });
  return {
    id: 'weak', stageNo: 0, titleKey: 'hb.weak.title', bpm: opt.bpm, stepsPerBar: 8, bars, solvents, sections,
    newIds: null, music: { transpose: 0, chords: 'b' }, tailBars: 1, practice: true,
  };
}
