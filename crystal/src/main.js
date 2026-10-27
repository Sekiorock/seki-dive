// crystal/src/main.js
// ② クリスタル・ラボ：画面の切り替えと全体の進行（全体の仕様書 8章）。
// v0.1：固体の実験台と自由実験。
// v0.2：気体の実験台（ヘンリーの法則）と濃度の実験台（3つの濃度）。カメラを指で自由に動かせるように
//       （1本指で回す・ピンチで寄る・2本指で動かす・ダブルタップで戻る・視点のボタン）。操作盤をたためる。
//       結晶の形を本物に寄せた。
// v0.4：対戦「析出ニアピン」（battle.js）。
// v0.3：注文モード（24段階。予想を入れてから実験し、予想と結果の差で報酬）と精製モード（混合物から KNO₃ を取り出す）。
// 画面：タイトル → 実験台（自由実験） ／ 発見の一覧。ワールドに入るときは、毎回アバター選択の画面を通る。

import {
  VERSION, RANGE, SOLUTE_ORDER, DISCOVERY, DISCOVERIES, DISCOVERY_GROUPS, BENCHES,
  GAS_RANGE, GAS_ORDER, GASES, GAS_VIEW, CONC_RANGE, CONC_ORDER, CONC_SOLUTES, NEARPIN, GLOW,
} from './config.js';
import { SOLUTES } from './solubility.js';
import { createLab } from './lab.js';
import { createGasLab, dissolve } from './gas.js';
import { createConcLab } from './conc.js';
import { createScene } from './scene3d.js';
import { createModes } from './modes.js';
import * as battle from './battle.js';
import { createCalc } from '../../shared/calc.js';

let calc = null;
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, fx } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getWorldData, setWorldData } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama, reward, grant } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { standUrl, faceUrl, nameKey, say, tagStand, faceFig, nameTag } from '../../shared/characters.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const WORLD = 'crystal';
const GUIDE = 'karin';         // 工房の親方
const HINT_KEY = 'sekidive.crystal.hint';

let screen = 'loading';
let scene = null;
let lab = null;                // 固体
let gasLab = null;             // 気体
let concLab = null;            // 濃度
let bench = 'solid';
let mode = 'free';              // タイトルで選んだモード：'free' | 'order' | 'refine'
let modes = null;
let menuKind = 'order';
let folded = false;
let avatar = null;
let backTo = 'title';

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
  for (const id of ['title', 'lab', 'found', 'menu', 'battle']) $(id).hidden = id !== name;
  if (name !== 'lab' && modes) modes.leave();
  document.body.classList.toggle('is-lab', name === 'lab');
  if (scene) scene.showPanel(name === 'lab');
  if (name === 'found') $('discover').hidden = true;
  updateViewport();
}

// ───────────── 発見（自由実験の報酬） ─────────────
function foundMap() { return getWorldData(WORLD).found || {}; }
function foundCount() { return DISCOVERIES.filter((k) => foundMap()[k]).length; }

let discoverTimer = 0;
const queue = [];
async function onDiscover(kind) {
  if (foundMap()[kind] || queue.includes(kind)) return;
  queue.push(kind);
  const d = getWorldData(WORLD);
  d.found = { ...(d.found || {}), [kind]: Date.now() };
  setWorldData(WORLD, d);
  const el = $('discover');
  el.querySelector('img').src = faceUrl(GUIDE);
  tagStand(t, el.querySelector('img'), GUIDE, { face: true });
  el.querySelector('b').textContent = t('cr.discover.head', { name: t(`cr.d.${kind}`) });
  el.querySelector('p').textContent = say(t, GUIDE, t(`cr.d.${kind}Line`));
  el.querySelector('span').textContent = t('cr.discover.pending');
  el.hidden = false;
  fx.celebrate();
  clearTimeout(discoverTimer);
  discoverTimer = setTimeout(() => { el.hidden = true; }, 5200);
  renderFoundButtons();
  let entry = null;
  try { entry = await reward({ itemKey: 'ledger.item.crDiscover', itemVars: { name: `i18n:cr.d.${kind}` }, gross: DISCOVERY.reward }); } catch (e) { /* 通信の失敗は知らせだけ */ }
  el.querySelector('span').textContent = entry
    ? t('cr.discover.got', { gross: formatHiyama(entry.gross), net: formatHiyama(entry.amount) })
    : t('cr.discover.cap');
  queue.splice(queue.indexOf(kind), 1);
}

