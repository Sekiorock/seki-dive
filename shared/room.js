// shared/room.js  対戦の部屋と賞金（全体の仕様書 11章：4つのワールドで共通の仕組み）
//
// 部屋：rooms/{4桁の番号} = {
//   world, mode, host, state: 'lobby' | 'countdown' | 'playing' | 'done', createdAt, startAt, max,
//   meta: { ワールドごとの設定（曲・難易度など） },
//   players: { uid: { name, avatar, costume, joinedAt, lastSeen, paid, score, gauge, combo, done, final, left, out } },
//            out はバトルロイヤルで脱落した時刻（水和ゲージが0になった）
//   attacks: { pushId: { from, to, kind, at } },   // 妨害
//   claims: { uid: true },                          // 賞金を受け取った印（2回受け取れないように）
// }
// 判定や計算は各自の端末で行い、通信では結果（スコア、ゲージ、妨害）だけを送る。
// 無料のプランではサーバーのプログラムが使えないので、参加料・賞金・罰金は、それぞれ本人の端末が払う・受け取る。
//
// 対戦できるとき：先生の設定 settings.battleMode が
//   'always' いつでも（はじめの設定） ／ 'class' 授業中のみ（先生が管理画面で「授業を始める」を押してから終えるまで） ／ 'off' 停止

import { backend, getUser, getCostume } from './auth.js';
import { getSettings, SETTINGS, getBalance, isInArrears } from './economy.js';

const fb = () => backend.fb;
const r = (p) => fb().ref(backend.db, p);

export const ROOM = {
  heartbeatMs: 1000,      // 自分の状態を送る間隔
  dropSec: 30,            // この秒数、連絡がない人は「切断」とみなす（全体の仕様書 11章）
  idleSec: 60,            // この秒数、何も操作しない人は「放置」とみなす
  countdownMs: 6000,      // 開始を押してから曲が始まるまで
  maxAgeMs: 2 * 3600 * 1000,   // これより古い部屋には入れない
};

// サーバーの時計とのずれ（ミリ秒）。2台の端末で同時に曲を始めるのに使う
let serverOffset = 0;
let offsetWatching = false;
function watchOffset() {
  if (offsetWatching || backend.mode !== 'online') return;
  offsetWatching = true;
  try {
    fb().onValue(r('.info/serverTimeOffset'), (s) => { const v = s.val(); if (typeof v === 'number') serverOffset = v; });
  } catch (e) { /* 取れなければ端末の時計を使う */ }
}
export function serverNow() { watchOffset(); return Date.now() + serverOffset; }

/** 対戦できるか。{ ok, reason }（reason：'noconfig' | 'offline' | 'off' | 'class' | 'arrears' | 'short'） */
export function battleAllowed() {
  // つながっていないとき：設定が空（noconfig）か、通信できなかった（offline）かを分けて知らせる
  if (backend.mode !== 'online') return { ok: false, reason: backend.reason === 'noconfig' ? 'noconfig' : 'offline' };
  const s = getSettings();
  // はじめは「いつでも」（生徒どうしで自由に対戦を始められる）。先生は「授業中のみ」「停止」にもできる
  const mode = s.battleMode || 'always';
  if (mode === 'off') return { ok: false, reason: 'off' };
  if (mode === 'class' && !(typeof s.classUntil === 'number' && s.classUntil > serverNow())) return { ok: false, reason: 'class' };
  if (isInArrears()) return { ok: false, reason: 'arrears' };
  if (getBalance() < SETTINGS.battleFee) return { ok: false, reason: 'short' };
  return { ok: true };
}

function me() {
  const u = getUser();
  const avatar = u.lastAvatar;
  return { name: u.nickname || '', avatar, costume: getCostume(avatar), joinedAt: serverNow(), lastSeen: serverNow() };
}

/** 部屋を作る。4桁の番号を返す */
export async function createRoom({ world, mode, max = 2, meta = {} }) {
  watchOffset();
  for (let i = 0; i < 20; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const snap = await fb().get(r(`rooms/${code}`));
    const v = snap.val();
    if (v && serverNow() - (v.createdAt || 0) < ROOM.maxAgeMs && v.state !== 'done') continue;   // 使われている
    await fb().set(r(`rooms/${code}`), {
      world, mode, max, meta, host: backend.uid, state: 'lobby', createdAt: serverNow(),
      players: { [backend.uid]: me() },
    });
    return code;
  }
  throw new Error('no free room');
}

/** 番号で部屋に入る。{ ok, reason }（reason：'none' | 'world' | 'started' | 'full'） */
export async function joinRoom(code, world) {
  watchOffset();
  const snap = await fb().get(r(`rooms/${code}`));
  const v = snap.val();
  if (!v || serverNow() - (v.createdAt || 0) > ROOM.maxAgeMs || v.state === 'done') return { ok: false, reason: 'none' };
  if (v.world !== world) return { ok: false, reason: 'world' };
  const players = v.players || {};
  if (players[backend.uid]) return { ok: true };
  if (v.state !== 'lobby') return { ok: false, reason: 'started' };
  if (Object.keys(players).length >= (v.max || 2)) return { ok: false, reason: 'full' };
  await fb().set(r(`rooms/${code}/players/${backend.uid}`), me());
  return { ok: true };
}

/** 部屋の変化を見張る。やめるときは返り値の関数を呼ぶ */
export function watchRoom(code, cb) {
  return fb().onValue(r(`rooms/${code}`), (s) => cb(s.val()));
}

