// freeze/src/battle.js
// ③ フリーズ・ガードの対戦（全体の仕様書 9章・11章、freeze v0.4）。
//   ・寒波バトルロイヤル（2〜12人）：みんなに同じ3区間。撒く量を決めて、一斉に夜を迎える。
//     予算を4割以上残して守り切ると、寒波を1つ相手に送れる（受けた人の次の夜、区間が2℃冷える）。凍った区間が合計3つで脱落。
//   ・浸透圧の綱引き（1対1〜6対6）：毎回3枚のカード（物質と質量）から1枚選んで、U字管の自分の側に溶かす。
//     粒子の多い側へ水が移り、液面が上がる。先に目標の線まで上げたチームの勝ち。
//   部屋・参加料・賞金・勝負税・途中退出の罰金は、ほかのワールドの対戦と同じ（shared/room.js、shared/economy.js）。
//   始まる時刻（startAt）から、どの端末も同じ時計（サーバーの時刻）で、夜（回）の区切りを数える。
//   各自が自分の選んだものを送り（p0, p1 … / c0, c1 … / 寒波の相手 a0, a1 …）、結果は送られた値から各自の端末で同じように計算する。

import { t } from '../../shared/i18n.js';
import { backend } from '../../shared/auth.js';
import { SETTINGS, payFee, prize, fine, formatHiyama } from '../../shared/economy.js';
import { faceUrl } from '../../shared/characters.js';
import * as room from '../../shared/room.js';
import { WAVE, TUG, SUBSTANCES, CONST, NIGHT } from './config.js';
import { judge, nightState } from './model.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
const signed = (x) => (x > 0 ? `+${f1(x)}` : x < 0 ? `−${f1(-x)}` : '0.0');
const ceil10 = (x) => Math.ceil(x / 10 - 1e-9) * 10;
const ACTIVE_KEY = 'sekidive.fz.activeBattle';
const WORLD = 'freeze';
const CFG = (mode) => (mode === 'tug' ? TUG : WAVE);
const revealSec = (mode) => (mode === 'tug' ? TUG.revealSec : WAVE.nightSec);
const roundsOf = (mode) => (mode === 'tug' ? TUG.rounds : WAVE.nights);
const roundMs = (mode) => (CFG(mode).decideSec + revealSec(mode)) * 1000;

function active() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { return null; } }
function setActive(v) { try { if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* 何もしない */ } }

// ───────────── お題（部屋を作った人の端末で作る） ─────────────
export function makeWaveTasks(random = Math.random) {
  const pick = (a) => a[Math.floor(random() * a.length)];
  return WAVE.lows.slice(0, WAVE.nights).map(([hi, lo]) => {
    const steps = Math.round((hi - lo) / 0.5);
    return { s: [0, 1, 2].map(() => [pick(WAVE.waters), hi - 0.5 * Math.floor(random() * (steps + 1))]) };
  });
}
/** 粒子の物質量（そのカード1枚ぶん） */
export function cardParticles(card) { const S = SUBSTANCES[card.sub]; return (card.g / S.M) * S.i; }
export function makeTugTasks(random = Math.random) {
  const out = [];
  for (let r = 0; r < TUG.rounds; r++) {
    for (let tries = 0; tries < 50; tries++) {
      const pool = TUG.cards.slice();
      const subs = [];
      while (subs.length < 3) subs.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
      const same = r < TUG.sameMassRounds;
      const m = TUG.sameMass[Math.floor(random() * TUG.sameMass.length)];
      const cards = subs.map((sub) => ({ sub, g: same ? m : TUG.mixMass[Math.floor(random() * TUG.mixMass.length)] }));
      const ps = cards.map(cardParticles).sort((a, b) => b - a);
      if (ps[0] - ps[1] >= 0.01) { out.push({ cards }); break; }   // いちばん多いカードが1枚に決まるように
    }
  }
  return out;
}

// ───────────── 寒波バトル：1夜の中身 ─────────────
/** 夜 r の区間（寒波 inc 個を受けたとき） */
export function waveNight(tasks, r, inc = 0) {
  const base = tasks[r].s.map(([water, low], i) => ({ i, water, low }));
  const need = base.reduce((a, s) => a + (Math.max(0, -s.low) / CONST.Kf) * s.water, 0);
  const sections = base.map((s, i) => {
    let hit = 0;
    for (let w = 0; w < inc; w++) if (w % 3 === i) hit++;
    return { ...s, low: s.low - WAVE.coldDrop * hit, waved: hit };
  });
  return { kind: 'freeze', sections, budget: ceil10(need * WAVE.budgetPerMol), stage: 0, night: r + 1 };
}
const enc = (picks) => picks.map((p) => `${p.sub || ''}:${Number(p.mass) || 0}`).join('|');
const dec = (s) => (typeof s === 'string' ? s.split('|').map((x) => { const [sub, m] = x.split(':'); return { sub: sub || null, mass: Number(m) || 0 }; }) : null);

let H = null;
let B = null;

