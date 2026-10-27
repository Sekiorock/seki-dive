// colloid/src/main.js
// ④ コロイド・ミスト：霧の湖を1人で探検するパズル（全体の仕様書 10章）。
// v0.1：エリア1〜3。
//   エリア1 霧の入江（光の鈴）     ：チンダル現象。横から光を当てて、光の通り道が見える液（コロイド溶液）を見分ける
//   エリア2 揺らぐ浅瀬（限外の眼鏡）：ブラウン運動。光の点が不規則に動くわけ。粒の大きさのものさし
//   エリア3 セロハンの関所（セロハンの袋）：透析。水酸化鉄(III)のコロイド溶液から H⁺ と Cl⁻ だけを外へ出して、鍵を清める
//   エリアに入ると、まず「しくみ」（絵とものさし）を見せる。まちがえると、神主が理由を一言で返す。
//   報酬：エリアを抜けるごとに 100 ヒヤマ（はじめてのとき）。

import { VERSION, AREAS, LOCKED_AREAS, PUZZLES, LIQUIDS, DIALYSIS, REWARD } from './config.js';
import { createScene } from './scene3d.js';
import { createScope } from './scope.js';
import { pictureSvg, rulerHtml } from './explain.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, fx } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getWorldData, setWorldData } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama, reward, grant } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { standUrl, faceUrl, nameKey } from '../../shared/characters.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const WORLD = 'colloid';
const GUIDE = 'kasumi';          // 湖の神主
const MARK = ['①', '②', '③'];
const TOOL_ICON = { bell: '🔔', glasses: '🔍', bag: '🛍' };

let screen = 'loading';
let scene = null;
let scope = null;
let ai = 0;                      // 選んでいるエリア（0から）
let pi = 0;                      // 謎（0から）
let ps = null;                   // 謎の状態
let face = 'normal';             // 神主の表情

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
  if (scene) scene.showLabels(name === 'play');
  updateViewport();
}

// ───────────── 記録 ─────────────
function rec() { const d = getWorldData(WORLD); return { solved: d.solved || {}, areas: d.areas || {}, tut: d.tut || {} }; }
function save(patch) { const d = getWorldData(WORLD); setWorldData(WORLD, { ...d, ...patch }); }
function areaOpen(a) { return a === 0 || !!rec().areas[AREAS[a - 1].id]; }
function areaDone(a) { return !!rec().areas[AREAS[a].id]; }
function toolsOwned() { const r = rec(); return AREAS.filter((A, i) => r.areas[A.id] || i === ai).map((A) => A.tool); }