function renderFoundButtons() {
  const label = t('cr.found.button', { n: foundCount(), total: DISCOVERIES.length });
  $('found-btn').textContent = label;
  $('found-btn2').textContent = label;
}

function renderFound() {
  const f = foundMap();
  $('found-lead').textContent = t('cr.found.lead', { n: foundCount(), total: DISCOVERIES.length, reward: DISCOVERY.reward });
  $('found-list').innerHTML = BENCHES.map((b) => {
    const list = DISCOVERY_GROUPS[b];
    const n = list.filter((k) => f[k]).length;
    return `<li class="cr-found__group">${esc(t(`cr.bench.${b}`))}<small>${n} / ${list.length}</small></li>`
      + list.map((k) => (f[k]
        ? `<li><b>${esc(t(`cr.d.${k}`))}</b><p>${esc(t(`cr.d.${k}Line`))}</p></li>`
        : `<li class="is-locked"><b>？？？</b><p>${esc(t(`cr.d.${k}Hint`))}</p></li>`)).join('');
  }).join('');
}

// ───────────── タイトル ─────────────
/** v1.0：映えの段階。ふだんは、すんだ注文の数で決まる */
function glowLevel() {
  const n = Object.keys(getWorldData(WORLD).orders || {}).length;
  return Math.min(8, 1 + Math.floor(n / GLOW.perOrders));
}
function setGlow(n) { if (scene) scene.setGlow(n); }

function renderTitle() {
  setGlow(glowLevel());
  const st = $('title');
  st.querySelector('.cr-guide__stand').src = standUrl(GUIDE, 'normal');
  st.querySelector('.cr-guide__stand').alt = t(nameKey(GUIDE));
  st.querySelector('.cr-guide__line').textContent = say(t, GUIDE, t('cr.guide1'));
  tagStand(t, st.querySelector('.cr-guide__stand'), GUIDE);
  st.querySelectorAll('[data-act="pick-bench"]').forEach((b) => b.classList.toggle('is-on', b.dataset.bench === bench));
  st.querySelectorAll('[data-act="pick-mode"]').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === mode));
  st.querySelectorAll('[data-act="pick-bench"]').forEach((b) => b.classList.toggle('is-dim', mode !== 'free'));
  $('start-btn').textContent = t(mode === 'order' ? 'cr.start.order' : mode === 'refine' ? 'cr.start.refine' : 'cr.start');
  renderFoundButtons();
}

// ───────────── 3Dが見える場所 ─────────────
// 上の帯・視点のボタンより下、下の操作盤より上に、見せたいものが収まるようにする
function updateViewport() {
  if (!scene) return;
  requestAnimationFrame(() => {
    const H = window.innerHeight;
    if (screen !== 'lab') { scene.setViewport(0, H); return; }
    const top = Math.max($('topbar').getBoundingClientRect().bottom, $('views').getBoundingClientRect().bottom) + 4;
    const bottom = $('bottom').getBoundingClientRect().top - 4;
    scene.setViewport(top, Math.max(top + 80, bottom));
  });
}

function renderViews() {
  $('views').innerHTML = scene.viewNames().map((v) => `<button type="button" class="cr-view${scene.view === v ? ' is-on' : ''}" data-act="view" data-view="${v}">${esc(t(`cr.view.${v}`))}</button>`).join('')
    + `<button type="button" class="cr-view cr-view--help" data-act="view-help" aria-label="${esc(t('cr.view.help'))}">?</button>`;
}

// ───────────── スライダー ─────────────
function slider(id, range, onInput) {
  const el = $(id);
  el.min = range.min; el.max = range.max; el.step = range.step;
  el.addEventListener('input', () => onInput(Number(el.value)));
}
function setupSliders() {
  slider('s-temp', RANGE.temp, (v) => { lab.setTemp(v); renderSolid(); });
  slider('s-water', RANGE.water, (v) => { lab.setWater(v); renderSolid(); });
  slider('s-mass', RANGE.solute, (v) => { lab.setMass(v); renderSolid(); });
  slider('s-gp', GAS_RANGE.pressure, (v) => { gasLab.setPressure(v); gasLab.state.released = null; renderGas(); });
  slider('s-gt', GAS_RANGE.temp, (v) => { gasLab.setTemp(v); renderGas(); });
  slider('s-gv', GAS_RANGE.volume, (v) => { gasLab.setVolume(v); renderGas(); });
  slider('s-cs', CONC_RANGE.solute, (v) => { concLab.setSoluteMass(v); renderConc(); });
  slider('s-cw', CONC_RANGE.solvent, (v) => { concLab.setSolvent(v); renderConc(); });
  slider('s-cd', CONC_RANGE.density, (v) => { concLab.setDensity(v); renderConc(); });
}

