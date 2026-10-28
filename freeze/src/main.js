// freeze/src/main.js
// ③ フリーズ・ガード：画面の切り替えと1夜の進行（全体の仕様書 9章）。
// v0.3：区間を6から3に減らした。朝が近づくと朝日。各ステージのはじめに、公式への値の代入をアニメーションで説明し、
//       失敗した朝には、失敗した区間の数値で「かんたん解説」。ステージ6（浸透圧と逆浸透）・7（分子量から物質を特定）。
// v0.2：ステージ3（冷却曲線から凝固点を読む）、4（蒸気圧降下：真水で薄めて乾かす）、5（沸点上昇：釜の湯を煮立たせる）。
// v0.1：1夜の流れ（準備 → 夜 → 朝）と、ステージ1（凍結の峠：非電解質）・ステージ2（電解質の峠：電離で粒子が増える）。
//   準備：6つの区間ごとに、撒く物質と質量を決める（予算の中で）。凝固点は自分で計算する（電卓あり）。
//   夜：約40秒の早回し。区間の気温がその区間の溶液の凝固点を下回ると、路面が凍る。
//   朝：守れた区間の数と残った予算で評価。凍った区間・むだの多い区間に、どこで計算がずれたかの解説。
//   報酬：1夜を守り切ると 60 ヒヤマ、予算を半分以上残すと追加 40 ヒヤマ（どちらも、その夜で初めてのときだけ）。

import { VERSION, SUBSTANCES, STAGES, LOCKED_STAGES, NIGHT, REWARD, CONST, SPREAD, ASSIST, WAVE, TUG, GLOW, FZ_ANIM } from './config.js';
import { nightOf, plan, judge, nightState, needed, coolingCurve, molarFrom } from './model.js';
import { chainOf, demoOf, pictureOf, EXAMPLES, SHOW_IONS } from './tutorial.js';
import { pictureSvg, ionsHtml, lineBar } from './explain.js';
import { createScene } from './scene3d.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, fx } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { initBackend, getUser, setUserLang, getAvatar, getWorldData, setWorldData } from '../../shared/auth.js';
import { initEconomy, isWorldOpen, onSettingsChange, formatHiyama, reward, grant } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { standUrl, nameKey, say, tagStand, faceFig, nameTag } from '../../shared/characters.js';
import { createCalc } from '../../shared/calc.js';
import * as battle from './battle.js';

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
let meter = false;               // 目安メーターを表示しているか
let meterUsed = false;           // この夜の準備で、目安メーターを使ったか

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
  for (const id of ['title', 'play', 'battle']) $(id).hidden = id !== name;
  if (scene) scene.showLabels(name === 'play');
  updateViewport();
}

// ───────────── 記録 ─────────────
const key = (s, n) => `${s + 1}-${n + 1}`;
function rec() { return getWorldData(WORLD).nights || {}; }
function nightOpen(s, n) {
  if (s === 0 && n === 0) return true;
  // v1.1：守り切れなくても、凍った区間が1つまでなら次の夜へ進める（passed）
  const ok = (r) => !!(r && (r.cleared || r.passed));
  if (n > 0) return ok(rec()[key(s, n - 1)]);
  return ok(rec()[key(s - 1, STAGES[s - 1].nights.length - 1)]);
}
function stageOpen(s) { return nightOpen(s, 0); }

// ───────────── タイトル ─────────────
/** v1.0：映えの段階（選んでいるステージで決まる。全部クリアしたら最後のステージは段階8） */
function glowLevel(s = si) {
  const r = rec();
  const all = STAGES.every((S, i) => S.nights.every((_, n) => (r[key(i, n)] || {}).cleared));
  if (all && s === STAGES.length - 1) return GLOW.allClear;
  return GLOW.byStage[s] || 1;
}

function renderTitle() {
  if (scene) scene.setGlow(glowLevel());
  const st = $('title');
  st.querySelector('.fz-guide__stand').src = standUrl(GUIDE, 'normal');
  st.querySelector('.fz-guide__stand').alt = t(nameKey(GUIDE));
  st.querySelector('.fz-guide__line').textContent = say(t, GUIDE, t('fz.guide1'));
  tagStand(t, st.querySelector('.fz-guide__stand'), GUIDE);
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
  if (!keepPicks || picks.length !== night.sections.length) picks = night.sections.map(() => ({ sub: night.substances[0] || null, mass: '' }));
  phase = 'prep';
  if (scene) scene.clearSpread();
  if (!keepPicks) { meter = ASSIST.meterOnFirst && n === 0; meterUsed = meter; }   // v1.1：どのステージも1夜めはメーターつき
  else meterUsed = meter;
  run = null; result = null; rewardText = '';
  scene.setTheme(night.kind);
  scene.setGlow(glowLevel(s));
  scene.setNight(0.2);
  closeCurve();
  closeTut();
  setDawn(0);
  show('play');
  renderPanel();
  updateSections();
  // そのステージを初めて遊ぶときは、解き方の説明から
  // v1.1：どのステージも、第1夜を始めるときは毎回、公式のアニメから説明する（やり直しのときは出さない）
  const seen = getWorldData(WORLD).tut || {};
  if (!seen[night.stage] || (n === 0 && !keepPicks)) openTut('intro');
}

function subName(id) { return t(`fz.sub.${id}`); }
function startHour() { return { boil: 16, vapor: 18, osmo: 20, mm: 21 }[night.kind] ?? NIGHT.startHour; }
function spanHours() { return { boil: 3, vapor: 12, osmo: 10, mm: 9 }[night.kind] ?? NIGHT.hours; }
function setDawn(k) {
  const el = $('dawn');
  if (el) el.style.opacity = String(Math.min(1, k));
  if (scene) scene.setDawn(k);
}

