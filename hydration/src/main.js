// hydration/src/main.js
// ① ハイドレーション・ビート：画面の切り替えと全体の進行。
// v0.1：3D空間、水分子、飛んでくる Na⁺ と Cl⁻、左右のボタン、タイミング判定。ステージ1の曲だけ。
// v0.2：3章のすべての溶質ノーツ（同時押し・見送り・HCl の電離）、難易度と補助輪の3段階、練習曲。
// v0.3：ステージ1〜4、水和ゲージとクリア、ステージの解放、タイミング調整の画面。
// v0.4：ステージ5・6（溶媒の交代：ヘキサンでは中央の「なじむ」ボタン）、結果の画面の間違いの解説、図鑑。
// v0.5：クリアの報酬（ヒヤマ。所得税と1日の上限つき）、ショップの演出、道具屋の券（ヒント券・苦手問題の練習券・
//       図鑑の追加ページ）を使えるように。言語の切りかえで、どの画面も描き直すように。
// v0.8：対戦（タイマン）。2人で同じ曲を同時に演奏し、10コンボごとに妨害を送り合う（battle.js）。
// v0.9：対戦（バトルロイヤル、3〜12人）。水和ゲージが0になると脱落して観戦に移る。妨害を送る相手を選べる。
//
// 画面：（初めてのときはタイミング調整）→ タイトル → プレイ（一時停止あり）→ 結果。ワールドに入るときは、毎回アバター選択の画面を通る。
// 時刻の基準は、音の時計（audio.js の heardTime）。

import { ROYALE, GLOW } from './config.js';
import { VERSION, NOTE, COMBO_LAYERS, CUTIN_EVERY, FLASH, DIFFICULTY, DEFAULT_DIFFICULTY, GAUGE, CALIB, JUDGE, SHOP_FX, WEAK } from './config.js';
import { NOTES } from './notes.js';
import { CHARTS, CHART_ORDER, STAGE_ORDER, expandChart, chartFormulas, makeWeakChart } from './charts.js';
import { createJudge } from './judge.js';
import { unlockAudio, heardTime, heardTimeAt, pauseAudio, resumeAudio, savedOffset, saveOffset, startCalibration } from './audio.js';
import { isUnlocked, isCleared, recordOf, prevStageNo, recordResult } from './progress.js';
import { createSong, playHit, playWrong } from './music.js';
import { createScene } from './scene3d.js';
import { renderResult } from './results.js';
import { renderZukan, zukanTab, zukanPick, closeZukan } from './zukan.js';
import { hideModel } from './viewer.js';
import * as battle from './battle.js';
import { BATTLE } from './battle.js';
import { serverNow } from './net.js';
import { saveExplanations, addWeak, weakList, hasWeak, firstClearOf, fxState, addFx, useFx, openPage } from './progress.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getCostume, itemCount, useItem, addItem } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama, SETTINGS, reward, pay, grant, priceWithTax, canAfford, isInArrears } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { DEFAULT_AVATAR, standUrl, lineKey, nameKey, say, tagStand, faceFig, nameTag } from '../../shared/characters.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DIFF_ORDER = ['easy', 'normal', 'hard'];
const STORE_KEY = 'sekio.hb.pick';

// 選んだ曲と難易度（この端末だけで覚えておく）
let pick = { chart: CHART_ORDER[0], diff: DEFAULT_DIFFICULTY };
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && CHARTS[saved.chart]) pick.chart = saved.chart;
  if (saved && DIFFICULTY[saved.diff]) pick.diff = saved.diff;
} catch (e) { /* 覚えておけない端末では、毎回はじめの選び方になる */ }
function savePick() { try { localStorage.setItem(STORE_KEY, JSON.stringify(pick)); } catch (e) { /* 何もしない */ } }

function stageLabel(chart) { return chart.stageNo ? t('hb.stageLabel', { n: chart.stageNo }) : t('hb.practiceLabel'); }

let screen = 'loading';      // 'title' / 'play' / 'result'
let scene = null;
let avatar = DEFAULT_AVATAR;
let play = null;             // 今の曲の状態

function goHome() { location.href = '../'; }

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3600);
}

function show(name) {
  screen = name;
  for (const id of ['title', 'play', 'result', 'calib', 'zukan', 'shop', 'battle']) $(id).hidden = id !== name;
  if (name !== 'result' && name !== 'zukan') hideModel();
  document.body.classList.toggle('is-playing', name === 'play');
}

// ───────────── タイトル ─────────────
/** v1.0：映えの段階。タイトルでは、開いているいちばん先のステージの段階 */
function titleGlow() {
  // 練習曲（ノーツ・パレード）はいつでも開いているので数えない。全ステージをクリアしたら最高の段階
  if (STAGE_ORDER.every((id) => isCleared(id))) return GLOW.byStage.parade;
  const open = STAGE_ORDER.filter((id) => isUnlocked(id));
  return Math.max(1, ...open.map((id) => GLOW.byStage[id] || 1));
}