export function initBattle(hooks) {
  H = hooks;
  const a = active();
  if (a && backend.mode === 'online') {
    setActive(null);
    fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine }).then(() => H.toast(t('fz.b.fineOld', { amount: formatHiyama(SETTINGS.quitFine) })));
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
let menuMode = 'wave';
export function openBattle(mode) {
  const ok = room.battleAllowed();
  if (!ok.ok) { H.toast(t(`fz.b.no.${ok.reason}`, { fee: formatHiyama(SETTINGS.battleFee) })); return; }
  B = null;
  menuMode = mode;
  renderMenu();
  H.show('battle');
}
function rulesHtml(mode) {
  const C = CFG(mode);
  const lines = mode === 'tug'
    ? [t('fz.b.tug.rule1', { sec: TUG.decideSec }), t('fz.b.tug.rule2', { goal: TUG.goalCm, n: TUG.rounds }), t('fz.b.tug.rule3', { max: TUG.teamMax })]
    : [t('fz.b.wave.rule1', { sec: WAVE.decideSec }), t('fz.b.wave.rule2', { left: Math.round(WAVE.cheapLeft * 100), d: WAVE.coldDrop }), t('fz.b.wave.rule3', { out: WAVE.outFrozen, n: WAVE.nights })];
  lines.push(mode === 'tug' ? t('fz.b.tug.prize', { fee: formatHiyama(SETTINGS.battleFee), tax: Math.round(SETTINGS.betTaxRate * 100) }) : t('fz.b.prize', { fee: formatHiyama(SETTINGS.battleFee), tax: Math.round(SETTINGS.betTaxRate * 100) }));
  lines.push(t('fz.b.fineRule', { fine: formatHiyama(SETTINGS.quitFine) }));
  return `<ul class="fz-rules">${lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="fz-note">${esc(t('fz.b.players', { min: C.minPlayers, max: C.maxPlayers }))}</p>`;
}
function renderMenu() {
  H.$('battle').innerHTML = `<h2 class="fz-btitle">${esc(t(`fz.b.${menuMode}.title`))}</h2>${rulesHtml(menuMode)}
    <button type="button" class="btn btn--primary fz-wide" data-act="b-create">${esc(t('fz.b.create'))}</button>
    <div class="fz-join"><input type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" id="b-code" placeholder="0000" aria-label="${esc(t('fz.b.codeLabel'))}" autocomplete="off">
    <button type="button" class="btn" data-act="b-join">${esc(t('fz.b.join'))}</button></div>
    <button type="button" class="btn fz-wide" data-act="b-done">${esc(t('fz.toTitle'))}</button>`;
}
async function createRoom() {
  try {
    const mode = menuMode;
    const tasks = mode === 'tug' ? makeTugTasks() : makeWaveTasks();
    const code = await room.createRoom({ world: WORLD, mode, max: CFG(mode).maxPlayers, meta: { tasks: JSON.stringify(tasks) } });
    enterRoom(code, mode);
    if (mode === 'tug') room.updateMe(code, { team: 'A' }).catch(() => {});
  } catch (e) { console.info('[対戦] 部屋を作れませんでした', e && e.message); H.toast(t('fz.b.err')); }
}
async function joinRoom() {
  const code = (H.$('b-code').value || '').replace(/\D/g, '');
  if (code.length !== 4) { H.toast(t('fz.b.codeBad')); return; }
  try {
    const r = await room.joinRoom(code, WORLD);
    if (!r.ok) { H.toast(t(`fz.b.joinNo.${r.reason}`)); return; }
    enterRoom(code, null);
  } catch (e) { console.info('[対戦] 部屋に入れませんでした', e && e.message); H.toast(t('fz.b.err')); }
}
function enterRoom(code, mode) {
  B = {
    code, mode, room: null, phase: 'lobby', started: false, paid: false, startAt: 0, tasks: [], hiddenAt: 0,
    sent: {}, locked: false, touched: -1, stage: null, settled: false, prize: null, picks: null, card: -1, target: {}, lobbyHtml: '', joinedTeam: false,
  };
  B.unsub = room.watchRoom(code, onRoom);
  B.beat = setInterval(() => { if (B) room.updateMe(B.code, {}).catch(() => {}); }, room.ROOM.heartbeatMs);
  renderLobby();
}
function players() {
  return Object.entries((B && B.room && B.room.players) || {}).map(([uid, p]) => ({ uid, ...p })).sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
}
function onRoom(r) {
  if (!B) return;
  B.room = r;
  if (!r) { if (B.phase === 'lobby') { H.toast(t('fz.b.closed')); leave(); renderMenu(); } return; }
  if (!B.mode) B.mode = r.mode;
  if (r.meta && r.meta.tasks && !B.tasks.length) { try { B.tasks = JSON.parse(r.meta.tasks); } catch (e) { B.tasks = []; } }
  // 綱引き：入った人は、人数の少ないチームへ
  if (B.mode === 'tug' && !B.joinedTeam && r.players && r.players[backend.uid] && !r.players[backend.uid].team) {
    B.joinedTeam = true;
    const ps = players().filter((p) => !p.left);
    const a = ps.filter((p) => p.team === 'A').length, b = ps.filter((p) => p.team === 'B').length;
    room.updateMe(B.code, { team: a <= b ? 'A' : 'B' }).catch(() => {});
  }
  if (r.state === 'countdown' && r.startAt && !B.started && r.players && r.players[backend.uid]) {
    B.started = true;
    beginCountdown(r);
  }
  if (B.phase === 'lobby') renderLobby();
  if (B.phase === 'final') { renderFinal(); settle(); }
}
function teamOk(ps) {
  if (B.mode !== 'tug') return ps.length >= WAVE.minPlayers;
  const a = ps.filter((p) => p.team === 'A').length, b = ps.filter((p) => p.team === 'B').length;
  return a >= 1 && b >= 1 && a <= TUG.teamMax && b <= TUG.teamMax && a + b === ps.length;
}
function renderLobby() {
  if (!B) return;
  const r = B.room;
  const ps = players().filter((p) => !p.left);
  const host = r && r.host === backend.uid;
  const C = CFG(B.mode);
  const li = (p) => `<li class="fz-bp${p.team ? ` is-${p.team}` : ''}"><img src="${faceUrl(p.avatar || 'toma', p.costume || 'base')}" alt="" width="34" height="34">`
    + `<b>${esc(p.name || t('topbar.guest'))}${p.uid === backend.uid ? ` ${esc(t('fz.b.you'))}` : ''}</b>${r && r.host === p.uid ? `<span>${esc(t('fz.b.host'))}</span>` : ''}</li>`;
  let list;
  if (B.mode === 'tug') {
    const me = ps.find((p) => p.uid === backend.uid) || {};
    list = ['A', 'B'].map((tm) => `<div class="fz-team is-${tm}"><p><b>${esc(t(`fz.b.team${tm}`))}</b>`
      + (me.team !== tm ? `<button type="button" class="fz-mini" data-act="b-team" data-team="${tm}">${esc(t('fz.b.toTeam'))}</button>` : '')
      + `</p><ul class="fz-bplayers">${ps.filter((p) => p.team === tm).map(li).join('')}</ul></div>`).join('');
    list = `<div class="fz-teams">${list}</div>`;
  } else list = `<ul class="fz-bplayers">${ps.map(li).join('')}</ul>`;
  const ok = teamOk(ps);
  const html = `<h2 class="fz-btitle">${esc(t(`fz.b.${B.mode || 'wave'}.title`))}</h2>
    <p class="fz-code"><span>${esc(t('fz.b.code'))}</span><b>${esc(B.code)}</b></p>
    <p class="fz-note">${esc(t('fz.b.codeShare'))}　${esc(t('fz.b.count', { n: ps.length, max: C.maxPlayers }))}</p>
    ${list}
    ${host ? `<button type="button" class="btn btn--primary fz-wide" data-act="b-start" ${ok ? '' : 'disabled'}>${esc(t(ok ? 'fz.b.start' : (B.mode === 'tug' ? 'fz.b.needTeams' : 'fz.b.needMore'), { fee: formatHiyama(SETTINGS.battleFee), n: C.minPlayers }))}</button>`
      : `<p class="fz-note fz-note--hot">${esc(t('fz.b.waitHost'))}</p>`}
    <button type="button" class="btn fz-wide" data-act="b-leave">${esc(t('fz.b.leave'))}</button>`;
  if (html === B.lobbyHtml) return;
  B.lobbyHtml = html;
  H.$('battle').innerHTML = html;
}
async function startRoom() {
  if (!B || !B.room || B.room.host !== backend.uid) return;
  if (!teamOk(players().filter((p) => !p.left))) return;
  await room.updateRoom(B.code, { state: 'countdown', startAt: room.serverNow() + room.ROOM.countdownMs });
}
async function beginCountdown(r) {
  const fee = await payFee({ itemKey: 'ledger.item.fzBattleFee', amount: SETTINGS.battleFee });
  if (!fee) {
    H.toast(t('fz.b.no.short', { fee: formatHiyama(SETTINGS.battleFee) }));
    await room.leaveRoom(B.code, true).catch(() => {});
    leave();
    H.toTitle();
    return;
  }
  B.paid = true;
  await room.updateMe(B.code, { paid: true });
  setActive({ code: B.code, startAt: r.startAt });
  B.startAt = r.startAt;
  B.phase = 'countdown';
  H.enterBattle(B.mode);
}