/** 自分の状態を送る（スコア・ゲージなど）。lastSeen も更新する */
export function updateMe(code, patch) {
  return fb().update(r(`rooms/${code}/players/${backend.uid}`), { ...patch, lastSeen: serverNow() });
}

/** 部屋の設定を変える（部屋を作った人だけ） */
export function updateRoom(code, patch) { return fb().update(r(`rooms/${code}`), patch); }

/** 部屋から出る。始まる前なら名前を消し、始まったあとなら「抜けた」印を付ける */
export async function leaveRoom(code, started) {
  if (started) await updateMe(code, { left: true });
  else await fb().set(r(`rooms/${code}/players/${backend.uid}`), null);
}

/** 妨害を送る */
export function sendAttack(code, to, kind) {
  return fb().set(fb().push(r(`rooms/${code}/attacks`)), { from: backend.uid, to, kind, at: serverNow() });
}

/** 賞金を受け取ってよいか（1部屋で1回だけ）。受け取れるなら true */
export async function claimOnce(code) {
  const res = await fb().runTransaction(r(`rooms/${code}/claims/${backend.uid}`), (cur) => (cur ? undefined : true));
  return !!res.committed;
}

/**
 * v1.0：結果（順位と賞金の取り分）を、部屋に1回だけ書いて全員でそろえる。
 *   端末ごとに「切断」の見え方が少しずれることがある（電波が一瞬切れた人など）。各自が自分で計算すると、
 *   取り分の合計が参加料の合計をこえることがあるので、最初に書いた人の結果を、全員が使う。
 *   返り値：{ ranks: { uid: 順位（抜けた人は 0） }, shares: { uid: 取り分 }, pot }
 */
export async function fixResult(code, list, fee = SETTINGS.battleFee) {
  const split = prizeSplit(list, fee);
  return fixShares(code, { pot: split.pot, ranks: Object.fromEntries(list.map((p) => [p.uid, p.dropped ? 0 : p.rank])), shares: split.shares });
}
/** 順位と取り分を自分で決めたとき（チーム戦など）に、部屋に1回だけ書いてそろえる */
export async function fixShares(code, { pot = 0, ranks = {}, shares = {} }) {
  // 空のものは書けない（Firebase では空のものは消える）ので、印を入れておく
  const mine = { at: serverNow(), pot, ranks: Object.keys(ranks).length ? ranks : { none: 0 }, shares: Object.keys(shares).length ? shares : { none: 0 } };
  try {
    const res = await fb().runTransaction(r(`rooms/${code}/result`), (cur) => (cur ? undefined : mine));
    const v = res && res.snapshot && typeof res.snapshot.val === 'function' ? res.snapshot.val() : null;
    return v && v.ranks ? v : mine;
  } catch (e) {
    console.warn('fixShares', e);
    return mine;
  }
}
/** 部屋に書かれた結果から、自分の順位と取り分 */
export function resultOf(fixed, uid) {
  if (!fixed) return null;
  return { rank: (fixed.ranks || {})[uid] || null, share: (fixed.shares || {})[uid] || 0, pot: fixed.pot || 0 };
}

/** 切断・放置・途中退出した人か */
export function isDropped(p, now = serverNow()) {
  return !!(p && (p.left || (!p.done && now - (p.lastSeen || 0) > ROOM.dropSec * 1000)));
}

/**
 * 順位を決める（各自の端末で同じ結果になるように並べる）。
 *   1. 最後まで残った人（脱落していない人）を、点数の高い順に
 *   2. 脱落した人（バトルロイヤル）を、あとまで残った順に
 *   3. 抜けた人（途中退出・切断）は最下位
 * 返り値：[{ uid, ...player, rank, dropped }]
 */
export function ranking(players, now = serverNow()) {
  const list = Object.entries(players || {}).map(([uid, p]) => ({ uid, ...p, dropped: isDropped(p, now) }));
  const group = (p) => (p.dropped ? 2 : p.out ? 1 : 0);
  const key = (p) => (p.dropped ? -1 : p.out ? p.out : (p.final ?? p.score ?? 0));
  list.sort((a, b) => (group(a) - group(b)) || (key(b) - key(a)) || String(a.uid).localeCompare(String(b.uid)));
  let rank = 0, prev = null;
  list.forEach((p, i) => {
    const k = `${group(p)}:${key(p)}`;
    if (k !== prev) { rank = i + 1; prev = k; }
    p.rank = rank;
  });
  return list;
}

/**
 * 賞金の分け方（全体の仕様書 11章）：参加料の合計から勝負税を引いた残りを、1位50%・2位30%・3位20%。
 * 2人のときは1位が全額。同じ順位の人がいれば、その順位の取り分を等分する。
 * 返り値：{ pot, tax, shares: { uid: 税引き前の取り分 } }（取り分は税の前。税は受け取る人の端末が国庫へ納める）
 */
export function prizeSplit(list, fee = SETTINGS.battleFee) {
  const paid = list.filter((p) => p.paid);
  const pot = paid.length * fee;
  const rates = paid.length <= 2 ? [1] : [0.5, 0.3, 0.2];
  const shares = {};
  const live = list.filter((p) => !p.dropped);
  rates.forEach((rate, i) => {
    const rank = i + 1;
    const same = live.filter((p) => p.rank === rank);
    if (!same.length) return;
    // 同じ順位が何人もいるときは、その人数分の順位の取り分を合わせて等分する
    const span = rates.slice(i, i + same.length).reduce((a, b) => a + b, 0);
    same.forEach((p) => { shares[p.uid] = (shares[p.uid] || 0) + Math.floor((pot * span) / same.length); });
  });
  return { pot, shares };
}
