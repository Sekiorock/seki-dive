// colloid/src/race.js
// 対戦「チーム対抗レース」（全体の仕様書 10章・11章、colloid v0.4）。
//   ・同じ関門の道（10か所、最後が湖の社）を、2チームが同時に進む。先に社に着いたチームの勝ち。
//   ・関門には使う道具が決まっている。7つの道具はチームの中でばらばらに配る（名前の順に1つずつ）。
//     その道具を持つ人だけが問いに答えられる。ほかの人は「呼ぶ」でその人を呼ぶ（相手の画面に大きく出て、ふるえる）。
//   ・相手チームに「霧の壁」を送れる（1チーム2回まで）。10秒間、光の鈴を持つ人にしか問いが見えない。
//   ・2〜3人のときは全員で1チーム。道具を分け合って、自分の最速記録（この端末）に挑む。参加料と賞金はない。
//   部屋・参加料・賞金・勝負税・途中退出の罰金は、ほかのワールドの対戦と同じ（shared/room.js、shared/economy.js）。
//   解いた関門は、答えた人が「s0, s1 …（解いた時刻）」として送り、どの端末も同じように数える。

import { backend } from '../../shared/auth.js';
import { SETTINGS, payFee, prize, fine, formatHiyama } from '../../shared/economy.js';
import { faceUrl, faceFig } from '../../shared/characters.js';
import * as room from '../../shared/room.js';
import { RACE, TOOLS } from './config.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACTIVE_KEY = 'sekidive.cl.activeRace';
const WORLD = 'colloid';
const QN = 4;    // 道具ごとの問いの数
const TOOL_ICON = { bell: '🔔', glasses: '🔍', bag: '🛍', pole: '⚡', vial: '🧪', nigari: '💧', shield: '🛡' };
const PROP = { bell: 'fog', glasses: 'shoal', bag: 'gate', pole: 'trough', vial: 'cup', nigari: 'cup', shield: 'cup' };
const CUP = { vial: [null, 'clay', null], nigari: ['tonyu', 'tofu', 'koya'], shield: [null, 'sumi', null] };
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function active() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { return null; } }
function setActive(v) { try { if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* 何もしない */ } }

/** 関門の道（部屋を作った人の端末で作る）。7つの道具が1回ずつ出てから、残りはばらばら */
export function makeGates(random = Math.random) {
  const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const tools = shuffle(TOOLS);
  while (tools.length < RACE.gates) tools.push(TOOLS[Math.floor(random() * TOOLS.length)]);
  const used = {};
  return tools.slice(0, RACE.gates).map((tool) => {
    const left = Array.from({ length: QN }, (_, k) => k).filter((k) => !(used[tool] || []).includes(k));
    const q = left[Math.floor(random() * left.length)];
    used[tool] = [...(used[tool] || []), q];
    return { tool, q, order: shuffle([0, 1, 2]) };
  });
}

let H = null;
let R = null;

export function initRace(hooks) {
  H = hooks;
  const a = active();
  if (a && backend.mode === 'online') {
    setActive(null);
    if (a.paid) fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine }).then(() => H.toast(H.t('cl.r.fineOld', { amount: formatHiyama(SETTINGS.quitFine) })));
    room.leaveRoom(a.code, true).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (!R || R.phase !== 'play') return;
    if (document.hidden) R.hiddenAt = Date.now();
    else if (R.hiddenAt && Date.now() - R.hiddenAt > room.ROOM.dropSec * 1000) forfeit('drop');
    else R.hiddenAt = 0;
  });
}
export function inRace() { return !!(R && (R.phase === 'play' || R.phase === 'countdown')); }