const choice = (act, id, on, formula, sub) => `<button type="button" class="cr-solute" role="radio" aria-checked="${on}" data-act="${act}" data-id="${id}">${esc(formula)}<small>${esc(sub)}</small></button>`;
function renderChoices() {
  $('solutes').innerHTML = SOLUTE_ORDER.map((id) => choice('solute', id, lab.state.solute === id, SOLUTES[id].formula, t(`cr.s.${id}`))).join('');
  $('gases').innerHTML = GAS_ORDER.map((id) => choice('gas', id, gasLab.state.gas === id, id === 'AIR' ? t('cr.g.air') : GASES[id].formula, t(`cr.g.${id}`))).join('');
  $('csolutes').innerHTML = CONC_ORDER.map((id) => choice('csolute', id, concLab.state.solute === id, CONC_SOLUTES[id].formula, t(`cr.c.s.${id}`))).join('');
}

const cell = (k, v, sub = '') => `<div class="cr-cell"><dt>${esc(t(k))}</dt><dd>${v}${sub ? `<small class="cr-sub">${sub}</small>` : ''}</dd></div>`;

// ───────────── 固体 ─────────────
function renderSolid() {
  const s = lab.state;
  $('s-temp').value = s.temp; $('s-water').value = s.water; $('s-mass').value = s.mass;
  $('v-temp').textContent = `${s.temp} ℃`;
  $('v-water').textContent = `${s.water} g`;
  $('v-mass').textContent = `${s.mass} g`;
  readoutSolid(s);
  scene.setState('solid', s);
}
function readoutSolid(s) {
  const e = s.eq;
  const g = (x) => `${x.toFixed(1)}<small>g</small>`;
  const multi = e.parts.length > 1;
  const name = (id) => (id === 'KNO3' ? 'KNO₃' : 'CuSO₄·5H₂O');
  const cells = [
    cell('cr.r.water', g(e.water), e.addedWater > 0.05 ? `+${e.addedWater.toFixed(1)} ${esc(t('cr.r.fromHydrate'))}` : ''),
    cell('cr.r.dissolved', g(e.dissolved)),
    cell('cr.r.crystal', g(e.crystal), multi ? e.parts.map((p) => `${name(p.id)} ${p.crystal.toFixed(1)}`).join('<br>') : ''),
    cell('cr.r.solubility', e.parts.map((p) => p.S.toFixed(1)).join('/'), esc(t('cr.r.per100'))),
  ];
  const hydr = e.parts.some((p) => p.id === 'CuSO4' && p.crystal > 0.05) ? `<p class="cr-note">${esc(t('cr.r.hydrateNote'))}</p>` : '';
  $('readout').innerHTML = `<div class="cr-readout__row"><dl>${cells.join('')}</dl><p class="cr-state is-${e.state}">${esc(t(`cr.state.${e.state}`))}</p></div>${hydr}`;
  $('seed-btn').hidden = e.state !== 'supersaturated' || mode !== 'free';
}

