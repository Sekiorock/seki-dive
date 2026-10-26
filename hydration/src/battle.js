// hydration/src/battle.js
// 対戦の進行と妨害（ハイドレーション・ビート仕様書 6章、v0.8：タイマン）。
//   ・誰かが部屋を作ると4桁の部屋番号が出る。もう1人はその番号で入る。部屋を作った人が開始を押す。
//   ・2人で同じ曲（部屋を作った人が選んだ曲と難易度）を同時に演奏し、曲の終わりのスコアが高いほうの勝ち。
//   ・10コンボごとに、相手に妨害を1つ送る（色消し・無極性の群れ・濃霧から、くじで選ぶ）。
//   ・参加料（1人100ヒヤマ）が賞金になる。勝負税を引いた残りを、勝った人が受け取る（引き分けは半分ずつ）。
//   ・途中で抜けたり、30秒以上つながらなかったり、60秒以上操作しなかったりすると、罰金（200ヒヤマ）。
//   ・結果に出すのは順位とスコアだけ。誰が何を間違えたかは、本人の結果の画面にだけ出す。
// 通信は shared/room.js（net.js から呼ぶ）。判定は各自の端末で行い、送るのはスコア・ゲージ・妨害だけ。

import { t } from '../../shared/i18n.js';
import { backend } from '../../shared/auth.js';
import { SETTINGS, payFee, prize, fine, formatHiyama } from '../../shared/economy.js';
import { faceUrl } from '../../shared/characters.js';
import * as net from './net.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACTIVE_KEY = 'sekidive.hb.activeBattle';   // 対戦の途中かどうか（閉じて抜けた人の罰金に使う）
export const ATTACK_KINDS = ['mono', 'swarm', 'fog'];
export const BATTLE = {
  attackEvery: 10,        // このコンボごとに妨害を1つ送る
  monoNotes: 8,           // 色消し：次のこの数のノーツの補助輪が段階3になる
  swarmNotes: 4,          // 無極性の群れ：見送るノーツがこの数だけ割り込む
  fogSec: 8,              // 濃霧：この秒数、ノーツが判定リングの直前まで見えにくくなる
};

let H = null;     // main.js から渡された関数たち
let B = null;     // 今の対戦 { code, room, unsub, phase, paid, seen, startAt, lastSend, hiddenAt, lastInput }

function active() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { return null; } }
function setActive(v) { try { if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* 何もしない */ } }

/**
 * @param hooks {
 *   $, toast, show(screen), pick() → { chart, diff }, chartTitleKey(chartId),
 *   startPlay({ battle }), applyAttack(kind, fromName), quitToTitle(), playStats() → { score, gauge, combo }
 * }
 */
export function initBattle(hooks) {
  H = hooks;
  // 前回、対戦の途中で抜けた（ページを閉じた・通信が切れた）ときは、ここで罰金を払う
  const a = active();
  if (a && backend.mode === 'online') {
    setActive(null);
    fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine }).then(() => {
      H.toast(t('hb.battle.fineOld', { amount: formatHiyama(SETTINGS.quitFine) }));
    });
    net.leaveRoom(a.code, true).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (!B || B.phase !== 'playing') return;
    if (document.hidden) B.hiddenAt = Date.now();
    else if (B.hiddenAt && Date.now() - B.hiddenAt > net.ROOM.dropSec * 1000) forfeit('drop');
    else B.hiddenAt = 0;
  });
}

export function inBattle() { return !!(B && (B.phase === 'playing' || B.phase === 'countdown')); }
export function battleCode() { return B && B.code; }

// ───────────── 対戦の入口（部屋を作る・番号で入る） ─────────────
export function openBattle() {
  const ok = net.battleAllowed();
  if (!ok.ok) { H.toast(t(`hb.battle.no.${ok.reason}`, { fee: formatHiyama(SETTINGS.battleFee) })); return; }
  B = null;
  renderMenu();
  H.show('battle');
}