// ───────────── 入口・部屋 ─────────────
export function openRace() {
  const ok = room.battleAllowed();
  if (!ok.ok) { H.toast(H.t(`cl.r.no.${ok.reason}`, { fee: formatHiyama(SETTINGS.battleFee) })); return; }
  R = null;
  renderMenu();
  H.show('race');
}
function renderMenu() {
  const t = H.t;
  const rules = [t('cl.r.rule1', { n: RACE.gates }), t('cl.r.rule2'), t('cl.r.rule3', { sec: RACE.fogSec, n: RACE.fogPerTeam }), t('cl.r.rule4', { min: RACE.versusMin }),
    t('cl.r.rule5', { fee: formatHiyama(SETTINGS.battleFee), tax: Math.round(SETTINGS.betTaxRate * 100) }), t('cl.r.rule6', { fine: formatHiyama(SETTINGS.quitFine) })];
  H.$('race').innerHTML = `<h2 class="cl-rtitle">${esc(t('cl.r.title'))}</h2><ul class="cl-rules">${rules.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    + `<button type="button" class="btn btn--primary cl-wide" data-act="r-create">${esc(t('cl.r.create'))}</button>`
    + `<div class="cl-join"><input type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" id="r-code" placeholder="0000" aria-label="${esc(t('cl.r.codeLabel'))}" autocomplete="off">`
    + `<button type="button" class="btn" data-act="r-join">${esc(t('cl.r.join'))}</button></div>`
    + `<button type="button" class="btn cl-wide" data-act="r-done">${esc(t('cl.toTitle'))}</button>`;
}
async function createRoom() {
  try {
    const code = await room.createRoom({ world: WORLD, mode: 'race', max: RACE.maxPlayers, meta: { gates: JSON.stringify(makeGates()) } });
    enterRoom(code);
    room.updateMe(code, { team: 'A' }).catch(() => {});
  } catch (e) { console.info('[対戦] 部屋を作れませんでした', e && e.message); H.toast(H.t('cl.r.err')); }
}
async function joinRoom() {
  const code = (H.$('r-code').value || '').replace(/\D/g, '');
  if (code.length !== 4) { H.toast(H.t('cl.r.codeBad')); return; }
  try {
    const r = await room.joinRoom(code, WORLD);
    if (!r.ok) { H.toast(H.t(`cl.r.joinNo.${r.reason}`)); return; }
    enterRoom(code);
  } catch (e) { console.info('[対戦] 部屋に入れませんでした', e && e.message); H.toast(H.t('cl.r.err')); }
}
function enterRoom(code) {
  R = { code, room: null, phase: 'lobby', started: false, paid: false, coop: false, startAt: 0, gates: [], hiddenAt: 0, sent: {}, lockUntil: 0,
    touched: Date.now(), settled: false, prize: null, lobbyHtml: '', panelKey: '', joinedTeam: false, pingSeen: 0, banner: null, finalAt: 0 };
  R.unsub = room.watchRoom(code, onRoom);
  R.beat = setInterval(() => { if (R) room.updateMe(R.code, {}).catch(() => {}); }, room.ROOM.heartbeatMs);
  renderLobby();
}
function players() {
  return Object.entries((R && R.room && R.room.players) || {}).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
}
function onRoom(r) {
  if (!R) return;
  R.room = r;
  if (!r) { if (R.phase === 'lobby') { H.toast(H.t('cl.r.closed')); leave(); renderMenu(); } return; }
  if (r.meta && r.meta.gates && !R.gates.length) { try { R.gates = JSON.parse(r.meta.gates); } catch (e) { R.gates = []; } }
  if (!R.joinedTeam && r.players && r.players[backend.uid] && !r.players[backend.uid].team) {
    R.joinedTeam = true;
    const ps = players().filter((p) => !p.left);
    const a = ps.filter((p) => p.team === 'A').length, b = ps.filter((p) => p.team === 'B').length;
    room.updateMe(R.code, { team: a <= b ? 'A' : 'B' }).catch(() => {});
  }
  if (r.state === 'countdown' && r.startAt && !R.started && r.players && r.players[backend.uid]) {
    R.started = true;
    beginCountdown(r);
  }
  // 呼ばれた（チームの人の ping が自分あて）
  if (R.phase === 'play') {
    for (const p of players()) {
      const pg = p.ping;
      if (pg && pg.to === backend.uid && pg.at > R.pingSeen && room.serverNow() - pg.at < RACE.pingSec * 1000) {
        R.pingSeen = pg.at;
        R.banner = { from: p.name || H.t('topbar.guest'), until: Date.now() + RACE.pingSec * 1000 };
        H.called();
      }
    }
  }
  if (R.phase === 'lobby') renderLobby();
  if (R.phase === 'final') { renderFinal(); settle(); }
}
function isCoop(ps) { return ps.length < RACE.versusMin; }
function teamOk(ps) {
  if (ps.length < RACE.minPlayers) return false;
  if (isCoop(ps)) return true;
  const a = ps.filter((p) => p.team === 'A').length, b = ps.filter((p) => p.team === 'B').length;
  return a >= 2 && b >= 2 && a <= RACE.teamMax && b <= RACE.teamMax && a + b === ps.length;
}
function renderLobby() {
  if (!R) return;
  const t = H.t;
  const r = R.room;
  const ps = players().filter((p) => !p.left);
  const host = r && r.host === backend.uid;
  const coop = isCoop(ps);
  const me = ps.find((p) => p.uid === backend.uid) || {};
  const li = (p) => `<li class="cl-bp">${faceFig(t, p.avatar || 'kasumi', { costume: p.costume || 'base', size: 30 })}<b>${esc(p.name || t('topbar.guest'))}${p.uid === backend.uid ? ` ${esc(t('cl.r.you'))}` : ''}</b>${r && r.host === p.uid ? `<span>${esc(t('cl.r.host'))}</span>` : ''}</li>`;
  const list = coop
    ? `<p class="cl-note cl-note--hot">${esc(t('cl.r.coopNote', { min: RACE.versusMin }))}</p><ul class="cl-bplayers">${ps.map(li).join('')}</ul>`
    : `<div class="cl-teams">${['A', 'B'].map((tm) => `<div class="cl-team is-${tm}"><p><b>${esc(t(`cl.r.team${tm}`))}</b>${me.team !== tm ? `<button type="button" class="cl-mini" data-act="r-team" data-team="${tm}">${esc(t('cl.r.toTeam'))}</button>` : ''}</p>`
      + `<ul class="cl-bplayers">${ps.filter((p) => p.team === tm).map(li).join('')}</ul></div>`).join('')}</div>`;
  const ok = teamOk(ps);
  const html = `<h2 class="cl-rtitle">${esc(t('cl.r.title'))}</h2>
    <p class="cl-code"><span>${esc(t('cl.r.code'))}</span><b>${esc(R.code)}</b></p>
    <p class="cl-note">${esc(t('cl.r.codeShare'))}　${esc(t('cl.r.count', { n: ps.length, max: RACE.maxPlayers }))}</p>${list}
    ${host ? `<button type="button" class="btn btn--primary cl-wide" data-act="r-start" ${ok ? '' : 'disabled'}>${esc(ok ? (coop ? t('cl.r.startCoop') : t('cl.r.start', { fee: formatHiyama(SETTINGS.battleFee) })) : t(ps.length < RACE.minPlayers ? 'cl.r.needMore' : 'cl.r.needTeams', { n: RACE.minPlayers }))}</button>`
      : `<p class="cl-note cl-note--hot">${esc(t('cl.r.waitHost'))}</p>`}
    <button type="button" class="btn cl-wide" data-act="r-leave">${esc(t('cl.r.leave'))}</button>`;
  if (html === R.lobbyHtml) return;
  R.lobbyHtml = html;
  H.$('race').innerHTML = html;
}
async function startRoom() {
  if (!R || !R.room || R.room.host !== backend.uid) return;
  const ps = players().filter((p) => !p.left);
  if (!teamOk(ps)) return;
  // 先に「協力か対抗か」を書いてから、開始の合図を出す（どの端末も同じ形で始めるため）
  await room.updateRoom(R.code, { meta: { ...(R.room.meta || {}), coop: isCoop(ps) } });
  await room.updateRoom(R.code, { state: 'countdown', startAt: room.serverNow() + room.ROOM.countdownMs });
}
async function beginCountdown(r) {
  R.coop = r.meta && typeof r.meta.coop === 'boolean' ? r.meta.coop : isCoop(players().filter((p) => !p.left));
  if (!R.coop) {
    const fee = await payFee({ itemKey: 'ledger.item.clRaceFee', amount: SETTINGS.battleFee });
    if (!fee) {
      H.toast(H.t('cl.r.no.short', { fee: formatHiyama(SETTINGS.battleFee) }));
      await room.leaveRoom(R.code, true).catch(() => {});
      leave(); H.toTitle(); return;
    }
    R.paid = true;
  }
  await room.updateMe(R.code, { paid: true });
  setActive({ code: R.code, paid: R.paid });
  R.startAt = r.startAt;
  R.phase = 'countdown';
  R.touched = Date.now();
  H.enterRace();
}

