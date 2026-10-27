// freeze/src/main.js
// ③ フリーズ・ガード：画面の切り替えと1夜の進行（全体の仕様書 9章）。
// v0.2：ステージ3（冷却曲線から凝固点を読む）、4（蒸気圧降下：真水で薄めて乾かす）、5（沸点上昇：釜の湯を煮立たせる）。
// v0.1：1夜の流れ（準備 → 夜 → 朝）と、ステージ1（凍結の峠：非電解質）・ステージ2（電解質の峠：電離で粒子が増える）。
//   準備：6つの区間ごとに、撒く物質と質量を決める（予算の中で）。凝固点は自分で計算する（電卓あり）。
//   夜：約40秒の早回し。区間の気温がその区間の溶液の凝固点を下回ると、路面が凍る。
//   朝：守れた区間の数と残った予算で評価。凍った区間・むだの多い区間に、どこで計算がずれたかの解説。
//   報酬：1夜を守り切ると 60 ヒヤマ、予算を半分以上残すと追加 40 ヒヤマ（どちらも、その夜で初めてのときだけ）。

import { VERSION, SUBSTANCES, STAGES, LOCKED_STAGES, NIGHT, REWARD, CONST } from './config.js';
import { nightOf, plan, judge, nightState, needed, coolingCurve } from './model.js';
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
  if (!keepPicks || picks.length !== night.sections.length) picks = night.sections.map(() => ({ sub: night.substances[0] || null, mass: '' }));
  phase = 'prep';
  run = null; result = null; rewardText = '';
  scene.setTheme(night.kind);
  scene.setNight(0.2);
  closeCurve();
  show('play');
  renderPanel();
  updateSections();
}

function subName(id) { return t(`fz.sub.${id}`); }
const fmtBp = (v) => `${(Math.round(v * 100) / 100).toFixed(2)}`;
const isFreezing = () => night.kind === 'freeze' || night.kind === 'curve';

/** 準備の行の、区間の条件の部分（kind ごと） */
function condCells(sec, k) {
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
    const tableBtn = kind === 'vapor' ? '' : `<button type="button" class="fz-mini" data-act="table">${esc(t('fz.table'))}</button>`;
    const table = kind === 'vapor'
      ? `<div class="fz-table">${['NaCl', 'CaCl2', 'urea', 'glucose'].map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span>${S.M} g/mol</span><span>${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>`
      : `<div class="fz-table">${subs.map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${esc(subName(id))}</span><span>${S.M} g/mol</span><span>${S.price} pt/mol　${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>`;
    box.innerHTML = head(tableBtn
      + `<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>`
      + `<button type="button" class="fz-mini" data-act="to-title">${esc(t('fz.toTitle'))}</button>`)
      + `<div class="fz-budget${p.over ? ' is-over' : ''}" id="budget"><span>${esc(t('fz.used'))} <b>${f1(p.used)}</b> / ${night.budget} pt</span>`
      + `<span>${esc(t('fz.left'))} <b>${f1(p.left)}</b> pt</span><span class="fz-budget__bar"><i style="width:${(ratio * 100).toFixed(1)}%"></i></span></div>`
      + `<p class="fz-hint">${esc(t(`fz.hint${night.stage}`, { kf: CONST.Kf, kb: CONST.Kb, wp: CONST.waterPrice }))}</p>`
      + (showTable || kind === 'vapor' ? table : '')
      + `<ol class="fz-rows fz-rows--${kind}">${night.sections.map((sec, k) => {
        const pk = picks[k];
        const sel = kind === 'vapor' ? ''
          : `<select data-k="${k}" data-f="sub" aria-label="${esc(t('fz.subLabel'))}">${subs.map((id) => `<option value="${id}" ${pk.sub === id ? 'selected' : ''}>${esc(SUBSTANCES[id].formula)}</option>`).join('')}</select>`;
        const unit = kind === 'vapor' ? 'kg' : 'g';
        return `<li class="fz-row fz-row--${kind}"><b>${k + 1}</b>${condCells(sec, k)}${sel}`
          + `<input type="number" inputmode="decimal" step="any" min="0" data-k="${k}" data-f="mass" id="m${k}" value="${esc(pk.mass)}" placeholder="${unit}" aria-label="${esc(t(kind === 'vapor' ? 'fz.addLabel' : 'fz.massLabel', { n: k + 1 }))}">`
          + `<span class="fz-cost" id="c${k}">${f1(p.rows[k].cost)} pt</span></li>`;
      }).join('')}</ol>`
      + `<p class="fz-note">${esc(t(`fz.colHelp.${kind}`))}</p>`
      + `<div class="fz-foot"><button type="button" class="btn btn--primary" data-act="go-night" id="go-btn" ${p.over ? 'disabled' : ''}>${esc(t(p.over ? 'fz.overBudget' : `fz.go.${kind}`))}</button></div>`;
  } else if (phase === 'night') {
    box.innerHTML = head(`<b class="fz-clock" id="clock">${kind === 'boil' ? '16:00' : kind === 'vapor' ? '18:00' : '22:00'}</b><button type="button" class="fz-mini" data-act="fast">${esc(t('fz.fast'))}</button>`)
      + `<ol class="fz-rows" id="night-rows"></ol>`;
    renderNightRows(0);
  } else {
    const r = result;
    box.innerHTML = head(`<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>`)
      + `<div class="fz-sum"><p class="fz-sum__big ${r.all ? 'is-ok' : 'is-ng'}">${esc(t(r.all ? `fz.all.${kind}` : `fz.some.${kind}`, { n: r.safe, total: r.rows.length }))}</p>`
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
  const kind = night.kind;
  const S = row.sub ? SUBSTANCES[row.sub] : null;
  const C = kind === 'vapor' ? SUBSTANCES[row.csub] : null;
  const vars = {
    n: k + 1, fp: signed(row.value), low: kind === 'boil' || kind === 'vapor' ? '' : signed(row.low), need: d.need !== undefined ? (kind === 'vapor' ? f2(d.need) : f1(d.need)) : '',
    mass: kind === 'vapor' ? f2(row.mass || 0) : f1(row.mass || 0),
    sub: S ? subName(row.sub) : C ? subName(row.csub) : '', f: S ? S.formula : C ? C.formula : '', i: S ? S.i : C ? C.i : 1, wi: d.wrongI || '', r: d.ratio ? f1(d.ratio) : '',
    read: d.read !== undefined ? signed(d.read) : '', fp0: kind === 'curve' ? signed(row.fp0) : '', min: kind === 'curve' ? signed(row.fp0 - row.sc) : '',
    bp: kind === 'boil' ? fmtBp(row.value) : '', target: kind === 'boil' ? fmtBp(row.target) : '',
    m: kind === 'vapor' ? f2(row.value) : '', max: kind === 'vapor' ? f2(row.mMax) : '',
  };
  const fam = kind === 'vapor' ? 'dv' : kind === 'boil' ? 'db' : 'diag';
  const cls = row.fail ? 'is-frozen' : ['waste', 'forgotIon', 'ignoredResidual', 'noSubtract'].includes(d.kind) ? 'is-waste' : '';
  return `<li class="${cls}"><b>${k + 1}</b>${esc(t(`fz.${fam}.${d.kind}`, vars))}</li>`;
}