// ───────────── タイトル ─────────────
function renderTitle() {
  const st = $('title');
  st.querySelector('.cl-guide__stand').src = standUrl(GUIDE, 'normal');
  st.querySelector('.cl-guide__stand').alt = t(nameKey(GUIDE));
  st.querySelector('.cl-guide__line').textContent = t('quote', { line: t('cl.guide1') });
  $('areas').innerHTML = AREAS.map((A, i) => {
    const open = areaOpen(i);
    return `<button type="button" class="cl-card${i === ai ? ' is-on' : ''}" data-act="area" data-i="${i}" ${open ? '' : 'disabled'}>`
      + `<b>${A.id}</b><span>${esc(t(`cl.area${A.id}.name`))}</span><small>${TOOL_ICON[A.tool]} ${esc(t(`cl.tool.${A.tool}`))}</small><em>${areaDone(i) ? '✓' : open ? '' : '🔒'}</em></button>`;
  }).join('') + LOCKED_AREAS.map((L) => `<button type="button" class="cl-card" disabled><b>${L.id}</b><span>${esc(t(`cl.area${L.id}.name`))}</span><small>${esc(t('cl.soon', { v: L.ver }))}</small></button>`).join('');
  const r = rec();
  const owned = AREAS.filter((A) => r.areas[A.id]).map((A) => A.tool);
  $('tools').innerHTML = AREAS.map((A) => `<span class="cl-tool${owned.includes(A.tool) ? ' is-on' : ''}" title="${esc(t(`cl.tool.${A.tool}`))}">${TOOL_ICON[A.tool]}<small>${esc(t(`cl.tool.${A.tool}`))}</small></span>`).join('')
    + LOCKED_AREAS.map(() => '<span class="cl-tool is-locked">?</span>').join('');
  $('start-btn').textContent = t(areaDone(ai) ? 'cl.replay' : 'cl.start', { n: AREAS[ai].id, name: t(`cl.area${AREAS[ai].id}.name`) });
  $('start-btn').disabled = !areaOpen(ai);
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

// ───────────── エリアと謎 ─────────────
function area() { return AREAS[ai]; }
function pid() { return area().puzzles[pi]; }
function P() { return PUZZLES[pid()]; }
function startArea(a) {
  ai = a;
  const r = rec();
  pi = Math.max(0, area().puzzles.findIndex((id) => !r.solved[id]));
  if (areaDone(a)) pi = 0;
  show('play');
  startPuzzle();
  if (!r.tut[area().id]) openTut(true);
}
function startPuzzle() {
  ps = { probed: {}, sel: [], tool: (P().tools || [])[0] || null, order: [], solved: false, fb: null, step: 0, shown: -1,
    opts: (P().options || []).slice().sort(() => Math.random() - 0.5),
    dial: { inWater: false, inside: DIALYSIS.start, outside: 0, cloud: 0, waits: 0, busy: false, tested: false } };
  face = 'normal';
  updateProp();
  renderPanel();
}
/** 3D と のぞき窓 を、いまの謎に合わせる */
function updateProp() {
  const p = P();
  const id = pid();
  if (p.prop === 'pool' || p.prop === 'cup') {
    scene.setProp(p.prop, p.items.map((liq, k) => ({ liquid: liq, label: itemLabel(k), sel: ps.sel.includes(liq) })));
    scene.shine(ps.shown >= 0 && ps.tool === 'bell' ? ps.shown : -1);
  } else scene.setProp(p.prop);
  if (p.prop === 'fog') scene.setFog(ps.step >= 1, ps.solved);
  if (p.prop === 'shoal') scene.setStones(area().puzzles.filter((x) => rec().solved[x]).length * 2 + (ps.solved ? 0 : 0));
  if (p.prop === 'gate') {
    const d = ps.dial;
    const done = id === '3-3' && ps.solved;
    scene.setGate({ inWater: id !== '3-3' ? false : d.inWater, clean: id === '3-3' ? 1 - d.inside / DIALYSIS.start : 0, cloud: d.cloud, open: done || (id !== '3-3' && rec().solved['3-3']) });
  }
  // のぞき窓
  let mode = null, opt = {};
  if (p.type === 'probe' && ps.tool === 'glasses' && ps.shown >= 0) mode = LIQUIDS[p.items[ps.shown]].scope;
  if (id === '2-1' && ps.step >= 1) { mode = 'brown'; opt = { molecules: ps.solved }; }
  if (id === '3-3' && ps.dial.inWater) { mode = 'dialysis'; opt = { inside: ps.dial.inside, outside: ps.dial.outside, cloud: ps.dial.cloud }; }
  if (id === '3-2' && ps.solved) { mode = 'dialysis'; opt = { inside: 30, outside: 70 }; }
  $('scope-box').hidden = !mode;
  if (mode) {
    scope.set(mode, opt);
    $('scope-cap').textContent = t(`cl.scope.${mode}${opt.molecules ? 'Mol' : ''}`);
  }
}
function itemLabel(k) {
  const p = P();
  const liq = p.items[k];
  if (p.hidden && !ps.probed[liq] && !ps.solved) return `${t(`cl.prop.${p.prop}`)}${MARK[k]}`;
  return `${MARK[k]} ${t(`cl.liq.${liq}`)}`;
}

function guideBox(line) {
  return `<div class="cl-say"><img src="${faceUrl(GUIDE)}" alt="" width="40" height="40" class="cl-say__face is-${face}"><p>${esc(line)}</p></div>`;
}

function renderPanel() {
  const box = $('panel');
  const p = P();
  const id = pid();
  const A = area();
  const head = `<div class="cl-head"><b>${esc(t('cl.areaHead', { n: A.id, name: t(`cl.area${A.id}.name`) }))}</b>`
    + `<span class="cl-steps">${A.puzzles.map((x, i) => `<i class="${rec().solved[x] ? 'is-done' : ''}${i === pi ? ' is-now' : ''}"></i>`).join('')}</span>`
    + `<button type="button" class="cl-mini cl-mini--hot" data-act="tut">${esc(t('cl.tutBtn'))}</button>`
    + `<button type="button" class="cl-mini" data-act="to-title">${esc(t('cl.toTitle'))}</button></div>`;
  let line = ps.fb ? ps.fb : t(`cl.q.${id}`, { n: DIALYSIS.clean });
  let body = '';
  if (!ps.solved) {
    if (p.type === 'probe') body = probeHtml(p);
    else if (p.type === 'choice') body = choiceHtml(p, id);
    else if (p.type === 'order') body = orderHtml(p);
    else body = dialysisHtml();
  } else {
    line = ps.fb || t(`cl.ok.${id}`);
    body = `<div class="cl-learn"><b>${esc(t('cl.learned'))}</b><p>${esc(t(`cl.learn.${id}`))}</p></div>`
      + `<div class="cl-foot"><button type="button" class="btn btn--primary" data-act="next">${esc(t(pi + 1 < A.puzzles.length ? 'cl.nextQ' : 'cl.clearArea'))}</button></div>`;
  }
  box.innerHTML = head + guideBox(line) + body;
  updateViewport();
}

function toolsHtml(list) {
  const owned = toolsOwned();
  return `<div class="cl-tools">${list.filter((x) => owned.includes(x)).map((x) => `<button type="button" class="cl-toolb${ps.tool === x ? ' is-on' : ''}" data-act="tool" data-tool="${x}">${TOOL_ICON[x]} ${esc(t(`cl.tool.${x}`))}</button>`).join('')}</div>`;
}
function probeHtml(p) {
  const res = (liq) => {
    const r = ps.probed[liq];
    if (!r) return `<small class="cl-res">${esc(t('cl.notYet'))}</small>`;
    const parts = [];
    if (r.bell) parts.push(t(LIQUIDS[liq].beam ? 'cl.res.beam' : 'cl.res.noBeam'));
    if (r.glasses) parts.push(t(`cl.res.scope.${LIQUIDS[liq].scope}`));
    return `<small class="cl-res is-${LIQUIDS[liq].beam ? 'yes' : 'no'}">${esc(parts.join(' ／ '))}</small>`;
  };
  return toolsHtml(p.tools)
    + `<p class="cl-hint">${esc(t(p.multi ? 'cl.howProbeMulti' : 'cl.howProbe'))}</p>`
    + `<div class="cl-items">${p.items.map((liq, k) => `<div class="cl-item${ps.sel.includes(liq) ? ' is-sel' : ''}${ps.shown === k ? ' is-shown' : ''}">`
      + `<button type="button" class="cl-item__probe" data-act="probe" data-k="${k}"><b>${esc(itemLabel(k))}</b>${res(liq)}<span>${ps.tool ? TOOL_ICON[ps.tool] : ''} ${esc(t('cl.probe'))}</span></button>`
      + `<button type="button" class="cl-item__pick" data-act="pick" data-k="${k}" aria-pressed="${ps.sel.includes(liq)}">${esc(t(ps.sel.includes(liq) ? 'cl.picked' : 'cl.pick'))}</button></div>`).join('')}</div>`
    + `<div class="cl-foot"><button type="button" class="btn btn--primary" data-act="answer" ${ps.sel.length ? '' : 'disabled'}>${esc(t('cl.answer'))}</button></div>`;
}
function choiceHtml(p, id) {
  // 1-2・2-1 は、まず道具を使う（光を当てる／眼鏡をかける）
  if ((id === '1-2' || id === '2-1') && ps.step < 1) {
    const tool = id === '1-2' ? 'bell' : 'glasses';
    return `<div class="cl-foot"><button type="button" class="btn btn--primary" data-act="use">${TOOL_ICON[tool]} ${esc(t(`cl.use.${tool}`))}</button></div>`;
  }
  return `<p class="cl-hint">${esc(t(p.multi ? 'cl.pickMulti' : 'cl.pickOne'))}</p>`
    + `<div class="cl-opts">${ps.opts.map((o) => `<button type="button" class="cl-opt${ps.sel.includes(o) ? ' is-sel' : ''}" data-act="opt" data-o="${o}">${esc(t(`cl.opt.${id}.${o}`))}</button>`).join('')}</div>`
    + `<div class="cl-foot"><button type="button" class="btn btn--primary" data-act="answer" ${ps.sel.length ? '' : 'disabled'}>${esc(t('cl.answer'))}</button></div>`;
}
function orderHtml(p) {
  return `<p class="cl-hint">${esc(t('cl.howOrder'))}</p>${rulerHtml(t, null, [])}`
    + `<div class="cl-opts cl-opts--3">${p.items.map((o) => `<button type="button" class="cl-opt${ps.order.includes(o) ? ' is-sel' : ''}" data-act="ord" data-o="${o}" ${ps.order.includes(o) ? 'disabled' : ''}>`
      + `${ps.order.includes(o) ? `<em>${ps.order.indexOf(o) + 1}</em>` : ''}${esc(t(`cl.size.${o}`))}</button>`).join('')}</div>`
    + `<div class="cl-foot"><button type="button" class="btn" data-act="ord-reset" ${ps.order.length ? '' : 'disabled'}>${esc(t('cl.reset'))}</button></div>`;
}
function dialysisHtml() {
  const d = ps.dial;
  const pct = Math.round(d.inside);
  const meter = `<div class="cl-meter"><span>${esc(t('cl.dial.inside'))}</span><b>${pct}</b><span class="cl-meter__bar"><i style="width:${pct}%"></i><em style="left:${DIALYSIS.clean}%"></em></span></div>`;
  if (!d.inWater) return `<p class="cl-hint">${esc(t('cl.dial.start'))}</p><div class="cl-foot"><button type="button" class="btn btn--primary" data-act="dial-in">🛍 ${esc(t('cl.dial.in'))}</button></div>`;
  const dis = d.busy ? 'disabled' : '';
  return meter + `<p class="cl-hint">${esc(t('cl.dial.how', { n: DIALYSIS.clean }))}</p>`
    + `<div class="cl-opts cl-opts--2"><button type="button" class="cl-opt" data-act="dial-wait" ${dis}>⏳ ${esc(t('cl.dial.wait'))}</button>`
    + `<button type="button" class="cl-opt" data-act="dial-change" ${dis || (d.outside > 0 ? '' : 'disabled')}>🌊 ${esc(t('cl.dial.change'))}</button>`
    + `<button type="button" class="cl-opt" data-act="dial-test" ${dis}>🧪 ${esc(t('cl.dial.test'))}</button>`
    + `<button type="button" class="cl-opt cl-opt--hot" data-act="dial-key" ${dis}>🔑 ${esc(t('cl.dial.key'))}</button></div>`;
}

// ───────────── 答え合わせ ─────────────
function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }
function answer() {
  const p = P();
  const id = pid();
  if (sameSet(ps.sel, p.answer)) { solve(); return; }
  // まちがい：いちばん気にしてほしいものを1つ選んで、理由を返す
  const wrong = ps.sel.find((x) => !p.answer.includes(x));
  let key;
  if (p.type === 'probe') key = wrong ? `cl.why.${wrong}` : 'cl.why.missing';
  else key = wrong ? `cl.ng.${id}.${wrong}` : `cl.ng.${id}.missing`;
  // 調べていないものを選んだら、まず調べるように
  if (p.type === 'probe' && wrong && !ps.probed[wrong]) key = 'cl.why.probeFirst';
  ps.fb = t(key);
  face = 'surprise';
  renderPanel();
}
function solve() {
  ps.solved = true;
  ps.fb = null;
  face = 'smile';
  const r = rec();
  save({ solved: { ...r.solved, [pid()]: Date.now() } });
  if (P().type === 'probe' && P().tools.includes('bell')) { ps.tool = 'bell'; ps.shown = P().items.indexOf(P().answer[0]); }
  updateProp();
  if (P().prop === 'shoal') scene.setStones(area().puzzles.filter((x) => rec().solved[x]).length * 2);
  renderPanel();
}
async function next() {
  if (pi + 1 < area().puzzles.length) { pi += 1; startPuzzle(); return; }
  // エリアを抜けた
  const r = rec();
  const first = !r.areas[area().id];
  save({ areas: { ...r.areas, [area().id]: Date.now() } });
  fx.celebrate();
  let line = '';
  if (first) {
    try {
      const e = await reward({ itemKey: 'ledger.item.clArea', itemVars: { n: area().id }, gross: REWARD.area });
      line = e ? t('cl.reward', { gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : t('cl.cap');
    } catch (e) { line = t('cl.cap'); }
  } else line = t('cl.already');
  openClear(line);
}

// ───────────── しくみ（エリアのはじめ） ─────────────
let tutPage = 0;
function openTut(first = false) {
  tutPage = 0;
  renderTut(first);
  const r = rec();
  save({ tut: { ...r.tut, [area().id]: Date.now() } });
}
function renderTut(first = false) {
  const m = $('tut');
  m.hidden = false;
  const A = area();
  const marks = { 1: ['light'], 2: [], 3: ['cello', 'paper'] }[A.id];
  const hi = { 1: 'colloid', 2: 'colloid', 3: 'ion' }[A.id];
  const pages = [
    `${first || tutPage === 0 ? `<p class="cl-gift">${TOOL_ICON[A.tool]} ${esc(t('cl.gift', { tool: t(`cl.tool.${A.tool}`) }))}</p>` : ''}`
      + `<p class="cl-tut__big">${esc(t(`cl.how${A.id}.head`))}</p>${pictureSvg(A.id, t)}<p class="cl-tut__lead">${esc(t(`cl.how${A.id}.text`))}</p>`,
    `<p class="cl-tut__big">${esc(t('cl.ruler.head'))}</p>${rulerHtml(t, hi, marks)}<p class="cl-tut__lead">${esc(t(`cl.how${A.id}.size`))}</p>`,
  ];
  const last = tutPage >= pages.length - 1;
  m.innerHTML = `<div class="cl-tut__card"><div class="cl-tut__bar"><b>${esc(t('cl.tutTitle', { n: A.id, name: t(`cl.area${A.id}.name`) }))}</b>`
    + `<span class="cl-tut__dots">${pages.map((_, i) => `<i class="${i === tutPage ? 'is-on' : ''}"></i>`).join('')}</span>`
    + `<button type="button" class="cl-mini" data-act="tut-close" aria-label="${esc(t('cl.close'))}">×</button></div>`
    + `${guideBox(t(`cl.how${A.id}.say${tutPage}`))}${pages[tutPage]}`
    + `<div class="cl-foot">${tutPage > 0 ? `<button type="button" class="btn" data-act="tut-prev">${esc(t('cl.prev'))}</button>` : ''}`
    + `<button type="button" class="btn btn--primary" data-act="${last ? 'tut-close' : 'tut-next'}">${esc(t(last ? 'cl.gotIt' : 'cl.nextP'))}</button></div></div>`;
}
function closeTut() { $('tut').hidden = true; }
function openClear(line) {
  const m = $('tut');
  m.hidden = false;
  const A = area();
  const nx = ai + 1 < AREAS.length ? ai + 1 : -1;
  face = 'smile';
  m.innerHTML = `<div class="cl-tut__card cl-clear"><p class="cl-clear__big">${esc(t('cl.cleared', { n: A.id, name: t(`cl.area${A.id}.name`) }))}</p>`
    + `<p class="cl-gift">${TOOL_ICON[A.tool]} ${esc(t('cl.toolMine', { tool: t(`cl.tool.${A.tool}`) }))}</p>`
    + guideBox(t(`cl.bye${A.id}`)) + `<p class="cl-reward">${esc(line)}</p>`
    + `<div class="cl-foot"><button type="button" class="btn" data-act="to-title">${esc(t('cl.toTitle'))}</button>`
    + (nx >= 0 ? `<button type="button" class="btn btn--primary" data-act="go-area" data-i="${nx}">${esc(t('cl.nextArea', { n: AREAS[nx].id }))}</button>` : '')
    + `</div></div>`;
}

// ───────────── 透析 ─────────────
function dialWait() {
  const d = ps.dial;
  if (d.busy) return;
  d.busy = true;
  const total = d.inside + d.outside;
  d.inside = total * DIALYSIS.bagShare;
  d.outside = total - d.inside;
  d.waits += 1;
  d.cloud = 0;
  ps.fb = t('cl.dial.waiting');
  updateProp(); renderPanel();
  setTimeout(() => { if (!ps || pid() !== '3-3') return; d.busy = false; ps.fb = t('cl.dial.waited'); updateProp(); renderPanel(); }, DIALYSIS.waitSec * 1000);
}
function dialChange() { const d = ps.dial; d.outside = 0; d.cloud = 0; ps.fb = t('cl.dial.changed'); updateProp(); renderPanel(); }
function dialTest() {
  const d = ps.dial;
  // 外の水に AgNO₃ を入れる：Cl⁻ があると、白い AgCl の沈殿でにごる
  d.cloud = Math.min(1, d.outside / 40);
  d.tested = true;
  ps.fb = t(d.outside > 1 ? 'cl.dial.cloudy' : d.inside > DIALYSIS.clean ? 'cl.dial.clearButWait' : 'cl.dial.clear');
  updateProp(); renderPanel();
}
function dialKey() {
  const d = ps.dial;
  if (d.inside <= DIALYSIS.clean) { solve(); return; }
  ps.fb = t('cl.dial.notYet', { n: Math.round(d.inside) });
  face = 'surprise';
  renderPanel();
}

// ───────────── 毎回の描き直し ─────────────
const LITE_MS = params.has('lite') ? 400 : 0;
let lastDraw = 0;
function loop(nowMs) {
  requestAnimationFrame(loop);
  if (scene && (!LITE_MS || nowMs - lastDraw >= LITE_MS)) { lastDraw = nowMs; scene.frame(nowMs); scope.frame(nowMs); }
}

function setupInput() {
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'area') { ai = Number(b.dataset.i); renderTitle(); }
    else if (act === 'start') { if (areaOpen(ai)) startArea(ai); }
    else if (act === 'go-area') { closeTut(); startArea(Number(b.dataset.i)); }
    else if (act === 'to-title') { closeTut(); renderTitle(); show('title'); $('scope-box').hidden = true; }
    else if (act === 'tut') openTut();
    else if (act === 'tut-next') { tutPage += 1; renderTut(); }
    else if (act === 'tut-prev') { tutPage = Math.max(0, tutPage - 1); renderTut(); }
    else if (act === 'tut-close') closeTut();
    else if (act === 'tool') { ps.tool = b.dataset.tool; ps.shown = -1; updateProp(); renderPanel(); }
    else if (act === 'probe') {
      const k = Number(b.dataset.k);
      const liq = P().items[k];
      if (!ps.tool) return;
      ps.probed[liq] = { ...(ps.probed[liq] || {}), [ps.tool]: true };
      ps.shown = k;
      ps.fb = t(`cl.saw.${ps.tool}.${ps.tool === 'bell' ? (LIQUIDS[liq].beam ? 'yes' : 'no') : LIQUIDS[liq].scope}`);
      face = 'normal';
      updateProp(); renderPanel();
    } else if (act === 'pick' || act === 'opt') {
      const v = act === 'pick' ? P().items[Number(b.dataset.k)] : b.dataset.o;
      if (P().multi) ps.sel = ps.sel.includes(v) ? ps.sel.filter((x) => x !== v) : [...ps.sel, v];
      else ps.sel = ps.sel.includes(v) ? [] : [v];
      ps.fb = null; face = 'normal';
      updateProp(); renderPanel();
    } else if (act === 'use') { ps.step = 1; ps.fb = t(`cl.used.${pid()}`); updateProp(); renderPanel(); }
    else if (act === 'answer') answer();
    else if (act === 'ord') {
      ps.order.push(b.dataset.o);
      ps.fb = null;
      if (ps.order.length === P().items.length) {
        if (ps.order.every((x, i) => x === P().answer[i])) { solve(); return; }
        ps.fb = t('cl.ng.2-2.order'); face = 'surprise'; ps.order = [];
      }
      renderPanel();
    } else if (act === 'ord-reset') { ps.order = []; renderPanel(); }
    else if (act === 'dial-in') { ps.dial.inWater = true; ps.fb = t('cl.dial.inDone'); updateProp(); renderPanel(); }
    else if (act === 'dial-wait') dialWait();
    else if (act === 'dial-change') dialChange();
    else if (act === 'dial-test') dialTest();
    else if (act === 'dial-key') dialKey();
    else if (act === 'next') next();
  });
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
  loading.textContent = t('cl.loading');
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
    if (screen === 'play') { updateProp(); renderPanel(); if (!$('tut').hidden && $('tut').querySelector('.cl-clear') === null) renderTut(); }
  });

  createTopbar({ mount: $('topbar'), showQR: false, onHome: () => goHome() });
  applyToDom();
  initNotices(toast);

  if (!isWorldOpen(WORLD)) { toast(t('cl.closed')); setTimeout(goHome, 2500); return; }
  onSettingsChange(() => { if (!isWorldOpen(WORLD)) { toast(t('cl.closed')); setTimeout(goHome, 2500); } });

  let avatar = getAvatar(WORLD);
  if (params.get('from') !== 'home' || !avatar) {
    const chosen = await openAvatarSelect(WORLD);
    if (!chosen) { goHome(); return; }
    avatar = chosen;
  }
  if (params.has('from')) history.replaceState(null, '', location.pathname);

  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  scene = createScene($('scene'));
  scope = createScope($('scope'));
  scene.setProp('pool', [{ liquid: 'water', label: '' }, { liquid: 'starch', label: '' }, { liquid: 'sugar', label: '' }]);
  setupInput();
  for (let a = AREAS.length - 1; a >= 0; a--) if (areaOpen(a)) { ai = a; break; }
  renderTitle();
  show('title');
  requestAnimationFrame(loop);

  if (params.has('debug')) {
    if (params.has('fast')) DIALYSIS.waitSec = 0.6;
    window.__cl = {
      get state() { return { screen, ai, pi, id: pid(), ps }; },
      start: (a, p = 0) => { startArea(a); pi = p; startPuzzle(); },
      closeTut: () => closeTut(),
      grant: (n) => grant({ itemKey: 'ledger.item.founding', amount: n }),
    };
  }
}

start();
