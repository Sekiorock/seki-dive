// hydration/src/notes.js
// 溶質ノーツの一覧（ハイドレーション・ビート仕様書 3章）。譜面はこの一覧から選んで並べる。
// v0.1 では Na⁺ と Cl⁻ だけ。v0.2 で 3章のすべてのノーツを足す。
//
//   id        譜面で使う名前
//   formula   化学式（どちらの言語でも同じ表記）
//   charge    'plus'（δ+、陽イオン）/ 'minus'（δ−、陰イオン）
//   answer    正解の入力。'O' = 左ボタン（水の O を向ける）、'H' = 右ボタン（水の H を向ける）
//   kindKey   補助輪の文字の i18n の鍵（「陽イオン」など）
//   radius    3Dの球の大きさ（Cl⁻ は Na⁺ より大きい）

export const NOTES = {
  Na: { id: 'Na', formula: 'Na⁺', charge: 'plus', answer: 'O', kindKey: 'hb.kind.cation', radius: 0.62 },
  Cl: { id: 'Cl', formula: 'Cl⁻', charge: 'minus', answer: 'H', kindKey: 'hb.kind.anion', radius: 0.86 },
};

/** 間違いの種類（v0.4 の結果画面で、種類ごとに解説を出す） */
export function mistakeKind(note, input) {
  if (note.charge === 'plus' && input === 'H') return 'cationH';   // 陽イオンに H を向けた
  if (note.charge === 'minus' && input === 'O') return 'anionO';   // 陰イオンに O を向けた
  return 'timing';
}
