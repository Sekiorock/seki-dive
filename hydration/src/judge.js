// hydration/src/judge.js
// タイミングと向きの判定、コンボ、点数（ハイドレーション・ビート仕様書 2章）。
//   ・向きが逆なら、タイミングが合っていても「逆向き」としてミス（向きの正しさが、タイミングより優先）。
//   ・同時押しのノーツ（-OH など）：左右を JUDGE.simulMs の内に両方押す。片方だけなら「片側だけ」でミス。
//   ・見送るノーツ（無極性分子、溶けにくい結晶）：判定の幅の間に押さなければ「見送り成功」（Perfect 扱い）。
//     押すと「誤水和」としてミス。
//   ・判定の幅：Perfect ±50 ms、Great ±90 ms、Good ±130 ms（config.js で変えられる）。
//   ・時刻はすべて「聞こえている音の時刻」から曲の始まりを引いた秒。
//   ・v0.3：水和ゲージ（GAUGE）。判定ごとに増減し、曲の終わりに clearPct % 以上ならクリア。
//     タイミング調整で測った、その端末のずれ（offsetMs）を差し引いて判定する。
//
// press() と tick() は、判定が決まったノーツの知らせ（events）の列を返す：
//   { note, result: 'perfect'|'great'|'good'|'miss'|'wrong', ms, kind?, pass? }
//   kind は間違いの種類（notes.js の mistakeKind）。pass は見送り成功。

import { JUDGE, SCORE, GAUGE } from './config.js';
import { mistakeKind } from './notes.js';