function renderTitle() {
  if (scene) scene.setGlow(titleGlow());
  const st = $('title');
  st.querySelector('.hb-guide__stand').src = standUrl('minato', 'normal');
  st.querySelector('.hb-guide__stand').alt = t(nameKey('minato'));
  st.querySelector('.hb-guide__line').textContent = say(t, 'minato', t(lineKey('minato', 'hb1')));
  tagStand(t, st.querySelector('.hb-guide__stand'), 'minato');
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  if (!isUnlocked(pick.chart)) pick.chart = CHART_ORDER[0];
  $('chart-pick').innerHTML = CHART_ORDER.map((id) => {
    const c = CHARTS[id];
    const on = id === pick.chart;
    const open = isUnlocked(id);
    const recs = DIFF_ORDER.map((d) => {
      const r = recordOf(id, d);
      return `<i class="${r && r.clear ? 'is-clear' : ''}" title="${esc(t(`hb.diff.${d}`))}">${esc(t(`hb.diffShort.${d}`))}</i>`;
    }).join('');
    const mine = recordOf(id, pick.diff);
    const notesLine = c.newKey ? t(c.newKey) : c.newIds ? t('hb.chartNew', { list: chartFormulas(c).join(' ') }) : t('hb.chartAll');
    return `<button type="button" class="hb-chart${on ? ' is-on' : ''}${c.stageNo ? '' : ' hb-chart--parade'}" data-act="pick-chart" data-chart="${id}" aria-pressed="${on}"${open ? '' : ' disabled'}>
      <span class="hb-chart__no">${esc(stageLabel(c))}</span>
      <span class="hb-chart__name">${esc(t(c.titleKey))}</span>
      <span class="hb-chart__info">${esc(t('hb.chartInfo', { bpm: c.bpm }))}</span>
      ${open ? `<span class="hb-chart__notes">${esc(notesLine)}</span>
      <span class="hb-chart__rec">${recs}<b>${mine ? esc(t('hb.best', { score: formatHiyama(mine.best) })) : ''}</b></span>`
        : `<span class="hb-chart__lock">🔒 ${esc(t('hb.locked', { n: prevStageNo(id) }))}</span>`}
    </button>`;
  }).join('');
  $('diff-pick').innerHTML = DIFF_ORDER.map((d) => {
    const on = d === pick.diff;
    return `<button type="button" class="hb-diff__btn${on ? ' is-on' : ''}" data-act="pick-diff" data-diff="${d}" aria-pressed="${on}">
      <b>${esc(t(`hb.diff.${d}`))}</b><span>${esc(t(`hb.diff.${d}Sub`))}</span>
    </button>`;
  }).join('');
  $('diff-note').textContent = t(`hb.diff.${pick.diff}Note`);
  renderTickets();
  const off = savedOffset();
  $('calib-now').textContent = off === null ? t('hb.calib.none') : `${off > 0 ? '+' : ''}${off} ms`;
}

// ───────────── v0.5：道具屋の券 ─────────────
let useHint = false;
function renderTickets() {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hint = itemCount('hint'), practice = itemCount('practice');
  if (!hint) useHint = false;
  const rows = [];
  if (hint && pick.diff !== 'easy') {
    rows.push(`<label class="hb-ticket"><input type="checkbox" data-act="use-hint" ${useHint ? 'checked' : ''}><span>${esc(t('hb.ticket.hint'))}　<b>×${hint}</b></span></label>`);
  }
  if (practice) {
    rows.push(`<div class="hb-ticket"><span>${esc(t('hb.ticket.practice'))}　<b>×${practice}</b><br>${esc(t(hasWeak() ? 'hb.ticket.practiceNote' : 'hb.ticket.practiceNone'))}</span>
      <button type="button" class="btn btn--small" data-act="weak-start"${hasWeak() ? '' : ' disabled'}>${esc(t('hb.ticket.practiceGo'))}</button></div>`);
  }
  $('tickets').innerHTML = rows.join('');
}

// ───────────── プレイ ─────────────
async function startPlay(opts = {}) {
  const weak = opts.weak;
  const bt = opts.battle;     // 対戦：{ code, chart, diff, startAt }
  if (!weak && !bt && !isUnlocked(pick.chart)) { toast(t('hb.lockedToast', { n: prevStageNo(pick.chart) })); return; }
  let chart = CHARTS[bt ? bt.chart : pick.chart];
  if (weak) {
    // 苦手ノーツの練習曲：券を1枚使う
    if (!useItem('practice')) { renderTitle(); return; }
    chart = makeWeakChart({ water: weakList('water', WEAK.maxNotes), hexane: weakList('hexane', WEAK.maxNotes) }, WEAK);
    toast(t('hb.ticket.practiceUsed'));
  }
  // ヒント券：ふつう・むずかしいでも、この曲だけ補助輪1の文字を出す
  let hinted = false;
  if (!weak && !bt && useHint && pick.diff !== 'easy' && useItem('hint')) { hinted = true; toast(t('hb.ticket.hintUsed')); }
  useHint = false;
  const ctx = await unlockAudio();
  const diffId = bt ? bt.diff : pick.diff;
  const diff = DIFFICULTY[diffId];
  const exp = expandChart(chart, diff);
  // 確かめるとき用（?debug=1&short）：曲を14秒に縮める
  if (params.has('debug') && params.has('short')) { exp.notes = exp.notes.filter((n) => n.t < 12); exp.lengthSec = 14; exp.totalBars = Math.ceil(14 / exp.barSec); }
  const notes = exp.notes.map((n) => ({ ...n, state: 'pending', slot: null }));
  const off = savedOffset();
  const royale = bt && bt.mode === 'royale';
  const judge = createJudge(notes, NOTES, {
    offsetMs: off === null ? JUDGE.inputOffsetMs : off,
    // バトルロイヤル：ゲージは半分から始まり、ミスで大きく減る（0 で脱落）
    ...(royale ? { startPct: ROYALE.startPct, negMul: ROYALE.negMul } : {}),
  });
  const song = createSong(chart, exp);
  // 対戦では、2人の端末で同じ時刻に始まるように、サーバーの時計で決めた開始の時刻に合わせる
  const t0 = bt ? ctx.currentTime + Math.max(0.5, (bt.startAt - serverNow()) / 1000) : ctx.currentTime + NOTE.leadInSec;
  hideModel();
  scene.reset();
  setSolvent('water', false);
  scene.setPlay({ approachSec: diff.approachSec, assist: hinted ? 1 : diff.assist });
  // 映え：ステージの曲はその段階。練習曲（パレード）は、いまの進み具合の段階
  const cid = bt ? bt.chart : pick.chart;
  scene.setGlow(weak ? GLOW.practice : STAGE_ORDER.includes(cid) ? (GLOW.byStage[cid] || 1) : titleGlow());
  scene.setFx(fxState().on);
  scene.setTiming(0, chart.bpm);
  scene.setComboLevel(0);
  song.start(t0);
  play = {
    chart, diff, diffId, exp, notes, judge, song, t0, swIdx: 0, weak: !!weak, hinted, battle: bt || null,
    paused: false, finished: false, hits: 0,
    peelEvery: Math.max(1, Math.ceil(notes.length / scene.crystalCount)),
    lastScore: -1, lastCombo: -1,
  };
  $('hud-score').textContent = '0';
  play.lastGauge = -1;
  play.out = false;
  document.body.classList.remove('is-out');
  $('spectate').hidden = true;
  $('hud-target').hidden = !royale;
  if (royale) $('hud-target').textContent = t('hb.battle.targetChip', { target: t(`hb.battle.target.${battle.currentTarget()}`) });
  $('hud-combo').classList.remove('is-on');
  show('play');
}

