// hydration/src/judge.js
// タイミングと向きの判定、コンボ、点数（ハイドレーション・ビート仕様書 2章）。
//   ・向きが逆なら、タイミングが合っていても「逆向き」としてミス（向きの正しさが、タイミングより優先）。
//   ・判定の幅：Perfect ±50 ms、Great ±90 ms、Good ±130 ms（config.js で変えられる）。
//   ・時刻はすべて「聞こえている音の時刻」から曲の始まりを引いた秒。

import { JUDGE, SCORE } from './config.js';
import { mistakeKind } from './notes.js';

export function createJudge(notes, defs) {
  const goodSec = JUDGE.good / 1000;
  const offset = JUDGE.inputOffsetMs / 1000;
  const graceSec = (JUDGE.missGraceMs || 0) / 1000;
  let cursor = 0;            // まだ判定していない、いちばん早いノーツ
  const stats = {
    total: notes.length,
    perfect: 0, great: 0, good: 0, miss: 0, wrong: 0,
    combo: 0, maxCombo: 0, rateSum: 0,
    mistakes: {},            // 間違いの種類ごとの回数（v0.4 の解説で使う）
    offsets: [],             // 当たったときのずれ（ミリ秒）。v0.3 のタイミング調整の参考
  };

  function grade(absMs) {
    if (absMs <= JUDGE.perfect) return 'perfect';
    if (absMs <= JUDGE.great) return 'great';
    return 'good';
  }

  function addMistake(kind) { stats.mistakes[kind] = (stats.mistakes[kind] || 0) + 1; }

  function record(note, result) {
    note.state = result === 'wrong' ? 'wrong' : result === 'miss' ? 'miss' : 'hit';
    note.result = result;
    stats[result] += 1;
    stats.rateSum += SCORE.rate[result] || 0;
    if (result === 'miss' || result === 'wrong') stats.combo = 0;
    else { stats.combo += 1; stats.maxCombo = Math.max(stats.maxCombo, stats.combo); }
  }

  function advance() { while (cursor < notes.length && notes[cursor].state !== 'pending') cursor += 1; }

  return {
    stats,
    get cursor() { return cursor; },

    /**
     * ボタンを押したとき。
     * @param {'O'|'H'} input
     * @param {number} time 押した瞬間の時刻（秒）
     * @returns {{note, result, ms}|null} 近くにノーツがなければ null（何も起きない）
     */
    press(input, time) {
      const tt = time - offset;
      let best = null, bestAbs = Infinity;
      for (let i = cursor; i < notes.length; i++) {
        const n = notes[i];
        if (n.t - tt > goodSec) break;
        if (n.state !== 'pending') continue;
        const abs = Math.abs(n.t - tt);
        if (abs <= goodSec && abs < bestAbs) { best = n; bestAbs = abs; }
      }
      if (!best) return null;
      const def = defs[best.noteId];
      const ms = Math.round((tt - best.t) * 1000);
      let result;
      if (def.answer !== input) {
        result = 'wrong';
        addMistake(mistakeKind(def, input));
      } else {
        result = grade(Math.abs(ms));
        stats.offsets.push(ms);
      }
      record(best, result);
      advance();
      return { note: best, result, ms };
    },

    /** 毎回呼ぶ：判定の幅を過ぎても押されなかったノーツを「ミス」にする。ミスにしたノーツの列を返す */
    tick(time) {
      const tt = time - offset - graceSec;
      const missed = [];
      for (let i = cursor; i < notes.length; i++) {
        const n = notes[i];
        if (n.t + goodSec >= tt) break;
        if (n.state === 'pending') { record(n, 'miss'); missed.push(n); }
      }
      advance();
      return missed;
    },

    /** 点数（全部 Perfect でちょうど 1,000,000 点） */
    score() { return stats.total ? Math.round((stats.rateSum / stats.total) * SCORE.max) : 0; },
    done() { return cursor >= notes.length; },
  };
}