// ───────────── チームと関門（どの端末でも同じになるように） ─────────────
function teamOf(p) { return R.coop ? 'A' : (p.team || 'A'); }
function myTeam() { const me = players().find((p) => p.uid === backend.uid); return me ? teamOf(me) : 'A'; }
function members(team) { return players().filter((p) => teamOf(p) === team && !room.isDropped(p)); }
/** 道具を持つ人：チームの人（名前の順）に、道具を1つずつ配る */
function holderOf(team, tool) {
  const ms = members(team);
  if (!ms.length) return null;
  return ms[TOOLS.indexOf(tool) % ms.length];
}
function toolsOf(team, uid) { return TOOLS.filter((tool) => { const h = holderOf(team, tool); return h && h.uid === uid; }); }
function solvedAt(team, i) {
  let best = null;
  for (const p of players()) {
    if (teamOf(p) !== team) continue;
    const v = p.uid === backend.uid && `s${i}` in R.sent ? R.sent[`s${i}`] : p[`s${i}`];
    if (typeof v === 'number' && (best === null || v < best)) best = v;
  }
  return best;
}
function progress(team) { let i = 0; while (i < R.gates.length && solvedAt(team, i) !== null) i++; return i; }
function fogUntil(team) {
  let until = 0;
  for (const a of Object.values((R.room && R.room.attacks) || {})) if (a.kind === 'fog' && a.to === team) until = Math.max(until, a.at + RACE.fogSec * 1000);
  return until;
}
function fogsUsed(team) {
  const ids = new Set(players().filter((p) => teamOf(p) === team).map((p) => p.uid));
  return Object.values((R.room && R.room.attacks) || {}).filter((a) => a.kind === 'fog' && ids.has(a.from)).length;
}
function teams() { return R.coop ? ['A'] : ['A', 'B']; }
/** 結果：{ done, win（'A'|'B'|null）, prog, time } */
function result(now = room.serverNow()) {
  const N = R.gates.length;
  const info = {};
  for (const tm of teams()) {
    const pr = progress(tm);
    info[tm] = { prog: pr, last: pr ? solvedAt(tm, pr - 1) : null };
  }
  const finished = teams().filter((tm) => info[tm].prog >= N);
  const timeUp = now >= R.startAt + RACE.limitSec * 1000;
  const done = finished.length > 0 || timeUp;
  let win = null;
  if (done && !R.coop) {
    const [a, b] = [info.A, info.B];
    if (a.prog !== b.prog) win = a.prog > b.prog ? 'A' : 'B';
    else if (a.last !== null && b.last !== null && a.last !== b.last) win = a.last < b.last ? 'A' : 'B';
  }
  return { done, win, info, timeUp };
}