// ───────────── 解き方の説明（v0.4：しくみ → ためしてみよう → 計算のレシピ） ─────────────
const tut = { mode: 'intro', idx: 0, page: 0, shown: 0, demo: 0 };
function closeTut() { stopAnim(); const m = $('tut'); if (m) m.hidden = true; }
function failRows() { return result ? result.rows.map((r, k) => ({ r, k })).filter((x) => x.r.fail) : []; }
function tutPages() { return tut.mode === 'recap' ? ['recipe'] : ['anim', 'how', 'try', 'recipe']; }
/** mode：'intro'（ステージのはじめ）| 'recap'（失敗した区間の数値で） */
function openTut(mode, idx = 0) {
  if (mode === 'recap' && !failRows().length) return;
  tut.mode = mode; tut.idx = idx; tut.page = 0; tut.shown = 0;
  const d = demoOf(EXAMPLES[night.stage].kind);
  tut.demo = d.start;
  if (mode === 'recap') tut.shown = 99;
  renderTut();
  if (mode === 'intro') {
    const w = getWorldData(WORLD);
    setWorldData(WORLD, { ...w, tut: { ...(w.tut || {}), [night.stage]: Date.now() } });
  }
}
/** 説明に使う数値（例、または失敗した区間） */
function tutExample() {
  if (tut.mode !== 'recap') return { ex: EXAMPLES[night.stage], kind: EXAMPLES[night.stage].kind, row: null, k: -1 };
  const fr = failRows();
  const { r, k } = fr[Math.min(tut.idx, fr.length - 1)];
  const ex = { ...r };
  if (['freeze', 'curve', 'boil'].includes(night.kind)) ex.sub = r.sub || night.substances[night.substances.length - 1];
  return { ex, kind: night.kind, row: r, k };
}
function renderTut() {
  const m = $('tut');
  m.hidden = false;
  const pages = tutPages();
  const page = pages[tut.page];
  const { ex, kind, row, k } = tutExample();
  const stage = night.stage;
  const title = tut.mode === 'recap'
    ? t('fz.recapTitle', { n: kind === 'mm' ? t('fz.sampleN', { n: k + 1 }) : t('fz.secN', { n: k + 1 }) })
    : t('fz.tutTitle', { s: stage, name: t(`fz.stage${stage}.name`) });
  let body = '';
  stopAnim();
  if (page === 'anim') {
    body = `<p class="fz-tut__big">${esc(t(`fz.anim.head.${demoOf(kind).outKey}`))}</p>`
      + `<div class="fz-anim" id="tut-anim"><p class="fz-anim__formula">${esc(formulaOf(kind))}</p>`
      + `<p class="fz-anim__live" id="tut-anim-live"></p><div id="tut-anim-out"></div></div>`
      + `<p class="fz-tut__lead">${esc(t(`fz.anim.cap.${demoOf(kind).outKey}`))}</p>`;
  } else if (page === 'how') {
    const pic = pictureOf(kind);
    const subs = ['NaCl', 'CaCl2', 'urea'];
    body = `<p class="fz-tut__big">${esc(t(`fz.how.${kind === 'curve' ? 'freeze' : kind}.head`))}</p>`
      + pictureSvg(pic, t)
      + `<p class="fz-tut__lead">${esc(t(`fz.how.${kind === 'curve' ? 'freeze' : kind}.text`))}</p>`
      + (SHOW_IONS[stage] ? `<p class="fz-tut__sub">${esc(t('fz.how.ionHead'))}</p>${ionsHtml(t, subs)}` : '');
  } else if (page === 'try') {
    body = `<p class="fz-tut__big">${esc(t('fz.try.head'))}</p><div id="tut-demo">${demoHtml(kind)}</div>`;
  } else {
    body = recipeHtml(kind, ex, row);
  }
  const dots = pages.length > 1 ? `<span class="fz-tut__dots">${pages.map((p, i) => `<i class="${i === tut.page ? 'is-on' : ''}">${esc(t(`fz.tutPage.${p}`))}</i>`).join('')}</span>` : '';
  const chain = chainOf(t, kind, ex);
  const allShown = page !== 'recipe' || tut.shown >= chain.ops.length + 1;
  const more = tut.mode === 'recap' && failRows().length > 1;
  const last = tut.page >= pages.length - 1;
  let foot = '';
  if (tut.page > 0) foot += `<button type="button" class="btn" data-act="tut-prev">${esc(t('fz.tutPrev'))}</button>`;
  if (page === 'recipe' && !allShown) foot += `<button type="button" class="btn btn--primary" data-act="tut-step">${esc(t('fz.tutStep'))}</button>`;
  else if (!last) foot += `<button type="button" class="btn btn--primary" data-act="tut-nextp">${esc(t('fz.tutNextP'))}</button>`;
  else {
    if (more) foot += `<button type="button" class="btn" data-act="tut-next">${esc(t('fz.tutNextFail'))}</button>`;
    foot += `<button type="button" class="btn btn--primary" data-act="tut-close">${esc(t('fz.tutClose'))}</button>`;
  }
  if (page === 'anim') setTimeout(() => startAnim(kind), 0);
  m.innerHTML = `<div class="fz-tut__card"><div class="fz-tut__bar"><b>${esc(title)}</b>${dots}<button type="button" class="fz-mini" data-act="tut-close" aria-label="${esc(t('calc.close'))}">×</button></div>`
    + body + `<div class="fz-foot">${foot}</div></div>`;
  m.scrollTop = 0;
}
// ── v1.1：公式に連動するアニメ（説明の1ページめ）。数値が自動で行ったり来たりし、公式の数と粒と温度の線が一緒に動く ──
let animRaf = 0;
function stopAnim() { if (animRaf) cancelAnimationFrame(animRaf); animRaf = 0; }
function formulaOf(kind) {
  return { fp: 'Δt = K_f × m', bp: 'Δt = K_b × m', vp: 'm = n ÷ W', os: 'Π = c R T', mm: 'Δt = K_f × (w ÷ M) ÷ W' }[demoOf(kind).outKey];
}
/** 公式に今の数を入れた式（数が動くところを光らせる） */
function liveOf(kind, x) {
  const d = demoOf(kind);
  const b = (v) => `<b class="fz-anim__v">${v}</b>`;
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  if (d.outKey === 'fp') { const dt = CONST.Kf * x; return `Δt = 1.85 × ${b(f1(x))} = ${b(f2(dt))} K　→　${esc(t('fz.anim.fpAt'))} ${b(`${dt > 0 ? '−' : ''}${f2(dt)}℃`)}`; }
  if (d.outKey === 'bp') { const dt = CONST.Kb * x; return `Δt = 0.515 × ${b(f1(x))} = ${b(f2(dt))} K　→　${esc(t('fz.anim.bpAt'))} ${b(`${f2(100 + dt)}℃`)}`; }
  if (d.outKey === 'vp') { const m = 1.2 / (1 + x); return `m = 1.20 ÷ (1.0 + ${b(f1(x))}) = ${b(f2(m))} mol/kg`; }
  if (d.outKey === 'os') { const P = (x * CONST.R * 298) / 1e5; return `Π = ${b(f2(x))} × 8.31×10³ × 298 = ${b(f1(P))}×10⁵ Pa`; }
  const dt = CONST.Kf * (9 / x) / 0.1;
  return `Δt = 1.85 × (9.0 ÷ ${b(Math.round(x))}) ÷ 0.100 = ${b(f2(dt))} K`;
}
function startAnim(kind) {
  stopAnim();
  const d = demoOf(kind);
  const t0 = performance.now();
  const lo = d.outKey === 'mm' ? d.min : d.min, hi = d.outKey === 'mm' ? d.max : d.min + (d.max - d.min) * 0.8;
  let last = -1;
  const tick = (now) => {
    const live = $('tut-anim-live'), out = $('tut-anim-out');
    if (!live || !out) { animRaf = 0; return; }
    // 4秒で行って、4秒で戻る（はじめと終わりで少し止まる）
    const ph = ((now - t0) / 1000) % (FZ_ANIM.cycleSec * 2);
    const k = Math.min(1, Math.max(0, ph < FZ_ANIM.cycleSec ? ph / FZ_ANIM.cycleSec : 2 - ph / FZ_ANIM.cycleSec) * 1.15 - 0.075);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const raw = lo + (hi - lo) * e;
    const x = Math.round(raw / d.step) * d.step;
    if (x !== last) {
      last = x;
      tut.demo = x;
      live.innerHTML = liveOf(kind, x);
      out.innerHTML = demoOut(kind);
    }
    animRaf = requestAnimationFrame(tick);
  };
  animRaf = requestAnimationFrame(tick);
}

