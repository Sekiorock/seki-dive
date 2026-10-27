// freeze/src/main.js
// ③ フリーズ・ガード：画面の切り替えと1夜の進行（全体の仕様書 9章）。
// v0.1：1夜の流れ（準備 → 夜 → 朝）と、ステージ1（凍結の峠：非電解質）・ステージ2（電解質の峠：電離で粒子が増える）。
//   準備：6つの区間ごとに、撒く物質と質量を決める（予算の中で）。凝固点は自分で計算する（電卓あり）。
//   夜：約40秒の早回し。区間の気温がその区間の溶液の凝固点を下回ると、路面が凍る。
//   朝：守れた区間の数と残った予算で評価。凍った区間・むだの多い区間に、どこで計算がずれたかの解説。
//   報酬：1夜を守り切ると 60 ヒヤマ、予算を半分以上残すと追加 40 ヒヤマ（どちらも、その夜で初めてのときだけ）。

import { VERSION, SUBSTANCES, STAGES, LOCKED_STAGES, NIGHT, REWARD, CONST } from './config.js';
import { nightOf, plan, judge, tempAt, neededMass } from './model.js';
import { createScene } from './scene3d.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, fx } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getWorldData, setWorldData } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama, reward, grant } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { standUrl, nameKey } from '../../shared/characters.js';
import { createCalc } from '../../shared/calc.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const WORLD = 'freeze';
const GUIDE = 'toma';            // 峠の守り人
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const signed = (x) => (x > 0 ? `+${f1(x)}` : x < 0 ? `−${f1(-x)}` : '0.0');

let screen = 'loading';
let scene = null;
let calc = null;
let si = 0, ni = 0;              // 選んでいるステージと夜（0から）
let night = null;                // nightOf の結果
let picks = [];                  // 区間ごとの { sub, mass }
let phase = 'prep';              // 'prep' | 'night' | 'morning'
let run = null;                  // 夜の進行 { t0, dur, frozenAt: [] }
let result = null;               // 朝の判定
let rewardText = '';
let showTable = false;

function goHome() { location.href = '../'; }
let toastTimer = 0;
function toast(msg, ms = 3600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), ms);
}
function show(name) {
  screen = name;
  for (const id of ['title', 'play']) $(id).hidden = id !== name;
  updateViewport();
}

// ───────────── 記録 ─────────────
const key = (s, n) => `${s + 1}-${n + 1}`;
function rec() { return getWorldData(WORLD).nights || {}; }
function nightOpen(s, n) {
  if (s === 0 && n === 0) return true;
  if (n > 0) return !!(rec()[key(s, n - 1)] || {}).cleared;
  return !!(rec()[key(s - 1, STAGES[s - 1].nights.length - 1)] || {}).cleared;
}
function stageOpen(s) { return nightOpen(s, 0); }

// ───────────── タイトル ─────────────
function renderTitle() {
  const st = $('title');
  st.querySelector('.fz-guide__stand').src = standUrl(GUIDE, 'normal');
  st.querySelector('.fz-guide__stand').alt = t(nameKey(GUIDE));
  st.querySelector('.fz-guide__line').textContent = t('quote', { line: t('fz.guide1') });
  const r = rec();
  $('stages').innerHTML = STAGES.map((S, i) => {
    const open = stageOpen(i);
    const done = S.nights.every((_, n) => (r[key(i, n)] || {}).cleared);
    return `<button type="button" class="fz-card${i === si ? ' is-on' : ''}" data-act="stage" data-i="${i}" ${open ? '' : 'disabled'}>`
      + `<b>${S.id}</b><span>${esc(t(`fz.stage${S.id}.name`))}</span><em>${done ? '✓' : open ? '' : '🔒'}</em></button>`;
  }).join('') + LOCKED_STAGES.map((L) => `<button type="button" class="fz-card" disabled><b>${L.id}</b><span>${esc(t(`fz.stage${L.id}.name`))}</span><span>${esc(t('fz.soon', { v: L.ver }))}</span></button>`).join('');
  $('nights-title').textContent = t('fz.nightsOf', { s: STAGES[si].id, name: t(`fz.stage${STAGES[si].id}.name`) });
  $('nights').innerHTML = STAGES[si].nights.map((_, n) => {
    const open = nightOpen(si, n);
    const x = r[key(si, n)] || {};
    return `<button type="button" class="fz-card${n === ni ? ' is-on' : ''}" data-act="night" data-i="${n}" ${open ? '' : 'disabled'}>`
      + `<b>${esc(t('fz.nightN', { n: n + 1 }))}</b><span>${esc(t('fz.budgetIs', { b: nightOf(si, n).budget }))}</span>`
      + `<em>${x.cleared ? (x.bonus ? '✓ ★' : '✓') : open ? '' : '🔒'}</em></button>`;
  }).join('');
  $('start-btn').textContent = t('fz.start', { s: STAGES[si].id, n: ni + 1 });
  $('start-btn').disabled = !nightOpen(si, ni);
}