// ───────────── 進行（毎フレーム） ─────────────
export function frame() {
  if (!R || (R.phase !== 'countdown' && R.phase !== 'play')) return;
  const now = room.serverNow();
  if (now < R.startAt) {
    const key = `cd:${Math.ceil((R.startAt - now) / 1000)}`;
    if (key !== R.panelKey) { R.panelKey = key; H.$('panel').innerHTML = `<div class="cl-head"><b>${esc(H.t('cl.r.title'))}</b></div><p class="cl-bcount">${esc(H.t('cl.r.countdown'))} <b>${Math.ceil((R.startAt - now) / 1000)}</b></p>`; H.updateViewport(); }
    return;
  }
  if (R.phase === 'countdown') { R.phase = 'play'; R.touched = Date.now(); }
  const res = result(now);
  if (res.done) { finish(); return; }
  // 放置：自分が答える番なのに、長く何もしない（待っている人は放置にしない）
  const tmx = myTeam(); const gx = R.gates[res.info[tmx].prog]; const hx = gx && holderOf(tmx, gx.tool);
  const mineNow = hx && hx.uid === backend.uid;
  if (mineNow && !R.holdSince) R.holdSince = Date.now();
  if (!mineNow) R.holdSince = 0;
  if (!R.coop && mineNow && Date.now() - Math.max(R.holdSince, R.touched) > RACE.idleSec * 1000) { forfeit('idle'); return; }
  renderPlay(now, res);
}

