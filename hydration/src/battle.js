// hydration/src/battle.js
// 対戦の進行と妨害（ハイドレーション・ビート仕様書 6章）。
//   v0.8 タイマン（2人）：曲の終わりのスコアが高いほうの勝ち。
//   v0.9 バトルロイヤル（3〜12人）：水和ゲージが0になると脱落。最後まで残った人の勝ち（全員残ればスコア順）。
//        脱落した人は観戦の画面に移り、残っている人の様子を見られる。
//   ・誰かが部屋を作ると4桁の部屋番号が出る。ほかの人はその番号で入る。部屋を作った人が開始を押す。
//   ・みんなで同じ曲（部屋を作った人が選んだ曲と難易度）を同時に演奏する。
//   ・10コンボごとに、相手に妨害を1つ送る（色消し・無極性の群れ・濃霧から、くじで選ぶ）。
//     バトルロイヤルでは、送る相手を「ランダム」「1位の人」「自分を攻撃した人」から選べる（プレイ中も右上で切りかえ）。
//   ・参加料（1人100ヒヤマ）が賞金になる。勝負税を引いた残りを、2人なら1位が全額、3人以上なら1位50%・2位30%・3位20%。
//   ・途中で抜けたり、30秒以上つながらなかったり、60秒以上操作しなかったりすると、罰金（200ヒヤマ）。
//     脱落したあとは、もう演奏していないので、抜けても罰金はない。
//   ・結果に出すのは順位とスコアだけ。誰が何を間違えたかは、本人の結果の画面にだけ出す。
// 通信は shared/room.js（net.js から呼ぶ）。判定は各自の端末で行い、送るのはスコア・ゲージ・妨害だけ。

import { t } from '../../shared/i18n.js';
import { backend } from '../../shared/auth.js';
import { SETTINGS, payFee, prize, fine, formatHiyama } from '../../shared/economy.js';
import { faceUrl, faceFig } from '../../shared/characters.js';
import { ROYALE } from './config.js';
import * as net from './net.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACTIVE_KEY = 'sekidive.hb.activeBattle';   // 対戦の途中かどうか（閉じて抜けた人の罰金に使う）
export const ATTACK_KINDS = ['mono', 'swarm', 'fog'];
export const TARGETS = ['random', 'leader', 'revenge'];
export const BATTLE = {
  attackEvery: 10,        // このコンボごとに妨害を1つ送る
  monoNotes: 8,           // 色消し：次のこの数のノーツの補助輪が段階3になる
  swarmNotes: 4,          // 無極性の群れ：見送るノーツがこの数だけ割り込む
  fogSec: 8,              // 濃霧：この秒数、ノーツが判定リングの直前まで見えにくくなる
};
export const MODES = { duel: { min: 2, max: 2 }, royale: { min: ROYALE.minPlayers, max: ROYALE.maxPlayers } };

let H = null;     // main.js から渡された関数たち
let B = null;     // 今の対戦 { code, room, mode, phase, paid, seen, startAt, hiddenAt, lastInput, target, lastAttacker, out }
let target = 'random';   // バトルロイヤルで妨害を送る相手（覚えておく）

function active() { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch (e) { return null; } }
function setActive(v) { try { if (v) localStorage.setItem(ACTIVE_KEY, JSON.stringify(v)); else localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* 何もしない */ } }

/**
 * @param hooks {
 *   $, toast, show(screen), pick() → { chart, diff }, chartTitleKey(chartId),
 *   startPlay({ battle }), applyAttack(kind, fromName), quitToTitle(), playStats() → { score, gauge, combo },
 *   updateRival(view), updateBattleResult(view), eliminated()
 * }
 */
export function initBattle(hooks) {
  H = hooks;
  // 前回、対戦の途中で抜けた（ページを閉じた・通信が切れた）ときは、ここで罰金を払う
  const a = active();
  if (a && backend.mode === 'online') {
    setActive(null);
    fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine }).then((fe) => {
      H.toast(fe && fe.waived ? t('fine.waived') : t('hb.battle.fineOld', { amount: formatHiyama(SETTINGS.quitFine) }));
    });
    net.leaveRoom(a.code, true).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (!B || B.phase !== 'playing' || B.out) return;
    if (document.hidden) B.hiddenAt = Date.now();
    else if (B.hiddenAt && Date.now() - B.hiddenAt > net.ROOM.dropSec * 1000) forfeit('drop');
    else B.hiddenAt = 0;
  });
}