// ───────────── 3Dが見える場所 ─────────────
function updateViewport() {
  if (!scene) return;
  requestAnimationFrame(() => {
    const H = window.innerHeight;
    if (screen !== 'play') { scene.setViewport(0, H * 0.62); return; }
    const top = $('topbar').getBoundingClientRect().bottom + 4;
    const bottom = $('bottom').getBoundingClientRect().top - 4;
    scene.setViewport(top, Math.max(top + 80, bottom));
  });
}

// ───────────── 1夜 ─────────────
function startNight(s, n, keepPicks = false) {
  si = s; ni = n;
  night = nightOf(s, n);
  if (!keepPicks || picks.length !== night.sections.length) picks = night.sections.map(() => ({ sub: night.substances[0], mass: '' }));
  phase = 'prep';
  run = null; result = null; rewardText = '';
  scene.setNight(0.2);
  show('play');
  renderPanel();
  updateSections();
}

function subName(id) { return t(`fz.sub.${id}`); }

function renderPanel() {
  const box = $('panel');
  const head = (extra) => `<div class="fz-head"><b>${esc(t('fz.nightTitle', { s: night.stage, n: night.night }))}</b>${extra}</div>`;
  if (phase === 'prep') {
    const p = plan(night, picks.map((x) => ({ sub: x.sub, mass: Number(x.mass) || 0 })));
    const ratio = Math.min(1, p.used / night.budget);
    const subs = night.substances;
    box.innerHTML = head(`<button type="button" class="fz-mini" data-act="table">${esc(t('fz.table'))}</button>`
      + `<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>`
      + `<button type="button" class="fz-mini" data-act="to-title">${esc(t('fz.toTitle'))}</button>`)
      + `<div class="fz-budget${p.over ? ' is-over' : ''}" id="budget"><span>${esc(t('fz.used'))} <b>${f1(p.used)}</b> / ${night.budget} pt</span>`
      + `<span>${esc(t('fz.left'))} <b>${f1(p.left)}</b> pt</span><span class="fz-budget__bar"><i style="width:${(ratio * 100).toFixed(1)}%"></i></span></div>`
      + `<p class="fz-hint">${esc(t(`fz.hint${night.stage}`, { kf: CONST.Kf }))}</p>`
      + (showTable ? `<div class="fz-table">${subs.map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span>${S.M} g/mol</span><span>${S.price} pt/mol　${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>` : '')
      + `<ol class="fz-rows">${night.sections.map((sec, k) => {
        const pk = picks[k];
        return `<li class="fz-row"><b>${k + 1}</b><span class="fz-v">${f1(sec.water)}<small>kg</small></span><span class="fz-v fz-low">${signed(sec.low)}<small>℃</small></span>`
          + `<select data-k="${k}" data-f="sub" aria-label="${esc(t('fz.subLabel'))}">${subs.map((id) => `<option value="${id}" ${pk.sub === id ? 'selected' : ''}>${esc(SUBSTANCES[id].formula)} ${esc(subName(id))}</option>`).join('')}</select>`
          + `<input type="number" inputmode="decimal" step="any" min="0" data-k="${k}" data-f="mass" id="m${k}" value="${esc(pk.mass)}" placeholder="g" aria-label="${esc(t('fz.massLabel', { n: k + 1 }))}">`
          + `<span class="fz-cost" id="c${k}">${f1(p.rows[k].cost)} pt</span></li>`;
      }).join('')}</ol>`
      + `<p class="fz-note">${esc(t('fz.colHelp'))}</p>`
      + `<div class="fz-foot"><button type="button" class="btn btn--primary" data-act="go-night" id="go-btn" ${p.over ? 'disabled' : ''}>${esc(t(p.over ? 'fz.overBudget' : 'fz.goNight'))}</button></div>`;
  } else if (phase === 'night') {
    box.innerHTML = head(`<b class="fz-clock" id="clock">22:00</b><button type="button" class="fz-mini" data-act="fast">${esc(t('fz.fast'))}</button>`)
      + `<ol class="fz-rows" id="night-rows"></ol>`;
    renderNightRows(0);
  } else {
    const r = result;
    box.innerHTML = head(`<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>`)
      + `<div class="fz-sum"><p class="fz-sum__big ${r.all ? 'is-ok' : 'is-ng'}">${esc(t(r.all ? 'fz.allSafe' : 'fz.someFrozen', { n: r.safe, total: r.rows.length }))}</p>`
      + `<p class="fz-sum__sub">${esc(t('fz.budgetLeft', { left: f1(r.left), budget: r.budget }))}${r.half ? ` ${esc(t('fz.halfLeft'))}` : ''}</p>`
      + (rewardText ? `<p class="fz-sum__reward">${esc(rewardText)}</p>` : '') + '</div>'
      + `<ul class="fz-diag">${r.rows.map((row, k) => diagLine(row, k)).join('')}</ul>`
      + `<div class="fz-foot"><button type="button" class="btn" data-act="retry">${esc(t('fz.retry'))}</button>`
      + (r.all && nextNight() ? `<button type="button" class="btn btn--primary" data-act="next">${esc(t('fz.next'))}</button>` : '')
      + `<button type="button" class="btn" data-act="to-title">${esc(t('fz.toTitle'))}</button></div>`;
  }
  updateViewport();
}

