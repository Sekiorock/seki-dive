// crystal/src/battle.js
// 対戦「析出ニアピン」（全体の仕様書 8章・11章、crystal v0.4）。
//   ・2〜12人が同じお題（例：「KNO₃ 80 g を使って、ちょうど 30.0 g 析出させよ」）を受け取り、
//     制限時間30秒で、水の質量と冷やす温度を決める（80℃で全部溶かしてから冷やす、と考える）。
//   ・時間が来ると、全員のビーカーが3Dで横一列に並び、一斉に冷却が始まる。目標に最も近い人がその回の勝ち。
//   ・5回戦。合計の誤差が小さい順に順位を決める。
//   ・参加料・賞金・勝負税・途中退出の罰金は、ハイドレーション・ビートの対戦と同じ（shared/room.js、shared/economy.js）。
//     2人なら1位が全額、3人以上なら1位50%・2位30%・3位20%。
//   ・始まる時刻（startAt）から、各回の「決める時間」「結果を見せる時間」を、どの端末も同じ時計（サーバーの時刻）で数える。
//     決める時間が終わると、各自の端末が自分の水の質量と温度を送る（w0, t0 … のように、回ごとに）。
//     結果の計算（析出量と誤差）は、送られた数値から各自の端末で同じように行う。

import { t } from '../../shared/i18n.js';
import { backend } from '../../shared/auth.js';
import { SETTINGS, payFee, prize, fine, formatHiyama } from '../../shared/economy.js';
import { faceUrl } from '../../shared/characters.js';
import * as room from '../../shared/room.js';
import { NEARPIN } from './config.js';
import { equilibrium, curvePoint, SOLUTES } from './solubility.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACTIVE_KEY = 'sekidive.cr.activeBattle';
const WORLD = 'crystal';
const roundMs = () => (NEARPIN.decideSec + NEARPIN.revealSec) * 1000;
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

function active() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { return null; } }
function setActive(v) { try { if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* 何もしない */ } }

/** 析出量（g）：溶質 m g を水 w g に 80℃で溶かし、T℃まで冷やしたとき */
export function crystalOf(task, w, T) { return equilibrium(task.solute, task.mass, w, T).crystal; }

/** お題を5つ作る（部屋を作った人の端末で。みんな同じお題を使う） */
export function makeTasks(random = Math.random) {
  return NEARPIN.tasks.map((d) => {
    const mass = d.mass[Math.floor(random() * d.mass.length)];
    const max = crystalOf({ solute: d.solute, mass }, NEARPIN.water.min, NEARPIN.temp.min);
    const lo = Math.max(5, max * 0.2), hi = max * 0.8;
    const target = Math.round((lo + random() * (hi - lo)) * 2) / 2;
    return { solute: d.solute, mass, target };
  });
}

let H = null;
let B = null;

export function initBattle(hooks) {
  H = hooks;
  const a = active();
  if (a && backend.mode === 'online') {
    setActive(null);
    fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine }).then(() => H.toast(t('cr.b.fineOld', { amount: formatHiyama(SETTINGS.quitFine) })));
    room.leaveRoom(a.code, true).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (!B || B.phase !== 'play') return;
    if (document.hidden) B.hiddenAt = Date.now();
    else if (B.hiddenAt && Date.now() - B.hiddenAt > room.ROOM.dropSec * 1000) forfeit('drop');
    else B.hiddenAt = 0;
  });
}

export function inBattle() { return !!(B && (B.phase === 'play' || B.phase === 'countdown')); }

// ───────────── 入口・部屋 ─────────────
export function openBattle() {
  const ok = room.battleAllowed();
  if (!ok.ok) { H.toast(t(`cr.b.no.${ok.reason}`, { fee: formatHiyama(SETTINGS.battleFee) })); return; }
  B = null;
  renderMenu();
  H.show('battle');
}