function renderPlay(now, res) {
  const t = H.t;
  const tm = myTeam();
  const i = res.info[tm].prog;
  const gate = R.gates[i];
  const holder = gate ? holderOf(tm, gate.tool) : null;
  const mine = holder && holder.uid === backend.uid;
  const fogged = fogUntil(tm) > now;
  const bell = holderOf(tm, 'bell');
  const iSeeBell = bell && bell.uid === backend.uid;
  const locked = Date.now() < R.lockUntil;
  const banner = R.banner && Date.now() < R.banner.until ? R.banner : null;
  const enemy = R.coop ? null : (tm === 'A' ? 'B' : 'A');
  const fogLeft = R.coop ? 0 : RACE.fogPerTeam - fogsUsed(tm);
  // 3D：進んだ関門の数で景色が豪華に。関門の道具に合わせた小道具
  H.scene3d(gate ? gate.tool : null, i, R.gates.length, fogged);
  const left = Math.max(0, R.startAt + RACE.limitSec * 1000 - now);
  const key = [i, holder && holder.uid, fogged, locked, banner && banner.until, fogLeft, ...teams().map((x) => res.info[x].prog)].join('|');
  // 時計と霧の残りは、文字だけ書きかえる（全部を描き直すと、ボタンを押しそこねるため）
  const tEl = H.$('r-time'); if (tEl) tEl.textContent = mmss(left);
  const fEl = H.$('r-fogs'); if (fEl) fEl.textContent = t('cl.r.fogNow', { s: Math.max(0, Math.ceil((fogUntil(tm) - now) / 1000)) });
  if (key === R.panelKey) return;
  R.panelKey = key;
  const track = teams().map((x) => {
    const pr = res.info[x].prog;
    return `<div class="cl-track is-${x}${x === tm ? ' is-mine' : ''}"><b>${esc(R.coop ? t('cl.r.coopTeam') : t(`cl.r.team${x}`))}</b><span class="cl-track__bar">${R.gates.map((g, k) => `<i class="${k < pr ? 'is-done' : k === pr ? 'is-now' : ''}">${k === R.gates.length - 1 ? '⛩' : TOOL_ICON[g.tool]}</i>`).join('')}</span><em>${pr}/${R.gates.length}</em></div>`;
  }).join('');
  const myTools = toolsOf(tm, backend.uid).map((x) => `<span class="cl-mytool${gate && gate.tool === x ? ' is-now' : ''}">${TOOL_ICON[x]} ${esc(t(`cl.tool.${x}`))}</span>`).join('');
  let body = '';
  if (gate) {
    const qk = `cl.rq.${gate.tool}${gate.q}`;
    const head = `<p class="cl-gate"><b>${esc(t(i === R.gates.length - 1 ? 'cl.r.gateLast' : 'cl.r.gate', { n: i + 1, all: R.gates.length }))}</b>`
      + `<span>${TOOL_ICON[gate.tool]} ${esc(t(`cl.tool.${gate.tool}`))}　${esc(t('cl.r.holder', { name: holder ? (holder.name || t('topbar.guest')) : '—' }))}</span></p>`;
    if (mine) {
      const hide = fogged && !iSeeBell;
      body = head + `<div class="cl-rq${hide ? ' is-fog' : ''}"><p>${esc(t(`${qk}.q`))}</p><div class="cl-opts">${gate.order.map((k) => `<button type="button" class="cl-opt" data-act="r-ans" data-k="${k}" ${locked || hide ? 'disabled' : ''}>${esc(t(`${qk}.${'abc'[k]}`))}</button>`).join('')}</div>`
        + (hide ? `<div class="cl-rq__fog">${esc(t('cl.r.fogged', { name: bell ? (bell.name || t('topbar.guest')) : '—' }))}</div>` : '') + '</div>'
        + (locked ? `<p class="cl-note cl-note--hot">${esc(t('cl.r.locked', { s: RACE.wrongLockSec }))}</p>` : '');
    } else {
      // 問いは、道具を持つ人の画面に。ほかの人には見出しだけ（霧のときは、光の鈴を持つ人には問いも見える）
      const peek = fogged && iSeeBell;
      body = head + `<div class="cl-wait"><p>${esc(t('cl.r.yourTurnNot', { name: holder ? (holder.name || t('topbar.guest')) : '—', tool: t(`cl.tool.${gate.tool}`) }))}</p>`
        + `<button type="button" class="btn btn--primary" data-act="r-ping">📣 ${esc(t('cl.r.ping', { name: holder ? (holder.name || t('topbar.guest')) : '' }))}</button></div>`
        + (peek ? `<div class="cl-rq is-peek"><p>🔔 ${esc(t('cl.r.peek'))}</p><p>${esc(t(`${qk}.q`))}</p></div>` : '');
    }
  }
  const fogBtn = enemy ? `<button type="button" class="cl-mini cl-mini--fog" data-act="r-fog" ${fogLeft > 0 ? '' : 'disabled'}>🌫 ${esc(t('cl.r.fogBtn', { n: fogLeft }))}</button>` : '';
  H.$('panel').innerHTML = `<div class="cl-head"><b>${esc(t('cl.r.title'))}</b><span class="cl-rtime" id="r-time">${mmss(left)}</span>${fogBtn}`
    + `<button type="button" class="cl-mini" data-act="r-quit">${esc(t('cl.r.quit'))}</button></div>`
    + (banner ? `<div class="cl-banner">📣 ${esc(t('cl.r.called', { name: banner.from }))}</div>` : '')
    + (fogged ? `<div class="cl-fogbar">🌫 <span id="r-fogs">${esc(t('cl.r.fogNow', { s: Math.ceil((fogUntil(tm) - now) / 1000) }))}</span></div>` : '')
    + `<div class="cl-tracks">${track}</div><p class="cl-sub">${esc(t('cl.r.myTools'))}</p><div class="cl-mytools">${myTools || esc(t('cl.r.noTools'))}</div>${body}`;
  H.updateViewport();
}