export function createJudge(notes, defs, { offsetMs = JUDGE.inputOffsetMs, startPct = GAUGE.startPct, negMul = 1, judgeMul = 1, clearPct = GAUGE.clearPct } = {}) {
  // v1.1：難易度ごとに判定の幅を広げる（judgeMul）
  const W = { perfect: JUDGE.perfect * judgeMul, great: JUDGE.great * judgeMul, good: JUDGE.good * judgeMul };
  const goodSec = W.good / 1000;
  const offset = offsetMs / 1000;
  const gaugeUnit = notes.length ? 100 / (notes.length * GAUGE.fullAt) : 0;
  const graceSec = (JUDGE.missGraceMs || 0) / 1000;
  const simulSec = (JUDGE.simulMs || 90) / 1000;
  let cursor = 0;            // まだ判定していない、いちばん早いノーツ
  let half = null;           // 同時押しのノーツで、片方だけ押された状態 { note, input, tt, ms }
  const stats = {
    total: notes.length,
    perfect: 0, great: 0, good: 0, miss: 0, wrong: 0,
    passed: 0,               // 見送り成功（perfect にも数える）
    combo: 0, maxCombo: 0, rateSum: 0,
    mistakes: {},            // 間違いの種類ごとの回数（結果の画面の解説で使う）
    mistakeNotes: {},        // 間違いの種類ごとに、どの溶質で間違えたか { cationH: { Na: 3 } }（解説の模型に使う）
    offsets: [],             // 当たったときのずれ（ミリ秒）。タイミング調整の参考
    gauge: startPct,         // 水和ゲージ（0〜100 %）。バトルロイヤルでは半分から始まり、0 で脱落
  };

  // ノーツの正解（溶媒で変わる。charts.js が n.answer に入れておく）
  const answerOf = (n) => n.answer || defs[n.noteId].answer;

  function grade(absMs) {
    if (absMs <= W.perfect) return 'perfect';
    if (absMs <= W.great) return 'great';
    return 'good';
  }

  function record(note, result, extra = {}) {
    note.state = result === 'wrong' ? 'wrong' : result === 'miss' ? 'miss' : 'hit';
    note.result = result;
    stats[result] += 1;
    stats.rateSum += SCORE.rate[result] || 0;
    if (extra.kind) {
      stats.mistakes[extra.kind] = (stats.mistakes[extra.kind] || 0) + 1;
      const per = stats.mistakeNotes[extra.kind] = stats.mistakeNotes[extra.kind] || {};
      per[note.noteId] = (per[note.noteId] || 0) + 1;
    }
    if (extra.pass) stats.passed += 1;
    const g = GAUGE.gain[result] || 0;
    stats.gauge = Math.max(0, Math.min(100, stats.gauge + g * (g < 0 ? negMul : 1) * gaugeUnit));
    if (result === 'miss' || result === 'wrong') stats.combo = 0;
    else { stats.combo += 1; stats.maxCombo = Math.max(stats.maxCombo, stats.combo); }
    return { note, result, ...extra };
  }

  function advance() { while (cursor < notes.length && notes[cursor].state !== 'pending') cursor += 1; }

  /** 片方だけ押されたまま時間が過ぎた同時押しのノーツを、「片側だけ」のミスにする */
  function resolveHalf(events) {
    if (!half) return;
    const n = half.note;
    half = null;
    if (n.state === 'pending') events.push(record(n, 'wrong', { kind: mistakeKind(defs[n.noteId], 'none', n.solvent), ms: 0 }));
  }

  return {
    stats,
    get cursor() { return cursor; },

    /**
     * ボタンを押したとき。
     * @param {'O'|'H'} input
     * @param {number} time 押した瞬間の時刻（秒）
     */
    press(input, time) {
      const tt = time - offset;
      const events = [];
      // 同時押しの2つ目
      if (half) {
        if (input !== half.input && tt - half.tt <= simulSec && half.note.state === 'pending') {
          const ms = Math.abs(half.ms) < Math.abs(Math.round((tt - half.note.t) * 1000)) ? half.ms : Math.round((tt - half.note.t) * 1000);
          stats.offsets.push(ms);
          events.push(record(half.note, grade(Math.abs(ms)), { ms }));
          half = null;
          advance();
          return events;
        }
        resolveHalf(events);
      }
      let best = null, bestAbs = Infinity;
      for (let i = cursor; i < notes.length; i++) {
        const n = notes[i];
        if (n.t - tt > goodSec) break;
        if (n.state !== 'pending') continue;
        const abs = Math.abs(n.t - tt);
        if (abs <= goodSec && abs < bestAbs) { best = n; bestAbs = abs; }
      }
      if (!best) { advance(); return events; }
      const def = defs[best.noteId];
      const ans = answerOf(best);
      const ms = Math.round((tt - best.t) * 1000);
      if (ans === 'OH') {
        // 同時押し：もう片方を少しだけ待つ
        half = { note: best, input, tt, ms };
        return events;
      }
      if (ans === 'PASS') {
        events.push(record(best, 'wrong', { kind: mistakeKind(def, input, best.solvent), ms }));
      } else if (ans !== input) {
        events.push(record(best, 'wrong', { kind: mistakeKind(def, input, best.solvent), ms }));
      } else {
        stats.offsets.push(ms);
        events.push(record(best, grade(Math.abs(ms)), { ms }));
      }
      advance();
      return events;
    },

    /**
     * 毎回呼ぶ：
     *  ・同時押しの片方だけのまま、時間が過ぎたら「片側だけ」
     *  ・見送るノーツが判定の幅を過ぎたら「見送り成功」
     *  ・判定の幅を過ぎても押されなかったノーツは「ミス」
     */
    tick(time) {
      const tt = time - offset;
      const events = [];
      if (half && tt - half.tt > simulSec) resolveHalf(events);
      const limit = tt - graceSec;
      for (let i = cursor; i < notes.length; i++) {
        const n = notes[i];
        if (n.t + goodSec >= limit) break;
        if (n.state !== 'pending' || (half && half.note === n)) continue;
        if (answerOf(n) === 'PASS') events.push(record(n, 'perfect', { pass: true }));
        else events.push(record(n, 'miss'));
      }
      advance();
      return events;
    },

    /** 点数（全部 Perfect でちょうど 1,000,000 点） */
    score() { return stats.total ? Math.round((stats.rateSum / stats.total) * SCORE.max) : 0; },
    done() { return cursor >= notes.length; },
    /** クリアしたか（曲の終わりに水和ゲージが clearPct % 以上） */
    cleared() { return stats.gauge >= clearPct; },
    clearPct,
  };
}