function renderMenu() {
  const { chart, diff } = H.pick();
  const box = H.$('battle');
  box.innerHTML = `
    <h2 class="hb-zukan__title">${esc(t('hb.battle.title'))}</h2>
    <ul class="hb-battle__rules">
      <li>${esc(t('hb.battle.rule1'))}</li>
      <li>${esc(t('hb.battle.rule2', { n: BATTLE.attackEvery }))}</li>
      <li>${esc(t('hb.battle.rule3', { fee: formatHiyama(SETTINGS.battleFee), tax: Math.round(SETTINGS.betTaxRate * 100) }))}</li>
      <li>${esc(t('hb.battle.rule4', { fine: formatHiyama(SETTINGS.quitFine) }))}</li>
    </ul>
    <div class="hb-battle__song"><span>${esc(t('hb.battle.song'))}</span><b>${esc(t(H.chartTitleKey(chart)))} ・ ${esc(t(`hb.diff.${diff}`))}</b>
      <small>${esc(t('hb.battle.songNote'))}</small></div>
    <button type="button" class="btn btn--primary hb-battle__wide" data-act="battle-create">${esc(t('hb.battle.create'))}</button>
    <div class="hb-battle__join">
      <input type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" id="battle-code" placeholder="0000" aria-label="${esc(t('hb.battle.codeLabel'))}" autocomplete="off">
      <button type="button" class="btn" data-act="battle-join">${esc(t('hb.battle.join'))}</button>
    </div>
    <p class="hb-zukan__empty">${esc(t('hb.battle.privacy'))}</p>
    <button type="button" class="btn hb-zukan__back" data-act="battle-close">${esc(t('hb.zukan.back'))}</button>`;
}

export async function createRoom() {
  const { chart, diff } = H.pick();
  try {
    const code = await net.createRoom({ world: 'hydration', mode: 'duel', max: 2, meta: { chart, diff } });
    enterRoom(code);
  } catch (e) {
    console.info('[対戦] 部屋を作れませんでした', e && e.message);
    H.toast(t('hb.battle.err'));
  }
}

export async function joinRoom() {
  const code = (H.$('battle-code').value || '').replace(/\D/g, '');
  if (code.length !== 4) { H.toast(t('hb.battle.codeBad')); return; }
  try {
    const r = await net.joinRoom(code, 'hydration');
    if (!r.ok) { H.toast(t(`hb.battle.join.${r.reason}`)); return; }
    enterRoom(code);
  } catch (e) {
    console.info('[対戦] 部屋に入れませんでした', e && e.message);
    H.toast(t('hb.battle.err'));
  }
}

function enterRoom(code) {
  B = { code, room: null, phase: 'lobby', paid: false, seen: new Set(), startAt: 0, lastSend: 0, hiddenAt: 0, lastInput: Date.now(), started: false };
  B.unsub = net.watchRoom(code, onRoom);
  B.beat = setInterval(heartbeat, net.ROOM.heartbeatMs);
  renderLobby();
}

function heartbeat() {
  if (!B) return;
  const st = B.phase === 'playing' ? H.playStats() : null;
  const patch = st ? { score: st.score, gauge: Math.round(st.gauge), combo: st.combo } : {};
  net.updateMe(B.code, patch).catch(() => {});
  // 放置（60秒操作なし）は、途中退出と同じ扱い
  if (B.phase === 'playing' && Date.now() - B.lastInput > net.ROOM.idleSec * 1000) forfeit('idle');
}

/** ボタンを押したとき（放置の見張り） */
export function touched() { if (B) B.lastInput = Date.now(); }

function rival(room) {
  const ps = (room && room.players) || {};
  const id = Object.keys(ps).find((u) => u !== backend.uid);
  return id ? { uid: id, ...ps[id] } : null;
}