export function inBattle() { return !!(B && (B.phase === 'playing' || B.phase === 'countdown')); }
export function battleMode() { return B ? B.mode : null; }
export function isOut() { return !!(B && B.out); }

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
    <h2 class="hb-zukan__title">${esc(t('hb.battle.menuTitle'))}</h2>
    <ul class="hb-battle__rules">
      <li>${esc(t('hb.battle.rule1'))}</li>
      <li>${esc(t('hb.battle.ruleRoyale'))}</li>
      <li>${esc(t('hb.battle.rule2', { n: BATTLE.attackEvery }))}</li>
      <li>${esc(t('hb.battle.rule3', { fee: formatHiyama(SETTINGS.battleFee), tax: Math.round(SETTINGS.betTaxRate * 100) }))}</li>
      <li>${esc(t('hb.battle.rule4', { fine: formatHiyama(SETTINGS.quitFine) }))}</li>
    </ul>
    <div class="hb-battle__song"><span>${esc(t('hb.battle.song'))}</span><b>${esc(t(H.chartTitleKey(chart)))} ・ ${esc(t(`hb.diff.${diff}`))}</b>
      <small>${esc(t('hb.battle.songNote'))}</small></div>
    <div class="hb-battle__modes">
      <button type="button" class="btn btn--primary" data-act="battle-create" data-mode="duel"><b>${esc(t('hb.battle.mode.duel'))}</b><small>${esc(t('hb.battle.mode.duelSub'))}</small></button>
      <button type="button" class="btn btn--primary" data-act="battle-create" data-mode="royale"><b>${esc(t('hb.battle.mode.royale'))}</b><small>${esc(t('hb.battle.mode.royaleSub', { min: ROYALE.minPlayers, max: ROYALE.maxPlayers }))}</small></button>
    </div>
    <div class="hb-battle__join">
      <input type="text" inputmode="numeric" maxlength="4" pattern="[0-9]*" id="battle-code" placeholder="0000" aria-label="${esc(t('hb.battle.codeLabel'))}" autocomplete="off">
      <button type="button" class="btn" data-act="battle-join">${esc(t('hb.battle.join'))}</button>
    </div>
    <p class="hb-zukan__empty">${esc(t('hb.battle.privacy'))}</p>
    <button type="button" class="btn hb-zukan__back" data-act="battle-close">${esc(t('hb.zukan.back'))}</button>`;
}

export async function createRoom(mode = 'duel') {
  const { chart, diff } = H.pick();
  const m = MODES[mode] || MODES.duel;
  try {
    const code = await net.createRoom({ world: 'hydration', mode, max: m.max, meta: { chart, diff } });
    enterRoom(code, mode);
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
    enterRoom(code, null);
  } catch (e) {
    console.info('[対戦] 部屋に入れませんでした', e && e.message);
    H.toast(t('hb.battle.err'));
  }
}

function enterRoom(code, mode) {
  B = { code, room: null, mode: mode || 'duel', phase: 'lobby', paid: false, seen: new Set(), startAt: 0, hiddenAt: 0, lastInput: Date.now(), started: false, out: false, lastAttacker: null };
  B.unsub = net.watchRoom(code, onRoom);
  B.beat = setInterval(heartbeat, net.ROOM.heartbeatMs);
  renderLobby();
}

function heartbeat() {
  if (!B) return;
  const st = B.phase === 'playing' && !B.out ? H.playStats() : null;
  const patch = st ? { score: st.score, gauge: Math.round(st.gauge), combo: st.combo } : {};
  net.updateMe(B.code, patch).catch(() => {});
  // 放置（60秒操作なし）は、途中退出と同じ扱い（脱落したあとは、もう操作しないので数えない）
  if (B.phase === 'playing' && !B.out && Date.now() - B.lastInput > net.ROOM.idleSec * 1000) forfeit('idle');
}

/** ボタンを押したとき（放置の見張り） */
export function touched() { if (B) B.lastInput = Date.now(); }

function rivals(room) {
  const ps = (room && room.players) || {};
  return Object.entries(ps).filter(([u, p]) => u !== backend.uid && !(B && B.phase === 'lobby' && p.left)).map(([uid, p]) => ({ uid, ...p }));
}

function onRoom(room) {
  if (!B) return;
  B.room = room;
  if (!room) { if (B.phase === 'lobby') { H.toast(t('hb.battle.closed')); leave(); H.show('battle'); renderMenu(); } return; }
  if (room.mode) B.mode = room.mode;
  // 開始の合図
  if (room.state === 'countdown' && room.startAt && !B.started && room.players && room.players[backend.uid]) {
    B.started = true;
    beginCountdown(room);
  }
  if (B.phase === 'lobby') renderLobby();
  if (B.phase === 'playing' || B.phase === 'result') {
    H.updateRival(rivalViews(room));
    // 届いた妨害
    for (const [id, a] of Object.entries(room.attacks || {})) {
      if (B.seen.has(id)) continue;
      B.seen.add(id);
      if (a.to === backend.uid && a.at >= (room.startAt || 0) && B.phase === 'playing' && !B.out) {
        const from = room.players && room.players[a.from];
        B.lastAttacker = a.from;
        H.applyAttack(a.kind, (from && from.name) || t('topbar.guest'));
      }
    }
  }
  if (B.phase === 'result' || (B.out && B.phase === 'playing')) settle();
}

/** 相手たちの小さな表示（点数の高い順）。脱落・切断した人は灰色 */
function rivalViews(room) {
  const list = net.ranking(room && room.players);
  return {
    mode: B.mode,
    me: B.out,
    rows: list.filter((p) => p.uid !== backend.uid || B.mode === 'royale').map((p) => ({
      uid: p.uid, me: p.uid === backend.uid, name: p.name || t('topbar.guest'), face: faceUrl(p.avatar || 'minato', p.costume || 'base'), avatar: p.avatar || 'minato', costume: p.costume || 'base',
      score: p.final ?? p.score ?? 0, gauge: p.gauge ?? 0, combo: p.combo ?? 0, rank: p.rank,
      dropped: p.dropped, out: !!p.out, done: !!p.done, attacker: p.uid === B.lastAttacker,
    })),
  };
}

function renderLobby() {
  if (!B) return;
  const room = B.room;
  const box = H.$('battle');
  const ps = Object.entries((room && room.players) || {}).filter(([, p]) => !p.left);
  const host = room && room.host === backend.uid;
  const meta = (room && room.meta) || {};
  const m = MODES[B.mode] || MODES.duel;
  const n = Math.max(m.min, Math.min(m.max, ps.length + (ps.length < m.max ? 1 : 0)));
  const slots = Array.from({ length: B.mode === 'duel' ? 2 : n }, (_, i) => {
    const e = ps[i];
    if (!e) return `<li class="hb-battle__p is-empty">${esc(t('hb.battle.waiting'))}</li>`;
    const [uid, p] = e;
    return `<li class="hb-battle__p">${faceFig(t, p.avatar || 'minato', { costume: p.costume || 'base', size: 40 })}
      <b>${esc(p.name || t('topbar.guest'))}${uid === backend.uid ? ` ${esc(t('hb.battle.you'))}` : ''}</b>
      ${room.host === uid ? `<span>${esc(t('hb.battle.host'))}</span>` : ''}</li>`;
  }).join('');
  const targetRow = B.mode === 'royale' ? `
    <div class="hb-battle__target"><span>${esc(t('hb.battle.targetLabel'))}</span>
      <div class="hb-diff">${TARGETS.map((k) => `<button type="button" class="hb-diff__btn${target === k ? ' is-on' : ''}" data-act="battle-target" data-target="${k}" aria-pressed="${target === k}"><b>${esc(t(`hb.battle.target.${k}`))}</b></button>`).join('')}</div></div>` : '';
  const html = `
    <h2 class="hb-zukan__title">${esc(t(`hb.battle.mode.${B.mode}`))}</h2>
    <p class="hb-battle__code"><span>${esc(t('hb.battle.code'))}</span><b>${esc(B.code)}</b></p>
    <p class="hb-zukan__empty">${esc(t('hb.battle.codeShare'))}</p>
    <div class="hb-battle__song"><span>${esc(t('hb.battle.song'))}</span><b>${meta.chart ? `${esc(t(H.chartTitleKey(meta.chart)))} ・ ${esc(t(`hb.diff.${meta.diff}`))}` : ''}</b></div>
    <p class="hb-battle__count">${esc(t('hb.battle.count', { n: ps.length, max: m.max }))}</p>
    <ul class="hb-battle__players${B.mode === 'royale' ? ' is-royale' : ''}">${slots}</ul>
    ${targetRow}
    ${host ? `<button type="button" class="btn btn--primary hb-battle__wide" data-act="battle-start"${ps.length >= m.min ? '' : ' disabled'}>${esc(t(ps.length >= m.min ? 'hb.battle.start' : 'hb.battle.needMore', { fee: formatHiyama(SETTINGS.battleFee), n: m.min }))}</button>`
      : `<p class="hb-battle__wait">${esc(t('hb.battle.waitHost'))}</p>`}
    <button type="button" class="btn hb-zukan__back" data-act="battle-leave">${esc(t('hb.battle.leave'))}</button>`;
  // 中身が変わったときだけ描き直す（毎秒の連絡のたびに描き直すと、ボタンを押しそこねるため）
  if (html === B.lobbyHtml && box.innerHTML) return;
  B.lobbyHtml = html;
  box.innerHTML = html;
}

/** 妨害を送る相手を選ぶ（バトルロイヤル） */
export function setTarget(k) {
  if (!TARGETS.includes(k)) return;
  target = k;
  if (B && B.phase === 'lobby') renderLobby();
}
/** プレイ中の右上のボタン：次の選び方へ */
export function nextTarget() {
  target = TARGETS[(TARGETS.indexOf(target) + 1) % TARGETS.length];
  return target;
}
export function currentTarget() { return target; }

/** 部屋を作った人が「開始」を押したとき */
export async function startRoom() {
  if (!B || !B.room || B.room.host !== backend.uid) return;
  const ps = Object.values(B.room.players || {}).filter((p) => !p.left);
  if (ps.length < (MODES[B.mode] || MODES.duel).min) return;
  await net.updateRoom(B.code, { state: 'countdown', startAt: net.serverNow() + net.ROOM.countdownMs });
}

async function beginCountdown(room) {
  // 参加料を払う（払えなければ抜ける）
  const fee = await payFee({ itemKey: 'ledger.item.battleFee', amount: SETTINGS.battleFee });
  if (!fee) {
    H.toast(t('hb.battle.no.short', { fee: formatHiyama(SETTINGS.battleFee) }));
    await net.leaveRoom(B.code, true).catch(() => {});
    leave();
    H.show('title');
    return;
  }
  B.paid = true;
  await net.updateMe(B.code, { paid: true });
  setActive({ code: B.code, startAt: room.startAt });
  B.startAt = room.startAt;
  B.phase = 'playing';
  B.lastInput = Date.now();
  H.updateRival(rivalViews(room));
  H.startPlay({ battle: { code: B.code, mode: B.mode, chart: room.meta.chart, diff: room.meta.diff, startAt: room.startAt } });
}

/** 妨害を送る相手を決める */
function pickTarget() {
  const live = rivals(B.room).filter((p) => !net.isDropped(p) && !p.out && !p.done);
  if (!live.length) return null;
  if (B.mode === 'royale' && target === 'leader') {
    return live.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  }
  if (B.mode === 'royale' && target === 'revenge' && B.lastAttacker) {
    const r = live.find((p) => p.uid === B.lastAttacker);
    if (r) return r;
  }
  return live[Math.floor(Math.random() * live.length)];
}

/** コンボが続いたとき（main.js から）。BATTLE.attackEvery ごとに相手へ妨害を送る */
export function onCombo(combo) {
  if (!B || B.phase !== 'playing' || B.out || !combo || combo % BATTLE.attackEvery) return null;
  const r = pickTarget();
  if (!r) return null;
  const kind = ATTACK_KINDS[Math.floor(Math.random() * ATTACK_KINDS.length)];
  net.sendAttack(B.code, r.uid, kind).catch(() => {});
  return { kind, to: r.name || t('topbar.guest') };
}

/** バトルロイヤルで水和ゲージが0になったとき（main.js から）。脱落して観戦に移る */
export async function eliminate(score) {
  if (!B || B.out || B.mode !== 'royale') return;
  B.out = true;
  B.final = score;
  setActive(null);    // もう演奏していないので、ここで抜けても罰金はない
  await net.updateMe(B.code, { out: net.serverNow(), done: true, final: score, score, gauge: 0 }).catch(() => {});
}

/** 曲が終わったとき（main.js から）。結果を送り、ほかの人を待つ */
export async function finished(score) {
  if (!B) return null;
  B.phase = 'result';
  if (!B.out) {
    B.final = score;
    await net.updateMe(B.code, { done: true, final: score, score }).catch(() => {});
  }
  return resultView();
}

/** 結果の画面に出す、対戦の部分 */
export function resultView() {
  if (!B || !B.room) return { state: 'waiting', ranks: [], mode: B ? B.mode : 'duel' };
  const list = net.ranking(B.room.players);
  // v1.0：参加料を払った印もそろってから（印が届くのがおくれても、賞金の合計がずれないように）
  const all = list.every((p) => p.dropped || (p.done && p.paid));
  // v1.0：部屋に書かれた結果があれば、全員それを使う（端末ごとに切断の見え方がずれても、順位と賞金がそろう）
  const fixed = B.fixed || B.room.result || null;
  const rankOf = (p) => (fixed ? (fixed.ranks || {})[p.uid] || 0 : p.rank);
  const ranks = list.map((p) => ({ name: p.name || t('topbar.guest'), score: p.final ?? p.score ?? 0, rank: rankOf(p), me: p.uid === backend.uid, dropped: fixed ? !rankOf(p) : p.dropped, out: !!p.out }));
  if (fixed) ranks.sort((a, b) => (a.rank || 99) - (b.rank || 99));
  if (!all && !fixed) return { state: 'waiting', ranks, code: B.code, mode: B.mode };
  let rank, share, pot, firsts;
  if (fixed) {
    const m = net.resultOf(fixed, backend.uid);
    ({ rank, share, pot } = m);
    firsts = Object.values(fixed.ranks || {}).filter((r) => r === 1);
  } else {
    const mine = list.find((p) => p.uid === backend.uid);
    const split = net.prizeSplit(list, SETTINGS.battleFee);
    rank = mine && !mine.dropped ? mine.rank : null;
    share = split.shares[backend.uid] || 0; pot = split.pot;
    firsts = list.filter((p) => p.rank === 1 && !p.dropped);
  }
  return {
    state: 'done', ranks, list, fixed: !!fixed, code: B.code, mode: B.mode, rank: rank || null, win: rank === 1,
    draw: firsts.length > 1, share, pot, prize: B.prize || null,
  };
}

let settling = false;
async function settle() {
  let v = resultView();
  H.updateBattleResult(v);
  if (v.state !== 'done' || settling || B.settled) return;
  settling = true;
  try {
    B.settled = true;
    if (!v.fixed) { B.fixed = await net.fixResult(B.code, v.list, SETTINGS.battleFee); v = resultView(); }
    setActive(null);
    if (B.room && B.room.host === backend.uid) net.updateRoom(B.code, { state: 'done' }).catch(() => {});
    if (v.share > 0 && await net.claimOnce(B.code)) {
      const entry = await prize({ itemKey: 'ledger.item.battlePrize', itemVars: {}, gross: v.share });
      if (entry) B.prize = { gross: entry.gross, tax: entry.tax, net: entry.amount };
    }
    H.updateBattleResult(resultView());
  } finally { settling = false; }
}

/** 対戦をやめる（演奏の途中なら罰金。脱落したあとなら罰金なし） */
export async function forfeit(why = 'quit') {
  if (!B) return;
  const code = B.code;
  const playing = B.phase === 'playing' && !B.out;
  B.phase = 'gone';
  if (playing) {
    setActive(null);
    await net.leaveRoom(code, true).catch(() => {});
    const fe = await fine({ itemKey: 'ledger.item.quitFine', amount: SETTINGS.quitFine });
    H.toast(fe && fe.waived ? t('fine.waived') : t(`hb.battle.fine.${why}`, { amount: formatHiyama(SETTINGS.quitFine) }));
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
  else if (B.room) H.updateRival(rivalViews(B.room));
}