function answer(k) {
  const now = room.serverNow();
  const tm = myTeam();
  const i = progress(tm);
  const gate = R.gates[i];
  if (!gate || Date.now() < R.lockUntil) return;
  R.touched = Date.now();
  if (k === 0) {
    R.sent[`s${i}`] = now;
    room.updateMe(R.code, { [`s${i}`]: now }).catch(() => {});
    H.correct();
  } else {
    R.lockUntil = Date.now() + RACE.wrongLockSec * 1000;
    H.wrong();
    setTimeout(() => { if (R) R.panelKey = ''; }, RACE.wrongLockSec * 1000 + 50);
  }
  R.panelKey = '';
}

// ───────────── 終わり ─────────────
async function finish() {
  if (R.phase === 'final') return;
  R.phase = 'final';
  R.finalAt = room.serverNow();
  setActive(null);
  await room.updateMe(R.code, { done: true }).catch(() => {});
  const res = result();
  const tm = myTeam();
  if (R.coop && res.info.A.prog >= R.gates.length) {
    const time = res.info.A.last - R.startAt;
    const best = H.getBest(players().length);
    R.record = { time, best, isBest: !best || time < best };
    if (R.record.isBest) H.setBest(players().length, time);
  }
  if ((R.coop && res.info.A.prog >= R.gates.length) || (!R.coop && res.win === tm)) H.big(); else H.end();
  H.show('race');
  renderFinal();
  settle();
}
function resultView() {
  const ps = players();
  const res = result(Math.max(room.serverNow(), R.finalAt));
  if (R.coop) return { state: 'done', res, share: 0 };
  // v1.0：部屋に書かれた取り分があれば、全員それを使う
  const fixed = R.fixed || (R.room && R.room.result) || null;
  if (fixed) return { state: 'done', res, share: room.resultOf(fixed, backend.uid).share, fixed: true };
  const all = ps.every((p) => room.isDropped(p) || (p.done && p.paid));
  if (!all) return { state: 'waiting', res };
  const paid = ps.filter((p) => p.paid);
  const pot = paid.length * SETTINGS.battleFee;
  // 取り分の人数は「途中で抜けた（left）」だけを除いて数える。通信がおくれて一時的に切断に見える人を外すと、
  // 端末ごとに人数がちがって、賞金の合計が参加料の合計をこえてしまうため（つながらないままの人の取り分は、受け取られずに残る）
  const getters = paid.filter((p) => !p.left && (!res.win || teamOf(p) === res.win));
  const me = getters.find((p) => p.uid === backend.uid);
  const each = getters.length ? Math.floor(pot / getters.length) : 0;
  return { state: 'done', res, share: me ? each : 0,
    fix: () => room.fixShares(R.code, { pot, ranks: Object.fromEntries(ps.map((p) => [p.uid, getters.includes(p) ? 1 : p.left ? 0 : 2])), shares: Object.fromEntries(getters.map((p) => [p.uid, each])) }) };
}
function renderFinal() {
  if (!R) return;
  const t = H.t;
  const v = resultView();
  const res = v.res;
  let head;
  if (R.coop) {
    head = res.info.A.prog >= R.gates.length
      ? `<p class="cl-brank">${esc(t('cl.r.coopDone', { time: mmss(R.record ? R.record.time : 0) }))}</p><p class="cl-note cl-note--hot">${esc(R.record && R.record.isBest ? t('cl.r.newBest') : t('cl.r.best', { time: mmss(R.record ? R.record.best : 0) }))}</p>`
      : `<p class="cl-brank">${esc(t('cl.r.coopTimeUp', { n: res.info.A.prog, all: R.gates.length }))}</p>`;
  } else {
    head = `<p class="cl-brank">${esc(res.win ? t('cl.r.winner', { team: t(`cl.r.team${res.win}`) }) : t('cl.r.draw'))}</p>`;
  }
  const rows = teams().map((tm) => `<div class="cl-team is-${tm}${res.win === tm ? ' is-win' : ''}"><p><b>${esc(R.coop ? t('cl.r.coopTeam') : t(`cl.r.team${tm}`))}</b><em>${res.info[tm].prog}/${R.gates.length}</em></p>`
    + `<ul class="cl-bplayers">${players().filter((p) => teamOf(p) === tm).map((p) => `<li class="cl-bp${p.uid === backend.uid ? ' is-me' : ''}"><b>${esc(p.name || t('topbar.guest'))}</b>${room.isDropped(p) ? `<span>${esc(t('cl.r.dropped'))}</span>` : ''}</li>`).join('')}</ul></div>`).join('');
  const prizeLine = R.coop ? '' : v.state !== 'done' ? t('cl.r.waitOthers')
    : R.prize ? t('cl.r.prizeGot', { gross: formatHiyama(R.prize.gross), tax: formatHiyama(R.prize.tax), net: formatHiyama(R.prize.net) })
      : v.share > 0 ? t('cl.r.paying') : t('cl.r.noPrize');
  H.$('race').innerHTML = `<h2 class="cl-rtitle">${esc(t('cl.r.final'))}</h2>${head}<div class="cl-teams${R.coop ? ' is-one' : ''}">${rows}</div>`
    + (prizeLine ? `<p class="cl-note cl-note--hot">${esc(prizeLine)}</p>` : '')
    + `<p class="cl-note">${esc(t(R.coop ? 'cl.r.howCoop' : 'cl.r.howRank'))}</p>`
    + `<button type="button" class="btn btn--primary cl-wide" data-act="r-done">${esc(t('cl.toTitle'))}</button>`;
}
let settling = false;
async function settle() {
  if (!R || R.settled || settling || R.coop) return;
  let v = resultView();
  if (v.state !== 'done') return;
  settling = true;
  try {
    R.settled = true;
    if (!v.fixed && v.fix) { R.fixed = await v.fix(); v = resultView(); }
    if (R.room && R.room.host === backend.uid) room.updateRoom(R.code, { state: 'done' }).catch(() => {});
    if (v.share > 0 && await room.claimOnce(R.code)) {
      const entry = await prize({ itemKey: 'ledger.item.clRacePrize', itemVars: {}, gross: v.share });
      if (entry) R.prize = { gross: entry.gross, tax: entry.tax, net: entry.amount };
    }
    renderFinal();
  } finally { settling = false; }
}
async function forfeit(why = 'quit') {
  if (!R) return;
  const code = R.code;
  const playing = R.phase === 'play' || R.phase === 'countdown';
  const paid = R.paid;
  R.phase = 'gone';
  setActive(null);
  if (playing) {
    await room.leaveRoom(code, true).catch(() => {});
    if (paid) {
      await fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine });
      H.toast(H.t(`cl.r.fine.${why}`, { amount: formatHiyama(SETTINGS.quitFine) }));
    }
  }
  leave();
  H.toTitle();
}
async function leaveLobby() {
  if (!R) return;
  const code = R.code;
  const started = R.phase !== 'lobby';
  leave();
  await room.leaveRoom(code, started).catch(() => {});
  H.toTitle();
}
function leave() {
  if (!R) return;
  if (R.unsub) R.unsub();
  clearInterval(R.beat);
  R = null;
}