function diagLine(row, k) {
  const d = row.diag;
  const S = row.sub ? SUBSTANCES[row.sub] : null;
  const vars = {
    n: k + 1, fp: signed(row.fp), low: signed(row.low), need: d.need ? f1(d.need) : '', mass: f1(row.mass || 0),
    sub: row.sub ? subName(row.sub) : '', f: S ? S.formula : '', i: S ? S.i : 1, wi: d.wrongI || '', r: d.ratio ? f1(d.ratio) : '',
  };
  const cls = row.frozen ? 'is-frozen' : d.kind === 'waste' || d.kind === 'forgotIon' ? 'is-waste' : '';
  return `<li class="${cls}"><b>${k + 1}</b>${esc(t(`fz.diag.${d.kind}`, vars))}</li>`;
}

function nextNight() {
  if (ni + 1 < STAGES[si].nights.length) return [si, ni + 1];
  if (si + 1 < STAGES.length) return [si + 1, 0];
  return null;
}

/** 準備のあいだ：入力が変わったら、費用と予算だけ書き直す（入力欄を作りなおすと、キーボードが閉じるため） */
function refreshPrep() {
  const p = plan(night, picks.map((x) => ({ sub: x.sub, mass: Number(x.mass) || 0 })));
  p.rows.forEach((r, k) => { const el = $(`c${k}`); if (el) el.textContent = `${f1(r.cost)} pt`; });
  const b = $('budget');
  if (b) {
    b.classList.toggle('is-over', p.over);
    const bs = b.querySelectorAll('b');
    bs[0].textContent = f1(p.used); bs[1].textContent = f1(p.left);
    b.querySelector('i').style.width = `${(Math.min(1, p.used / night.budget) * 100).toFixed(1)}%`;
  }
  const go = $('go-btn');
  if (go) { go.disabled = p.over; go.textContent = t(p.over ? 'fz.overBudget' : 'fz.goNight'); }
}

function updateSections(tNight = null) {
  if (!night) return;
  const list = night.sections.map((sec, k) => {
    const title = t('fz.secN', { n: k + 1 });
    if (phase === 'prep') return { title, big: `${signed(sec.low)}℃`, small: t('fz.waterKg', { w: f1(sec.water) }), frozen: false, safe: true };
    const row = (result || judge(night, cleanPicks())).rows[k];
    if (phase === 'night') {
      const T = tempAt(sec.low, tNight, NIGHT);
      const frozen = run.frozenAt[k] !== null && tNight >= run.frozenAt[k];
      return { title, big: `${signed(T)}℃`, small: t('fz.fpIs', { fp: signed(row.fp) }), frozen, safe: T >= row.fp };
    }
    return { title, big: row.frozen ? t('fz.frozen') : t('fz.safe'), small: t('fz.fpIs', { fp: signed(row.fp) }), frozen: row.frozen, safe: !row.frozen };
  });
  scene.setSections(list);
}

