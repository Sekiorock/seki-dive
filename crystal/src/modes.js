// crystal/src/modes.js
// 注文モードと精製モード（全体の仕様書 8章、crystal v0.3）。
//   注文：カリンの注文を読み、予想を数値で入れて決めてから「実験する」。実験台が自動で動き（温度を下げる、
//         水を蒸発させる、圧力を上げる など）、結果の数値と予想の差で報酬が決まる（ORDER.rewards）。
//         前より近い予想を出したときは、差額を受け取れる。24段階。前の注文に挑戦すると、次が開く。
//   精製：KNO₃ と CuSO₄·5H₂O の混合物を、① 溶かす → ② 冷やす → ③ ろ過して冷水で洗う → ④ 乾かす。
//         取り出した KNO₃ の質量と純度が目標を超えれば達成（はじめての達成で REFINE.reward）。

import { faceFig, say } from '../../shared/characters.js';
import { ORDER, REFINE, GLOW, LOUPE_MUL } from './config.js';
import * as ox from './orderex.js';
import { trayHtml, trayClick, consumeArmed, settleLever, hasKey, keyNeedText, KEY_FROM } from '../../shared/items.js';
import { ORDERS, buildState, rankOf } from './orders.js';
import { defineMix, mixEq, filter, wash, dry } from './refine.js';
import { curvePoint, solubility } from './solubility.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const pad2 = (n) => String(n).padStart(2, '0');