function renderMenu() {
  H.$('battle').innerHTML = `
    <h2 class="cr-found__title">${esc(t('cr.b.title'))}</h2>
    <ul class="cr-rules">
      <li>${esc(t('cr.b.rule1', { sec: NEARPIN.decideSec }))}</li>
      <li>${esc(t('cr.b.rule2', { n: NEARPIN.rounds }))}</li>
      <li>${esc(t('cr.b.rule3', { fee: formatHiyama(SETTINGS.battleFee), tax: Math.round(SETTINGS.betTaxRate * 100) }))}</li>
      <li>${esc(t('cr.b.rule4', { fine: formatHiyama(SETTINGS.quitFine) }))}</li>
    </ul>
    <button type="button" class="btn btn--primary cr-wide" data-act="b-create"><b>${esc(t('cr.b.create'))}</b><small>${esc(t('cr.b.createSub', { min: NEARPIN.minPlayers, max: NEARPIN.maxPlayers }))}</small></button>
    <div class="cr-join">
      <input type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" id="b-code" placeholder="0000" aria-label="${esc(t('cr.b.codeLabel'))}" autocomplete="off">
      <button type="button" class="btn" data-act="b-join">${esc(t('cr.b.join'))}</button>
    </div>
    <button type="button" class="btn" data-act="to-title">${esc(t('cr.back'))}</button>`;
}

async function createRoom() {
  try {
    const code = await room.createRoom({ world: WORLD, mode: 'nearpin', max: NEARPIN.maxPlayers, meta: { tasks: makeTasks() } });
    enterRoom(code);
  } catch (e) { console.info('[対戦] 部屋を作れませんでした', e && e.message); H.toast(t('cr.b.err')); }
}

async function joinRoom() {
  const code = (H.$('b-code').value || '').replace(/\D/g, '');
  if (code.length !== 4) { H.toast(t('cr.b.codeBad')); return; }
  try {
    const r = await room.joinRoom(code, WORLD);
    if (!r.ok) { H.toast(t(`cr.b.joinNo.${r.reason}`)); return; }
    enterRoom(code);
  } catch (e) { console.info('[対戦] 部屋に入れませんでした', e && e.message); H.toast(t('cr.b.err')); }
}

function enterRoom(code) {
  B = {
    code, room: null, phase: 'lobby', started: false, paid: false, startAt: 0, tasks: [], hiddenAt: 0,
    w: NEARPIN.water.start, T: NEARPIN.temp.start, sent: {}, locked: false, touched: -1, stage: null, ridx: -1, settled: false, prize: null,
  };
  B.unsub = room.watchRoom(code, onRoom);
  B.beat = setInterval(() => { if (B) room.updateMe(B.code, {}).catch(() => {}); }, room.ROOM.heartbeatMs);
  renderLobby();
}

function players() {
  return Object.entries((B && B.room && B.room.players) || {}).map(([uid, p]) => ({ uid, ...p }));
}

function onRoom(r) {
  if (!B) return;
  B.room = r;
  if (!r) { if (B.phase === 'lobby') { H.toast(t('cr.b.closed')); leave(); renderMenu(); } return; }
  if (r.meta && r.meta.tasks) B.tasks = r.meta.tasks;
  if (r.state === 'countdown' && r.startAt && !B.started && r.players && r.players[backend.uid]) {
    B.started = true;
    beginCountdown(r);
  }
  if (B.phase === 'lobby') renderLobby();
  if (B.phase === 'final') { renderFinal(); settle(); }
}

function renderLobby() {
  if (!B) return;
  const r = B.room;
  const ps = players().filter((p) => !p.left);
  const host = r && r.host === backend.uid;
  const slots = ps.map((p) => `<li class="cr-bp"><img src="${faceUrl(p.avatar || 'minato', p.costume || 'base')}" alt="" width="36" height="36">
      <b>${esc(p.name || t('topbar.guest'))}${p.uid === backend.uid ? ` ${esc(t('cr.b.you'))}` : ''}</b>${r.host === p.uid ? `<span>${esc(t('cr.b.host'))}</span>` : ''}</li>`).join('');
  const html = `
    <h2 class="cr-found__title">${esc(t('cr.b.title'))}</h2>
    <p class="cr-code"><span>${esc(t('cr.b.code'))}</span><b>${esc(B.code)}</b></p>
    <p class="cr-note">${esc(t('cr.b.codeShare'))}</p>
    <p class="cr-note">${esc(t('cr.b.count', { n: ps.length, max: NEARPIN.maxPlayers }))}</p>
    <ul class="cr-bplayers">${slots}</ul>
    ${host ? `<button type="button" class="btn btn--primary cr-wide" data-act="b-start" ${ps.length >= NEARPIN.minPlayers ? '' : 'disabled'}>${esc(t(ps.length >= NEARPIN.minPlayers ? 'cr.b.start' : 'cr.b.needMore', { fee: formatHiyama(SETTINGS.battleFee), n: NEARPIN.minPlayers }))}</button>`
      : `<p class="cr-note cr-note--hot">${esc(t('cr.b.waitHost'))}</p>`}
    <button type="button" class="btn" data-act="b-leave">${esc(t('cr.b.leave'))}</button>`;
  if (html === B.lobbyHtml) return;   // 毎秒の連絡のたびに描き直すと、ボタンを押しそこねるので、変わったときだけ
  B.lobbyHtml = html;
  H.$('battle').innerHTML = html;
}