// ───────────── 時刻と結果の計算（どの端末でも同じになるように） ─────────────
function stageAt(now) {
  if (now < B.startAt) return { stage: 'countdown', r: -1, left: (B.startAt - now) / 1000 };
  const r = Math.floor((now - B.startAt) / roundMs(B.mode));
  const inR = now - B.startAt - r * roundMs(B.mode);
  const dec = CFG(B.mode).decideSec * 1000;
  if (inR < dec) return { stage: 'decide', r, left: (dec - inR) / 1000 };
  return { stage: 'reveal', r, inR: (inR - dec) / 1000 };
}
function myVal(p, key) { return p.uid === backend.uid && key in B.sent ? B.sent[key] : p[key]; }

/** 寒波バトル：夜 upTo の手前まで進めた結果 */
function waveSim(upTo) {
  const ps = players();
  const st = {};
  ps.forEach((p) => { st[p.uid] = { frozen: 0, out: null, left: 0, gone: false, earned: [], inc: [], res: [], to: [] }; });
  let sends = [];
  let last = -1;
  for (let r = 0; r < Math.min(upTo, WAVE.nights); r++) {
    const alive = ps.filter((p) => st[p.uid].out === null);
    if (alive.length <= 1 && r > 0) break;
    last = r;
    for (const p of alive) {
      const s = st[p.uid];
      const raw = myVal(p, `p${r}`);
      if (p.left && raw === undefined) { s.out = r; s.gone = true; continue; }
      const inc = sends.filter((x) => x.to === p.uid).length;
      s.inc[r] = inc;
      const night = waveNight(B.tasks, r, inc);
      let picks = dec(raw) || night.sections.map(() => ({ sub: null, mass: 0 }));
      let j = judge(night, picks);
      if (j.used > night.budget + 1e-9) { picks = night.sections.map(() => ({ sub: null, mass: 0 })); j = judge(night, picks); j.over = true; }
      s.res[r] = { night, j };
      s.frozen += j.rows.filter((x) => x.fail).length;
      s.left += Math.max(0, j.left);
      s.earned[r] = j.all && !j.over && j.left >= WAVE.cheapLeft * night.budget - 1e-9;
    }
    for (const p of alive) if (st[p.uid].out === null && st[p.uid].frozen >= WAVE.outFrozen) st[p.uid].out = r;
    const after = ps.filter((p) => st[p.uid].out === null);
    sends = [];
    for (const p of after) {
      if (!st[p.uid].earned[r]) continue;
      const others = after.filter((q) => q.uid !== p.uid);
      if (!others.length) continue;
      const want = myVal(p, `a${r}`);
      let to = others.find((q) => q.uid === want);
      if (!to) { const i = after.findIndex((q) => q.uid === p.uid); to = after[(i + 1) % after.length]; }
      st[p.uid].to[r] = to.uid;
      sends.push({ from: p.uid, to: to.uid });
    }
  }
  const alive = ps.filter((p) => st[p.uid].out === null);
  return { st, ps, alive, last, sends };
}
/** 寒波バトルの順位：残った人（凍った数が少ない → 残した予算が多い）→ 脱落した人（あとまで残った順）→ 抜けた人 */
function waveRanking(sim) {
  const key = (p) => {
    const s = sim.st[p.uid];
    if (s.gone || room.isDropped(p)) return [2, 0, 0];
    if (s.out !== null) return [1, -s.out, s.frozen];
    return [0, s.frozen, -Math.round(s.left)];
  };
  const list = sim.ps.map((p) => ({ ...p, k: key(p), dropped: sim.st[p.uid].gone || room.isDropped(p) }));
  list.sort((a, b) => (a.k[0] - b.k[0]) || (a.k[1] - b.k[1]) || (a.k[2] - b.k[2]) || String(a.uid).localeCompare(String(b.uid)));
  let rank = 0, prev = '';
  list.forEach((p, i) => { const k = p.k.join(':'); if (k !== prev) { rank = i + 1; prev = k; } p.rank = rank; });
  return list;
}
function waveOver(sim) { return sim.last >= WAVE.nights - 1 || (sim.last >= 0 && sim.alive.length <= 1); }