function cleanPicks() { return picks.map((x) => ({ sub: x.sub, mass: Number(x.mass) || 0 })); }

function goNight() {
  const p = plan(night, cleanPicks());
  if (p.over) return;
  result = judge(night, cleanPicks());
  // それぞれの区間が凍りはじめる時刻（0〜1）。凍らないなら null
  const frozenAt = result.rows.map((r) => {
    if (!r.frozen) return null;
    for (let k = 0; k <= 400; k++) { const x = k / 400; if (tempAt(r.low, x, NIGHT) < r.fp) return x; }
    return NIGHT.lowAt;
  });
  run = { t0: performance.now(), dur: NIGHT.durSec * 1000, frozenAt, base: 0 };
  phase = 'night';
  if (calc) calc.close();
  renderPanel();
}

function renderNightRows(x) {
  const box = $('night-rows');
  if (!box) return;
  box.innerHTML = night.sections.map((sec, k) => {
    const row = result.rows[k];
    const T = tempAt(sec.low, x, NIGHT);
    const frozen = run.frozenAt[k] !== null && x >= run.frozenAt[k];
    return `<li class="fz-row fz-row--night${frozen ? ' is-frozen' : ' is-safe'}"><b>${k + 1}</b>`
      + `<span class="fz-v">${esc(t('fz.now'))} ${signed(T)}<small>℃</small></span>`
      + `<span class="fz-v">${esc(t('fz.fpShort'))} ${signed(row.fp)}<small>℃</small></span>`
      + `<span>${esc(frozen ? t('fz.frozen') : t('fz.guarding'))}</span></li>`;
  }).join('');
}