async function startRoom() {
  if (!B || !B.room || B.room.host !== backend.uid) return;
  const ps = players().filter((p) => !p.left);
  if (ps.length < NEARPIN.minPlayers) return;
  await room.updateRoom(B.code, { state: 'countdown', startAt: room.serverNow() + room.ROOM.countdownMs });
}

async function beginCountdown(r) {
  const fee = await payFee({ itemKey: 'ledger.item.crBattleFee', amount: SETTINGS.battleFee });
  if (!fee) {
    H.toast(t('cr.b.no.short', { fee: formatHiyama(SETTINGS.battleFee) }));
    await room.leaveRoom(B.code, true).catch(() => {});
    leave();
    H.toTitle();
    return;
  }
  B.paid = true;
  await room.updateMe(B.code, { paid: true });
  setActive({ code: B.code, startAt: r.startAt });
  B.startAt = r.startAt;
  B.tasks = (r.meta && r.meta.tasks) || B.tasks;
  B.phase = 'countdown';
  H.enterBattleLab();
}

// ───────────── 進行（毎フレーム） ─────────────
function stageAt(now) {
  if (now < B.startAt) return { stage: 'countdown', r: -1, left: (B.startAt - now) / 1000 };
  const r = Math.floor((now - B.startAt) / roundMs());
  if (r >= NEARPIN.rounds) return { stage: 'final', r: NEARPIN.rounds };
  const inR = now - B.startAt - r * roundMs();
  if (inR < NEARPIN.decideSec * 1000) return { stage: 'decide', r, left: NEARPIN.decideSec - inR / 1000 };
  return { stage: 'reveal', r, inR: inR / 1000 - NEARPIN.decideSec };
}

/** ある人の、その回の選んだ数値（送っていなければ null） */
function pickOf(p, r) {
  if (p.uid === backend.uid && B.sent[r]) return B.sent[r];
  const w = p[`w${r}`], T = p[`t${r}`];
  return typeof w === 'number' && typeof T === 'number' ? { w, T } : null;
}
/** その回の誤差（送っていなければ、目標の質量そのものを誤差にする） */
function errOf(p, r) {
  const task = B.tasks[r];
  const pk = pickOf(p, r);
  if (!pk) return task.target;
  return Math.abs(crystalOf(task, pk.w, pk.T) - task.target);
}
function totals(upTo) {
  return players().map((p) => {
    let sum = 0;
    for (let r = 0; r < upTo; r++) sum += errOf(p, r);
    return { ...p, total: sum };
  });
}

export function frame() {
  if (!B || (B.phase !== 'countdown' && B.phase !== 'play')) return;
  const now = room.serverNow();
  const s = stageAt(now);
  const key = `${s.stage}:${s.r}`;
  const changed = key !== B.stage;
  B.stage = key;
  if (s.stage === 'countdown') {
    if (changed) renderPanel(s);
    const el = H.$('b-timer'); if (el) el.textContent = Math.ceil(s.left);
    showMyBeaker(0);
    return;
  }
  B.phase = 'play';
  if (s.stage === 'decide') {
    if (changed) {
      B.locked = false;
      // 放置：続けて何回も操作しなかった
      if (s.r - Math.max(B.touched, 0) >= NEARPIN.idleRounds && s.r >= NEARPIN.idleRounds) { forfeit('idle'); return; }
      H.scene.setBench('solid');
      renderPanel(s);
    }
    const el = H.$('b-timer'); if (el) el.textContent = Math.ceil(s.left);
    const bar = H.$('b-bar'); if (bar) bar.style.width = `${(s.left / NEARPIN.decideSec) * 100}%`;
    showMyBeaker(s.r);
  } else if (s.stage === 'reveal') {
    if (changed) {
      submit(s.r);
      H.scene.setBench('arena');
    }
    showArena(s);
    if (changed || Math.floor(s.inR * 4) !== B.lastTick) { B.lastTick = Math.floor(s.inR * 4); renderPanel(s); }
  } else if (s.stage === 'final') {
    finish();
  }
}

