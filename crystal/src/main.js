// crystal/src/main.js
// ② クリスタル・ラボ：画面の切り替えと全体の進行（全体の仕様書 8章）。
// v0.1：固体の実験台と自由実験。
//   ・溶質の種類（KNO₃、KCl、NaCl、CuSO₄、CuSO₄·5H₂O、KNO₃ と CuSO₄·5H₂O の混合物）、溶質の質量 0〜200 g、
//     水の質量 50〜300 g、温度 0〜80℃ をスライダーで動かすと、溶け残り・析出する結晶が3Dでその場で変わる。
//   ・背後の溶解度曲線の上を「今の状態」の点が動く。不飽和・飽和・過飽和を表示する。
//   ・高温の溶液を急に冷やすと、まれに過飽和になる。「種結晶を落とす」で一気に結晶が出る。
//   ・初めて見た現象（発見）ごとに、発見報酬として20ヒヤマ（所得税と1日の上限つき）。
// 画面：タイトル → 実験台（自由実験） ／ 発見の一覧。ワールドに入るときは、毎回アバター選択の画面を通る。

import { VERSION, RANGE, SOLUTE_ORDER, DISCOVERY, DISCOVERIES } from './config.js';
import { SOLUTES } from './solubility.js';
import { createLab } from './lab.js';
import { createScene } from './scene3d.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, fx } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getWorldData, setWorldData } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama, reward } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { standUrl, faceUrl, lineKey, nameKey } from '../../shared/characters.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const WORLD = 'crystal';
const GUIDE = 'karin';         // 工房の親方（ユウタロー）

let screen = 'loading';
let scene = null;
let lab = null;
let avatar = null;
let backTo = 'title';          // 発見の一覧を閉じたときに戻る画面

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
  for (const id of ['title', 'lab', 'found']) $(id).hidden = id !== name;
  document.body.classList.toggle('is-lab', name === 'lab');
  if (scene) scene.showPanel(name === 'lab');
  if (name === 'found') $('discover').hidden = true;
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
  // 知らせ：親方の顔と、発見の名前、ひとこと
  const el = $('discover');
  el.querySelector('img').src = faceUrl(GUIDE);
  el.querySelector('b').textContent = t('cr.discover.head', { name: t(`cr.d.${kind}`) });
  el.querySelector('p').textContent = t(`cr.d.${kind}Line`);
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
  $('found-list').innerHTML = DISCOVERIES.map((k) => (f[k]
    ? `<li><b>${esc(t(`cr.d.${k}`))}</b><p>${esc(t(`cr.d.${k}Line`))}</p></li>`
    : `<li class="is-locked"><b>？？？</b><p>${esc(t(`cr.d.${k}Hint`))}</p></li>`)).join('');
}

// ───────────── タイトル ─────────────
function renderTitle() {
  const st = $('title');
  st.querySelector('.cr-guide__stand').src = standUrl(GUIDE, 'normal');
  st.querySelector('.cr-guide__stand').alt = t(nameKey(GUIDE));
  st.querySelector('.cr-guide__line').textContent = t('quote', { line: t('cr.guide1') });
  renderFoundButtons();
}

// ───────────── 実験台 ─────────────
function setupSliders() {
  for (const k of ['temp', 'water', 'mass']) {
    const el = $(`s-${k}`);
    const r = RANGE[k === 'mass' ? 'solute' : k];
    el.min = r.min; el.max = r.max; el.step = r.step;
    el.addEventListener('input', () => {
      const v = Number(el.value);
      if (k === 'temp') lab.setTemp(v);
      else if (k === 'water') lab.setWater(v);
      else lab.setMass(v);
      renderLab();
    });
  }
}

function renderSolutes() {
  const s = lab.state;
  $('solutes').innerHTML = SOLUTE_ORDER.map((id) => `<button type="button" class="cr-solute" role="radio" aria-checked="${s.solute === id}" data-act="solute" data-id="${id}">
    ${esc(SOLUTES[id].formula)}<small>${esc(t(`cr.s.${id}`))}</small></button>`).join('');
}