function nextNight() {
  if (ni + 1 < STAGES[si].nights.length) return [si, ni + 1];
  if (si + 1 < STAGES.length) return [si + 1, 0];
  return null;
}

/** 準備のあいだ：入力が変わったら、費用と予算だけ書き直す（入力欄を作りなおすと、キーボードが閉じるため） */
function refreshPrep() {
  const p = plan(night, cleanPicks());
  p.rows.forEach((r, k) => { const el = $(`c${k}`); if (el) el.textContent = `${f1(r.cost)} pt`; });
  const b = $('budget');
  if (b) {
    b.classList.toggle('is-over', p.over);
    const bs = b.querySelectorAll('b');
    bs[0].textContent = f1(p.used); bs[1].textContent = f1(p.left);
    b.querySelector('i').style.width = `${(Math.min(1, p.used / night.budget) * 100).toFixed(1)}%`;
  }
  const go = $('go-btn');
  if (go) { go.disabled = p.over; go.textContent = t(p.over ? 'fz.overBudget' : `fz.go.${night.kind}`); }
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
      return { title, big: `${signed(sec.low)}℃`, small: t('fz.waterKg', { w: f1(sec.water) }), progress: 0 };
    }
    const row = (result || judge(night, cleanPicks())).rows[k];
    const x = phase === 'night' ? tNight : 1;
    const ns = nightState(kind, row, x);
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
  if (p.over) return;
  result = judge(night, cleanPicks());
  run = { t0: performance.now(), dur: NIGHT.durSec * 1000, base: 0 };
  phase = 'night';
  if (calc) calc.close();
  closeCurve();
  renderPanel();
}

function renderNightRows(x) {
  const box = $('night-rows');
  if (!box) return;
  const kind = night.kind;
  box.innerHTML = result.rows.map((row, k) => {
    const ns = nightState(kind, row, x);
    let a, b, c, bad = ns.failNow, ok = false;
    if (kind === 'vapor') {
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
    return `<li class="fz-row fz-row--night${bad ? ' is-frozen' : ' is-safe'}${ok ? ' is-ok' : ''}"><b>${k + 1}</b>`
      + `<span class="fz-v">${a}</span><span class="fz-v">${b}</span><span>${esc(c)}</span></li>`;
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
    const startH = night.kind === 'boil' ? 16 : night.kind === 'vapor' ? 18 : NIGHT.startHour;
    const hour = (startH + x * (night.kind === 'boil' ? 3 : night.kind === 'vapor' ? 12 : NIGHT.hours)) % 24;
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
    else if (act === 'curve') openCurve(Number(b.dataset.k));
    else if (act === 'curve-close') closeCurve();
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
  picks = night.sections.map(() => ({ sub: night.substances[0] || null, mass: '' }));
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
      need: (sub, k) => needed(night.kind, night.sections[k], sub),
      go: () => goNight(),
      grant: (n) => grant({ itemKey: 'ledger.item.founding', amount: n }),
      calc: () => calc,
    };
  }
}

start();