// ───────────── 気体 ─────────────
/** 粒1つが表す物質量（mol）：その気体を 20℃・1.0×10⁵ Pa・5 L の水に溶かしたとき、粒がおよそ12個になる */
function gasUnit(gas) {
  const r = GAS_VIEW.dotsAt;
  const n = dissolve(gas, r.pressure * 1e5, r.temp, r.volume).n;
  return n > 0 ? n / r.dots : 0;
}
const milli = (n) => `${(n * 1e3).toFixed(2)}<small>×10⁻³ mol</small>`;
const mlOf = (L) => `${(L * 1000).toFixed(1)}<small>mL</small>`;
const massOf = (g) => (g < 1 ? `${(g * 1000).toFixed(1)}<small>mg</small>` : `${g.toFixed(3)}<small>g</small>`);
function renderGas() {
  const s = gasLab.state;
  const e = s.eq;
  $('s-gp').value = s.pressure; $('s-gt').value = s.temp; $('s-gv').value = s.volume;
  $('v-gp').textContent = `${s.pressure.toFixed(1)} ×10⁵ Pa`;
  $('v-gt').textContent = `${s.temp} ℃`;
  $('v-gv').textContent = `${s.volume.toFixed(1)} L`;
  $('open-btn').disabled = !e.henry || s.pressure <= GAS_RANGE.pressure.min;
  const unit = gasUnit(s.gas);
  readoutGas(s, unit);
  scene.setState('gas', s, unit);
}
function readoutGas(s, unit) {
  const e = s.eq;
  let html;
  if (!e.henry) {
    html = `<p class="cr-warn">${esc(t('cr.g.hclNote'))}</p>`;
  } else {
    const multi = e.parts.length > 1;
    const per = (f) => (multi ? e.parts.map((p) => `${GASES[p.id].formula} ${f(p)}`).join('<br>') : '');
    const cells = [
      cell('cr.g.r.n', milli(e.n), per((p) => (p.n * 1e3).toFixed(2))),
      cell('cr.g.r.mass', massOf(e.mass), per((p) => `${(p.mass * 1000).toFixed(1)} mg`)),
      cell('cr.g.r.volP', multi ? '—' : mlOf(e.volP), multi ? per((p) => `${(p.volP * 1000).toFixed(1)} mL`) : esc(t('cr.g.r.volPSub', { p: s.pressure.toFixed(1), T: s.temp }))),
      cell('cr.g.r.volStd', mlOf(e.volStd), per((p) => `${(p.volStd * 1000).toFixed(1)} mL`)),
    ];
    const rel = s.released && s.released.n > 0
      ? `<p class="cr-note cr-note--hot">${esc(t('cr.g.released', { n: (s.released.n * 1e3).toFixed(2), v: (s.released.volStd * 1000).toFixed(1) }))}</p>`
      : '';
    const airNote = multi ? `<p class="cr-note">${esc(t('cr.g.airNote', { o: ((e.parts[1].n / e.n) * 100).toFixed(0) }))}</p>` : '';
    html = `<div class="cr-readout__row"><dl>${cells.join('')}</dl><p class="cr-state cr-state--gas" style="--gas:${GASES[s.gas].color}">${esc(s.gas === 'AIR' ? t('cr.g.air') : GASES[s.gas].formula)}</p></div>`
      + `<p class="cr-note cr-note--unit">${esc(t('cr.g.unit', { u: (unit * 1e3).toFixed(3) }))}</p>${airNote}${rel}`;
  }
  $('readout').innerHTML = html;
  $('seed-btn').hidden = true;
}

// ───────────── 濃度 ─────────────
const METER_MAX = { percent: 50, molarity: 8, molality: 8 };
function meter(k, v, unit, formula) {
  const r = Math.min(1, v / METER_MAX[k]);
  return `<div class="cr-meter cr-meter--${k}"><span class="cr-meter__name">${esc(t(`cr.c.m.${k}`))}</span>`
    + `<span class="cr-meter__bar"><i style="width:${(r * 100).toFixed(1)}%"></i></span>`
    + `<b class="cr-meter__val">${v >= 100 ? v.toFixed(1) : v.toFixed(2)}<small>${unit}</small>${v > METER_MAX[k] ? '<em>▲</em>' : ''}</b>`
    + `<small class="cr-meter__f">${formula}</small></div>`;
}
function renderConc() {
  const s = concLab.state;
  const e = s.eq;
  $('s-cs').value = s.solute_g; $('s-cw').value = s.solvent; $('s-cd').value = s.density;
  $('v-cs').textContent = `${s.solute_g} g`;
  $('v-cw').textContent = `${s.solvent} g`;
  $('v-cd').textContent = `${s.density.toFixed(2)} g/cm³`;
  readoutConc(s);
  scene.setState('conc', s);
}
function readoutConc(s) {
  const e = s.eq;
  const f1 = `${+s.solute_g.toFixed(1)} ÷ ${+e.mass.toFixed(1)} × 100`;
  const f2 = `${e.n.toFixed(3)} mol ÷ ${(e.volMl / 1000).toFixed(3)} L`;
  const f3 = `${e.n.toFixed(3)} mol ÷ ${(s.solvent / 1000).toFixed(3)} kg`;
  $('readout').innerHTML = meter('percent', e.percent, '%', esc(f1)) + meter('molarity', e.molarity, 'mol/L', esc(f2)) + meter('molality', e.molality, 'mol/kg', esc(f3))
    + `<p class="cr-note cr-note--unit">${esc(t('cr.c.volLine', { m: +e.mass.toFixed(1), d: s.density.toFixed(2), v: e.volMl.toFixed(1), n: e.n.toFixed(3), M: e.M }))}</p>`;
  $('seed-btn').hidden = true;
}