function renderLab() {
  const s = lab.state;
  const e = s.eq;
  $('s-temp').value = s.temp; $('s-water').value = s.water; $('s-mass').value = s.mass;
  $('v-temp').textContent = `${s.temp} ℃`;
  $('v-water').textContent = `${s.water} g`;
  $('v-mass').textContent = `${s.mass} g`;
  const g = (x) => `${x.toFixed(1)}<small>g</small>`;
  const multi = e.parts.length > 1;
  const name = (id) => (id === 'KNO3' ? 'KNO₃' : 'CuSO₄·5H₂O');
  // 画面の下（操作盤の上）に、横一列で数値を出す
  const cell = (k, v, sub = '') => `<div class="cr-cell"><dt>${esc(t(k))}</dt><dd>${v}${sub ? `<small class="cr-sub">${sub}</small>` : ''}</dd></div>`;
  const cells = [
    cell('cr.r.water', g(e.water), e.addedWater > 0.05 ? `+${e.addedWater.toFixed(1)} ${esc(t('cr.r.fromHydrate'))}` : ''),
    cell('cr.r.dissolved', g(e.dissolved)),
    cell('cr.r.crystal', g(e.crystal), multi ? e.parts.map((p) => `${name(p.id)} ${p.crystal.toFixed(1)}`).join('<br>') : ''),
    cell('cr.r.solubility', e.parts.map((p) => p.S.toFixed(1)).join('/'), esc(t('cr.r.per100'))),
  ];
  const hydr = e.parts.some((p) => p.id === 'CuSO4' && p.crystal > 0.05) ? `<p class="cr-note">${esc(t('cr.r.hydrateNote'))}</p>` : '';
  $('readout').innerHTML = `<div class="cr-readout__row"><dl>${cells.join('')}</dl><p class="cr-state is-${e.state}">${esc(t(`cr.state.${e.state}`))}</p></div>${hydr}`;
  $('seed-btn').hidden = e.state !== 'supersaturated';
  scene.setState(s);
}

function openLab() {
  renderSolutes();
  renderLab();
  show('lab');
}

// ───────────── 毎回の描き直し ─────────────
function loop(nowMs) {
  requestAnimationFrame(loop);
  if (scene) scene.frame(nowMs);
}

function setupInput() {
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'free' || act === 'bench-solid') openLab();
    else if (act === 'to-title') { renderTitle(); show('title'); }
    else if (act === 'solute') { lab.setSolute(b.dataset.id); renderSolutes(); renderLab(); }
    else if (act === 'seed') { if (lab.seed()) { scene.sparkle(); renderLab(); } }
    else if (act === 'found') { backTo = screen; renderFound(); show('found'); }
    else if (act === 'found-close') { if (backTo === 'lab') openLab(); else { renderTitle(); show('title'); } }
  });
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

  // 初めて起動したときの流れ（言語・ニックネーム・開国交付金）は、ホームで行う
  if (!getUser().onboarded) { goHome(); return; }
  const savedLang = getUser().lang;
  if (savedLang && savedLang !== getLang()) setLang(savedLang);
  onLangChange((lang) => {
    setUserLang(lang);
    applyToDom();
    if (screen === 'title') renderTitle();
    if (screen === 'lab') { renderSolutes(); renderLab(); }
    if (screen === 'found') renderFound();
    renderFoundButtons();
    if (scene && lab) scene.redraw(lab.state);
  });

  createTopbar({ mount: $('topbar'), showQR: false, onHome: () => goHome() });
  applyToDom();
  initNotices(toast);

  // 先生がこのワールドを閉じているときは入れない
  if (!isWorldOpen(WORLD)) { toast(t('cr.closed')); setTimeout(goHome, 2500); return; }
  onSettingsChange(() => { if (!isWorldOpen(WORLD)) { toast(t('cr.closed')); setTimeout(goHome, 2500); } });

  // ワールドに入るたびに、アバター選択の画面を通る（ホームの門から来たときは、そこで選んでいる）
  avatar = getAvatar(WORLD);
  if (params.get('from') !== 'home' || !avatar) {
    const chosen = await openAvatarSelect(WORLD);
    if (!chosen) { goHome(); return; }
    avatar = chosen;
  }
  if (params.has('from')) history.replaceState(null, '', location.pathname);

  if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  lab = createLab({ onDiscover });
  scene = createScene($('scene'));
  scene.setState(lab.state);
  setupSliders();
  setupInput();
  // 発見の知らせは、タップすると早めに消える
  $('discover').addEventListener('click', () => { $('discover').hidden = true; });
  renderTitle();
  show('title');
  requestAnimationFrame(loop);

  // 確かめるための入口（住所に ?debug=1 を付けたときだけ）
  if (params.has('debug')) {
    window.__cr = {
      get lab() { return lab; }, get screen() { return screen; },
      set: (o) => { if (o.solute) lab.setSolute(o.solute); if (o.water != null) lab.setWater(o.water); if (o.mass != null) lab.setMass(o.mass); if (o.temp != null) lab.setTemp(o.temp, o.at); if (o.forceSuper) lab.forceSuper(); renderSolutes(); renderLab(); },
    };
  }
}

start();