function onRoom(room) {
  if (!B) return;
  B.room = room;
  if (!room) { if (B.phase === 'lobby') { H.toast(t('hb.battle.closed')); leave(); } return; }
  // 開始の合図
  if (room.state === 'countdown' && !B.started && room.players && room.players[backend.uid]) {
    B.started = true;
    beginCountdown(room);
  }
  if (B.phase === 'lobby') renderLobby();
  if (B.phase === 'playing' || B.phase === 'result') {
    H.updateRival(rivalView(room));
    // 届いた妨害
    for (const [id, a] of Object.entries(room.attacks || {})) {
      if (B.seen.has(id)) continue;
      B.seen.add(id);
      if (a.to === backend.uid && a.at >= (room.startAt || 0) && B.phase === 'playing') {
        const from = room.players && room.players[a.from];
        H.applyAttack(a.kind, (from && from.name) || t('topbar.guest'));
      }
    }
  }
  if (B.phase === 'result') settle();
}

function rivalView(room) {
  const r = rival(room);
  if (!r) return null;
  return { name: r.name || t('topbar.guest'), face: faceUrl(r.avatar || 'minato', r.costume || 'base'), score: r.final ?? r.score ?? 0,
    gauge: r.gauge ?? 0, combo: r.combo ?? 0, dropped: net.isDropped(r), done: !!r.done };
}

function renderLobby() {
  if (!B) return;
  const room = B.room;
  const box = H.$('battle');
  const ps = Object.entries((room && room.players) || {}).filter(([, p]) => !p.left);
  const host = room && room.host === backend.uid;
  const meta = (room && room.meta) || {};
  const slots = [0, 1].map((i) => {
    const e = ps[i];
    if (!e) return `<li class="hb-battle__p is-empty">${esc(t('hb.battle.waiting'))}</li>`;
    const [uid, p] = e;
    return `<li class="hb-battle__p"><img src="${faceUrl(p.avatar || 'minato', p.costume || 'base')}" alt="" width="40" height="40">
      <b>${esc(p.name || t('topbar.guest'))}${uid === backend.uid ? ` ${esc(t('hb.battle.you'))}` : ''}</b>
      ${room.host === uid ? `<span>${esc(t('hb.battle.host'))}</span>` : ''}</li>`;
  }).join('');
  box.innerHTML = `
    <h2 class="hb-zukan__title">${esc(t('hb.battle.title'))}</h2>
    <p class="hb-battle__code"><span>${esc(t('hb.battle.code'))}</span><b>${esc(B.code)}</b></p>
    <p class="hb-zukan__empty">${esc(t('hb.battle.codeShare'))}</p>
    <div class="hb-battle__song"><span>${esc(t('hb.battle.song'))}</span><b>${meta.chart ? `${esc(t(H.chartTitleKey(meta.chart)))} ・ ${esc(t(`hb.diff.${meta.diff}`))}` : ''}</b></div>
    <ul class="hb-battle__players">${slots}</ul>
    ${host ? `<button type="button" class="btn btn--primary hb-battle__wide" data-act="battle-start"${ps.length >= 2 ? '' : ' disabled'}>${esc(t('hb.battle.start', { fee: formatHiyama(SETTINGS.battleFee) }))}</button>`
      : `<p class="hb-battle__wait">${esc(t('hb.battle.waitHost'))}</p>`}
    <button type="button" class="btn hb-zukan__back" data-act="battle-leave">${esc(t('hb.battle.leave'))}</button>`;
}

/** 部屋を作った人が「開始」を押したとき */
export async function startRoom() {
  if (!B || !B.room || B.room.host !== backend.uid) return;
  const ps = Object.values(B.room.players || {}).filter((p) => !p.left);
  if (ps.length < 2) return;
  await net.updateRoom(B.code, { state: 'countdown', startAt: net.serverNow() + net.ROOM.countdownMs });
}

async function beginCountdown(room) {
  // 参加料を払う（払えなければ抜ける）
  const fee = await payFee({ itemKey: 'ledger.item.battleFee', amount: SETTINGS.battleFee });
  if (!fee) {
    H.toast(t('hb.battle.no.short', { fee: formatHiyama(SETTINGS.battleFee) }));
    await net.leaveRoom(B.code, true).catch(() => {});
    leave();
    return;
  }
  B.paid = true;
  await net.updateMe(B.code, { paid: true });
  setActive({ code: B.code, startAt: room.startAt });
  B.startAt = room.startAt;
  B.phase = 'playing';
  B.lastInput = Date.now();
  H.updateRival(rivalView(room));
  H.startPlay({ battle: { code: B.code, chart: room.meta.chart, diff: room.meta.diff, startAt: room.startAt } });
}