function renderBench() {
  for (const b of BENCHES) $(`ctl-${b}`).hidden = b !== bench;
  document.querySelectorAll('#bench-tabs .cr-tab').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.bench === bench)));
  const fb = $('fold-btn');
  fb.textContent = t(folded ? 'cr.panel.open' : 'cr.panel.fold');
  fb.setAttribute('aria-expanded', String(!folded));
  $('panel').classList.toggle('is-folded', folded);
  renderChoices();
  if (bench === 'solid') renderSolid();
  else if (bench === 'gas') renderGas();
  else renderConc();
  renderViews();
  updateViewport();
}

function setBench(name) {
  bench = name;
  scene.setBench(name);
  renderBench();
}

/** 実験台の画面に入る。kind：'free'（自由実験の操作盤）| 'order' | 'refine' */
function enterLab(kind) {
  show('lab');
  $('panel').hidden = kind !== 'free';
  $('order-panel').hidden = kind !== 'order';
  $('refine-panel').hidden = kind !== 'refine';
  $('battle-panel').hidden = kind !== 'battle';
  $('readout').hidden = kind === 'battle';
  $('seed-btn').hidden = true;
  $('discover').hidden = true;
  renderViews();
  updateViewport();
}

function openMenu(which) {
  menuKind = which;
  modes.renderMenu(which);
  show('menu');
}

function openLab() {
  scene.setBench(bench);
  enterLab('free');
  renderBench();
  // はじめて実験台を開いたときだけ、指の使い方を知らせる
  let seen = false;
  try { seen = !!localStorage.getItem(HINT_KEY); localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* 保存できなくても続ける */ }
  if (!seen) toast(t('cr.view.help'), 5200);
}

// ───────────── 毎回の描き直し ─────────────
// 確かめるとき（?debug=1&lite）は、3Dの描き直しを間引いて、1台のパソコンで何人分も動かせるようにする
const LITE_MS = params.has('lite') ? 400 : 0;
let lastDraw = 0;
function loop(nowMs) {
  requestAnimationFrame(loop);
  if (modes) modes.frame(nowMs);
  battle.frame();
  if (scene && (!LITE_MS || nowMs - lastDraw >= LITE_MS)) { lastDraw = nowMs; scene.frame(nowMs); }
}