/** ためしてみよう：スライダーで粒を動かす */
function demoHtml(kind) {
  const d = demoOf(kind);
  return `<label class="fz-demo__in"><span>${esc(t(`fz.try.in.${d.outKey}`))}</span><output id="tut-demo-v">${esc(demoVal(d))}</output>`
    + `<input type="range" data-tut="demo" min="${d.min}" max="${d.max}" step="${d.step}" value="${tut.demo}"></label>`
    + `<div id="tut-demo-out">${demoOut(kind)}</div><p class="fz-tut__lead">${esc(t(`fz.try.note.${d.outKey}`))}</p>`;
}
function demoVal(d) { return d.outKey === 'mm' ? `${tut.demo}` : `${(Math.round(tut.demo * 100) / 100).toFixed(d.step < 0.1 ? 2 : 1)} ${d.inUnit}`; }
function demoOut(kind) {
  const d = demoOf(kind);
  const o = d.compute(tut.demo);
  const dots = Array.from({ length: Math.min(40, o.dots) }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  let bar;
  if (d.outKey === 'fp') bar = lineBar({ min: -6, max: 2, zone: { from: -6, to: -CONST.Kf * tut.demo, cls: 'is-ice', label: t('fz.zone.ice') }, marks: [{ v: 0, cls: 'is-zero', label: '0℃' }, { v: -CONST.Kf * tut.demo, cls: 'is-fp', label: t('fz.mk.fp') }] });
  else if (d.outKey === 'bp') bar = lineBar({ min: 99.8, max: 101.8, zone: { from: 100 + CONST.Kb * tut.demo, to: 101.8, cls: 'is-boil', label: t('fz.zone.boil') }, marks: [{ v: 100, cls: 'is-zero', label: '100℃' }, { v: 100 + CONST.Kb * tut.demo, cls: 'is-fp', label: t('fz.mk.bp') }] });
  else if (d.outKey === 'vp') { const mm = 1.2 / (1 + tut.demo); bar = lineBar({ min: 0, max: 1.3, zone: { from: 0, to: 0.6, cls: 'is-dry', label: t('fz.zone.dry') }, marks: [{ v: mm, cls: 'is-fp', label: t('fz.mk.m') }] }); }
  else if (d.outKey === 'os') bar = lineBar({ min: 0, max: 26, zone: { from: 0, to: (tut.demo * CONST.R * 298) / 1e5, cls: 'is-press', label: '' }, marks: [{ v: (tut.demo * CONST.R * 298) / 1e5, cls: 'is-fp', label: 'Π' }] });
  else bar = lineBar({ min: -3.6, max: 0.4, zone: { from: -3.6, to: -(CONST.Kf * (9 / tut.demo) / 0.1), cls: 'is-ice', label: '' }, marks: [{ v: 0, cls: 'is-zero', label: '0℃' }, { v: -(CONST.Kf * (9 / tut.demo) / 0.1), cls: 'is-fp', label: t('fz.mk.fp') }] });
  return `<div class="fz-demo__grains${d.outKey === 'vp' ? ' is-cloth' : ''}" style="--spread:${o.spread || 1}">${dots}</div>`
    + `<p class="fz-demo__out"><span>${esc(t(`fz.try.out.${d.outKey}`))}</span><b class="${o.ok ? 'is-ok' : ''}">${esc(o.txt)}</b></p>${bar}`;
}
/** 計算のレシピ：矢印でつないだ「単位の変わり方」 */
function recipeHtml(kind, ex, row) {
  const c = chainOf(t, kind, ex);
  const lead = tut.mode === 'recap' ? '' : `<p class="fz-tut__lead">${esc(t(`fz.tutLead${night.stage}`))}</p>`;
  let cmp = '';
  if (row) cmp = compareHtml(row);
  const n = tut.shown;
  let html = `${cmp}${lead}<p class="fz-tut__formula"><span>${esc(c.formula)}</span></p><ol class="fz-chain${tut.mode === 'recap' ? ' is-all' : ''}">`;
  c.nodes.forEach((nd, i) => {
    if (i > 0) {
      const op = c.ops[i - 1];
      html += `<li class="fz-chain__op${i <= n - 1 ? ' is-shown' : ''}" style="--i:${i}"><span class="fz-chain__arrow">▼</span><b class="fz-chain__opv">${op.op}</b><small>${esc(op.why)}</small></li>`;
    }
    html += `<li class="fz-chain__node${i <= n - 1 ? ' is-shown' : ''}${i === c.nodes.length - 1 ? ' is-last' : ''}" style="--i:${i}"><small>${esc(nd.label)}</small>`
      + `<b>${esc(nd.val)}<em>${esc(nd.unit)}</em></b>${nd.calc ? `<span class="fz-chain__calc">${nd.calc}</span>` : ''}</li>`;
  });
  html += '</ol>';
  if (n >= c.nodes.length && c.answer) html += `<p class="fz-chain__ans">${esc(c.answer.note)}</p>`;
  html += `<p class="fz-tut__legend"><i class="c-g">${esc(t('fz.tut.lgGiven'))}</i><i class="c-k">${esc(t('fz.tut.lgConst'))}</i></p>`;
  return html;
}
/** かんたん解説：自分の撒いた量と、ちょうどの量の比べ */
function compareHtml(row) {
  const kind = night.kind;
  const S = row.sub ? SUBSTANCES[row.sub] : null;
  let line, bar = '';
  if (kind === 'freeze' || kind === 'curve') {
    const fp = row.value;
    line = t('fz.cmp.fp', { m: f1(row.mass || 0), f: S ? S.formula : '', fp: signed(fp), low: signed(row.low) });
    bar = freezeBar(row, fp, row.low);
  } else if (kind === 'boil') line = t('fz.cmp.bp', { m: f1(row.mass || 0), f: S ? S.formula : '', bp: fmtBp(row.value), target: fmtBp(row.target) });
  else if (kind === 'vapor') line = t('fz.cmp.vp', { w: f2(row.mass || 0), m: f2(row.value), max: f2(row.mMax) });
  else if (kind === 'osmo') line = t('fz.cmp.os', { p: f1(row.mass || 0), pi: f2(row.pi) });
  else line = t('fz.cmp.mm', { f: S ? S.formula : '—', M: S ? S.M : '—' });
  return `<div class="fz-cmp"><p>${esc(line)}</p>${bar}</div>`;
}
// ───────────── 数直線（準備の目安・撒く・夜・朝の解説で同じ形） ─────────────
/** 凍結：凍るゾーン（凍る温度より低いところ）、凍る温度、予報、いまの気温。目盛りの幅は、区間の最終の値で決める */
function freezeBar(row, fp, low, now = null) {
  const min = Math.floor(Math.min(low, row.value ?? fp, fp) - 1), max = 2;
  const marks = [{ v: low, cls: 'is-low', label: t('fz.mk.low') }, { v: fp, cls: 'is-fp', label: t('fz.mk.fp') }];
  if (now !== null) marks.push({ v: now, cls: 'is-now', label: t('fz.mk.now') });
  return lineBar({ min, max, zone: { from: min, to: fp, cls: 'is-ice', label: t('fz.zone.ice') }, marks });
}
function boilBar(bp, target, now = null) {
  const min = 99.8, max = Math.max(bp, target) + 0.4;
  const marks = [{ v: target, cls: 'is-low', label: t('fz.mk.target') }, { v: bp, cls: 'is-fp', label: t('fz.mk.bp') }];
  if (now !== null) marks.push({ v: now, cls: 'is-now', label: t('fz.mk.now') });
  return lineBar({ min, max, zone: { from: bp, to: max, cls: 'is-boil', label: t('fz.zone.boil') }, marks });
}
function vaporBar(m, max, top) {
  return lineBar({ min: 0, max: top * 1.08, zone: { from: 0, to: max, cls: 'is-dry', label: t('fz.zone.dry') }, marks: [{ v: max, cls: 'is-low', label: t('fz.mk.max') }, { v: m, cls: 'is-fp', label: t('fz.mk.m') }] });
}
function osmoBar(p, pi) {
  const max = Math.max(p, pi) * 1.25 + 0.5;
  return lineBar({ min: 0, max, zone: { from: pi, to: max, cls: 'is-dry', label: t('fz.zone.press') }, marks: [{ v: pi, cls: 'is-low', label: 'Π' }, { v: p, cls: 'is-fp', label: t('fz.mk.p') }] });
}
/** 区間の数直線（準備の目安・朝） */
function barOf(kind, row) {
  if (kind === 'freeze' || kind === 'curve') return freezeBar(row, row.value, row.low);
  if (kind === 'boil') return boilBar(row.value, row.target);
  if (kind === 'vapor') { const S = SUBSTANCES[row.csub]; const m0 = ((row.cg / S.M) * S.i) / row.water; return vaporBar(row.value, row.mMax, m0); }
  if (kind === 'osmo') return osmoBar(row.mass || 0, row.pi);
  return '';
}

const fmtBp = (v) => `${(Math.round(v * 100) / 100).toFixed(2)}`;
const isFreezing = () => night.kind === 'freeze' || night.kind === 'curve';

/** 準備の行の、区間の条件の部分（kind ごと） */
function mmText(sec) {
  const solvent = sec.q === 'fpb' ? t('fz.benzene') : t('fz.water');
  if (sec.q === 'osm') return t('fz.mm.osm', { g: sec.g, V: sec.V, T: sec.tc, p: `${sec.piMant.toFixed(2)}×10^${sec.piExp}` });
  return t('fz.mm.fp', { g: sec.g, s: solvent, sg: sec.sg, fp: sec.q === 'fpb' ? sec.fp.toFixed(2) : `−${sec.dt.toFixed(2)}` });
}
function condCells(sec, k) {
  if (night.kind === 'mm') return `<span class="fz-q">${esc(mmText(sec)).replace(/\^(-?\d+)/g, '<sup>$1</sup>')}</span>`;
  if (night.kind === 'osmo') {
    const S = SUBSTANCES[sec.csub];
    return `<span class="fz-v fz-cloth">${esc(S.formula)}<br>${f2(sec.c)}<small>mol/L</small></span><span class="fz-v fz-low">${sec.tc}<small>℃</small></span>`;
  }
  if (night.kind === 'vapor') {
    const S = SUBSTANCES[sec.csub];
    return `<span class="fz-v fz-cloth">${esc(S.formula)} ${sec.cg}<small>g</small><br>${esc(t('fz.waterShort'))} ${f1(sec.water)}<small>kg</small></span>`
      + `<span class="fz-v fz-low">≦${f2(sec.mMax)}<small>mol/kg</small></span>`;
  }
  if (night.kind === 'boil') return `<span class="fz-v">${f1(sec.water)}<small>kg</small></span><span class="fz-v fz-low">${fmtBp(sec.target)}<small>℃</small></span>`;
  const graph = night.kind === 'curve' ? `<button type="button" class="fz-graph" data-act="curve" data-k="${k}" aria-label="${esc(t('fz.curveOpen', { n: k + 1 }))}">📈</button>` : '';
  return `<span class="fz-v">${f1(sec.water)}<small>kg</small></span><span class="fz-v fz-low">${signed(sec.low)}<small>℃</small></span>${graph}`;
}

function renderPanel() {
  const box = $('panel');
  const head = (extra) => `<div class="fz-head"><b>${esc(t('fz.nightTitle', { s: night.stage, n: night.night }))}</b>${extra}</div>`;
  const kind = night.kind;
  if (phase === 'prep') {
    const p = plan(night, cleanPicks());
    const ratio = Math.min(1, p.used / night.budget);
    const subs = night.substances;
    const tableBtn = kind === 'vapor' || kind === 'mm' || kind === 'osmo' ? '' : `<button type="button" class="fz-mini" data-act="table">${esc(t('fz.table'))}</button>`;
    const table = kind === 'mm'
      ? `<div class="fz-table">${night.candidates.map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span>M = ${S.M}</span><span></span>`; }).join('')}</div>`
      : kind === 'osmo'
      ? `<div class="fz-table">${['NaCl', 'CaCl2', 'urea', 'glucose'].map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span></span><span>${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>`
      : kind === 'vapor'
      ? `<div class="fz-table">${['NaCl', 'CaCl2', 'urea', 'glucose'].map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span>${S.M} g/mol</span><span>${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>`
      : `<div class="fz-table">${subs.map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span>${S.M} g/mol</span><span>${S.price} pt/mol　${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>`;
    box.innerHTML = head(tableBtn
      + `<button type="button" class="fz-mini fz-mini--hot" data-act="tut">${esc(t('fz.tutBtn'))}</button>`
      + (kind === 'mm' ? '' : `<button type="button" class="fz-mini${meter ? ' is-on' : ''}" data-act="meter" aria-pressed="${meter}">${esc(t('fz.meterBtn'))}</button>`)
      + `<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>`
      + `<button type="button" class="fz-mini" data-act="to-title">${esc(t('fz.toTitle'))}</button>`)
      + (kind === 'mm' ? '' : `<div class="fz-budget${p.over ? ' is-over' : ''}" id="budget"><span>${esc(t('fz.used'))} <b>${f1(p.used)}</b> / ${night.budget} pt</span>`
      + `<span>${esc(t('fz.left'))} <b>${f1(p.left)}</b> pt</span><span class="fz-budget__bar"><i style="width:${(ratio * 100).toFixed(1)}%"></i></span></div>`)
      + `<p class="fz-hint">${esc(t(`fz.hint${night.stage}`, { kf: CONST.Kf, kb: CONST.Kb, wp: CONST.waterPrice, pp: CONST.pressPrice, bk: CONST.benzeneKf, bf: CONST.benzeneFp }))}</p>`
      + (showTable || ['vapor', 'mm', 'osmo'].includes(kind) ? table : '')
      + `<ol class="fz-rows fz-rows--${kind}">${night.sections.map((sec, k) => {
        const pk = picks[k];
        if (kind === 'mm') {
          return `<li class="fz-row fz-row--mm"><b>${k + 1}</b>${condCells(sec, k)}`
            + `<select data-k="${k}" data-f="sub" aria-label="${esc(t('fz.pickLabel', { n: k + 1 }))}"><option value="">${esc(t('fz.pickNone'))}</option>${night.candidates.map((id) => `<option value="${id}" ${pk.sub === id ? 'selected' : ''}>${esc(SUBSTANCES[id].formula)}</option>`).join('')}</select></li>`;
        }
        const sel = kind === 'vapor' || kind === 'osmo' ? ''
          : `<select data-k="${k}" data-f="sub" aria-label="${esc(t('fz.subLabel'))}">${subs.map((id) => `<option value="${id}" ${pk.sub === id ? 'selected' : ''}>${esc(SUBSTANCES[id].formula)}</option>`).join('')}</select>`;
        const unit = kind === 'vapor' ? 'kg' : kind === 'osmo' ? '×10⁵Pa' : 'g';
        const lbl = kind === 'vapor' ? 'fz.addLabel' : kind === 'osmo' ? 'fz.pressLabel' : 'fz.massLabel';
        return `<li class="fz-row fz-row--${kind}"><b>${k + 1}</b>${condCells(sec, k)}${sel}`
          + `<input type="number" inputmode="decimal" step="any" min="0" data-k="${k}" data-f="mass" id="m${k}" value="${esc(pk.mass)}" placeholder="${unit}" aria-label="${esc(t(lbl, { n: k + 1 }))}">`
          + `<span class="fz-cost" id="c${k}">${f1(p.rows[k].cost)} pt</span>`
          + `<span class="fz-meter" id="mt${k}" ${meter ? '' : 'hidden'}>${meter ? barOf(kind, p.rows[k]) : ''}</span></li>`;
      }).join('')}</ol>`
      + `<p class="fz-note">${esc(t(`fz.colHelp.${kind}`))}</p>`
      + (meter ? `<p class="fz-note fz-note--hot">${esc(t('fz.meterNote'))}</p>` : '')
      + `<div class="fz-foot"><button type="button" class="btn btn--primary" data-act="go-night" id="go-btn" ${p.over ? 'disabled' : ''}>${esc(t(p.over ? 'fz.overBudget' : `fz.go.${kind}`))}</button></div>`;
  } else if (phase === 'spread') {
    box.innerHTML = head('') + `<p class="fz-spread__cap">${esc(t(`fz.spread.${kind}`))}</p><ol class="fz-rows" id="spread-rows"></ol>`;
    renderSpreadRows(0);
  } else if (phase === 'night') {
    box.innerHTML = head(`<b class="fz-clock" id="clock">${startHour()}:00</b><button type="button" class="fz-mini" data-act="fast">${esc(t('fz.fast'))}</button>`)
      + `<ol class="fz-rows" id="night-rows"></ol>`;
    renderNightRows(0);
  } else {
    const r = result;
    const fails = r.rows.filter((x) => x.fail).length;
    box.innerHTML = head((fails ? `<button type="button" class="fz-mini fz-mini--hot" data-act="recap">${esc(t('fz.recapBtn'))}</button>` : '')
      + `<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>`)
      + `<div class="fz-sum"><p class="fz-sum__big ${r.all ? 'is-ok' : 'is-ng'}">${esc(t(r.all ? `fz.all.${kind}` : `fz.some.${kind}`, { n: r.safe, total: r.rows.length }))}</p>`
      + (kind === 'mm' ? '' : `<p class="fz-sum__sub">${esc(t('fz.budgetLeft', { left: f1(r.left), budget: r.budget }))}${r.half ? ` ${esc(t('fz.halfLeft'))}` : ''}</p>`)
      + (rewardText ? `<p class="fz-sum__reward">${esc(rewardText)}</p>` : '') + '</div>'
      + `<ul class="fz-diag">${r.rows.map((row, k) => diagLine(row, k)).join('')}</ul>`
      + `<div class="fz-foot"><button type="button" class="btn" data-act="retry">${esc(t('fz.retry'))}</button>`
      + (!r.all && r.safe >= r.rows.length - 1 ? `<p class="fz-note fz-note--hot">${esc(t('fz.passNext'))}</p>` : '')
      + (r.safe >= r.rows.length - 1 && nextNight() ? `<button type="button" class="btn btn--primary" data-act="next">${esc(t('fz.next'))}</button>` : '')
      + `<button type="button" class="btn" data-act="to-title">${esc(t('fz.toTitle'))}</button></div>`;
  }
  updateViewport();
}

function diagLine(row, k) {
  const d = row.diag;
  const kind = night.kind;
  const S = row.sub ? SUBSTANCES[row.sub] : null;
  const C = kind === 'vapor' ? SUBSTANCES[row.csub] : null;
  const vars = {
    n: k + 1, fp: signed(row.value), low: kind === 'boil' || kind === 'vapor' ? '' : signed(row.low), need: d.need !== undefined ? (kind === 'vapor' ? f2(d.need) : f1(d.need)) : '',
    mass: kind === 'vapor' ? f2(row.mass || 0) : f1(row.mass || 0),
    sub: S ? subName(row.sub) : C ? subName(row.csub) : '', f: S ? S.formula : C ? C.formula : '', i: S ? S.i : C ? C.i : 1, wi: d.wrongI || '', r: d.ratio ? (d.ratio < 0.1 ? f2(d.ratio) : f1(d.ratio)) : '',
    read: d.read !== undefined ? signed(d.read) : '', fp0: kind === 'curve' ? signed(row.fp0) : '', min: kind === 'curve' ? signed(row.fp0 - row.sc) : '',
    bp: kind === 'boil' ? fmtBp(row.value) : '', target: kind === 'boil' ? fmtBp(row.target) : '',
    m: kind === 'vapor' ? f2(row.value) : '', max: kind === 'vapor' ? f2(row.mMax) : '',
    p: kind === 'osmo' ? f1(row.mass || 0) : '', pi: kind === 'osmo' ? f2(row.pi) : '', T: row.tc ?? '', TK: row.TK ?? '', c: row.c !== undefined ? f2(row.c) : '',
    M: kind === 'mm' ? f1(d.M) : '', ans: kind === 'mm' ? t('fz.ansFmt', { f: SUBSTANCES[row.ans].formula, n: subName(row.ans), M: SUBSTANCES[row.ans].M }) : '',
    pickM: kind === 'mm' && d.picked ? d.picked : '',
  };
  if (kind === 'osmo') { vars.sub = subName(row.csub); vars.f = SUBSTANCES[row.csub].formula; vars.i = SUBSTANCES[row.csub].i; }
  if (kind === 'mm' && row.sub) { vars.sub = subName(row.sub); vars.f = SUBSTANCES[row.sub].formula; }
  const fam = kind === 'vapor' ? 'dv' : kind === 'boil' ? 'db' : kind === 'osmo' ? 'do' : kind === 'mm' ? 'dm' : 'diag';
  const cls = row.fail ? 'is-frozen' : ['waste', 'forgotIon', 'ignoredResidual', 'noSubtract'].includes(d.kind) ? 'is-waste' : '';
  const bar = kind === 'mm' ? '' : barOf(kind, row);
  return `<li class="${cls}"><b>${k + 1}</b>${esc(t(`fz.${fam}.${d.kind}`, vars))}${bar ? `<span class="fz-meter">${bar}</span>` : ''}</li>`;
}

function nextNight() {
  if (ni + 1 < STAGES[si].nights.length) return [si, ni + 1];
  if (si + 1 < STAGES.length) return [si + 1, 0];
  return null;
}

/** 準備のあいだ：入力が変わったら、費用と予算だけ書き直す（入力欄を作りなおすと、キーボードが閉じるため） */
function refreshPrep() {
  const p = plan(night, cleanPicks());
  p.rows.forEach((r, k) => {
    const el = $(`c${k}`); if (el) el.textContent = `${f1(r.cost)} pt`;
    const mt = $(`mt${k}`); if (mt && meter) mt.innerHTML = barOf(night.kind, r);
  });
  const b = $('budget');
  if (b) {
    b.classList.toggle('is-over', p.over);
    const bs = b.querySelectorAll('b');
    bs[0].textContent = f1(p.used); bs[1].textContent = f1(p.left);
    b.querySelector('i').style.width = `${(Math.min(1, p.used / night.budget) * 100).toFixed(1)}%`;
  }
  const go = $('go-btn');
  if (go) { go.disabled = p.over && night.kind !== 'mm'; go.textContent = t(p.over && night.kind !== 'mm' ? 'fz.overBudget' : `fz.go.${night.kind}`); }
}

/** 3D の札 */
function updateSections(tNight = null) {
  if (!night) return;
  const kind = night.kind;
  const list = night.sections.map((sec, k) => {
    const title = t('fz.secN', { n: k + 1 });
    if (phase === 'prep') {
      if (kind === 'vapor') return { title, big: `≦${f2(sec.mMax)}`, small: `${SUBSTANCES[sec.csub].formula} ${sec.cg} g`, progress: 0 };
      if (kind === 'boil') return { title, big: `${fmtBp(sec.target)}℃`, small: t('fz.waterKg', { w: f1(sec.water) }), progress: 0 };
      if (kind === 'osmo') return { title, big: `${f2(sec.c)} mol/L`, small: `${SUBSTANCES[sec.csub].formula} ${sec.tc}℃`, progress: 0 };
      if (kind === 'mm') return { title: t('fz.sampleN', { n: k + 1 }), big: '?', small: t('fz.unknown'), progress: 0 };
      return { title, big: `${signed(sec.low)}℃`, small: t('fz.waterKg', { w: f1(sec.water) }), progress: 0 };
    }
    const row = (result || judge(night, cleanPicks())).rows[k];
    if (phase === 'spread') {
      const v = spreadValue(row, spreadK(tNight || 0, k));
      if (kind === 'vapor') return { title, big: `${f2(v)}`, small: t('fz.lbl.m'), progress: 0 };
      if (kind === 'boil') return { title, big: `${fmtBp(v)}℃`, small: t('fz.lbl.bp'), progress: 0 };
      return { title, big: `${signed(v)}℃`, small: t('fz.lbl.fp'), safe: v <= row.low + 1e-6 };
    }
    const x = phase === 'night' ? tNight : 1;
    const ns = nightState(kind, row, x);
    if (kind === 'osmo') {
      return { title, big: phase === 'morning' ? t(row.fail ? 'fz.osFail' : 'fz.osOk') : `${f1(row.mass || 0)}×10⁵`, small: phase === 'morning' ? `Π = ${f2(row.pi)}×10⁵ Pa` : t('fz.pressing'), bad: ns.failNow, ok: !row.fail && ns.progress >= 1, progress: ns.progress, fail: row.fail };
    }
    if (kind === 'mm') {
      const S = row.sub ? SUBSTANCES[row.sub] : null;
      return { title: t('fz.sampleN', { n: k + 1 }), big: ns.reveal ? (row.fail ? '✗' : '✓') : '…', small: ns.reveal ? SUBSTANCES[row.ans].formula : (S ? S.formula : '?'), bad: ns.reveal && row.fail, ok: ns.reveal && !row.fail, progress: ns.progress };
    }
    if (kind === 'vapor') {
      const pct = Math.round(ns.progress * 100);
      return { title, big: phase === 'morning' ? t(row.fail ? 'fz.wet' : 'fz.dry') : `${pct}%`, small: `${f2(row.value)} mol/kg`, bad: ns.failNow, ok: !row.fail && ns.progress >= 1, progress: ns.progress };
    }
    if (kind === 'boil') {
      return { title, big: phase === 'morning' ? t(row.fail ? 'fz.notBoil' : 'fz.boiled') : `${fmtBp(ns.shown)}℃`, small: t('fz.bpIs', { bp: fmtBp(row.value) }), bad: ns.failNow, ok: ns.boiling && !row.fail, progress: ns.progress, boiling: ns.boiling };
    }
    if (phase === 'night') return { title, big: `${signed(ns.shown)}℃`, small: t('fz.fpIs', { fp: signed(row.value) }), frozen: ns.failNow, safe: ns.shown >= row.value };
    return { title, big: row.fail ? t('fz.frozen') : t('fz.safe'), small: t('fz.fpIs', { fp: signed(row.value) }), frozen: row.fail, safe: !row.fail };
  });
  scene.setSections(list);
}

function cleanPicks() { return picks.map((x) => ({ sub: x.sub, mass: Number(x.mass) || 0 })); }

function goNight() {
  const p = plan(night, cleanPicks());
  if (p.over && night.kind !== 'mm') return;
  result = judge(night, cleanPicks());
  if (calc) calc.close();
  closeCurve();
  // 撒く・足す物質があれば、まず撒くようすを見せる（粒の数 → 凍る温度が下がる）
  if (['freeze', 'curve', 'boil', 'vapor'].includes(night.kind)) {
    phase = 'spread';
    run = { t0: performance.now(), dur: SPREAD.sec * 1000 };
    scene.spread(spreadList());
    renderPanel();
    updateSections(0);
    return;
  }
  beginNight();
}
function beginNight() {
  run = { t0: performance.now(), dur: NIGHT.durSec * 1000, base: 0 };
  phase = 'night';
  renderPanel();
}

/** 撒く粒（3D）：粒子の物質量に比例した数。電解質は、着地すると i 個の粒に分かれる */
function particlesOf(row) {
  if (night.kind === 'vapor') return 0;
  const S = row.sub ? SUBSTANCES[row.sub] : null;
  return S && row.mass > 0 ? (row.mass / S.M) * S.i : 0;
}
function spreadList() {
  return result.rows.map((row) => {
    if (night.kind === 'vapor') return { drops: Math.min(SPREAD.maxDots, Math.round((row.mass || 0) * SPREAD.dropsPerKg)) };
    const S = row.sub ? SUBSTANCES[row.sub] : null;
    const dots = Math.min(SPREAD.maxDots, Math.round(particlesOf(row) * SPREAD.dotsPerMol));
    return { dots, split: S ? S.i : 1, color: S ? S.color : '#ffffff', ions: S && S.i > 1 };
  });
}
/** 撒く間の進み方（区間ごとに少しずらす） */
function spreadK(x, k) { const u = Math.max(0, Math.min(1, (x - k * 0.08) / 0.7)); return u * u * (3 - 2 * u); }
/** 撒く間の、その区間の値（凍る温度・沸く温度・粒の濃さ） */
function spreadValue(row, e) {
  const kind = night.kind;
  if (kind === 'freeze') return row.value * e;
  if (kind === 'curve') return row.fp0 + (row.value - row.fp0) * e;
  if (kind === 'boil') return 100 + (row.value - 100) * e;
  const S = SUBSTANCES[row.csub];
  return ((row.cg / S.M) * S.i) / (row.water + (row.mass || 0) * e);
}
function renderSpreadRows(x) {
  const box = $('spread-rows');
  if (!box) return;
  const kind = night.kind;
  box.innerHTML = result.rows.map((row, k) => {
    const e = spreadK(x, k);
    const v = spreadValue(row, e);
    let a, bar;
    if (kind === 'vapor') {
      const S = SUBSTANCES[row.csub];
      const m0 = ((row.cg / S.M) * S.i) / row.water;
      a = t('fz.sp.vapor', { w: f2((row.mass || 0) * e), m: f2(v) });
      bar = vaporBar(v, row.mMax, m0);
    } else if (kind === 'boil') {
      a = t('fz.sp.boil', { n: f2(particlesOf(row) * e), bp: fmtBp(v) });
      bar = boilBar(v, row.target);
    } else {
      a = t('fz.sp.freeze', { n: f2(particlesOf(row) * e), fp: signed(v) });
      bar = freezeBar(row, v, row.low);
    }
    return `<li class="fz-row fz-row--spread"><b>${k + 1}</b><span class="fz-sp">${esc(a)}</span><span class="fz-meter">${bar}</span></li>`;
  }).join('');
}

function renderNightRows(x) {
  const box = $('night-rows');
  if (!box) return;
  const kind = night.kind;
  box.innerHTML = result.rows.map((row, k) => {
    const ns = nightState(kind, row, x);
    let a, b, c, bad = ns.failNow, ok = false;
    if (kind === 'osmo') {
      a = `${esc(t('fz.pressShort'))} ${f1(row.mass || 0)}<small>×10⁵Pa</small>`;
      b = `${esc(t('fz.fresh'))} ${row.fail ? '−' : ''}${Math.round(ns.progress * 100)}<small>%</small>`;
      ok = !row.fail && ns.progress >= 1;
      c = t(bad ? 'fz.osBack' : ok ? 'fz.osOk' : 'fz.pressing');
    } else if (kind === 'mm') {
      a = `${esc(t('fz.sampleN', { n: k + 1 }))}`;
      b = row.sub ? `${esc(SUBSTANCES[row.sub].formula)}` : '—';
      ok = ns.reveal && !row.fail;
      c = t(!ns.reveal ? 'fz.testing' : row.fail ? 'fz.mmWrong' : 'fz.mmRight');
    } else if (kind === 'vapor') {
      a = `${esc(t('fz.dryness'))} ${Math.round(ns.progress * 100)}<small>%</small>`;
      b = `${f2(row.value)}<small>/${f2(row.mMax)}</small>`;
      ok = !row.fail && ns.progress >= 1;
      c = t(bad ? 'fz.wet' : ok ? 'fz.dry' : 'fz.drying');
    } else if (kind === 'boil') {
      a = `${esc(t('fz.now'))} ${fmtBp(ns.shown)}<small>℃</small>`;
      b = `${esc(t('fz.bpShort'))} ${fmtBp(row.value)}<small>℃</small>`;
      ok = ns.boiling && !row.fail;
      c = t(bad ? 'fz.notBoil' : ns.boiling ? (row.fail ? 'fz.boilLow' : 'fz.boiled') : 'fz.heating');
    } else {
      a = `${esc(t('fz.now'))} ${signed(ns.shown)}<small>℃</small>`;
      b = `${esc(t('fz.fpShort'))} ${signed(row.value)}<small>℃</small>`;
      c = t(bad ? 'fz.frozen' : 'fz.guarding');
    }
    let bar = '';
    if (kind === 'freeze' || kind === 'curve') bar = freezeBar(row, row.value, row.low, ns.shown);
    else if (kind === 'boil') bar = boilBar(row.value, row.target, ns.shown);
    else if (kind === 'osmo') bar = osmoBar(row.mass || 0, row.pi);
    return `<li class="fz-row fz-row--night${bad ? ' is-frozen' : ' is-safe'}${ok ? ' is-ok' : ''}"><b>${k + 1}</b>`
      + `<span class="fz-v">${a}</span><span class="fz-v">${b}</span><span>${esc(c)}</span>${bar ? `<span class="fz-meter">${bar}</span>` : ''}</li>`;
  }).join('');
}

// ───────────── ステージ3：冷却曲線 ─────────────
function closeCurve() { const m = $('curve'); if (m) m.hidden = true; }
function openCurve(k) {
  const sec = night.sections[k];
  const m = $('curve');
  m.hidden = false;
  m.querySelector('.fz-curve__title').textContent = t('fz.curveTitle', { n: k + 1 });
  m.querySelector('.fz-curve__how').textContent = t('fz.curveHow');
  const cv = m.querySelector('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 330, H = cv.clientHeight || 250;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const c = coolingCurve(sec);
  const L = 42, R = W - 10, T = 12, B = H - 30;
  const yMax = 2.2, yMin = Math.floor((sec.fp0 - sec.sc - 0.8) * 2) / 2;
  const xMax = Math.ceil(c.tEnd);
  const X = (x) => L + ((R - L) * x) / xMax;
  const Y = (y) => B - ((B - T) * (y - yMin)) / (yMax - yMin);
  g.fillStyle = 'rgba(5,8,26,0.9)'; g.fillRect(0, 0, W, H);
  // 目盛り：0.1℃ ごとに細い線、0.5℃ ごとに数字
  for (let y = Math.ceil(yMin * 10) / 10; y <= yMax + 1e-9; y = Math.round((y + 0.1) * 10) / 10) {
    const major = Math.abs(y * 2 - Math.round(y * 2)) < 1e-6;
    g.strokeStyle = major ? 'rgba(143,243,250,0.32)' : 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(R, Y(y)); g.stroke();
    if (major) { g.fillStyle = 'rgba(220,230,255,0.85)'; g.font = '600 10px Chakra Petch, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(y.toFixed(1), L - 4, Y(y)); }
  }
  for (let x = 0; x <= xMax; x += 1) {
    const major = x % 5 === 0;
    g.strokeStyle = major ? 'rgba(143,243,250,0.25)' : 'rgba(255,255,255,0.06)';
    g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), B); g.stroke();
    if (major) { g.fillStyle = 'rgba(220,230,255,0.85)'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(String(x), X(x), B + 4); }
  }
  g.fillStyle = 'rgba(220,230,255,0.85)'; g.textAlign = 'center'; g.textBaseline = 'top'; g.font = '600 10px M PLUS 1p, sans-serif';
  g.fillText(t('fz.curveX'), (L + R) / 2, B + 16);
  g.save(); g.translate(10, (T + B) / 2); g.rotate(-Math.PI / 2); g.fillText(t('fz.curveY'), 0, 0); g.restore();
  g.strokeStyle = '#ffffff'; g.lineWidth = 2.2;
  g.beginPath(); c.pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](X(x), Y(y))); g.stroke();
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
  const firstClear = r.all && !prev.cleared && night.kind !== 'mm';
  const noBonus = ASSIST.meterNoBonus && meterUsed;
  const firstBonus = r.all && r.half && !prev.bonus && night.kind !== 'mm' && !noBonus;
  const pass = r.all || r.safe >= r.rows.length - 1;
  nights[k] = { cleared: prev.cleared || r.all, passed: !!(prev.passed || pass), bonus: prev.bonus || (r.all && r.half && !noBonus), best: Math.max(prev.best || 0, r.safe), at: Date.now() };
  setWorldData(WORLD, { ...d, nights });
  if (r.all) fx.celebrate();
  renderPanel();
  updateSections();
  const lines = [];
  if (night.kind === 'mm') {
    // ステージ7：正しく特定した問題ごとに 150（その問題で初めてのとき）
    const d2 = getWorldData(WORLD);
    const ids = { ...(d2.ids || {}) };
    let total = 0;
    r.rows.forEach((row, q) => { const id = `${night.stage}-${night.night}-${q + 1}`; if (!row.fail && !ids[id]) { ids[id] = Date.now(); total += REWARD.identify; } });
    setWorldData(WORLD, { ...d2, ids });
    if (total > 0) {
      const e = await pay('ledger.item.fzIdentify', { s: night.stage, n: night.night }, total);
      lines.push(e ? t('fz.rewardIdentify', { gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : t('fz.cap'));
    } else if (r.safe > 0) lines.push(t('fz.already'));
    rewardText = lines.join(' ／ ');
    if (phase === 'morning') renderPanel();
    if (!r.all) setTimeout(() => { if (phase === 'morning') openTut('recap'); }, 1400);
    return;
  }
  if (firstClear) {
    const e = await pay('ledger.item.fzNight', { s: night.stage, n: night.night }, REWARD.night);
    lines.push(e ? t('fz.rewardNight', { gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : t('fz.cap'));
  }
  if (firstBonus) {
    const e = await pay('ledger.item.fzBonus', { s: night.stage, n: night.night }, REWARD.bonus);
    lines.push(e ? t('fz.rewardBonus', { gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : t('fz.cap'));
  }
  if (r.all && r.half && noBonus && !prev.bonus) lines.push(t('fz.noBonusMeter'));
  else if (r.all && !firstClear && !firstBonus) lines.push(t('fz.already'));
  rewardText = lines.join(' ／ ');
  if (phase === 'morning') renderPanel();
  // 失敗した区間があれば、少し待ってから「かんたん解説」
  if (!r.all) setTimeout(() => { if (phase === 'morning') openTut('recap'); }, 1400);
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
  if (phase === 'spread' && run && screen === 'play') {
    const x = Math.min(1, (nowMs - run.t0) / run.dur);
    const tick = Math.floor(x * 40);
    if (tick !== lastRowsTick) { lastRowsTick = tick; renderSpreadRows(x); updateSections(x); }
    if (x >= 1) beginNight();
  }
  if (phase === 'night' && run && screen === 'play') {
    const x = Math.min(1, run.base + (nowMs - run.t0) / run.dur);
    scene.setNight(Math.min(1, x / NIGHT.lowAt));
    const hour = (startHour() + x * spanHours()) % 24;
    // 朝が近づくと、地平線のあたりがぼんやり明るくなる
    setDawn(Math.max(0, (x - 0.72) / 0.28));
    const el = $('clock');
    if (el) el.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
    const tick = Math.floor(x * 80);
    if (tick !== lastRowsTick) { lastRowsTick = tick; renderNightRows(x); updateSections(x); }
    if (x >= 1) morning();
  }
  if (phase === 'battle') battle.frame();
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
    else if (act === 'to-title') { phase = 'prep'; run = null; scene.clearSpread(); if (calc) calc.close(); closeTut(); setDawn(0); renderTitle(); show('title'); scene.setNight(0.2); }
    else if (act.startsWith('b-')) battle.onClick(act, b);
    else if (act === 'battle') battle.openBattle(b.dataset.mode);
    else if (act === 'calc') calc.toggle();
    else if (act === 'table') { showTable = !showTable; renderPanel(); }
    else if (act === 'go-night') goNight();
    else if (act === 'meter') { meter = !meter; if (meter) meterUsed = true; renderPanel(); }
    else if (act === 'curve') openCurve(Number(b.dataset.k));
    else if (act === 'tut') openTut('intro');
    else if (act === 'recap') openTut('recap');
    else if (act === 'tut-close') closeTut();
    else if (act === 'tut-next') openTut('recap', (tut.idx + 1) % Math.max(1, failRows().length));
    else if (act === 'tut-step') { tut.shown = Math.max(2, tut.shown + 1); renderTut(); }
    else if (act === 'tut-nextp') { tut.page += 1; tut.shown = 1; tut.demo = demoOf(EXAMPLES[night.stage].kind).start; renderTut(); }
    else if (act === 'tut-prev') { tut.page = Math.max(0, tut.page - 1); tut.shown = tutPages()[tut.page] === 'recipe' ? 1 : 0; renderTut(); }
    else if (act === 'curve-close') closeCurve();
    else if (act === 'fast') {
      if (run && phase === 'night') {
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
    if (el.dataset && el.dataset.bk) { battle.onInput(el); return; }
    if (el.dataset && el.dataset.tut === 'demo') {
      const kind = tutExample().kind;
      tut.demo = Number(el.value);
      $('tut-demo-v').textContent = demoVal(demoOf(kind));
      $('tut-demo-out').innerHTML = demoOut(kind);
      return;
    }
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
    if (screen === 'play') { renderPanel(); updateSections(); if (!$('tut').hidden) renderTut(); }
    if (calc) calc.redraw();
    battle.redraw();
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
  picks = night.sections.map(() => ({ sub: night.substances[0] || null, mass: '' }));
  updateSections();
  setupInput();
  // はじめは、開いているいちばん先の夜を選んでおく
  outer: for (let s = STAGES.length - 1; s >= 0; s--) for (let n = STAGES[s].nights.length - 1; n >= 0; n--) if (nightOpen(s, n)) { si = s; ni = n; break outer; }
  renderTitle();
  show('title');
  battle.initBattle({
    $, toast, show, scene, updateViewport, screen: () => screen, calc: () => calc,
    enterBattle: () => { phase = 'battle'; run = null; closeTut(); closeCurve(); setDawn(0); scene.clearSpread(); show('play'); },
    toTitle: () => { phase = 'prep'; run = null; if (calc) calc.close(); scene.setTheme('freeze'); scene.setNight(0.2); setDawn(0); renderTitle(); show('title'); },
  });
  requestAnimationFrame(loop);

  if (params.has('debug')) {
    if (params.has('fast')) { NIGHT.durSec = 6; WAVE.decideSec = 32; TUG.decideSec = 14; }
    window.__fz = {
      glow: (n) => scene.setGlow(n),
      get phase() { return phase; }, get night() { return night; }, get result() { return result; }, get screen() { return screen; },
      start: (s, n) => startNight(s, n),
      tut: (m) => openTut(m), closeTut: () => closeTut(),
      fill: (list) => { list.forEach((x, k) => { picks[k] = { sub: x.sub, mass: String(x.mass) }; }); renderPanel(); },
      need: (sub, k) => needed(night.kind, night.sections[k], sub),
      go: () => goNight(),
      grant: (n) => grant({ itemKey: 'ledger.item.founding', amount: n }),
      calc: () => calc,
      battle: battle.debug,
    };
  }
}

start();