async function morning() {
  phase = 'morning';
  run = null;
  const r = result;
  rewardText = '';
  const d = getWorldData(WORLD);
  const nights = { ...(d.nights || {}) };
  const k = key(si, ni);
  const prev = nights[k] || {};
  const firstClear = r.all && !prev.cleared;
  const firstBonus = r.all && r.half && !prev.bonus;
  nights[k] = { cleared: prev.cleared || r.all, bonus: prev.bonus || (r.all && r.half), best: Math.max(prev.best || 0, r.safe), at: Date.now() };
  setWorldData(WORLD, { ...d, nights });
  if (r.all) fx.celebrate();
  renderPanel();
  updateSections();
  const lines = [];
  if (firstClear) {
    const e = await pay('ledger.item.fzNight', { s: night.stage, n: night.night }, REWARD.night);
    lines.push(e ? t('fz.rewardNight', { gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : t('fz.cap'));
  }
  if (firstBonus) {
    const e = await pay('ledger.item.fzBonus', { s: night.stage, n: night.night }, REWARD.bonus);
    lines.push(e ? t('fz.rewardBonus', { gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : t('fz.cap'));
  }
  if (r.all && !firstClear && !firstBonus) lines.push(t('fz.already'));
  rewardText = lines.join(' ／ ');
  if (phase === 'morning') renderPanel();
}

async function pay(itemKey, itemVars, gross) {
  try { return await reward({ itemKey, itemVars, gross }); } catch (e) { return null; }
}

// ───────────── 毎回の描き直し ─────────────
const LITE_MS = params.has('lite') ? 400 : 0;
let lastDraw = 0;
let lastRowsTick = -1;
function loop(nowMs) {
  requestAnimationFrame(loop);
  if (phase === 'night' && run && screen === 'play') {
    const x = Math.min(1, run.base + (nowMs - run.t0) / run.dur);
    scene.setNight(Math.min(1, x / NIGHT.lowAt));
    const hour = (NIGHT.startHour + x * NIGHT.hours) % 24;
    const el = $('clock');
    if (el) el.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
    const tick = Math.floor(x * 80);
    if (tick !== lastRowsTick) { lastRowsTick = tick; renderNightRows(x); updateSections(x); }
    if (x >= 1) morning();
  }
  if (scene && (!LITE_MS || nowMs - lastDraw >= LITE_MS)) { lastDraw = nowMs; scene.frame(nowMs); }
}

function setupInput() {
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'stage') { si = Number(b.dataset.i); ni = 0; for (let n = STAGES[si].nights.length - 1; n >= 0; n--) if (nightOpen(si, n)) { ni = n; break; } renderTitle(); }
    else if (act === 'night') { ni = Number(b.dataset.i); renderTitle(); }
    else if (act === 'start') { if (nightOpen(si, ni)) startNight(si, ni); }
    else if (act === 'to-title') { phase = 'prep'; run = null; if (calc) calc.close(); renderTitle(); show('title'); scene.setNight(0.2); }
    else if (act === 'calc') calc.toggle();
    else if (act === 'table') { showTable = !showTable; renderPanel(); }
    else if (act === 'go-night') goNight();
    else if (act === 'fast') {
      if (run) {
        // 残りを早送りの長さで進める
        const now = performance.now();
        const x = Math.min(1, run.base + (now - run.t0) / run.dur);
        run.base = x; run.t0 = now; run.dur = NIGHT.fastSec * 1000;
      }
    }
    else if (act === 'retry') startNight(si, ni, true);
    else if (act === 'next') { const nx = nextNight(); if (nx) startNight(nx[0], nx[1]); }
  });
  const onField = (e) => {
    const el = e.target;
    if (!el.dataset || el.dataset.k === undefined || phase !== 'prep') return;
    const k = Number(el.dataset.k);
    if (el.dataset.f === 'sub') picks[k].sub = el.value;
    else picks[k].mass = el.value;
    refreshPrep();
  };
  document.body.addEventListener('input', onField);
  document.body.addEventListener('change', onField);
  window.addEventListener('resize', updateViewport);
  if (window.ResizeObserver) new ResizeObserver(updateViewport).observe($('bottom'));
}

// ───────────── はじまり ─────────────
async function start() {
  applyTheme(WORLD);
  $('version').textContent = VERSION;
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
  loading.textContent = t('fz.loading');
  loading.hidden = false;
  await initBackend();
  await initEconomy();
  loading.hidden = true;

  if (!getUser().onboarded) { goHome(); return; }
  const savedLang = getUser().lang;
  if (savedLang && savedLang !== getLang()) setLang(savedLang);
  onLangChange((lang) => {
    setUserLang(lang);
    applyToDom();
    if (screen === 'title') renderTitle();
    if (screen === 'play') { if (phase === 'night') renderPanel(); else renderPanel(); updateSections(); }
    if (calc) calc.redraw();
  });

  createTopbar({ mount: $('topbar'), showQR: false, onHome: () => goHome() });
  calc = createCalc({ t, toast });
  applyToDom();
  initNotices(toast);

  if (!isWorldOpen(WORLD)) { toast(t('fz.closed')); setTimeout(goHome, 2500); return; }
  onSettingsChange(() => { if (!isWorldOpen(WORLD)) { toast(t('fz.closed')); setTimeout(goHome, 2500); } });

  let avatar = getAvatar(WORLD);
  if (params.get('from') !== 'home' || !avatar) {
    const chosen = await openAvatarSelect(WORLD);
    if (!chosen) { goHome(); return; }
    avatar = chosen;
  }
  if (params.has('from')) history.replaceState(null, '', location.pathname);

  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  scene = createScene($('scene'));
  night = nightOf(0, 0);
  picks = night.sections.map(() => ({ sub: night.substances[0], mass: '' }));
  updateSections();
  setupInput();
  // はじめは、開いているいちばん先の夜を選んでおく
  outer: for (let s = STAGES.length - 1; s >= 0; s--) for (let n = STAGES[s].nights.length - 1; n >= 0; n--) if (nightOpen(s, n)) { si = s; ni = n; break outer; }
  renderTitle();
  show('title');
  requestAnimationFrame(loop);

  if (params.has('debug')) {
    if (params.has('fast')) NIGHT.durSec = 6;
    window.__fz = {
      get phase() { return phase; }, get night() { return night; }, get result() { return result; }, get screen() { return screen; },
      start: (s, n) => startNight(s, n),
      fill: (list) => { list.forEach((x, k) => { picks[k] = { sub: x.sub, mass: String(x.mass) }; }); renderPanel(); },
      need: (sub, k) => neededMass(sub, night.sections[k].water, night.sections[k].low),
      go: () => goNight(),
      grant: (n) => grant({ itemKey: 'ledger.item.founding', amount: n }),
      calc: () => calc,
    };
  }
}

start();
