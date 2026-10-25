// hydration/src/main.js
// ① ハイドレーション・ビート：画面の切り替えと全体の進行。
// v0.1：3D空間、水分子、飛んでくる Na⁺ と Cl⁻、左右のボタン、タイミング判定。ステージ1の曲だけ。
// v0.2：3章のすべての溶質ノーツ（同時押し・見送り・HCl の電離）、難易度と補助輪の3段階、練習曲。
//
// 画面：タイトル → プレイ（一時停止あり）→ 結果。ワールドに入るときは、毎回アバター選択の画面を通る。
// 時刻の基準は、音の時計（audio.js の heardTime）。

import { VERSION, NOTE, COMBO_LAYERS, CUTIN_EVERY, FLASH, DIFFICULTY, DEFAULT_DIFFICULTY } from './config.js';
import { NOTES } from './notes.js';
import { CHARTS, CHART_ORDER, expandChart, chartFormulas } from './charts.js';
import { createJudge } from './judge.js';
import { unlockAudio, heardTime, heardTimeAt, pauseAudio, resumeAudio } from './audio.js';
import { createSong, playHit, playWrong } from './music.js';
import { createScene } from './scene3d.js';
import { renderResult } from './results.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getCostume } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { DEFAULT_AVATAR, standUrl, lineKey, nameKey } from '../../shared/characters.js';

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
  for (const id of ['title', 'play', 'result']) $(id).hidden = id !== name;
  document.body.classList.toggle('is-playing', name === 'play');
}

// ───────────── タイトル ─────────────
function renderTitle() {
  const st = $('title');
  st.querySelector('.hb-guide__stand').src = standUrl('minato', 'normal');
  st.querySelector('.hb-guide__stand').alt = t(nameKey('minato'));
  st.querySelector('.hb-guide__line').textContent = t('quote', { line: t(lineKey('minato', 'hb1')) });
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('chart-pick').innerHTML = CHART_ORDER.map((id) => {
    const c = CHARTS[id];
    const on = id === pick.chart;
    return `<button type="button" class="hb-chart${on ? ' is-on' : ''}" data-act="pick-chart" data-chart="${id}" aria-pressed="${on}">
      <span class="hb-chart__no">${esc(stageLabel(c))}</span>
      <span class="hb-chart__name">${esc(t(c.titleKey))}</span>
      <span class="hb-chart__info">${esc(t('hb.chartInfo', { bpm: c.bpm }))}</span>
      <span class="hb-chart__notes">${esc(chartFormulas(c).join(' '))}</span>
    </button>`;
  }).join('');
  $('diff-pick').innerHTML = DIFF_ORDER.map((d) => {
    const on = d === pick.diff;
    return `<button type="button" class="hb-diff__btn${on ? ' is-on' : ''}" data-act="pick-diff" data-diff="${d}" aria-pressed="${on}">
      <b>${esc(t(`hb.diff.${d}`))}</b><span>${esc(t(`hb.diff.${d}Sub`))}</span>
    </button>`;
  }).join('');
  $('diff-note').textContent = t(`hb.diff.${pick.diff}Note`);
}

// ───────────── プレイ ─────────────
async function startPlay() {
  const ctx = await unlockAudio();
  const chart = CHARTS[pick.chart];
  const diff = DIFFICULTY[pick.diff];
  const exp = expandChart(chart, diff);
  const notes = exp.notes.map((n) => ({ ...n, state: 'pending', slot: null }));
  const judge = createJudge(notes, NOTES);
  const song = createSong(chart, exp);
  const t0 = ctx.currentTime + NOTE.leadInSec;
  scene.reset();
  scene.setPlay({ approachSec: diff.approachSec, assist: diff.assist });
  scene.setTiming(0, chart.bpm);
  scene.setComboLevel(0);
  song.start(t0);
  play = {
    chart, diff, diffId: pick.diff, exp, notes, judge, song, t0,
    paused: false, finished: false, hits: 0,
    peelEvery: Math.max(1, Math.ceil(notes.length / scene.crystalCount)),
    lastScore: -1, lastCombo: -1,
  };
  $('hud-score').textContent = '0';
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
    }
  }
  if (shown) showJudge(judgeLabel(shown));
  const lv = comboLevel(st.combo);
  play.song.setLayers(lv);
  scene.setComboLevel(lv);
}

/** ボタンを押したときの処理。time は、押した瞬間の「曲の始まりからの秒」 */
function handleInput(input, time) {
  if (screen !== 'play' || !play || play.paused || play.finished) return null;
  play.lastPress = { input, time };
  scene.press(input, time);
  const events = play.judge.press(input, time);
  applyEvents(events, time);
  return events;
}

function updateHud() {
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

function finish() {
  play.finished = true;
  play.song.stop();
  renderResult($('result'), {
    stageLabel: stageLabel(play.chart), stageTitleKey: play.chart.titleKey, diffId: play.diffId,
    score: play.judge.score(), stats: play.judge.stats, avatar,
  });
  show('result');
}

// ───────────── 一時停止 ─────────────
async function pause() {
  if (screen !== 'play' || !play || play.paused || play.finished) return;
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
  $('pause').hidden = true;
  if (play) { play.finished = true; play.song.stop(); }
  await resumeAudio();
  play = null;
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
    updateHud();
    const ready = $('hud-ready');
    ready.textContent = now < -0.6 ? t('hb.ready') : now < 0.4 ? t('hb.go') : '';
    scene.frame(play.notes, play.judge.cursor, now);
    if (now > play.exp.lengthSec + 0.3) finish();
    return;
  }
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
    const input = KEYS[e.code];
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
    else if (act === 'pick-diff') { pick.diff = b.dataset.diff; savePick(); renderTitle(); }
    else if (act === 'pause') pause();
    else if (act === 'resume') resume();
    else if (act === 'retry') { await quitPlay(); startPlay(); }
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
    // プレイ中に言語を切り替えたときは、一時停止する（全体の仕様書 2章）
    if (screen === 'play') pause();
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
  renderTitle();
  show('title');
  requestAnimationFrame(loop);

  // 確かめるための入口（住所に ?debug=1 を付けたときだけ）
  if (params.has('debug')) {
    window.__hb = {
      get screen() { return screen; },
      get play() { return play; },
      pressAt: (input, songTime) => handleInput(input, songTime),
      songTime: () => (play ? heardTime() - play.t0 : null),
      setPick: (chart, diff) => { if (CHARTS[chart]) pick.chart = chart; if (DIFFICULTY[diff]) pick.diff = diff; renderTitle(); },
      start: () => startPlay(),
      defs: NOTES,
    };
  }
}

start();