function comboLevel(c) { return COMBO_LAYERS.filter((x) => c >= x).length; }

/** 判定の文字。見送り成功・片側だけ・誤水和は、専用の文字にする */
function judgeLabel(ev) {
  if (ev.pass) return 'pass';
  if (ev.result !== 'wrong') return ev.result;
  if (ev.kind === 'ohOneSide') return 'oneSide';
  if (ev.kind === 'nonpolarHydrated' || ev.kind === 'insolubleDissolved') return 'badHydrate';
  return 'wrong';
}
function showJudge(label) {
  const el = $('hud-judge');
  el.className = 'hb-judge';
  void el.offsetWidth;
  el.textContent = t(`hb.j.${label}`);
  const cls = label === 'pass' ? 'perfect' : (label === 'oneSide' || label === 'badHydrate') ? 'wrong' : label;
  el.classList.add('is-shown', `is-${cls}`, `is-${label}`);
}

let lastFlash = 0;
function flashPerfect() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // 画面の点滅が続くと、体調を崩す人がいる。反転は FLASH.minGapMs に1回まで、弱めに
  const nowMs = performance.now();
  if (nowMs - lastFlash < FLASH.minGapMs) return;
  lastFlash = nowMs;
  const f = $('flash');
  f.classList.add('is-on');
  setTimeout(() => f.classList.remove('is-on'), FLASH.durationMs);
}

function cutin(combo) {
  const el = $('cutin');
  el.querySelector('img').src = standUrl(avatar, 'smile', getCostume(avatar));
  tagStand(t, el.querySelector('img'), avatar);
  el.querySelector('p').textContent = t('hb.cutin', { n: combo });
  el.classList.remove('is-shown');
  void el.offsetWidth;
  el.classList.add('is-shown');
}

/** 判定が決まったノーツの知らせ（events）を、演出・音・文字に反映する */
function applyEvents(events, now) {
  if (!events.length) return;
  const st = play.judge.stats;
  let shown = null;
  for (const ev of events) {
    if (ev.result === 'wrong') {
      scene.wrong(ev.note, now);
      playWrong();
      shown = ev;
    } else if (ev.result === 'miss') {
      if (!shown) shown = ev;
    } else if (ev.pass) {
      scene.pass(ev.note, now);
      if (!shown) shown = ev;
    } else {
      play.hits += 1;
      scene.hit(ev.note, ev.result, now, play.hits % play.peelEvery === 0);
      playHit(ev.result);
      shown = ev;
      if (ev.result === 'perfect') flashPerfect();
      if (st.combo > 0 && st.combo % CUTIN_EVERY === 0) cutin(st.combo);
      // 対戦：10コンボごとに、相手へ妨害を送る
      if (play.battle) {
        const sent = battle.onCombo(st.combo);
        if (sent) attackBanner(t('hb.attack.sent', { kind: t(`hb.attack.${sent.kind}`), name: sent.to }), true);
      }
    }
  }
  if (shown) showJudge(judgeLabel(shown));
  const lv = comboLevel(st.combo);
  play.song.setLayers(lv);
  scene.setComboLevel(lv);
}

/** ボタンを押したときの処理。time は、押した瞬間の「曲の始まりからの秒」 */
/** 溶媒を切りかえる（ボタン・3D・知らせの文字） */
function setSolvent(sv, announce = true) {
  scene.setSolvent(sv);
  document.body.classList.toggle('is-hexane', sv === 'hexane');
  if (!announce) return;
  const el = $('hud-solvent');
  el.className = `hb-solvent is-${sv}`;
  void el.offsetWidth;
  el.innerHTML = `${t(`hb.solvent.${sv}`)}<small>${t(`hb.solvent.${sv}Sub`)}</small>`;
  el.classList.add('is-shown');
}

function handleInput(input, time) {
  if (screen !== 'play' || !play || play.paused || play.finished || play.out) return null;
  // ヘキサンのときは「なじむ」だけ、水のときは O と H だけ
  if ((scene.solvent === 'hexane') !== (input === 'M')) return null;
  play.lastPress = { input, time };
  if (play.battle) battle.touched();
  scene.press(input, time);
  const events = play.judge.press(input, time);
  applyEvents(events, time);
  return events;
}

function updateHud() {
  const g = Math.floor(play.judge.stats.gauge);
  if (g !== play.lastGauge) {
    $('hud-gauge-fill').style.width = `${play.judge.stats.gauge}%`;
    $('hud-gauge-pct').textContent = `${g}%`;
    $('hud-gauge').setAttribute('aria-valuenow', String(g));
    $('hud-gauge').classList.toggle('is-clear', play.judge.stats.gauge >= GAUGE.clearPct);
    play.lastGauge = g;
  }
  const sc = play.judge.score();
  if (sc !== play.lastScore) { $('hud-score').textContent = formatHiyama(sc); play.lastScore = sc; }
  const c = play.judge.stats.combo;
  if (c !== play.lastCombo) {
    const el = $('hud-combo');
    el.classList.toggle('is-on', c >= 2);
    el.querySelector('b').textContent = c;
    el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump');
    play.lastCombo = c;
  }
}