/** 綱引き：回 upTo の手前まで */
function tugSim(upTo) {
  const ps = players();
  let h = 0, end = -1, win = null;
  const rounds = [];
  for (let r = 0; r < Math.min(upTo, TUG.rounds); r++) {
    const card = B.tasks[r];
    const sum = { A: 0, B: 0 }, cnt = { A: 0, B: 0 };
    const picks = {};
    for (const p of ps) {
      if (!p.team) continue;
      const c = myVal(p, `c${r}`);
      const n = typeof c === 'number' && c >= 0 && card.cards[c] ? cardParticles(card.cards[c]) : 0;
      picks[p.uid] = { c: typeof c === 'number' ? c : -1, n };
      sum[p.team] += n; cnt[p.team] += 1;
    }
    const avg = { A: cnt.A ? sum.A / cnt.A : 0, B: cnt.B ? sum.B / cnt.B : 0 };
    const before = h;
    h = Math.max(-TUG.goalCm, Math.min(TUG.goalCm, h + TUG.cmPerMol * (avg.A - avg.B)));
    rounds.push({ avg, picks, before, h });
    if (Math.abs(h) >= TUG.goalCm - 1e-9) { end = r; win = h > 0 ? 'A' : 'B'; break; }
  }
  return { ps, rounds, h, end, win };
}
function tugDone(sim) { return sim.end >= 0 || sim.rounds.length >= TUG.rounds; }
function tugWinner(sim) { if (sim.win) return sim.win; return Math.abs(sim.h) < 0.05 ? null : sim.h > 0 ? 'A' : 'B'; }

// ───────────── 進行（毎フレーム） ─────────────
export function frame() {
  if (!B || (B.phase !== 'countdown' && B.phase !== 'play')) return;
  const now = room.serverNow();
  const s = stageAt(now);
  const key = `${s.stage}:${s.r}`;
  const changed = key !== B.stage;
  B.stage = key;
  if (s.stage === 'countdown') {
    if (changed) { renderPanel(s); if (B.mode === 'wave') H.scene.setTheme('freeze'); else showTug(0, 0); }
    const el = H.$('b-timer'); if (el) el.textContent = Math.ceil(s.left);
    return;
  }
  B.phase = 'play';
  // 決着がついたか（前の夜・回まで）
  if (B.mode === 'wave') {
    const prevSim = waveSim(s.r);
    if (s.r >= WAVE.nights || (s.stage === 'decide' && waveOver(prevSim))) { finish(); return; }
  } else {
    const prevSim = tugSim(s.r);
    if (s.r >= TUG.rounds || (s.stage === 'decide' && tugDone(prevSim) && s.r > 0)) { finish(); return; }
  }
  if (s.stage === 'decide') {
    if (changed) {
      B.locked = false;
      B.revealHtml = '';
      if (s.r - Math.max(B.touched, 0) >= WAVE.idleNights && s.r >= WAVE.idleNights && !amOut(s.r)) { forfeit('idle'); return; }
      if (B.mode === 'wave') { const inc = myInc(s.r); B.picks = [0, 1, 2].map(() => ({ sub: 'CaCl2', mass: '' })); B.incSeen = inc; H.scene.setTheme('freeze'); H.scene.clearSpread(); }
      else B.card = -1;
      renderPanel(s);
    }
    if (B.dirty) { B.dirty = false; renderPanel(s); }
    else if (B.mode === 'wave' && myInc(s.r) !== B.incSeen) { B.incSeen = myInc(s.r); renderPanel(s); }   // 寒波の相手の知らせが遅れて届いたとき
    const el = H.$('b-timer'); if (el) el.textContent = Math.ceil(s.left);
    const bar = H.$('b-bar'); if (bar) bar.style.width = `${(s.left / CFG(B.mode).decideSec) * 100}%`;
    if (B.mode === 'wave') waveLabels(s.r, null);
    else { const sim = tugSim(s.r); showTug(sim.h, 0); }
  } else {
    if (changed) { submit(s.r); if (B.mode === 'wave') startWaveNight(s.r); }
    if (B.mode === 'wave') waveReveal(s, changed);
    else tugReveal(s, changed);
  }
}
function amOut(r) {
  if (B.mode !== 'wave') return false;
  const sim = waveSim(r);
  const st = sim.st[backend.uid];
  return !!st && st.out !== null;
}
function myInc(r) {
  const sim = waveSim(r);
  return sim.sends.filter((x) => x.to === backend.uid).length;
}
function submit(r) {
  if (B.mode === 'wave') {
    const key = `p${r}`;
    if (key in B.sent || amOut(r)) return;
    const night = waveNight(B.tasks, r, myInc(r));
    let picks = B.picks.map((p) => ({ sub: p.sub, mass: Number(p.mass) || 0 }));
    if (judge(night, picks).used > night.budget + 1e-9) { picks = picks.map((p) => ({ ...p, mass: 0 })); H.toast(t('fz.b.wave.overSent')); }
    B.sent[key] = enc(picks);
    room.updateMe(B.code, { [key]: B.sent[key] }).catch(() => {});
  } else {
    const key = `c${r}`;
    if (key in B.sent) return;
    B.sent[key] = B.card;
    room.updateMe(B.code, { [key]: B.card }).catch(() => {});
  }
}