function setupInput() {
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (modes && modes.onClick(act, b)) return;
    if (battle.onClick(act)) return;
    if (act === 'battle') { battle.openBattle(); return; }
    if (act === 'calc') { calc.toggle(); return; }
    if (act === 'free') openLab();
    else if (act === 'pick-mode') { mode = b.dataset.mode; renderTitle(); }
    else if (act === 'start') { if (mode === 'free') openLab(); else openMenu(mode); }
    else if (act === 'pick-bench') { bench = b.dataset.bench; scene.setBench(bench); renderTitle(); }
    else if (act === 'bench') setBench(b.dataset.bench);
    else if (act === 'fold') { folded = !folded; renderBench(); }
    else if (act === 'view') { scene.setView(b.dataset.view); renderViews(); }
    else if (act === 'view-help') toast(t('cr.view.help'), 5200);
    else if (act === 'to-title') { renderTitle(); show('title'); }
    else if (act === 'solute') { lab.setSolute(b.dataset.id); renderChoices(); renderSolid(); }
    else if (act === 'gas') { gasLab.setGas(b.dataset.id); renderChoices(); renderGas(); }
    else if (act === 'csolute') { concLab.setSolute(b.dataset.id); renderChoices(); renderConc(); }
    else if (act === 'seed') { if (lab.seed()) { scene.sparkle(); renderSolid(); } }
    else if (act === 'open-cap') {
      const rel = gasLab.openCap();
      if (rel) scene.bubble(rel.n / Math.max(1e-9, gasUnit(gasLab.state.gas)));
      renderGas();
    }
    else if (act === 'found') { backTo = screen; renderFound(); show('found'); }
    else if (act === 'found-close') { if (backTo === 'lab') openLab(); else { renderTitle(); show('title'); } }
  });
  $('discover').addEventListener('click', () => { $('discover').hidden = true; });
  document.body.addEventListener('input', (e) => {
    if (modes && e.target.matches('input[data-rk]')) modes.onInput(e.target);
    if (e.target.matches('input[data-bk]')) battle.onInput(e.target);
  });
  document.body.addEventListener('keydown', (e) => { if (modes) modes.onKey(e); });
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
  loading.textContent = t('cr.loading');
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
    if (screen === 'lab') { if (modes && modes.kind) modes.rerender(); else renderBench(); }
    if (screen === 'menu') modes.renderMenu(menuKind);
    battle.redraw();
    if (calc) calc.redraw();
    if (scene) scene.redraw('arena');
    if (screen === 'found') renderFound();
    renderFoundButtons();
    if (scene && lab) scene.redraw('solid', lab.state);
  });

  createTopbar({ mount: $('topbar'), showQR: false, onHome: () => goHome() });
  calc = createCalc({ t, toast });
  applyToDom();
  initNotices(toast);

  if (!isWorldOpen(WORLD)) { toast(t('cr.closed')); setTimeout(goHome, 2500); return; }
  onSettingsChange(() => { if (!isWorldOpen(WORLD)) { toast(t('cr.closed')); setTimeout(goHome, 2500); } });

  avatar = getAvatar(WORLD);
  if (params.get('from') !== 'home' || !avatar) {
    const chosen = await openAvatarSelect(WORLD);
    if (!chosen) { goHome(); return; }
    avatar = chosen;
  }
  if (params.has('from')) history.replaceState(null, '', location.pathname);

  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  lab = createLab({ onDiscover });
  gasLab = createGasLab({ onDiscover });
  concLab = createConcLab({ onDiscover });
  scene = createScene($('scene'));
  scene.setState('solid', lab.state);
  scene.setState('gas', gasLab.state, gasUnit(gasLab.state.gas));
  scene.setState('conc', concLab.state);
  scene.onView(() => { if (screen === 'lab') renderViews(); });
  battle.initBattle({
    $, toast, scene, guide: GUIDE, updateViewport,
    show: (n) => show(n),
    screen: () => screen,
    toTitle: () => { scene.setBench(bench); renderTitle(); show('title'); },
    enterBattleLab: () => { scene.setBench('solid'); enterLab('battle'); },
  });
  modes = createModes({
    $, t, esc, scene, faceUrl, guide: GUIDE,
    glow: (n) => setGlow(n ?? glowLevel()),
    getData: () => getWorldData(WORLD),
    setData: (d) => setWorldData(WORLD, d),
    gasUnit,
    readout: { solid: readoutSolid, gas: readoutGas, conc: readoutConc },
    enterLab, openMenu, updateViewport, toast,
    celebrate: () => fx.celebrate(),
    money: formatHiyama,
    pay: async (itemKey, vars, gross) => { try { return await reward({ itemKey, itemVars: vars, gross }); } catch (e) { return null; } },
  });
  setupSliders();
  setupInput();
  renderTitle();
  show('title');
  requestAnimationFrame(loop);

  // 確かめるための入口（住所に ?debug=1 を付けたときだけ）
  if (params.has('debug')) {
    if (params.has('fast')) { NEARPIN.decideSec = 20; NEARPIN.revealSec = 16; NEARPIN.coolSec = 3; }
    window.__cr = {
      glow: (n) => setGlow(n),
      get lab() { return lab; }, get gas() { return gasLab; }, get conc() { return concLab; },
      get screen() { return screen; }, get scene() { return scene; }, get modes() { return modes.debug; }, battle: battle.debug, grant: (n) => grant({ itemKey: 'ledger.item.founding', amount: n }),
      order: (i) => modes.onClick('order-open', { dataset: { i } }),
      refine: (i) => modes.onClick('refine-open', { dataset: { i } }),
      bench: (b) => setBench(b),
      view: (v) => { scene.setView(v); renderViews(); },
      fold: (on) => { folded = !!on; renderBench(); },
      set: (o) => { if (o.solute) lab.setSolute(o.solute); if (o.water != null) lab.setWater(o.water); if (o.mass != null) lab.setMass(o.mass); if (o.temp != null) lab.setTemp(o.temp, o.at); if (o.forceSuper) lab.forceSuper(); renderChoices(); renderSolid(); },
      setGas: (o) => { if (o.gas) gasLab.setGas(o.gas); if (o.pressure != null) gasLab.setPressure(o.pressure); if (o.temp != null) gasLab.setTemp(o.temp); if (o.volume != null) gasLab.setVolume(o.volume); renderChoices(); renderGas(); },
      setConc: (o) => { if (o.solute) concLab.setSolute(o.solute); if (o.solute_g != null) concLab.setSoluteMass(o.solute_g); if (o.solvent != null) concLab.setSolvent(o.solvent); if (o.density != null) concLab.setDensity(o.density); renderChoices(); renderConc(); },
    };
  }
}

start();
