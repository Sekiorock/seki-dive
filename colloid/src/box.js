// colloid/src/box.js
// 標本箱：分散系の9マスの表（教科書 p.81 図19）。v0.3。
//   縦が分散質（散らばっている粒）、横が分散媒（まわり）。どちらも 気体・液体・固体。
//   見つけた標本をタップしてから、マスをタップして置く。正しく置くと 20 ヒヤマ（その標本で、はじめてのとき）。
//   9マスが全部うまると 300 ヒヤマ。気体どうしのマスは「コロイドにならない」（空気を置くと分かる）。
//   エーロゾル・乳濁液・懸濁液・分子コロイド・会合コロイドの札は、問いに答えて集める。

import { SPECIMENS, PHASES, FUDA, REWARD } from './config.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FUDA_OF = { aerosol: 'mist', emulsion: 'milk', suspension: 'mud', molecular: 'gelatin', assoc: 'soap' };

let H = null;
let sel = null;          // 選んでいる標本
let quiz = null;         // 札の問い { id, fuda, opts }
let line = '';
let face = 'normal';

export function initBox(hooks) { H = hooks; }

function data() { const d = H.getData(); return { found: d.found || {}, placed: d.placed || {}, fuda: d.fuda || {}, full: d.full || 0 }; }
function save(patch) { H.setData(patch); }

/** 謎を解いたときに見つかる標本（なければ null） */
export function specimenOf(pid) { return Object.keys(SPECIMENS).find((id) => SPECIMENS[id].from === pid) || null; }
/** 謎の記録から、見つけた標本を足す（前の版で解いた人にも） */
export function syncFound(solved) {
  const d = data();
  const found = { ...d.found };
  let add = 0;
  for (const [id, S] of Object.entries(SPECIMENS)) if (solved[S.from] && !found[id]) { found[id] = Date.now(); add++; }
  if (add) save({ found });
  return add;
}
/** 標本を見つけた（はじめてなら true） */
export function find(id) {
  const d = data();
  if (d.found[id]) return false;
  save({ found: { ...d.found, [id]: Date.now() } });
  return true;
}
/** うまったマスの数（0〜9） */
export function filled() {
  const d = data();
  const cells = new Set();
  for (const id of Object.keys(d.placed)) { const S = SPECIMENS[id]; if (S && S.phase) cells.add(S.phase.join('/')); }
  return cells.size;
}
export function newCount() {
  const d = data();
  return Object.keys(d.found).filter((id) => !d.placed[id] && !(SPECIMENS[id] && !SPECIMENS[id].phase && d.fuda[SPECIMENS[id].fuda])).length;
}

export function openBox() {
  sel = null; quiz = null; face = 'normal';
  line = H.t('cl.box.say0');
  render();
}
export function closeBox() { const m = H.$('box'); if (m) m.hidden = true; }

function render() {
  const m = H.$('box');
  m.hidden = false;
  const d = data();
  const t = H.t;
  const head = `<div class="cl-tut__bar"><b>${esc(t('cl.box.title'))}</b><span class="cl-box__count">${filled()} / 9</span>`
    + `<button type="button" class="cl-mini" data-act="box-close" aria-label="${esc(t('cl.close'))}">×</button></div>`;
  // 9マス
  const cellOf = (q, md) => Object.keys(d.placed).filter((id) => SPECIMENS[id].phase && SPECIMENS[id].phase[0] === q && SPECIMENS[id].phase[1] === md);
  let grid = `<div class="cl-grid"><i class="cl-grid__corner"><span>${esc(t('cl.box.medium'))} →</span><span>${esc(t('cl.box.dispersed'))} ↓</span></i>`;
  grid += PHASES.map((md) => `<b class="cl-grid__head">${esc(t(`cl.phase.${md}`))}</b>`).join('');
  for (const q of PHASES) {
    grid += `<b class="cl-grid__head is-row">${esc(t(`cl.phase.${q}`))}</b>`;
    for (const md of PHASES) {
      const ids = cellOf(q, md);
      const none = q === 'gas' && md === 'gas';
      const on = ids.length > 0;
      grid += `<button type="button" class="cl-cell${on ? ' is-on' : ''}${none && on ? ' is-none' : ''}${sel ? ' is-target' : ''}" data-act="box-cell" data-q="${q}" data-m="${md}">`
        + (on ? `<span class="cl-cell__icons">${ids.map((id) => SPECIMENS[id].icon).join('')}</span><small>${esc(none ? t('cl.box.none') : t(`cl.cell.${q}.${md}`))}</small>` : '<span class="cl-cell__q">?</span>')
        + '</button>';
    }
  }
  grid += '</div>';
  // 手持ちの標本
  const tray = Object.keys(SPECIMENS).filter((id) => d.found[id] && !d.placed[id] && !(!SPECIMENS[id].phase && d.fuda[SPECIMENS[id].fuda]));
  const trayHtml = tray.length
    ? `<div class="cl-tray">${tray.map((id) => `<button type="button" class="cl-spec${sel === id ? ' is-sel' : ''}${SPECIMENS[id].phase ? '' : ' is-fuda'}" data-act="box-pick" data-id="${id}"><span>${SPECIMENS[id].icon}</span>${esc(t(`cl.sp.${id}`))}${SPECIMENS[id].phase ? '' : `<em>${esc(t('cl.box.fudaMark'))}</em>`}</button>`).join('')}</div>`
    : `<p class="cl-hint">${esc(t(Object.keys(d.found).length ? 'cl.box.allPlaced' : 'cl.box.noneYet'))}</p>`;
  const fuda = `<div class="cl-fudas">${FUDA.map((f) => `<span class="cl-fuda${d.fuda[f] ? ' is-on' : ''}">${d.fuda[f] ? esc(t(`cl.fuda.${f}`)) : '？'}</span>`).join('')}</div>`;
  let quizHtml = '';
  if (quiz) {
    quizHtml = `<div class="cl-quiz"><p>${esc(t(`cl.fq.${quiz.fuda}`))}</p><div class="cl-opts">${quiz.opts.map((f) => `<button type="button" class="cl-opt" data-act="box-fuda" data-f="${f}">${esc(t(`cl.fuda.${f}`))}</button>`).join('')}</div></div>`;
  }
  const lost = Object.keys(SPECIMENS).length - Object.keys(d.found).length;
  m.innerHTML = `<div class="cl-tut__card cl-box">${head}${H.guideBox(line, face)}${quizHtml}${grid}`
    + `<p class="cl-sub">${esc(t('cl.box.tray'))}</p>${trayHtml}`
    + `<p class="cl-sub">${esc(t('cl.box.fudaHead'))}</p>${fuda}`
    + `<p class="cl-hint">${esc(t('cl.box.howto', { n: lost }))}</p>`
    + `<div class="cl-foot"><button type="button" class="btn btn--primary" data-act="box-close">${esc(t('cl.close'))}</button></div></div>`;
}