// ───────────── 寒波バトルの画面 ─────────────
function waveLabels(r, x) {
  const night = waveNight(B.tasks, r, myInc(r));
  H.scene.setSections(night.sections.map((sec, k) => ({ title: t('fz.secN', { n: k + 1 }), big: `${signed(sec.low)}℃`, small: sec.waved ? t('fz.b.wave.waved', { d: WAVE.coldDrop * sec.waved }) : t('fz.waterKg', { w: f1(sec.water) }), safe: sec.waved ? false : undefined })));
}
function startWaveNight(r) {
  const sim = waveSim(r + 1);
  const res = sim.st[backend.uid] && sim.st[backend.uid].res[r];
  if (!res) return;
  H.scene.spread(res.j.rows.map((row) => {
    const S = row.sub ? SUBSTANCES[row.sub] : null;
    const np = S && row.mass > 0 ? (row.mass / S.M) * S.i : 0;
    return { dots: Math.min(150, Math.round(np * 12)), split: S ? S.i : 1, color: S ? S.color : '#ffffff', ions: S && S.i > 1 };
  }));
}
function waveReveal(s, changed) {
  const sim = waveSim(s.r + 1);
  const me = sim.st[backend.uid];
  const res = me && me.res[s.r];
  const T = WAVE.nightSec;
  if (B.dirty) B.lastTick = -1, B.dirty = false;
  const x = Math.max(0, Math.min(1, (s.inR - 2) / (T - 8)));   // 2 秒撒いてから夜（6秒）。そのあと寒波の相手を選ぶ
  H.scene.setNight(Math.min(1, x / NIGHT.lowAt));
  if (res) {
    H.scene.setSections(res.j.rows.map((row, k) => {
      const ns = nightState('freeze', row, x);
      const end = x >= 1;
      return { title: t('fz.secN', { n: k + 1 }), big: end ? t(row.fail ? 'fz.frozen' : 'fz.safe') : `${signed(ns.shown)}℃`, small: t('fz.fpIs', { fp: signed(row.value) }), frozen: ns.failNow, safe: !ns.failNow };
    }));
  }
  const tick = Math.floor(s.inR * 4);
  if (changed || tick !== B.lastTick) { B.lastTick = tick; renderPanel(s, { sim, x }); }
}

function renderPanel(s, extra = {}) {
  const box = H.$('panel');
  if (!box) return;
  if (s.stage === 'countdown') {
    box.innerHTML = `<div class="fz-head"><b>${esc(t(`fz.b.${B.mode}.title`))}</b></div><p class="fz-bcount">${esc(t('fz.b.countdown'))} <b id="b-timer">${Math.ceil(s.left)}</b></p>`;
    H.updateViewport();
    return;
  }
  if (B.mode === 'tug') { renderTugPanel(s, extra); H.updateViewport(); return; }
  const sim = extra.sim || waveSim(s.r);
  const me = sim.st[backend.uid] || { frozen: 0 };
  const hearts = Array.from({ length: WAVE.outFrozen }, (_, i) => `<i class="${i < me.frozen ? 'is-lost' : ''}">❄</i>`).join('');
  const head = `<div class="fz-head"><b>${esc(t('fz.b.wave.night', { r: s.r + 1, n: WAVE.nights }))}</b><span class="fz-hearts" title="${esc(t('fz.b.wave.frozenCount', { n: me.frozen, out: WAVE.outFrozen }))}">${hearts}</span>`
    + `<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>${s.stage === 'decide' ? `<b class="fz-btimer" id="b-timer">${Math.ceil(s.left)}</b>` : ''}</div>`;
  if (s.stage === 'decide') {
    if (me.out !== null && me.out !== undefined) {
      box.innerHTML = head + `<p class="fz-sum__big is-ng">${esc(t('fz.b.wave.youOut'))}</p><p class="fz-note">${esc(t('fz.b.wave.watch'))}</p>${playersList(sim, s.r - 1)}`;
      H.updateViewport();
      return;
    }
    const inc = myInc(s.r);
    const night = waveNight(B.tasks, s.r, inc);
    const p = judge(night, B.picks.map((q) => ({ sub: q.sub, mass: Number(q.mass) || 0 })));
    const over = p.used > night.budget + 1e-9;
    const dis = B.locked ? 'disabled' : '';
    box.innerHTML = head + `<div class="fz-bbar"><i id="b-bar" style="width:${(s.left / WAVE.decideSec) * 100}%"></i></div>`
      + (inc ? `<p class="fz-wavein">${esc(t('fz.b.wave.incoming', { n: inc, d: WAVE.coldDrop }))}</p>` : '')
      + `<div class="fz-budget${over ? ' is-over' : ''}" id="b-budget"><span>${esc(t('fz.used'))} <b>${f1(p.used)}</b> / ${night.budget} pt</span>`
      + `<span>${esc(t('fz.b.wave.cheap', { pt: f1(night.budget * (1 - WAVE.cheapLeft)) }))}</span><span class="fz-budget__bar"><i style="width:${(Math.min(1, p.used / night.budget) * 100).toFixed(1)}%"></i><em style="left:${((1 - WAVE.cheapLeft) * 100).toFixed(1)}%"></em></span></div>`
      + `<ol class="fz-rows fz-rows--freeze">${night.sections.map((sec, k) => `<li class="fz-row fz-row--freeze${sec.waved ? ' is-waved' : ''}"><b>${k + 1}</b>`
        + `<span class="fz-v">${f1(sec.water)}<small>kg</small></span><span class="fz-v fz-low">${signed(sec.low)}<small>℃${sec.waved ? '❄' : ''}</small></span>`
        + `<select data-bk="sub" data-k="${k}" ${dis} aria-label="${esc(t('fz.subLabel'))}">${WAVE.substances.map((id) => `<option value="${id}" ${B.picks[k].sub === id ? 'selected' : ''}>${esc(SUBSTANCES[id].formula)}</option>`).join('')}</select>`
        + `<input type="number" inputmode="decimal" step="any" min="0" data-bk="mass" data-k="${k}" value="${esc(B.picks[k].mass)}" placeholder="g" ${dis} aria-label="${esc(t('fz.massLabel', { n: k + 1 }))}">`
        + `<span class="fz-cost" id="bc${k}">${f1(p.rows[k].cost)} pt</span></li>`).join('')}</ol>`
      + `<div class="fz-table">${WAVE.substances.map((id) => { const S = SUBSTANCES[id]; return `<b>${esc(S.formula)}</b><span>${S.M} g/mol</span><span>${S.price} pt/mol</span><span>${esc(t(`fz.ion.${id}`))}</span>`; }).join('')}</div>`
      + `<p class="fz-note">${esc(t('fz.b.wave.kf', { kf: CONST.Kf }))}</p>`
      + `<div class="fz-foot"><button type="button" class="btn" data-act="b-quit">${esc(t('fz.b.quit'))}</button>`
      + `<button type="button" class="btn btn--primary" data-act="b-lock" id="b-lock" ${dis || (over ? 'disabled' : '')}>${esc(t(B.locked ? 'fz.b.locked' : over ? 'fz.overBudget' : 'fz.b.lock'))}</button></div>`;
  } else {
    const res = me.res && me.res[s.r];
    const x = extra.x || 0;
    let mine = '';
    if (res) {
      mine = `<ol class="fz-rows">${res.j.rows.map((row, k) => {
        const ns = nightState('freeze', row, x);
        return `<li class="fz-row fz-row--night${ns.failNow ? ' is-frozen' : ' is-safe'}"><b>${k + 1}</b><span class="fz-v">${esc(t('fz.now'))} ${signed(ns.shown)}<small>℃</small></span>`
          + `<span class="fz-v">${esc(t('fz.fpShort'))} ${signed(row.value)}<small>℃</small></span><span>${esc(t(ns.failNow ? 'fz.frozen' : 'fz.guarding'))}</span></li>`;
      }).join('')}</ol>`;
      if (x >= 1) mine += `<p class="fz-note${me.earned[s.r] ? ' fz-note--hot' : ''}">${esc(me.earned[s.r] ? t('fz.b.wave.earned') : res.j.all ? t('fz.b.wave.notCheap', { left: Math.round(WAVE.cheapLeft * 100) }) : t('fz.b.wave.lost', { n: res.j.rows.filter((q) => q.fail).length }))}</p>`;
    } else mine = `<p class="fz-note">${esc(t('fz.b.wave.watch'))}</p>`;
    let pick = '';
    const after = sim.ps.filter((q) => sim.st[q.uid].out === null && q.uid !== backend.uid);
    if (x >= 1 && me.earned && me.earned[s.r] && after.length) {
      const cur = B.target[s.r] || sim.st[backend.uid].to[s.r];
      pick = `<p class="fz-sub">${esc(t('fz.b.wave.sendTo'))}</p><div class="fz-targets">${after.map((q) => `<button type="button" class="fz-mini${cur === q.uid ? ' is-on' : ''}" data-act="b-target" data-uid="${esc(q.uid)}">${esc(q.name || t('topbar.guest'))}</button>`).join('')}</div>`;
    }
    const html = head + mine + pick + (x >= 1 ? playersList(sim, s.r) : '');
    if (html !== B.revealHtml) { B.revealHtml = html; box.innerHTML = html; }   // 変わらないときは描き直さない（ボタンを押しそこねないように）
    H.updateViewport();
    return;
  }
  H.updateViewport();
}
/** 全員のようす（凍った数・脱落）。誰が何をまちがえたかは出さない */
function playersList(sim, r) {
  return `<ul class="fz-blist">${waveRanking(sim).map((p) => {
    const st = sim.st[p.uid];
    const ice = Array.from({ length: WAVE.outFrozen }, (_, i) => (i < st.frozen ? '❄' : '·')).join('');
    const mark = st.gone || p.dropped ? t('fz.b.dropped') : st.out !== null ? t('fz.b.wave.out') : (r >= 0 && st.earned[r] ? '✉' : '');
    return `<li class="${p.uid === backend.uid ? 'is-me' : ''}${st.out !== null ? ' is-out' : ''}"><b>${esc(p.name || t('topbar.guest'))}</b><span>${ice}</span><em>${esc(mark)}</em></li>`;
  }).join('')}</ul>`;
}