function submit(r) {
  if (B.sent[r]) return;
  B.sent[r] = { w: B.w, T: B.T };
  room.updateMe(B.code, { [`w${r}`]: B.w, [`t${r}`]: B.T }).catch(() => {});
}

/** 決める時間：自分のビーカー（結晶はまだ見せない） */
function showMyBeaker(r) {
  const task = B.tasks[Math.max(0, r)];
  if (!task) return;
  const eq = equilibrium(task.solute, task.mass, B.w, NEARPIN.startTemp);
  const hidden = { ...eq, crystal: 0, parts: eq.parts.map((p) => ({ ...p, crystal: 0 })), state: 'unsaturated' };
  H.scene.setState('solid', { solute: task.solute, mass: task.mass, water: B.w, temp: B.T, eq: hidden, point: curvePoint(task.solute, task.mass, B.w) });
}

/** 結果を見せる時間：全員のビーカーを並べて、80℃から一斉に冷やす */
function showArena(s) {
  const task = B.tasks[s.r];
  const k = Math.min(1, s.inR / NEARPIN.coolSec);
  const list = players().filter((p) => !p.left || pickOf(p, s.r)).map((p) => {
    const pk = pickOf(p, s.r);
    const me = p.uid === backend.uid;
    if (!pk) return { name: p.name || t('topbar.guest'), me, water: NEARPIN.water.start, crystal: 0, temp: NEARPIN.startTemp, solute: task.solute, text: '—', sub: t('cr.b.noPick') };
    const T = NEARPIN.startTemp + (pk.T - NEARPIN.startTemp) * k;
    const eq = equilibrium(task.solute, task.mass, pk.w, T);
    const fin = k >= 1;
    const err = Math.abs(eq.crystal - task.target);
    const cu = eq.parts.find((q) => q.id === 'CuSO4');
    return {
      name: p.name || t('topbar.guest'), me, water: eq.water, crystal: eq.crystal, temp: T, solute: task.solute,
      blue: cu ? (cu.dissolved / Math.max(1, eq.water)) * 100 / 40 : 0,
      text: `${f1(eq.crystal)} g`, sub: fin ? t('cr.b.diff', { d: f1(err) }) : `${Math.round(T)}℃`, err, uid: p.uid,
    };
  });
  if (k >= 1) {
    // 同じ誤差（0.1 g 単位）なら同じ順位
    const r10 = (e) => Math.round(e * 10);
    list.forEach((x) => { x.rank = x.err === undefined ? null : 1 + list.filter((y) => y.err !== undefined && r10(y.err) < r10(x.err)).length; });
  }
  H.scene.setState('arena', { players: list });
}

function taskText(task) {
  return t('cr.b.task', { s: t(`cr.s.${task.solute}`), f: SOLUTES[task.solute].formula, m: task.mass, x: f1(task.target), T: NEARPIN.startTemp });
}

