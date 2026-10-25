// hydration/src/charts.js
// 譜面（ハイドレーション・ビート仕様書 4章）。v0.1 はステージ1「極性のプレリュード」だけ。
//
// 1小節は8分音符8つ分。1文字が8分音符1つ：
//   N = Na⁺（左ボタン O）   C = Cl⁻（右ボタン H）   . = 何もない
// sections は曲の場面（音楽の盛り上がり energy 0〜3 にも使う）。

const STAGE1_BARS = [
  // イントロ（2小節）：まだノーツは来ない
  '........', '........',
  // A（8小節）：1拍目と3拍目に、Na⁺ と Cl⁻ が交互に
  'N...C...', 'N...C...', 'C...N...', 'C...N...',
  'N...N...', 'C...C...', 'N...C...', 'C...N...',
  // B（8小節）：毎拍
  'N.N.C.C.', 'N.C.N.C.', 'C.C.N.N.', 'C.N.C.N.',
  'N.C.C.N.', 'C.N.N.C.', 'N.N.C.C.', 'N.C.N...',
  // 間奏（2小節）
  'C.......', 'N.......',
  // C（8小節）：8分音符が混ざる
  'N.C.N.CC', 'N.C.N.C.', 'C.N.C.NN', 'C.N.C.N.',
  'N.NC..C.', 'C.CN..N.', 'N.C.NC..', 'C.N.CN..',
  // D（4小節）：いちばん盛り上がる
  'NCN.CNC.', 'NNCC.N.C', 'CNC.NCN.', 'CCNN.C.N',
  // 終わり（2小節）
  'N...C...', 'N.......',
];

export const CHARTS = {
  1: {
    stage: 1,
    titleKey: 'hb.stage1.title',
    bpm: 90,
    stepsPerBar: 8,               // 8分音符
    bars: STAGE1_BARS,
    // 曲の場面：from〜to（小節、0から数える）と、音の厚さ energy
    sections: [
      { from: 0, to: 1, name: 'intro', energy: 0 },
      { from: 2, to: 9, name: 'A', energy: 1 },
      { from: 10, to: 17, name: 'B', energy: 2 },
      { from: 18, to: 19, name: 'break', energy: 0 },
      { from: 20, to: 27, name: 'C', energy: 2 },
      { from: 28, to: 31, name: 'D', energy: 3 },
      { from: 32, to: 33, name: 'outro', energy: 1 },
    ],
    tailBars: 1,                  // 最後のノーツのあと、曲を鳴らしておく小節数
  },
};

const SYMBOL = { N: 'Na', C: 'Cl' };

/**
 * 譜面を、時刻つきのノーツの列に直す。
 * @returns {{ notes: {t:number, noteId:string}[], barSec:number, totalBars:number, lengthSec:number }}
 *   t は曲の始まりからの秒
 */
export function expandChart(chart) {
  const barSec = (60 / chart.bpm) * 4;
  const stepSec = barSec / chart.stepsPerBar;
  const notes = [];
  chart.bars.forEach((row, bar) => {
    [...row].forEach((ch, i) => {
      if (SYMBOL[ch]) notes.push({ t: bar * barSec + i * stepSec, noteId: SYMBOL[ch] });
    });
  });
  const totalBars = chart.bars.length + (chart.tailBars || 0);
  return { notes, barSec, totalBars, lengthSec: totalBars * barSec };
}

/** その小節の場面 */
export function sectionAt(chart, bar) {
  return chart.sections.find((s) => bar >= s.from && bar <= s.to) || { name: 'outro', energy: 1 };
}