// ───────────── 綱引きの画面 ─────────────
function showTug(h, flow) {
  const ps = players();
  H.scene.setTug({ h, goal: TUG.goalCm, flow, me: (ps.find((p) => p.uid === backend.uid) || {}).team || 'A' });
}
function cardLabel(c) { return `${SUBSTANCES[c.sub].formula} ${c.g} g`; }
function renderTugPanel(s, extra) {
  const box = H.$('panel');
  const me = players().find((p) => p.uid === backend.uid) || {};
  const myTeam = me.team || 'A';
  const sim = tugSim(s.stage === 'decide' ? s.r : s.r + 1);
  const hBefore = s.stage === 'decide' ? sim.h : (sim.rounds[s.r] ? sim.rounds[s.r].before : sim.h);
  const rope = (h) => `<div class="fz-rope"><span class="is-A">${esc(t('fz.b.teamA'))}</span><span class="fz-rope__bar"><i style="left:${(50 + (h / TUG.goalCm) * 50).toFixed(1)}%"></i></span><span class="is-B">${esc(t('fz.b.teamB'))}</span></div>`
    + `<p class="fz-note">${esc(t('fz.b.tug.level', { team: t(h >= 0 ? 'fz.b.teamA' : 'fz.b.teamB'), h: f1(Math.abs(h)), goal: TUG.goalCm }))}</p>`;
  const head = `<div class="fz-head"><b>${esc(t('fz.b.tug.round', { r: s.r + 1, n: TUG.rounds }))}</b><span class="fz-myteam is-${myTeam}">${esc(t(`fz.b.team${myTeam}`))}</span>`
    + `<button type="button" class="fz-mini calc-btn" data-act="calc">${esc(t('calc.open'))}</button>${s.stage === 'decide' ? `<b class="fz-btimer" id="b-timer">${Math.ceil(s.left)}</b>` : ''}</div>`;
  const task = B.tasks[s.r];
  if (!task) { box.innerHTML = head; return; }
  if (s.stage === 'decide') {
    const dis = B.locked ? 'disabled' : '';
    box.innerHTML = head + `<div class="fz-bbar"><i id="b-bar" style="width:${(s.left / TUG.decideSec) * 100}%"></i></div>` + rope(hBefore)
      + `<p class="fz-sub">${esc(t(s.r < TUG.sameMassRounds ? 'fz.b.tug.askSame' : 'fz.b.tug.askMix'))}</p>`
      + `<div class="fz-cards">${task.cards.map((c, i) => {
        const S = SUBSTANCES[c.sub];
        return `<button type="button" class="fz-cardb${B.card === i ? ' is-on' : ''}" data-act="b-card" data-i="${i}" ${dis}><b>${esc(S.formula)}</b><em>${c.g} g</em>`
          + `<small>M ${S.M}・${esc(t('fz.how.parts', { n: S.i }))}</small></button>`;
      }).join('')}</div>`
      + `<p class="fz-note">${esc(t('fz.b.tug.howCalc'))}</p>`
      + `<div class="fz-foot"><button type="button" class="btn" data-act="b-quit">${esc(t('fz.b.quit'))}</button>`
      + `<button type="button" class="btn btn--primary" data-act="b-lock" ${dis || (B.card < 0 ? 'disabled' : '')}>${esc(t(B.locked ? 'fz.b.locked' : 'fz.b.lock'))}</button></div>`;
    return;
  }
  const rd = sim.rounds[s.r];
  if (!rd) { box.innerHTML = head + rope(hBefore); return; }
  const k = Math.max(0, Math.min(1, (s.inR - 1.2) / 3.5));
  const h = rd.before + (rd.h - rd.before) * k;
  const team = (tm) => {
    const ps = players().filter((p) => p.team === tm);
    return `<div class="fz-tteam is-${tm}"><p><b>${esc(t(`fz.b.team${tm}`))}</b><em>${esc(t('fz.b.tug.avg', { n: f3(rd.avg[tm]) }))}</em></p><ul>${ps.map((p) => {
      const pk = rd.picks[p.uid] || { c: -1, n: 0 };
      const c = pk.c >= 0 ? task.cards[pk.c] : null;
      return `<li class="${p.uid === backend.uid ? 'is-me' : ''}"><b>${esc(p.name || t('topbar.guest'))}</b><span>${c ? esc(cardLabel(c)) : esc(t('fz.b.noPick'))}</span><em>${f3(pk.n)} mol</em></li>`;
    }).join('')}</ul></div>`;
  };
  const best = task.cards.map((c, i) => ({ i, n: cardParticles(c) })).sort((a, b) => b.n - a.n)[0];
  const myPick = rd.picks[backend.uid];
  const html = head + rope(h) + `<div class="fz-tteams">${team('A')}${team('B')}</div>`
    + (k >= 1 ? `<p class="fz-note fz-note--hot">${esc(t('fz.b.tug.best', { c: cardLabel(task.cards[best.i]), n: f3(best.n) }))}${myPick && myPick.c === best.i ? ` ${esc(t('fz.b.tug.youBest'))}` : ''}</p>` : '');
  if (html !== B.revealHtml) { B.revealHtml = html; box.innerHTML = html; }
  showTug(h, k < 1 ? Math.sign(rd.h - rd.before) : 0);
}
function tugReveal(s, changed) {
  const tick = Math.floor(s.inR * 5);
  if (changed || tick !== B.lastTick) { B.lastTick = tick; renderPanel(s); }
}