export function createModes(ctx) {
  const { $, t, esc, scene, faceUrl, guide } = ctx;
  ox.initOrderEx({ $, t, esc, toast: ctx.toast });

  let kind = null;            // 'order' | 'refine' | null
  const armedCr = { lev: null, boost: {} };   // v1.2：持ち物の欄（レバレッジ券・目盛り拡大鏡）
  let usedCr = null;                         // その注文で使った券
  // ── 注文 ──
  let oi = 0;                 // いまの注文の番号（0〜23）
  let phase = 'predict';      // 'predict' | 'ready' | 'run' | 'result'
  let guess = null;
  let run = null;             // { t0, st0 }
  let outcome = null;         // { value, rank, rewardText }
  // ── 精製 ──
  let li = 0;
  let rf = null;              // { step, water, heat, cool, ww, cake, res, rewardText }

  const data = () => ctx.getData();
  const ordersRec = () => data().orders || {};
  const refineRec = () => data().refine || {};

  // ───────────── 一覧 ─────────────
  function orderUnlocked(i) { return i === 0 || !!ordersRec()[ORDERS[i - 1].id]; }
  function levelUnlocked(i) { return i === 0 || !!refineRec()[i]; }
  const stars = (rank) => (rank === undefined ? '' : '★'.repeat(3 - rank) + '☆'.repeat(rank));

  function renderMenu(which) {
    kind = null;
    if (which === 'order') {
      $('menu-title').textContent = t('cr.orders.title');
      $('menu-lead').textContent = t('cr.orders.lead', { r0: ORDER.rewards[0], r1: ORDER.rewards[1], r2: ORDER.rewards[2] });
      const rec = ordersRec();
      $('menu-list').innerHTML = ORDERS.map((o, i) => {
        const r = rec[o.id];
        const open = orderUnlocked(i);
        return `<button type="button" class="cr-mcard${open ? '' : ' is-locked'}${r ? ' is-done' : ''}" data-act="order-open" data-i="${i}" ${open ? '' : 'disabled'}>`
          + `<b>${pad2(i + 1)}</b><span class="cr-tag cr-tag--${o.type}">${esc(t(`cr.order.type.${o.type}`))}</span>`
          + `<em>${r ? stars(r.rank) : open ? (i >= (KEY_FROM - 1) * GLOW.perOrders && !hasKey('crystal') ? '<span class="key-lock">🔑</span>' : '') : '🔒'}</em></button>`;
      }).join('');
    } else {
      $('menu-title').textContent = t('cr.refine.title');
      $('menu-lead').textContent = t('cr.refine.lead', { r: REFINE.reward });
      const rec = refineRec();
      $('menu-list').innerHTML = REFINE.levels.map((L, i) => {
        const open = levelUnlocked(i);
        return `<button type="button" class="cr-mcard cr-mcard--wide${open ? '' : ' is-locked'}${rec[i + 1] ? ' is-done' : ''}" data-act="refine-open" data-i="${i}" ${open ? '' : 'disabled'}>`
          + `<b>${esc(t('cr.refine.level', { n: i + 1 }))}</b>`
          + `<span>${esc(t('cr.refine.mix', { k: L.kno3, c: L.cuh }))}<br>${esc(t('cr.refine.target', { m: L.mass, p: L.purity }))}</span>`
          + `<em>${rec[i + 1] ? esc(t((rec[i + 1].grade ?? 0) === 0 ? 'cr.refine.cleared' : 'cr.refine.nearDone')) : open ? '' : '🔒'}</em></button>`;
      }).join('');
    }
    $('menu-list').dataset.kind = which;
  }

  // ───────────── 注文 ─────────────
  const order = () => ORDERS[oi];
  function fmt(v, o = order()) { return (Math.round(v * 10 ** o.digits) / 10 ** o.digits).toFixed(o.digits); }

  function showOrderState(st) {
    const o = order();
    if (o.bench === 'gas') scene.setState('gas', st, ctx.gasUnit(st.gas));
    else scene.setState(o.bench, st);
  }
  function readout(st, live) {
    const o = order();
    if (!live) { $('readout').hidden = true; return; }
    $('readout').hidden = false;
    if (o.bench === 'solid') ctx.readout.solid(st);
    else if (o.bench === 'gas') ctx.readout.gas(st, ctx.gasUnit(st.gas));
    else ctx.readout.conc(st);
  }

  function openOrder(i) {
    // v1.2：ステージ4（注文10）から先は、ロック物販の通行手形が必要
    if (i >= (KEY_FROM - 1) * GLOW.perOrders && !hasKey('crystal')) { ctx.toast(keyNeedText(t, 'crystal')); return; }
    // v1.0：注文が進むほど、景色が豪華に
    if (ctx.glow) ctx.glow(Math.min(8, 1 + Math.floor(i / GLOW.perOrders)));
    kind = 'order';
    oi = i;
    phase = 'predict';
    guess = null; run = null; outcome = null;
    const o = order();
    scene.setBench(o.bench);
    const st0 = buildState(o.bench, o.start);
    showOrderState(st0);
    ctx.enterLab('order');
    readout(st0, false);
    renderOrder();
    // v1.1：はじめて開いた注文では、問題のアニメを自動で見せる
    const seen = data().exSeen || {};
    if (!seen[o.id]) {
      ctx.setData({ ...data(), exSeen: { ...seen, [o.id]: Date.now() } });
      ox.openEx(o, 'ex');
    } else ox.closeEx();
  }

  function renderOrder() {
    const o = order();
    const rec = ordersRec()[o.id];
    const q = t(`cr.o.${o.id}.q`, o.vars());
    let body = '';
    if (phase === 'predict') {
      body = trayHtml(t, armedCr, { boosts: ['loupe.cr'], act: 'cr-tray' }) + `<div class="cr-guess"><label for="og">${esc(t('cr.order.guess'))}</label>`
        + `<input id="og" type="number" inputmode="decimal" step="any" enterkeyhint="done" autocomplete="off" value="${guess ?? ''}">`
        + `<span class="cr-guess__unit">${esc(o.unit)}</span>`
        + `<button type="button" class="btn btn--primary" data-act="order-decide">${esc(t('cr.order.decide'))}</button></div>`;
    } else if (phase === 'ready' || phase === 'run') {
      body = `<p class="cr-guess__locked">${esc(t('cr.order.locked2', { g: guess, u: o.unit }))}</p>`
        + `<button type="button" class="btn btn--primary cr-run" data-act="order-run" ${phase === 'run' ? 'disabled' : ''}>${esc(t(phase === 'run' ? 'cr.order.running' : 'cr.order.run'))}</button>`;
    } else {
      const d = Math.abs(guess - Number(fmt(outcome.value)));
      body = `<div class="cr-result is-r${outcome.rank}">`
        + `<p class="cr-result__rank">${esc(t(`cr.order.rank${outcome.rank}`))} <span>${stars(outcome.rank)}</span></p>`
        + `<dl><div><dt>${esc(t('cr.order.guess'))}</dt><dd>${esc(guess)}<small>${esc(o.unit)}</small></dd></div>`
        + `<div><dt>${esc(t('cr.order.result'))}</dt><dd>${fmt(outcome.value)}<small>${esc(o.unit)}</small></dd></div>`
        + `<div><dt>${esc(t('cr.order.diff'))}</dt><dd>${fmt(d)}<small>${esc(o.unit)}</small></dd></div></dl>`
        + `<p class="cr-result__reward">${esc(outcome.rewardText || t('cr.discover.pending'))}</p>`
        + `<details class="cr-how" ${outcome.rank > 0 ? 'open' : ''}><summary>${esc(t('cr.order.how'))}</summary><p>${esc(t(`cr.o.${o.id}.how`, o.how(outcome.value)))}</p></details></div>`
        + `<div class="cr-mpanel__foot"><button type="button" class="btn btn--small" data-act="order-retry">${esc(t('cr.order.retry'))}</button>`
        + (oi < ORDERS.length - 1 ? `<button type="button" class="btn btn--small btn--primary" data-act="order-next">${esc(t('cr.order.next'))}</button>` : '')
        + '</div>';
    }
    $('order-panel').innerHTML = `<div class="cr-mpanel__head"><b>${esc(t('cr.order.no', { n: pad2(oi + 1) }))}</b>`
      + `<span class="cr-tag cr-tag--${o.type}">${esc(t(`cr.order.type.${o.type}`))}</span>`
      + `${rec ? `<em>${esc(t('cr.order.stars', { s: stars(rec.rank) }))}</em>` : ''}`
      + `<button type="button" class="cr-fold calc-btn" data-act="calc">${esc(t('calc.open'))}</button><button type="button" class="cr-fold" data-act="order-list">${esc(t('cr.order.list'))}</button></div>`
      + `<div class="cr-order">${faceFig(t, guide, { size: 44 })}<p>${esc(say(t, guide, q))}</p></div>`
      // v1.1：問題のアニメとヒントは、いつでも開ける
      + `<div class="cr-oxbtns"><button type="button" class="btn btn--small" data-act="order-ex">▶ ${esc(t('cr.ex.open'))}</button>`
      + `<button type="button" class="btn btn--small cr-hintbtn" data-act="order-hint">💡 ${esc(t('cr.ex.hint'))}</button></div>${body}`;
    ctx.updateViewport();
  }

  function decide() {
    const el = $('og');
    const v = el ? Number(String(el.value).replace(',', '.')) : NaN;
    if (!el || el.value === '' || !Number.isFinite(v)) { ctx.toast(t('cr.order.invalid')); return; }
    guess = v;
    phase = 'ready';
    renderOrder();
  }

  function startRun() {
    ox.closeEx();
    usedCr = consumeArmed(armedCr);
    const o = order();
    phase = 'run';
    run = { t0: performance.now(), st0: buildState(o.bench, o.start) };
    renderOrder();
  }

  async function finishRun() {
    const o = order();
    const st = buildState(o.bench, { ...o.start, [o.anim.key]: o.anim.to });
    showOrderState(st);
    readout(st, true);
    const value = o.result(st, run.st0);
    const rank = rankOf(o, guess, value, usedCr && usedCr.boost['loupe.cr'] ? LOUPE_MUL : 1);
    outcome = { value, rank, rewardText: '' };
    phase = 'result';
    run = null;
    // 記録と報酬：前より良いランクのときだけ、差額を払う
    const d = data();
    const recs = { ...(d.orders || {}) };
    const prev = recs[o.id];
    const prevPaid = prev ? prev.paid || 0 : 0;
    const gross = ORDER.rewards[rank] - prevPaid;
    recs[o.id] = { rank: prev ? Math.min(prev.rank, rank) : rank, paid: Math.max(prevPaid, ORDER.rewards[rank]), at: Date.now() };
    ctx.setData({ ...d, orders: recs });
    if (rank === 0) ctx.celebrate();
    renderOrder();
    if (gross > 0) {
      const entry = await ctx.pay('ledger.item.crOrder', { n: pad2(oi + 1) }, gross);
      outcome.rewardText = entry
        ? t(prevPaid > 0 ? 'cr.order.rewardUp' : 'cr.order.reward', { gross: ctx.money(entry.gross), net: ctx.money(entry.amount) })
        : t('cr.order.cap');
    } else outcome.rewardText = t('cr.order.noReward');
    // v1.2：レバレッジ券の精算（「おしい」以上ならクリア）
    if (usedCr && usedCr.lev) {
      const lt = await settleLever(t, { mult: usedCr.mult, base: ORDER.rewards[0], clear: rank <= 1, label: `#${pad2(oi + 1)}` });
      if (lt) { outcome.rewardText = `${outcome.rewardText} ／ ${lt}`; ctx.toast(lt); }
    }
    usedCr = null;
    if (kind === 'order' && phase === 'result') renderOrder();
  }

  // ───────────── 精製 ─────────────
  const level = () => REFINE.levels[li];
  function refState() {
    const L = level();
    const total = defineMix(L);
    if (rf.step === 'wash' || rf.step === 'result') {
      const c = rf.cake;
      const eq = {
        water: 1e-4, addedWater: 0, dissolved: 0, solution: 0, crystal: c.k + c.c, state: 'saturated',
        parts: [{ id: 'KNO3', crystal: c.k, dissolved: 0, S: solubility('KNO3', REFINE.washTemp) }, { id: 'CuSO4', crystal: c.c, dissolved: 0, S: solubility('CuSO4', REFINE.washTemp) }],
      };
      return { solute: 'REF', mass: total, water: rf.water, temp: REFINE.washTemp, eq, point: curvePoint('REF', total, rf.water) };
    }
    const T = rf.step === 'dissolve' ? rf.heat : rf.cool;
    return { solute: 'REF', mass: total, water: rf.water, temp: T, eq: mixEq(L, rf.water, T), point: curvePoint('REF', total, rf.water) };
  }

  function openRefine(i) {
    kind = 'refine';
    li = i;
    rf = { step: 'dissolve', water: 100, heat: 60, cool: 20, ww: REFINE.wash.start, cake: null, res: null, rewardText: '' };
    scene.setBench('solid');
    ctx.enterLab('refine');
    $('readout').hidden = false;
    renderRefine();
  }

  const slider = (k, label, min, max, step, v, unit) => `<label class="cr-slider"><span><b>${esc(label)}</b><output>${v} ${unit}</output></span>`
    + `<input type="range" data-rk="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  const cellG = (label, v, unit = 'g', hot = false) => `<div class="cr-cell${hot ? ' is-hot' : ''}"><dt>${esc(label)}</dt><dd>${v}<small>${unit}</small></dd></div>`;

  function renderRefine() {
    const L = level();
    const st = refState();
    scene.setState('solid', st);
    const e = st.eq;
    const k = e.parts.find((p) => p.id === 'KNO3'), c = e.parts.find((p) => p.id === 'CuSO4');
    let read = '', ctl = '', warn = '';
    const steps = ['dissolve', 'cool', 'wash', 'result'];
    const stepNames = { dissolve: 'cr.refine.step.dissolve', cool: 'cr.refine.step.cool', wash: 'cr.refine.step.wash', result: 'cr.refine.step.dry' };
    const bar = `<ol class="cr-steps">${steps.map((s) => `<li class="${s === rf.step ? 'is-on' : steps.indexOf(s) < steps.indexOf(rf.step) ? 'is-done' : ''}">${esc(t(stepNames[s]))}</li>`).join('')}</ol>`;
    if (rf.step === 'dissolve') {
      read = `${cellG(t('cr.r.water'), e.water.toFixed(1))}${cellG(t('cr.r.dissolved'), e.dissolved.toFixed(1))}${cellG(t('cr.r.crystal'), e.crystal.toFixed(1), 'g', e.crystal > 0.01)}`;
      const ok = e.crystal < 0.01;
      ctl = slider('water', t('cr.refine.water'), 50, 300, 10, rf.water, 'g') + slider('heat', t('cr.refine.heat'), 20, 80, 1, rf.heat, '℃')
        + (ok ? '' : `<p class="cr-warn">${esc(t('cr.refine.undissolved'))}</p>`)
        + `<div class="cr-mpanel__foot"><button type="button" class="btn btn--small btn--primary" data-act="rf-cool" ${ok ? '' : 'disabled'}>${esc(t('cr.refine.toCool'))}</button></div>`;
    } else if (rf.step === 'cool') {
      read = `${cellG(t('cr.refine.r.k'), k.crystal.toFixed(1))}${cellG(t('cr.refine.r.c'), c.crystal.toFixed(1), 'g', c.crystal > 0.01)}${cellG(t('cr.r.water'), e.water.toFixed(1))}`;
      warn = c.crystal > 0.01 ? `<p class="cr-warn">${esc(t('cr.refine.cuOut'))}</p>` : '';
      ctl = slider('cool', t('cr.refine.cool'), 0, rf.heat, 1, rf.cool, '℃')
        + `<div class="cr-mpanel__foot"><button type="button" class="btn btn--small" data-act="rf-back">${esc(t('cr.refine.back'))}</button>`
        + `<button type="button" class="btn btn--small btn--primary" data-act="rf-filter">${esc(t('cr.refine.filter'))}</button></div>`;
    } else if (rf.step === 'wash') {
      const cake = rf.cake;
      const adh = cake.adh.w + cake.adh.k + cake.adh.cu;
      read = `${cellG(t('cr.refine.r.k'), cake.k.toFixed(1))}${cellG(t('cr.refine.r.c'), cake.c.toFixed(2), 'g', cake.c > 0.01)}${cellG(t('cr.refine.r.adh'), adh.toFixed(1))}${cellG(t('cr.refine.r.adhCu'), cake.adh.cu.toFixed(2), 'g', true)}`;
      const left = REFINE.washMax - cake.washes;
      ctl = slider('ww', t('cr.refine.washWater', { t: REFINE.washTemp }), REFINE.wash.min, REFINE.wash.max, REFINE.wash.step, rf.ww, 'g')
        + `<div class="cr-mpanel__foot"><button type="button" class="btn btn--small" data-act="rf-wash" ${left > 0 && rf.ww > 0 ? '' : 'disabled'}>${esc(t('cr.refine.wash', { n: cake.washes, max: REFINE.washMax }))}</button>`
        + `<button type="button" class="btn btn--small btn--primary" data-act="rf-dry">${esc(t('cr.refine.dry'))}</button></div>`;
    } else {
      const r = rf.res;
      const okM = r.kno3 >= L.mass - 1e-9, okP = r.purity >= L.purity - 1e-9;
      const g = gradeOf(L, r);
      read = `${cellG(t('cr.refine.r.kno3'), r.kno3.toFixed(1), 'g', !okM)}${cellG(t('cr.refine.r.imp'), r.imp.toFixed(2))}${cellG(t('cr.refine.r.purity'), r.purity.toFixed(2), '%', !okP)}${cellG(t('cr.refine.r.lost'), rf.cake.lost.toFixed(1))}`;
      ctl = `<div class="cr-result is-r${g}"><p class="cr-result__rank">${esc(t(['cr.refine.ok', 'cr.refine.near', 'cr.refine.ng'][g]))}</p>`
        + (g < 2 && rf.rewardText ? `<p class="cr-result__reward">${esc(rf.rewardText)}</p>` : '')
        + (g > 0 ? `<p class="cr-note">${esc(t(!okP ? 'cr.refine.ngPurity' : 'cr.refine.ngMass'))}</p>` : '')
        + `</div><div class="cr-mpanel__foot"><button type="button" class="btn btn--small" data-act="rf-retry">${esc(t('cr.refine.retry'))}</button>`
        + (g < 2 && li < REFINE.levels.length - 1 ? `<button type="button" class="btn btn--small btn--primary" data-act="rf-next">${esc(t('cr.refine.next'))}</button>` : '')
        + '</div>';
    }
    $('readout').innerHTML = `<div class="cr-readout__row"><dl class="cr-rf">${read}</dl></div>${warn}`;
    $('refine-panel').innerHTML = `<div class="cr-mpanel__head"><b>${esc(t('cr.refine.level', { n: li + 1 }))}</b>`
      + `<span class="cr-mpanel__goal">${esc(t('cr.refine.mix', { k: L.kno3, c: L.cuh }))}<br>${esc(t('cr.refine.target', { m: L.mass, p: L.purity }))}</span>`
      + `<button type="button" class="cr-fold calc-btn" data-act="calc">${esc(t('calc.open'))}</button><button type="button" class="cr-fold" data-act="rf-list">${esc(t('cr.refine.list'))}</button></div>${bar}${ctl}`;
    ctx.updateViewport();
  }

  function refineInput(k, v) {
    if (k === 'water') rf.water = v;
    else if (k === 'heat') { rf.heat = v; rf.cool = Math.min(rf.cool, v); }
    else if (k === 'cool') rf.cool = v;
    else if (k === 'ww') rf.ww = v;
    // スライダーを動かしている間は、操作盤を作りなおさずに、数値と3Dだけ変える
    const st = refState();
    scene.setState('solid', st);
    renderRefineLight();
  }
  let lightTimer = 0;
  function renderRefineLight() {
    clearTimeout(lightTimer);
    lightTimer = setTimeout(renderRefine, 120);
    const out = document.querySelectorAll('#refine-panel .cr-slider output');
    document.querySelectorAll('#refine-panel input[data-rk]').forEach((el, i) => {
      const unit = el.dataset.rk === 'heat' || el.dataset.rk === 'cool' ? '℃' : 'g';
      if (out[i]) out[i].textContent = `${el.value} ${unit}`;
    });
  }

  /** 0：達成、1：おしい（目標まで 質量 REFINE.near.mass g・純度 REFINE.near.purity % 以内）、2：届かない */
  function gradeOf(L, r) {
    if (r.kno3 >= L.mass - 1e-9 && r.purity >= L.purity - 1e-9) return 0;
    if (r.kno3 >= L.mass - REFINE.near.mass - 1e-9 && r.purity >= L.purity - REFINE.near.purity - 1e-9) return 1;
    return 2;
  }

  async function dryNow() {
    rf.res = dry(rf.cake);
    rf.step = 'result';
    const L = level();
    const g = gradeOf(L, rf.res);
    rf.rewardText = '';
    if (g < 2) {
      if (g === 0) ctx.celebrate();
      const d = data();
      const rec = { ...(d.refine || {}) };
      const prev = rec[li + 1];
      const paid = prev ? (prev.paid ?? REFINE.reward) : 0;   // v0.3 の記録（paid なし）は達成ずみとみなす
      const worth = g === 0 ? REFINE.reward : REFINE.near.reward;
      rec[li + 1] = { at: Date.now(), purity: rf.res.purity, kno3: rf.res.kno3, grade: Math.min(prev ? (prev.grade ?? 0) : 2, g), paid: Math.max(paid, worth) };
      ctx.setData({ ...d, refine: rec });
      if (worth > paid) {
        rf.rewardText = t('cr.discover.pending');
        renderRefine();
        const entry = await ctx.pay('ledger.item.crRefine', { n: li + 1 }, worth - paid);
        rf.rewardText = entry ? t(g === 0 ? 'cr.refine.reward' : 'cr.refine.nearReward', { gross: ctx.money(entry.gross), net: ctx.money(entry.amount) }) : t('cr.order.cap');
      } else rf.rewardText = t(prev && (prev.grade ?? 0) === 0 ? 'cr.refine.cleared' : 'cr.refine.nearDone');
    }
    if (kind === 'refine') renderRefine();
  }

  function onClick(act, b) {
    if (ox.onClick(act, b)) return true;
    if (act === 'cr-tray') { const g = $('og'); if (g && g.value !== '') guess = g.value; trayClick(armedCr, b.dataset.item); renderOrder(); return true; }
    if (act === 'order-ex') { ox.openEx(order(), 'ex'); return true; }
    if (act === 'order-hint') { ox.openEx(order(), 'hint'); return true; }
    if (act === 'order-open') { openOrder(Number(b.dataset.i)); return true; }
    if (act === 'refine-open') { openRefine(Number(b.dataset.i)); return true; }
    if (act === 'order-decide') { decide(); return true; }
    if (act === 'order-run') { startRun(); return true; }
    if (act === 'order-retry') { openOrder(oi); return true; }
    if (act === 'order-next') { openOrder(Math.min(ORDERS.length - 1, oi + 1)); return true; }
    if (act === 'order-list') { ctx.openMenu('order'); return true; }
    if (act === 'rf-list') { ctx.openMenu('refine'); return true; }
    if (act === 'rf-cool') { rf.step = 'cool'; rf.cool = Math.min(rf.cool, rf.heat); renderRefine(); return true; }
    if (act === 'rf-back') { rf.step = 'dissolve'; renderRefine(); return true; }
    if (act === 'rf-filter') { rf.cake = filter(mixEq(level(), rf.water, rf.cool)); rf.step = 'wash'; scene.sparkle(); renderRefine(); return true; }
    if (act === 'rf-wash') { rf.cake = wash(rf.cake, rf.ww); renderRefine(); return true; }
    if (act === 'rf-dry') { dryNow(); return true; }
    if (act === 'rf-retry') { openRefine(li); return true; }
    if (act === 'rf-next') { openRefine(Math.min(REFINE.levels.length - 1, li + 1)); return true; }
    return false;
  }

  return {
    get kind() { return kind; },
    renderMenu,
    onClick,
    onInput(el) {
      if (kind === 'refine' && el.dataset.rk) { refineInput(el.dataset.rk, Number(el.value)); return true; }
      return false;
    },
    onKey(e) { if (kind === 'order' && phase === 'predict' && e.key === 'Enter' && e.target.id === 'og') { e.preventDefault(); decide(); } },
    leave() {
      // v1.2：レバレッジ券を使った実験の途中で出たら、失敗あつかい
      if (usedCr && usedCr.lev && phase === 'run') settleLever(t, { mult: usedCr.mult, base: ORDER.rewards[0], clear: false, label: `#${pad2(oi + 1)}` }).then((x) => { if (x) ctx.toast(x); });
      usedCr = null;
      kind = null; run = null; ox.closeEx();
    },
    rerender() {
      if (kind === 'order') {
        const g = $('og'); if (g && phase === 'predict' && g.value !== '') guess = g.value;
        renderOrder();
      } else if (kind === 'refine') renderRefine();
    },
    frame(now) {
      if (kind !== 'order' || phase !== 'run' || !run) return;
      const o = order();
      const p = clamp01((now - run.t0) / ORDER.durMs);
      const from = o.start[o.anim.key];
      const v = from + (o.anim.to - from) * ease(p);
      const st = buildState(o.bench, { ...o.start, [o.anim.key]: v });
      showOrderState(st);
      readout(st, true);
      if (p >= 1) finishRun();
    },
    /** 確かめるとき用 */
    debug: { get phase() { return phase; }, get oi() { return oi; }, get rf() { return rf; }, decide: (v) => { const el = $('og'); if (el) el.value = v; decide(); }, run: startRun },
  };
}