/** 難易度ごとの報酬（先生が管理画面で変えられる） */
const REWARD_KEY = { easy: 'hbRewardEasy', normal: 'hbRewardNormal', hard: 'hbRewardHard' };

let lastResult = null;   // 言語を切りかえたときに、結果の画面を描き直すため
function showResult() { renderResult($('result'), lastResult); }

async function finish() {
  play.finished = true;
  play.song.stop();
  if (play.battle) { finishBattle(); return; }
  const clear = play.judge.cleared();
  const practice = play.weak || !play.chart.stageNo;
  const first = !practice && clear && firstClearOf(play.chart.id, play.diffId);
  const news = play.weak ? { newRecord: false, unlocked: null } : recordResult(play.chart.id, play.diffId, play.judge.score(), clear);
  addWeak(play.notes);
  const un = news.unlocked ? CHARTS[news.unlocked] : null;
  // 報酬：ステージをクリアしたときだけ（練習曲は出ない）。初めてクリアしたときは2倍
  let rw = { state: practice ? 'practice' : clear ? 'pending' : 'none' };
  if (rw.state === 'pending') {
    const base = SETTINGS[REWARD_KEY[play.diffId]] || 0;
    rw.gross = base * (first ? SETTINGS.firstClearMultiplier : 1);
    rw.first = first;
  }
  lastResult = {
    clear, gauge: play.judge.stats.gauge, clearPct: GAUGE.clearPct, news,
    unlocked: un ? { n: un.stageNo, titleKey: un.titleKey } : null,
    stageNo: play.chart.stageNo, practiceKey: play.weak ? 'hb.weak.label' : 'hb.practiceLabel',
    stageTitleKey: play.chart.titleKey, diffId: play.diffId, hinted: play.hinted,
    score: play.judge.score(), stats: play.judge.stats, avatar, reward: rw,
  };
  showResult();
  show('result');
  if (rw.state === 'pending') {
    const myResult = lastResult;
    let entry = null;
    try {
      entry = await reward({ itemKey: 'ledger.item.hbClear', itemVars: { stage: `i18n:${play.chart.titleKey}`, diff: `i18n:hb.diff.${play.diffId}`, first: first ? 'i18n:hb.reward.firstMark' : '' }, gross: rw.gross });
    } catch (e) { console.info('[ハイドレーション・ビート] 報酬を受け取れませんでした。', e && e.message); }
    if (lastResult !== myResult) return;
    if (entry) {
      Object.assign(rw, { state: 'done', got: entry.gross, tax: entry.tax, net: entry.amount, capped: entry.gross < rw.gross });
    } else {
      rw.state = 'cap';
    }
    if (screen === 'result') {
      const box = $('result');
      const top = box.scrollTop;
      showResult();
      box.scrollTop = top;
    }
  }
}

// ───────────── v0.8：対戦 ─────────────
function attackBanner(text, sent = false) {
  const el = $('hud-attack');
  el.className = `hb-attack${sent ? ' is-sent' : ''}`;
  void el.offsetWidth;
  el.textContent = text;
  el.classList.add('is-shown');
}

/** 相手から妨害が届いたとき */
function applyAttack(kind, from) {
  if (!play || play.finished) return;
  const now = heardTime() - play.t0;
  const approach = play.diff.approachSec;
  attackBanner(t('hb.attack.got', { kind: t(`hb.attack.${kind}`), name: from }));
  if (kind === 'mono') {
    // 色消し：まだ見えていない次の8ノーツを、補助輪の段階3に
    let n = 0;
    for (let i = play.judge.cursor; i < play.notes.length && n < BATTLE.monoNotes; i++) {
      const nt = play.notes[i];
      if (nt.state !== 'pending' || nt.slot || nt.t - approach < now) continue;
      nt.assist = 3; n += 1;
    }
  } else if (kind === 'fog') {
    scene.setFog(now + BATTLE.fogSec);
  } else if (kind === 'swarm') {
    // 無極性の群れ：見送るノーツを、ノーツどうしの間に割り込ませる（まだ見えていない所に）
    const from0 = now + approach + 0.4;
    const gaps = [];
    for (let i = play.judge.cursor; i < play.notes.length - 1 && gaps.length < BATTLE.swarmNotes; i++) {
      const a = play.notes[i], b = play.notes[i + 1];
      if (a.t < from0 || b.t - a.t < 0.6) continue;
      gaps.push((a.t + b.t) / 2);
    }
    const sw = play.exp.switches;
    for (const tt of gaps) {
      const solvent = [...sw].reverse().find((x) => x.t <= tt)?.solvent || 'water';
      const ids = solvent === 'hexane' ? ['Na', 'Cl', 'K', 'Glc'] : ['Hex', 'Bz', 'CCl4', 'I2', 'Nap'];
      const noteId = ids[Math.floor(Math.random() * ids.length)];
      const nt = { t: tt, noteId, solvent, answer: 'PASS', state: 'pending', slot: null, swarm: true };
      const at = play.notes.findIndex((x, k) => k >= play.judge.cursor && x.t > tt);
      play.notes.splice(at < 0 ? play.notes.length : at, 0, nt);
      play.judge.stats.total += 1;
    }
  }
}