function startQuiz(id) {
  const f = SPECIMENS[id].fuda;
  const others = FUDA.filter((x) => x !== f).sort(() => Math.random() - 0.5).slice(0, 2);
  quiz = { id, fuda: f, opts: [f, ...others].sort(() => Math.random() - 0.5) };
}

async function place(q, md) {
  const t = H.t;
  const id = sel;
  const S = SPECIMENS[id];
  if (!S.phase) { line = t('cl.box.fudaOnly'); face = 'normal'; render(); return; }
  if (S.phase[0] === q && S.phase[1] === md) {
    const d = data();
    const before = filled();
    save({ placed: { ...d.placed, [id]: Date.now() } });
    sel = null;
    H.correct();
    line = t(`cl.sp.ok.${id}`);
    face = 'smile';
    if (S.fuda && !data().fuda[S.fuda]) startQuiz(id);
    render();
    const lines = [];
    const e = await H.pay('ledger.item.clPlace', { name: t(`cl.sp.${id}`) }, REWARD.place);
    if (e) lines.push(t('cl.box.reward', { net: H.fmt(e.amount) }));
    if (before < 9 && filled() === 9 && !data().full) {
      save({ full: Date.now() });
      const e2 = await H.pay('ledger.item.clFull', {}, REWARD.full);
      H.big(t('cl.box.fullBig'), 'COMPLETE');
      lines.push(t('cl.box.full', { net: e2 ? H.fmt(e2.amount) : '0' }));
    }
    if (lines.length) { line = `${line}　${lines.join(' ／ ')}`; render(); }
    H.refresh();
    return;
  }
  H.wrong();
  line = t(`cl.sp.why.${id}`);
  face = 'surprise';
  render();
}

export function onClick(act, el) {
  if (!act.startsWith('box')) return false;
  const t = H.t;
  if (act === 'box') openBox();
  else if (act === 'box-close') { closeBox(); H.refresh(); }
  else if (act === 'box-pick') {
    const id = el.dataset.id;
    sel = sel === id ? null : id;
    face = 'normal';
    if (sel && !SPECIMENS[sel].phase) { startQuiz(sel); line = t(`cl.sp.ok.${sel}`); sel = null; }
    else line = sel ? t('cl.box.picked', { name: t(`cl.sp.${sel}`) }) : t('cl.box.say0');
    H.tap();
    render();
  } else if (act === 'box-cell') {
    if (!sel) { line = t('cl.box.pickFirst'); face = 'normal'; render(); return true; }
    place(el.dataset.q, el.dataset.m);
  } else if (act === 'box-fuda') {
    if (!quiz) return true;
    if (el.dataset.f === quiz.fuda) {
      const d = data();
      save({ fuda: { ...d.fuda, [quiz.fuda]: Date.now() } });
      H.correct();
      line = t(`cl.fok.${quiz.fuda}`);
      face = 'smile';
      quiz = null;
    } else {
      H.wrong();
      line = t('cl.box.fudaNg', { name: t(`cl.fuda.${el.dataset.f}`) });
      face = 'surprise';
    }
    render();
    H.refresh();
  }
  return true;
}
export function redraw() { const m = H.$('box'); if (m && !m.hidden) render(); }
export const boxDebug = { data, filled, FUDA_OF };