function renderPanel(s) {
  const box = H.$('battle-panel');
  if (!box) return;
  if (s.stage === 'countdown') {
    box.innerHTML = `<div class="cr-mpanel__head"><b>${esc(t('cr.b.title'))}</b></div><p class="cr-bcount">${esc(t('cr.b.countdown'))} <b id="b-timer">${Math.ceil(s.left)}</b></p>`;
    H.updateViewport();
    return;
  }
  const task = B.tasks[s.r];
  const head = `<div class="cr-mpanel__head"><b>${esc(t('cr.b.round', { r: s.r + 1, n: NEARPIN.rounds }))}</b>`
    + `<span class="cr-mpanel__goal">${esc(t('cr.b.myTotal', { e: f1(totals(s.stage === 'reveal' ? s.r : s.r).find((p) => p.uid === backend.uid)?.total || 0) }))}</span>`
    + `${s.stage === 'decide' ? `<b class="cr-btimer" id="b-timer">${Math.ceil(s.left)}</b>` : ''}</div>`;
  const tk = `<div class="cr-order"><img src="${faceUrl(H.guide)}" alt="" width="44" height="44"><p>${esc(taskText(task))}</p></div>`;
  if (s.stage === 'decide') {
    const dis = B.locked ? 'disabled' : '';
    box.innerHTML = head + `<div class="cr-bbar"><i id="b-bar" style="width:${(s.left / NEARPIN.decideSec) * 100}%"></i></div>` + tk
      + `<label class="cr-slider"><span><b>${esc(t('cr.water'))}</b><output id="b-vw">${B.w} g</output></span><input type="range" data-bk="w" min="${NEARPIN.water.min}" max="${NEARPIN.water.max}" step="${NEARPIN.water.step}" value="${B.w}" ${dis}></label>`
      + `<label class="cr-slider"><span><b>${esc(t('cr.refine.cool'))}</b><output id="b-vt">${B.T} ℃</output></span><input type="range" data-bk="T" min="${NEARPIN.temp.min}" max="${NEARPIN.temp.max}" step="${NEARPIN.temp.step}" value="${B.T}" ${dis}></label>`
      + `<div class="cr-mpanel__foot"><button type="button" class="btn btn--small" data-act="b-quit">${esc(t('cr.b.quit'))}</button>`
      + `<button type="button" class="btn btn--small btn--primary" data-act="b-lock" ${dis}>${esc(t(B.locked ? 'cr.b.locked' : 'cr.b.lock'))}</button></div>`;
  } else {
    const fin = s.inR >= NEARPIN.coolSec;
    const rows = players().filter((p) => !p.left || pickOf(p, s.r)).map((p) => {
      const pk = pickOf(p, s.r);
      const c = pk ? crystalOf(task, pk.w, pk.T) : 0;
      return { p, pk, c, err: pk ? Math.abs(c - task.target) : task.target };
    }).sort((a, b) => a.err - b.err);
    const r10 = (e) => Math.round(e * 10);
    rows.forEach((x) => { x.rank = 1 + rows.filter((y) => r10(y.err) < r10(x.err)).length; });
    box.innerHTML = head + tk + `<ol class="cr-brows">${rows.map((x) => `<li class="${x.p.uid === backend.uid ? 'is-me' : ''}">`
      + `<span>${fin ? x.rank : '·'}</span><b>${esc(x.p.name || t('topbar.guest'))}</b>`
      + `<small>${x.pk ? esc(t('cr.b.pick', { w: x.pk.w, T: x.pk.T })) : esc(t('cr.b.noPick'))}</small>`
      + `<em>${fin ? esc(t('cr.b.result', { c: f1(x.c), d: f1(x.err) })) : '…'}</em></li>`).join('')}</ol>`;
  }
  H.updateViewport();
}

// ───────────── 終わり ─────────────
async function finish() {
  if (B.phase === 'final') return;
  B.phase = 'final';
  const me = totals(NEARPIN.rounds).find((p) => p.uid === backend.uid);
  const total = me ? me.total : 0;
  setActive(null);
  await room.updateMe(B.code, { done: true, final: -Math.round(total * 10), err: Math.round(total * 10) / 10 }).catch(() => {});
  H.show('battle');
  renderFinal();
  settle();
}

function resultView() {
  const list = room.ranking(B.room && B.room.players);
  // 全員が終わり、参加料を払った印もそろってから賞金を分ける（印が届くのがおくれても、取り分がずれないように）
  const all = list.every((p) => p.dropped || (p.done && p.paid));
  const tot = totals(NEARPIN.rounds);
  const rows = list.map((p) => ({ name: p.name || t('topbar.guest'), me: p.uid === backend.uid, rank: p.rank, dropped: p.dropped, done: !!p.done, total: (tot.find((x) => x.uid === p.uid) || {}).total || 0 }));
  if (!all) return { state: 'waiting', rows };
  const mine = list.find((p) => p.uid === backend.uid);
  const split = room.prizeSplit(list, SETTINGS.battleFee);
  return { state: 'done', rows, rank: mine ? mine.rank : null, share: split.shares[backend.uid] || 0, pot: split.pot };
}