export function onClick(act, el) {
  if (!act.startsWith('r-')) return false;
  if (act === 'r-create') createRoom();
  else if (act === 'r-join') joinRoom();
  else if (act === 'r-start') startRoom();
  else if (act === 'r-leave') leaveLobby();
  else if (act === 'r-team') { if (R) room.updateMe(R.code, { team: el.dataset.team }).catch(() => {}); }
  else if (act === 'r-quit') forfeit('quit');
  else if (act === 'r-done') { leave(); H.toTitle(); }
  else if (act === 'r-ans') answer(Number(el.dataset.k));
  else if (act === 'r-ping') {
    if (!R) return true;
    const tm = myTeam(); const gate = R.gates[progress(tm)];
    const h = gate && holderOf(tm, gate.tool);
    if (h) { room.updateMe(R.code, { ping: { to: h.uid, at: room.serverNow() } }).catch(() => {}); H.toast(H.t('cl.r.pinged', { name: h.name || H.t('topbar.guest') })); }
    R.touched = Date.now();
  } else if (act === 'r-fog') {
    if (!R || R.coop) return true;
    const tm = myTeam();
    if (fogsUsed(tm) >= RACE.fogPerTeam) return true;
    room.sendAttack(R.code, tm === 'A' ? 'B' : 'A', 'fog').catch(() => {});
    H.toast(H.t('cl.r.fogSent'));
    R.touched = Date.now(); R.panelKey = '';
  }
  return true;
}
export function redraw() {
  if (!R) { if (H.screen() === 'race') renderMenu(); return; }
  if (R.phase === 'lobby') { R.lobbyHtml = ''; renderLobby(); }
  else if (R.phase === 'final') renderFinal();
  else R.panelKey = '';
}
/** 確かめるとき用 */
export const raceDebug = {
  get R() { return R; },
  state: () => (R ? { team: myTeam(), res: result(), gate: R.gates[progress(myTeam())], holder: (() => { const tm = myTeam(); const g = R.gates[progress(tm)]; return g ? (holderOf(tm, g.tool) || {}).uid : null; })(), me: backend.uid } : null),
};