// ───────────── 終わり ─────────────
async function finish() {
  if (B.phase === 'final') return;
  B.phase = 'final';
  setActive(null);
  let patch = { done: true };
  if (B.mode === 'wave') {
    const st = waveSim(WAVE.nights).st[backend.uid];
    if (st) patch = { ...patch, frozen: st.frozen, final: -st.frozen };
  }
  await room.updateMe(B.code, patch).catch(() => {});
  H.show('battle');
  renderFinal();
  settle();
}
function resultView() {
  const ps = players();
  const all = ps.every((p) => room.isDropped(p) || (p.done && p.paid));
  if (B.mode === 'wave') {
    const sim = waveSim(WAVE.nights);
    const list = waveRanking(sim);
    const rows = list.map((p) => ({ name: p.name || t('topbar.guest'), me: p.uid === backend.uid, rank: p.rank, dropped: p.dropped, done: !!p.done,
      text: t('fz.b.wave.finalRow', { n: sim.st[p.uid].frozen, left: Math.round(sim.st[p.uid].left) }), out: sim.st[p.uid].out !== null }));
    if (!all) return { state: 'waiting', rows };
    const mine = list.find((p) => p.uid === backend.uid);
    const split = room.prizeSplit(list, SETTINGS.battleFee);
    return { state: 'done', rows, rank: mine ? mine.rank : null, share: split.shares[backend.uid] || 0 };
  }
  const sim = tugSim(TUG.rounds);
  const win = tugWinner(sim);
  const rows = ['A', 'B'].map((tm) => ({ team: tm, win: win === tm, names: ps.filter((p) => p.team === tm).map((p) => ({ name: p.name || t('topbar.guest'), me: p.uid === backend.uid, dropped: room.isDropped(p) })) }));
  if (!all) return { state: 'waiting', rows, win, h: sim.h };
  const paid = ps.filter((p) => p.paid);
  const pot = paid.length * SETTINGS.battleFee;
  const getters = paid.filter((p) => !room.isDropped(p) && (!win || p.team === win));
  const me = getters.find((p) => p.uid === backend.uid);
  return { state: 'done', rows, win, h: sim.h, share: me && getters.length ? Math.floor(pot / getters.length) : 0 };
}
function renderFinal() {
  if (!B) return;
  const v = resultView();
  const prizeLine = v.state !== 'done' ? t('fz.b.waitOthers')
    : B.prize ? t('fz.b.prizeGot', { gross: formatHiyama(B.prize.gross), tax: formatHiyama(B.prize.tax), net: formatHiyama(B.prize.net) })
      : v.share > 0 ? t('fz.b.paying') : t('fz.b.noPrize');
  let body;
  if (B.mode === 'wave') {
    body = (v.state === 'done' && v.rank ? `<p class="fz-brank">${esc(t('fz.b.yourRank', { r: v.rank }))}</p>` : '')
      + `<ol class="fz-blist fz-blist--final">${v.rows.map((x) => `<li class="${x.me ? 'is-me' : ''}${x.dropped || x.out ? ' is-out' : ''}"><span>${x.dropped ? '—' : x.rank}</span><b>${esc(x.name)}</b>`
        + `<em>${esc(x.dropped ? t('fz.b.dropped') : x.done ? x.text : t('fz.b.playing'))}</em></li>`).join('')}</ol>`;
  } else {
    body = `<p class="fz-brank">${esc(v.win ? t('fz.b.tug.winner', { team: t(`fz.b.team${v.win}`) }) : t('fz.b.tug.draw'))}</p>`
      + `<p class="fz-note">${esc(t('fz.b.tug.level', { team: t(v.h >= 0 ? 'fz.b.teamA' : 'fz.b.teamB'), h: f1(Math.abs(v.h)), goal: TUG.goalCm }))}</p>`
      + `<div class="fz-teams">${v.rows.map((r) => `<div class="fz-team is-${r.team}${r.win ? ' is-win' : ''}"><p><b>${esc(t(`fz.b.team${r.team}`))}</b>${r.win ? '<em>WIN</em>' : ''}</p>`
        + `<ul class="fz-bplayers">${r.names.map((n) => `<li class="fz-bp${n.me ? ' is-me' : ''}"><b>${esc(n.name)}</b>${n.dropped ? `<span>${esc(t('fz.b.dropped'))}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>`;
  }
  H.$('battle').innerHTML = `<h2 class="fz-btitle">${esc(t('fz.b.final'))}</h2>${body}
    <p class="fz-note fz-note--hot">${esc(prizeLine)}</p>
    <p class="fz-note">${esc(t(`fz.b.${B.mode}.howRank`))}</p>
    <button type="button" class="btn btn--primary fz-wide" data-act="b-done">${esc(t('fz.toTitle'))}</button>`;
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
      const entry = await prize({ itemKey: 'ledger.item.fzBattlePrize', itemVars: {}, gross: v.share });
      if (entry) B.prize = { gross: entry.gross, tax: entry.tax, net: entry.amount };
    }
    renderFinal();
  } finally { settling = false; }
}
async function forfeit(why = 'quit') {
  if (!B) return;
  const code = B.code;
  const playing = B.phase === 'play' || B.phase === 'countdown';
  const out = B.mode === 'wave' && B.phase === 'play' && amOut(curRound());
  B.phase = 'gone';
  if (playing && !out) {
    setActive(null);
    await room.leaveRoom(code, true).catch(() => {});
    await fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine });
    H.toast(t(`fz.b.fine.${why}`, { amount: formatHiyama(SETTINGS.quitFine) }));
  } else if (playing) {
    // 脱落したあとに抜ける：罰金なし（結果だけ残す）
    setActive(null);
    await room.updateMe(code, { done: true }).catch(() => {});
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
function curRound() { return B ? Math.max(0, Math.floor((room.serverNow() - B.startAt) / roundMs(B.mode))) : 0; }

export function onClick(act, el) {
  if (!act.startsWith('b-')) return false;
  if (act === 'b-create') createRoom();
  else if (act === 'b-join') joinRoom();
  else if (act === 'b-start') startRoom();
  else if (act === 'b-leave') leaveLobby();
  else if (act === 'b-quit') forfeit('quit');
  else if (act === 'b-team') { if (B) room.updateMe(B.code, { team: el.dataset.team }).catch(() => {}); }
  else if (act === 'b-lock') { if (B) { B.locked = true; B.touched = Math.max(B.touched, curRound()); B.dirty = true; } }
  else if (act === 'b-card') { if (B && !B.locked) { B.card = Number(el.dataset.i); B.touched = Math.max(B.touched, curRound()); B.dirty = true; } }
  else if (act === 'b-target') {
    if (B) {
      const r = curRound();
      B.target[r] = el.dataset.uid;
      B.sent[`a${r}`] = el.dataset.uid;
      B.touched = Math.max(B.touched, r);
      room.updateMe(B.code, { [`a${r}`]: el.dataset.uid }).catch(() => {});
      B.lastTick = -1;
    }
  } else if (act === 'b-done') { leave(); H.toTitle(); }
  return true;
}
/** 寒波バトルの入力（撒く物質・質量）。入力欄を作りなおすとキーボードが閉じるので、費用と予算だけ書き直す */
export function onInput(el) {
  if (!B || B.locked || !el.dataset.bk || B.mode !== 'wave' || !B.picks) return false;
  const k = Number(el.dataset.k);
  if (el.dataset.bk === 'sub') B.picks[k].sub = el.value; else B.picks[k].mass = el.value;
  B.touched = Math.max(B.touched, curRound());
  const r = curRound();
  const night = waveNight(B.tasks, r, myInc(r));
  const p = judge(night, B.picks.map((q) => ({ sub: q.sub, mass: Number(q.mass) || 0 })));
  p.rows.forEach((row, i) => { const c = H.$(`bc${i}`); if (c) c.textContent = `${f1(row.cost)} pt`; });
  const over = p.used > night.budget + 1e-9;
  const bd = H.$('b-budget');
  if (bd) { bd.classList.toggle('is-over', over); bd.querySelector('b').textContent = f1(p.used); bd.querySelector('i').style.width = `${(Math.min(1, p.used / night.budget) * 100).toFixed(1)}%`; }
  const lk = H.$('b-lock');
  if (lk) { lk.disabled = over; lk.textContent = t(over ? 'fz.overBudget' : 'fz.b.lock'); }
  return true;
}
export function redraw() {
  if (!B) { if (H.screen() === 'battle') renderMenu(); return; }
  if (B.phase === 'lobby') { B.lobbyHtml = ''; renderLobby(); }
  else if (B.phase === 'final') renderFinal();
  else B.stage = null;
}

/** 確かめるとき用 */
export const debug = {
  get B() { return B; },
  fill: (list) => { if (B && B.picks) { list.forEach((x, k) => { B.picks[k] = { sub: x.sub, mass: String(x.mass) }; }); B.touched = curRound(); B.dirty = true; } },
  card: (i) => { if (B) { B.card = i; B.touched = curRound(); B.dirty = true; } },
  night: (r) => (B ? waveNight(B.tasks, r, myInc(r)) : null),
  sim: () => (B ? (B.mode === 'wave' ? waveSim(curRound() + 1) : tugSim(curRound() + 1)) : null),
};