function renderFinal() {
  if (!B) return;
  const v = resultView();
  const prizeLine = v.state !== 'done' ? t('cr.b.waitOthers')
    : B.prize ? t('cr.b.prize', { gross: formatHiyama(B.prize.gross), tax: formatHiyama(B.prize.tax), net: formatHiyama(B.prize.net) })
      : v.share > 0 ? t('cr.discover.pending') : t('cr.b.noPrize');
  H.$('battle').innerHTML = `
    <h2 class="cr-found__title">${esc(t('cr.b.final'))}</h2>
    ${v.state === 'done' && v.rank ? `<p class="cr-brank">${esc(t('cr.b.yourRank', { r: v.rank }))}</p>` : ''}
    <ol class="cr-brows cr-brows--final">${v.rows.map((x) => `<li class="${x.me ? 'is-me' : ''}${x.dropped ? ' is-out' : ''}"><span>${x.dropped ? '—' : x.rank}</span><b>${esc(x.name)}</b>`
      + `<small>${x.dropped ? esc(t('cr.b.dropped')) : x.done ? '' : esc(t('cr.b.playing'))}</small><em>${esc(t('cr.b.totalErr', { e: f1(x.total) }))}</em></li>`).join('')}</ol>
    <p class="cr-note cr-note--hot">${esc(prizeLine)}</p>
    <p class="cr-note">${esc(t('cr.b.howRank'))}</p>
    <button type="button" class="btn btn--primary cr-wide" data-act="b-done">${esc(t('cr.b.toTitle'))}</button>`;
}

let settling = false;
async function settle() {
  if (!B || B.settled || settling) return;
  const v = resultView();
  if (v.state !== 'done') return;
  settling = true;
  try {
    B.settled = true;
    if (B.room && B.room.host === backend.uid) room.updateRoom(B.code, { state: 'done' }).catch(() => {});
    if (v.share > 0 && await room.claimOnce(B.code)) {
      const entry = await prize({ itemKey: 'ledger.item.crBattlePrize', itemVars: {}, gross: v.share });
      if (entry) B.prize = { gross: entry.gross, tax: entry.tax, net: entry.amount };
    }
    renderFinal();
  } finally { settling = false; }
}

async function forfeit(why = 'quit') {
  if (!B) return;
  const code = B.code;
  const playing = B.phase === 'play' || B.phase === 'countdown';
  B.phase = 'gone';
  if (playing) {
    setActive(null);
    await room.leaveRoom(code, true).catch(() => {});
    await fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine });
    H.toast(t(`cr.b.fine.${why}`, { amount: formatHiyama(SETTINGS.quitFine) }));
  }
  leave();
  H.toTitle();
}

async function leaveLobby() {
  if (!B) return;
  const code = B.code;
  const started = B.phase !== 'lobby';
  leave();
  await room.leaveRoom(code, started).catch(() => {});
  H.toTitle();
}

function leave() {
  if (!B) return;
  if (B.unsub) B.unsub();
  clearInterval(B.beat);
  B = null;
}

export function onClick(act) {
  if (act === 'b-create') { createRoom(); return true; }
  if (act === 'b-join') { joinRoom(); return true; }
  if (act === 'b-start') { startRoom(); return true; }
  if (act === 'b-leave') { leaveLobby(); return true; }
  if (act === 'b-quit') { forfeit('quit'); return true; }
  if (act === 'b-lock') { if (B) { B.locked = true; B.touched = Math.max(B.touched, curRound()); const s = stageAt(room.serverNow()); renderPanel(s); } return true; }
  if (act === 'b-done') { leave(); H.toTitle(); return true; }
  return false;
}
function curRound() { return B ? Math.max(0, Math.floor((room.serverNow() - B.startAt) / roundMs())) : 0; }

export function onInput(el) {
  if (!B || B.locked || !el.dataset.bk) return false;
  const v = Number(el.value);
  if (el.dataset.bk === 'w') { B.w = v; const o = H.$('b-vw'); if (o) o.textContent = `${v} g`; }
  else { B.T = v; const o = H.$('b-vt'); if (o) o.textContent = `${v} ℃`; }
  B.touched = Math.max(B.touched, curRound());
  return true;
}

export function redraw() {
  if (!B) { if (H.$('battle') && !H.$('battle').hidden && H.screen() === 'battle') renderMenu(); return; }
  if (B.phase === 'lobby') { B.lobbyHtml = ''; renderLobby(); }
  else if (B.phase === 'final') renderFinal();
  else { B.stage = null; }
}

/** 確かめるとき用 */
export const debug = { get B() { return B; }, set: (w, T) => { if (B) { B.w = w; B.T = T; B.touched = curRound(); } } };