/** コンボが続いたとき（main.js から）。BATTLE.attackEvery ごとに相手へ妨害を送る */
export function onCombo(combo) {
  if (!B || B.phase !== 'playing' || !combo || combo % BATTLE.attackEvery) return null;
  const r = rival(B.room);
  if (!r || net.isDropped(r)) return null;
  const kind = ATTACK_KINDS[Math.floor(Math.random() * ATTACK_KINDS.length)];
  net.sendAttack(B.code, r.uid, kind).catch(() => {});
  return { kind, to: r.name || t('topbar.guest') };
}

/** 曲が終わったとき（main.js から）。結果を送り、相手を待つ */
export async function finished(score) {
  if (!B) return null;
  B.phase = 'result';
  B.final = score;
  await net.updateMe(B.code, { done: true, final: score, score }).catch(() => {});
  return resultView();
}

/** 結果の画面に出す、対戦の部分 */
export function resultView() {
  if (!B || !B.room) return { state: 'waiting', ranks: [] };
  const list = net.ranking(B.room.players);
  const all = list.every((p) => p.done || p.dropped);
  const ranks = list.map((p) => ({ name: p.name || t('topbar.guest'), score: p.final ?? p.score ?? 0, rank: p.rank, me: p.uid === backend.uid, dropped: p.dropped }));
  if (!all) return { state: 'waiting', ranks, code: B.code };
  const mine = list.find((p) => p.uid === backend.uid);
  const split = net.prizeSplit(list, SETTINGS.battleFee);
  return {
    state: 'done', ranks, code: B.code, rank: mine ? mine.rank : null, win: mine && mine.rank === 1 && !mine.dropped,
    draw: list.filter((p) => p.rank === 1 && !p.dropped).length > 1,
    share: split.shares[backend.uid] || 0, pot: split.pot, prize: B.prize || null,
  };
}

let settling = false;
async function settle() {
  const v = resultView();
  H.updateBattleResult(v);
  if (v.state !== 'done' || settling || B.settled) return;
  settling = true;
  try {
    B.settled = true;
    setActive(null);
    if (B.room && B.room.host === backend.uid) net.updateRoom(B.code, { state: 'done' }).catch(() => {});
    if (v.share > 0 && await net.claimOnce(B.code)) {
      const entry = await prize({ itemKey: 'ledger.item.battlePrize', itemVars: {}, gross: v.share });
      if (entry) B.prize = { gross: entry.gross, tax: entry.tax, net: entry.amount };
    }
    H.updateBattleResult(resultView());
  } finally { settling = false; }
}

/** 対戦をやめる（途中なら罰金） */
export async function forfeit(why = 'quit') {
  if (!B) return;
  const code = B.code;
  const playing = B.phase === 'playing';
  B.phase = 'gone';
  if (playing) {
    setActive(null);
    await net.leaveRoom(code, true).catch(() => {});
    await fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine });
    H.toast(t(`hb.battle.fine.${why}`, { amount: formatHiyama(SETTINGS.quitFine) }));
  }
  leave();
  H.quitToTitle();
}

/** 部屋を出る（始まる前なら罰金なし） */
export async function leaveLobby() {
  if (!B) return;
  const code = B.code;
  const started = B.phase !== 'lobby';
  leave();
  await net.leaveRoom(code, started).catch(() => {});
  H.show('title');
}

/** 対戦を終えて、見張りを止める */
export function leave() {
  if (!B) return;
  if (B.unsub) B.unsub();
  clearInterval(B.beat);
  B = null;
  H.updateRival(null);
}

/** 言語を切りかえたとき */
export function redraw() {
  if (!B) { if (H.$('battle') && !H.$('battle').hidden) renderMenu(); return; }
  if (B.phase === 'lobby') renderLobby();
}
