// hydration/src/charts.js
// 譜面（ハイドレーション・ビート仕様書 4章）。
//   ステージ1「極性のプレリュード」：Na⁺ と Cl⁻
//   練習曲「ノーツ・パレード」：v0.2 で足した、3章のすべての溶質ノーツを順番に試せる曲
//   （ステージ2〜4は v0.3、ステージ5・6は v0.4 で足す）
//
// 1小節は8分音符8つ分。1文字が8分音符1つ（. は何もない）：
//   N Na⁺  K K⁺  U Cu²⁺        （左：O）
//   C Cl⁻  I I⁻  O OH⁻  S SO₄²⁻ （右：H）
//   E エタノール  A NH₃  V 酢酸 （同時押し）
//   G グルコース（-OH ×5）  Z スクロース（-OH ×8）：同時押しの連続。後ろの拍をあけておく
//   H HCl：O のすぐあとに Cl⁻ が来る（H）。後ろの8分音符1つ（やさしいでは1拍）をあけておく
//   X ヘキサン  B ベンゼン  T 四塩化炭素  J ヨウ素  P ナフタレン（見送る）
//   Y AgCl  W BaSO₄  Q CaCO₃（溶けにくい結晶。見送る）

import { NOTES } from './notes.js';

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

export const CHARTS = {
  stage1: {
    id: 'stage1', stageNo: 1, titleKey: 'hb.stage1.title', bpm: 90, stepsPerBar: 8, bars: STAGE1_BARS,
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
  parade: {
    id: 'parade', stageNo: 0, titleKey: 'hb.parade.title', bpm: 96, stepsPerBar: 8, bars: PARADE_BARS,
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
export const CHART_ORDER = ['stage1', 'parade'];

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
      // やさしい：裏拍（8分音符の奇数番目）のノーツは抜く
      if (diff.thin && i % 2 === 1) return;
      if (def.chain) {
        chainNo += 1;
        for (let k = 0; k < def.chain; k++) {
          notes.push({ t: t + k * diff.chainStep * beat, noteId: k === 0 ? id : 'OHb', chain: chainNo, chainIdx: k, chainLen: def.chain });
        }
        return;
      }
      notes.push({ t, noteId: id });
      if (id === 'HCl') notes.push({ t: t + diff.hclGap * beat, noteId: 'HClCl', parentT: t });
    });
  });
  notes.sort((a, b) => a.t - b.t);
  const totalBars = chart.bars.length + (chart.tailBars || 0);
  return { notes, barSec, totalBars, lengthSec: totalBars * barSec };
}

/** その小節の場面 */
export function sectionAt(chart, bar) {
  return chart.sections.find((s) => bar >= s.from && bar <= s.to) || { name: 'outro', energy: 1 };
}

/** 曲に出てくる溶質の化学式（タイトルの画面に並べる） */
export function chartFormulas(chart) {
  const ids = new Set();
  chart.bars.forEach((row) => [...row].forEach((ch) => { if (SYMBOLS[ch]) ids.add(SYMBOLS[ch]); }));
  return [...ids].map((id) => NOTES[id].formula);
}