/** 相手たちの小さな表示（左の上）と、脱落したあとの観戦の一覧 */
function rivalRow(r) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const state = r.dropped ? t('hb.battle.dropped') : r.out ? t('hb.battle.out') : r.done ? t('hb.battle.finished') : (r.combo >= 2 ? t('hb.battle.combo', { n: r.combo }) : '');
  return `<div class="hb-rv${r.out || r.dropped ? ' is-out' : ''}${r.attacker ? ' is-attacker' : ''}${r.me ? ' is-me' : ''}">
    ${faceFig(t, r.avatar || 'minato', { costume: r.costume || 'base', size: 32, cls: 'is-mini' })}
    <div><b>${esc(r.rank)}. ${esc(r.name)}${r.me ? ` ${esc(t('hb.battle.you'))}` : ''}</b><span>${formatHiyama(r.score)}</span>
      <i><i style="width:${Math.max(0, Math.min(100, r.gauge))}%"></i></i><small>${esc(state)}</small></div></div>`;
}
function updateRival(v) {
  const el = $('hud-rival');
  if (!v || !v.rows.length) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('is-royale', v.mode === 'royale');
  // 左上には相手だけ（多いときは上位の6人まで）
  const others = v.rows.filter((r) => !r.me);
  el.innerHTML = others.slice(0, v.mode === 'royale' ? 6 : 1).map(rivalRow).join('');
  if (!$('spectate').hidden) $('spectate-list').innerHTML = v.rows.map((r) => `<li>${rivalRow(r)}</li>`).join('');
}

/** 対戦の曲が終わったとき：自分の結果の画面（順位とスコア）を出し、相手を待つ */
async function finishBattle() {
  addWeak(play.notes);
  lastResult = {
    clear: play.judge.cleared(), gauge: play.judge.stats.gauge, clearPct: GAUGE.clearPct, news: { newRecord: false },
    unlocked: null, stageNo: play.chart.stageNo, practiceKey: 'hb.practiceLabel',
    stageTitleKey: play.chart.titleKey, diffId: play.diffId, score: play.judge.score(), stats: play.judge.stats, avatar,
    reward: { state: 'none' }, battle: { state: 'waiting', ranks: [] },
  };
  showResult();
  show('result');
  const v = await battle.finished(play.judge.score());
  if (v) updateBattleResult(v);
}
function updateBattleResult(v) {
  if (!lastResult || !lastResult.battle) return;
  lastResult.battle = v;
  if (screen === 'result') { const box = $('result'); const top = box.scrollTop; showResult(); box.scrollTop = top; }
}

// ───────────── 一時停止 ─────────────
async function pause() {
  if (screen !== 'play' || !play || play.paused || play.finished) return;
  // 対戦中は止められない（相手は演奏を続けている）。やめるかどうかだけ聞く
  if (play.battle && play.out) return;   // 脱落して観戦中は、観戦の画面の「タイトルへ」で出る
  if (play.battle) {
    $('bpause-note').textContent = t('hb.battle.pauseNote', { amount: formatHiyama(SETTINGS.quitFine) });
    $('bpause').hidden = false;
    return;
  }
  play.paused = true;
  await pauseAudio();
  $('pause').hidden = false;
  $('pause').querySelector('[data-act="resume"]').focus();
}
async function resume() {
  if (!play) return;
  $('pause').hidden = true;
  await resumeAudio();
  play.paused = false;
}
async function quitPlay() {
  document.body.classList.remove('is-out');
  $('spectate').hidden = true;
  $('hud-target').hidden = true;
  $('pause').hidden = true;
  $('bpause').hidden = true;
  if (play) { play.finished = true; play.song.stop(); }
  await resumeAudio();
  play = null;
  document.body.classList.remove('is-hexane');
}

// ───────────── v0.5：ショップ（演出エフェクト） ─────────────
const FX_SWATCH = {
  sakura: 'linear-gradient(135deg, #ffc4dc, #ff7eb0)', kin: 'linear-gradient(135deg, #fff3c0, #E6B422)',
  raiko: 'linear-gradient(135deg, #ffffff, #36A9FF)', hoshi: 'linear-gradient(135deg, #ff7e7e, #ffd36e, #a8ff8a, #7cd0ff, #c59bff)',
};
function renderShop() {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = fxState();
  const row = (id, price) => {
    const owned = !id || st.owned.includes(id);
    const on = st.on === id;
    const btn = on ? `<button type="button" class="btn btn--small" disabled>${esc(t('hb.shop.using'))}</button>`
      : owned ? `<button type="button" class="btn btn--small" data-act="fx-use" data-id="${id}">${esc(t('hb.shop.use'))}</button>`
        : `<button type="button" class="btn btn--small btn--primary" data-act="fx-buy" data-id="${id}"${canAfford(price) ? '' : ' disabled'}>${esc(t(pendingBuy === id ? 'hb.shop.confirm' : 'hb.shop.buy'))}</button>`;
    const price2 = !id ? '' : owned ? esc(t('hb.shop.owned')) : `${esc(t('money', { amount: formatHiyama(priceWithTax(price)) }))} <small>${esc(t('hb.shop.taxIn', { price: formatHiyama(price) }))}</small>`;
    return `<div class="hb-shop__item${on ? ' is-on' : ''}">
      <button type="button" class="hb-shop__swatch" data-act="fx-preview" data-id="${id}" aria-label="${esc(t('hb.shop.preview'))}" style="background:${id ? FX_SWATCH[id] : 'rgba(255,255,255,0.12)'};border:0;cursor:pointer"></button>
      <div><b>${esc(t(`hb.fx.${id || 'none'}`))}</b><p>${esc(t(`hb.fx.${id || 'none'}Desc`))}</p><span class="hb-shop__price">${price2}</span></div>
      ${btn}
    </div>`;
  };
  $('shop-list').innerHTML = row('', 0) + SHOP_FX.map((f) => row(f.id, f.price)).join('')
    + (isInArrears() ? `<p class="hb-zukan__empty">${esc(t('hb.shop.arrears'))}</p>` : '');
}
/** ショップの見本：六角形から、演出の色の小さなかけらが飛び散る（画面の上だけの軽い動き） */
const FX_COLORS = { sakura: ['#ffc4dc', '#ff9ec7'], kin: ['#F8D25A', '#fff3c0'], raiko: ['#bfe8ff', '#36A9FF'], hoshi: ['#ff7e7e', '#ffd36e', '#a8ff8a', '#7cd0ff', '#c59bff'] };
function domBurst(el, id) {
  const cols = FX_COLORS[id];
  if (!cols || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('i');
    p.className = `hb-burst hb-burst--${id}`;
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.3, d = 40 + Math.random() * 40;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.background = cols[i % cols.length];
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d + (id === 'sakura' || id === 'hoshi' ? 20 : 0)}px`);
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 900);
  }
}
let pendingBuy = '';      // 買うボタンは2回押す（1回目で「もう一度押すと買う」）
async function buyFx(id) {
  const f = SHOP_FX.find((x) => x.id === id);
  if (!f) return;
  if (pendingBuy !== id) { pendingBuy = id; renderShop(); return; }
  pendingBuy = '';
  const r = await pay({ type: 'purchase', itemKey: 'ledger.item.hbFx', itemVars: { name: `i18n:hb.fx.${id}` }, price: f.price });
  if (r.ok) {
    addFx(id);
    toast(t('hb.shop.bought', { name: t(`hb.fx.${id}`) }));
  } else {
    toast(t(`hb.shop.fail.${r.reason}`));
  }
  renderShop();
}

// ───────────── タイミング調整（ハイドレーション・ビート仕様書 4章） ─────────────
// メトロノームに合わせて CALIB.taps 回たたき、ずれの中央値をその端末の補正にする
let calib = { first: false, run: null, result: null, value: 0, phase: 'ready' };

function openCalib(first) {
  const off = savedOffset();
  calib = { first, run: null, result: null, value: off === null ? 0 : off, phase: 'ready' };
  renderCalib();
  show('calib');
}
function renderCalib() {
  $('calib').querySelector('.hb-calib__lead').textContent = (calib.first ? `${t('hb.calib.first')} ` : '') + t('hb.calib.lead');
  const n = calib.result ? calib.result.count : 0;
  $('calib-dots').innerHTML = Array.from({ length: CALIB.taps }, (_, i) => `<li class="${i < n ? 'is-on' : ''}"></li>`).join('');
  $('calib-pad').disabled = calib.phase !== 'running';
  $('calib-start').textContent = t(calib.phase === 'ready' ? 'hb.calib.start' : 'hb.calib.again');
  $('calib-start').disabled = calib.phase === 'running';
  $('calib').querySelector('[data-act="calib-skip"]').textContent = t(calib.first ? 'hb.calib.skip' : 'hb.calib.back');
  const v = calib.value;
  $('calib-value').textContent = `${v > 0 ? '+' : ''}${v} ms`;
  let state = t('hb.calib.ready');
  if (calib.phase === 'running') state = calib.counting ? t('hb.calib.count', { n: calib.counting }) : t('hb.calib.tapping', { n, total: CALIB.taps });
  if (calib.phase === 'done') state = t('hb.calib.done');
  $('calib-state').textContent = state;
  let hint = '';
  if (calib.phase === 'done' && calib.result) {
    hint = Math.abs(v) < 10 ? t('hb.calib.zero') : t(v > 0 ? 'hb.calib.late' : 'hb.calib.early', { ms: Math.abs(v) });
    if (calib.result.spreadMs > CALIB.spreadWarnMs) hint += ` ${t('hb.calib.spread', { ms: calib.result.spreadMs })}`;
  }
  $('calib-hint').textContent = hint;
}
async function runCalib() {
  await unlockAudio();
  if (calib.run) calib.run.stop();
  calib.run = startCalibration();
  calib.result = null;
  calib.phase = 'running';
  calib.counting = 0;
  renderCalib();
}
function calibTap(ts) {
  if (!calib.run || calib.phase !== 'running') return;
  const r = calib.run.tap(ts);
  if (!r || r.early) return;
  calib.result = r;
  if (r.done) {
    calib.phase = 'done';
    calib.value = r.offsetMs;
    calib.run.stop();
  }
  renderCalib();
}
function nudgeCalib(d) {
  calib.value = Math.max(-CALIB.limitMs, Math.min(CALIB.limitMs, calib.value + d));
  renderCalib();
}
function saveCalib() {
  saveOffset(calib.value);
  toast(t('hb.calib.saved', { ms: `${calib.value > 0 ? '+' : ''}${calib.value}` }));
  closeCalib(true);
}
function closeCalib(saved) {
  if (calib.run) calib.run.stop();
  // 初めてのときに「あとで」を選んだら、補正 0 で覚えておく（毎回は出さない）
  if (!saved && calib.first && savedOffset() === null) saveOffset(JUDGE.inputOffsetMs);
  calib.phase = 'ready';
  renderTitle();
  show('title');
}
/** 拍に合わせて光る印（数えている間は朱、たたく拍は群青） */
function calibFrame() {
  const run = calib.run;
  const el = $('calib-beat');
  if (!run || calib.phase !== 'running') { el.classList.remove('is-on', 'is-lead'); return; }
  const now = heardTime();
  let idx = -1;
  run.beats.forEach((b, i) => { if (now >= b && now < b + 0.12) idx = i; });
  el.classList.toggle('is-on', idx >= 0);
  el.classList.toggle('is-lead', idx >= 0 && idx < run.leadBeats);
  const before = run.beats[run.leadBeats];
  const counting = now < before - 0.05 ? Math.max(1, run.beats.filter((b) => b <= now).length) : 0;
  if (counting !== calib.counting) { calib.counting = counting; renderCalib(); }
}
function setupCalibPad() {
  const pad = $('calib-pad');
  let lastTouch = 0;
  const down = (ts) => { pad.classList.add('is-down'); calibTap(ts); };
  const up = () => pad.classList.remove('is-down');
  pad.addEventListener('touchstart', (e) => { e.preventDefault(); lastTouch = performance.now(); down(e.timeStamp); }, { passive: false });
  pad.addEventListener('touchend', up);
  pad.addEventListener('touchcancel', up);
  pad.addEventListener('mousedown', (e) => { if (performance.now() - lastTouch < 800) return; down(e.timeStamp); });
  pad.addEventListener('mouseup', up);
  pad.addEventListener('mouseleave', up);
  window.addEventListener('keydown', (e) => {
    if (screen !== 'calib' || e.repeat || (e.code !== 'Space' && e.code !== 'KeyF' && e.code !== 'KeyJ')) return;
    e.preventDefault();
    down(e.timeStamp); setTimeout(up, 90);
  });
}

// ───────────── 毎回の描き直し ─────────────
let lastIdle = 0;
function loop(nowMs) {
  requestAnimationFrame(loop);
  if (!scene) return;
  if (screen === 'play' && play && !play.finished) {
    if (play.paused) return;
    const now = heardTime() - play.t0;
    applyEvents(play.judge.tick(now), now);
    // バトルロイヤル：水和ゲージが0になったら脱落して、観戦に移る
    if (play.battle && play.battle.mode === 'royale' && !play.out && now > 0 && play.judge.stats.gauge <= 0) {
      play.out = true;
      document.body.classList.add('is-out');
      $('spectate').hidden = false;
      $('hud-target').hidden = true;
      attackBanner(t('hb.spectate.out'));
      battle.eliminate(play.judge.score());
    }
    updateHud();
    const ready = $('hud-ready');
    ready.textContent = now < -0.6 ? t('hb.ready') : now < 0.4 ? t('hb.go') : '';
    // 溶媒が入れかわる時刻になったら、切りかえる
    while (play.swIdx < play.exp.switches.length && now >= play.exp.switches[play.swIdx].t) {
      setSolvent(play.exp.switches[play.swIdx].solvent);
      play.swIdx += 1;
    }
    scene.frame(play.notes, play.judge.cursor, now);
    if (now > play.exp.lengthSec + 0.3) finish();
    return;
  }
  if (screen === 'calib') calibFrame();
  // タイトル・結果の画面：背景として、少なめの回数でゆっくり動かす（電池のため）
  if (nowMs - lastIdle < 33) return;
  lastIdle = nowMs;
  scene.frame([], 0, nowMs / 1000);
}

// ───────────── 入力（タップは touchstart で受け取る。仕様書 9章） ─────────────
function setupInput() {
  let lastTouch = 0;
  document.querySelectorAll('.hb-pad').forEach((pad) => {
    const input = pad.dataset.input;
    const down = (ts) => {
      pad.classList.add('is-down');
      if (!play) return;
      handleInput(input, heardTimeAt(ts) - play.t0);
    };
    const up = () => pad.classList.remove('is-down');
    pad.addEventListener('touchstart', (e) => { e.preventDefault(); lastTouch = performance.now(); down(e.timeStamp); }, { passive: false });
    pad.addEventListener('touchend', up);
    pad.addEventListener('touchcancel', up);
    pad.addEventListener('mousedown', (e) => { if (performance.now() - lastTouch < 800) return; down(e.timeStamp); });
    pad.addEventListener('mouseup', up);
    pad.addEventListener('mouseleave', up);
  });
  const KEYS = { ArrowLeft: 'O', KeyF: 'O', ArrowRight: 'H', KeyJ: 'H' };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && screen === 'play') { if (play && play.paused) resume(); else pause(); return; }
    // ヘキサンのときは、どのキーでも「なじむ」
    const input = scene && scene.solvent === 'hexane' ? ((KEYS[e.code] || e.code === 'Space') ? 'M' : null) : KEYS[e.code];
    if (!input || e.repeat || screen !== 'play' || !play) return;
    e.preventDefault();
    const pad = document.querySelector(`.hb-pad[data-input="${input}"]`);
    pad.classList.add('is-down');
    setTimeout(() => pad.classList.remove('is-down'), 90);
    handleInput(input, heardTimeAt(e.timeStamp) - play.t0);
  });

  document.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'solo') startPlay();
    else if (act === 'pick-chart') { pick.chart = b.dataset.chart; savePick(); renderTitle(); }
    else if (act === 'calib') openCalib(false);
    else if (act === 'use-hint') { useHint = b.checked; }
    else if (act === 'weak-start') startPlay({ weak: true });
    else if (act === 'shop') { pendingBuy = ''; renderShop(); show('shop'); }
    else if (act === 'shop-close') { renderTitle(); show('title'); }
    else if (act === 'fx-buy') buyFx(b.dataset.id);
    else if (act === 'fx-use') { useFx(b.dataset.id); renderShop(); }
    else if (act === 'fx-preview') domBurst(b, b.dataset.id);
    else if (act === 'page-open') {
      if (useItem('zukan')) { openPage(b.dataset.id); toast(t('hb.page.opened')); }
      renderZukan($('zukan'));
    }
    else if (act === 'zukan') { renderZukan($('zukan')); show('zukan'); }
    else if (act === 'zukan-close') { closeZukan(); renderTitle(); show('title'); }
    else if (act === 'zukan-tab') zukanTab($('zukan'), b.dataset.tab);
    else if (act === 'zukan-pick') zukanPick($('zukan'), b.dataset.id);
    else if (act === 'save-explain') {
      const n = saveExplanations(b.dataset.kinds.split(','));
      b.disabled = true;
      b.textContent = t('hb.explain.savedAll');
      if (n) toast(t('hb.explain.savedToast', { n }));
    }
    else if (act === 'calib-start') runCalib();
    else if (act === 'calib-save') saveCalib();
    else if (act === 'calib-skip') closeCalib();
    else if (act === 'calib-minus') nudgeCalib(-CALIB.stepMs);
    else if (act === 'calib-plus') nudgeCalib(CALIB.stepMs);
    else if (act === 'pick-diff') { pick.diff = b.dataset.diff; savePick(); renderTitle(); }
    else if (act === 'pause') pause();
    else if (act === 'resume') resume();
    else if (act === 'retry') { await quitPlay(); startPlay(); }
    else if (act === 'battle') battle.openBattle();
    else if (act === 'battle-create') battle.createRoom(b.dataset.mode);
    else if (act === 'battle-target') battle.setTarget(b.dataset.target);
    else if (act === 'battle-next-target') { const k = battle.nextTarget(); b.textContent = t('hb.battle.targetChip', { target: t(`hb.battle.target.${k}`) }); }
    else if (act === 'spectate-leave') { battle.leave(); await quitPlay(); renderTitle(); show('title'); }
    else if (act === 'battle-join') battle.joinRoom();
    else if (act === 'battle-start') battle.startRoom();
    else if (act === 'battle-leave') battle.leaveLobby();
    else if (act === 'battle-close') { battle.leave(); renderTitle(); show('title'); }
    else if (act === 'bpause-close') { $('bpause').hidden = true; }
    else if (act === 'battle-forfeit') { $('bpause').hidden = true; battle.forfeit('quit'); }
    else if (act === 'battle-again') { battle.leave(); await quitPlay(); battle.openBattle(); }
    else if (act === 'battle-done') { battle.leave(); await quitPlay(); renderTitle(); show('title'); }
    else if (act === 'to-title') { await quitPlay(); show('title'); }
    else if (act === 'home') { await quitPlay(); goHome(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
}

// ───────────── はじまり ─────────────
async function start() {
  applyTheme('hydration');
  $('version').textContent = VERSION;
  document.documentElement.style.setProperty('--flash-strength', String(FLASH.strength));
  if (!FLASH.strength) FLASH.minGapMs = Infinity;
  try {
    await initI18n('../shared/');
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<div class="fatal">文字のファイルを読み込めませんでした。/ Could not load the text files.</div>');
    return;
  }
  applyToDom();
  if (typeof window.THREE === 'undefined') {
    document.body.insertAdjacentHTML('beforeend', `<div class="fatal">${t('error.three')}</div>`);
    return;
  }

  const loading = $('loading');
  loading.textContent = t('hb.loading');
  loading.hidden = false;
  await initBackend();
  await initEconomy();
  loading.hidden = true;

  // 初めて起動したときの流れ（言語・ニックネーム・開国交付金）は、ホームで行う
  if (!getUser().onboarded) { goHome(); return; }
  const savedLang = getUser().lang;
  if (savedLang && savedLang !== getLang()) setLang(savedLang);
  onLangChange((lang) => {
    setUserLang(lang);
    applyToDom();
    if (scene) scene.redrawLabels();
    if (screen === 'title') renderTitle();
    if (screen === 'calib') renderCalib();
    if (screen === 'zukan') renderZukan($('zukan'));
    if (screen === 'shop') renderShop();
    if (screen === 'result' && lastResult) { const box = $('result'); const top = box.scrollTop; showResult(); box.scrollTop = top; }
    // プレイ中に言語を切り替えたときは、一時停止する（全体の仕様書 2章）
    if (screen === 'play') pause();
    if (screen === 'battle') battle.redraw();
  });

  createTopbar({
    mount: $('topbar'),
    showQR: false,
    onHome: () => { if (screen === 'play' && play && !play.finished) pause(); else goHome(); },
  });
  applyToDom();
  initNotices(toast);

  // 先生がこのワールドを閉じているときは入れない
  if (!isWorldOpen('hydration')) { toast(t('hb.closed')); setTimeout(goHome, 2500); return; }
  onSettingsChange(() => {
    if (!isWorldOpen('hydration') && screen === 'title') { toast(t('hb.closed')); setTimeout(goHome, 2500); }
  });

  // ワールドに入るたびに、アバター選択の画面を通る（ホームの門から来たときは、そこで選んでいる）
  avatar = getAvatar('hydration');
  if (params.get('from') !== 'home' || !avatar) {
    const chosen = await openAvatarSelect('hydration');
    if (!chosen) { goHome(); return; }
    avatar = chosen;
  }
  // 読み込み直したときは、もう一度アバターを選ぶように、住所から印を消しておく
  if (params.has('from')) history.replaceState(null, '', location.pathname);

  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  scene = createScene($('scene'), { noteDefs: NOTES });
  setupInput();
  $('hud-gauge').querySelector('.hb-gauge__mark').style.left = `${GAUGE.clearPct}%`;
  setupCalibPad();
  battle.initBattle({
    $, toast, show,
    pick: () => ({ chart: pick.chart, diff: pick.diff }),
    chartTitleKey: (id) => (CHARTS[id] ? CHARTS[id].titleKey : 'hb.title'),
    startPlay: (o) => startPlay(o),
    applyAttack, updateRival, updateBattleResult,
    playStats: () => (play ? { score: play.judge.score(), gauge: play.judge.stats.gauge, combo: play.judge.stats.combo } : { score: 0, gauge: 0, combo: 0 }),
    quitToTitle: async () => { await quitPlay(); renderTitle(); show('title'); },
  });
  renderTitle();
  // 初めてこの端末で遊ぶときは、タイミング調整から（スキップもできる）
  if (savedOffset() === null && !params.has('nocalib')) openCalib(true);
  else show('title');
  requestAnimationFrame(loop);

  // 確かめるための入口（住所に ?debug=1 を付けたときだけ）
  if (params.has('debug')) {
    window.__hb = {
      glow: (n) => scene.setGlow(n),
      get screen() { return screen; },
      get play() { return play; },
      pressAt: (input, songTime) => handleInput(input, songTime),
      songTime: () => (play ? heardTime() - play.t0 : null),
      setPick: (chart, diff) => { if (CHARTS[chart]) pick.chart = chart; if (DIFFICULTY[diff]) pick.diff = diff; renderTitle(); },
      start: () => startPlay(),
      get calib() { return calib; },
      heard: () => heardTime(),
      give: (id, n = 1) => { addItem(id, n); renderTitle(); },
      grant: (n) => grant({ itemKey: 'ledger.item.founding', amount: n }),
      unlockAll: () => { STAGE_ORDER.forEach((id) => recordResult(id, 'easy', 1, true)); renderTitle(); },
      setOffset: (ms) => { saveOffset(ms); renderTitle(); },
      defs: NOTES,
    };
  }
}

start();
