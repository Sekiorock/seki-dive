// shared/auth.js
// 本人の情報（ニックネーム、ワールドごとのアバター、持っているキャラクター）。
// home v0.2 では端末の中（localStorage）だけに保存する。
// home v0.4 で Firebase の匿名ログインと users/{uid} に移し、先生のログインもここに足す。

import { CHARACTERS, DEFAULT_AVATAR } from './characters.js';

const KEY = 'sekidive.user';
export const NICKNAME_MAX = 10;   // ニックネームの最大の文字数

function blank() {
  return {
    nickname: '',
    onboarded: false,                 // 初めて起動したときの流れを終えたか
    avatars: {},                      // ワールドごとのアバター { hydration: 'minato', ... }
    lastAvatar: DEFAULT_AVATAR,       // 最後に選んだアバター（上の帯の顔アイコン）
    owned: CHARACTERS.filter((c) => c.start).map((c) => c.id),   // 持っているキャラクター
  };
}

let user = null;

export function getUser() {
  if (user) return user;
  user = blank();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') user = { ...user, ...saved };
  } catch (e) { /* 読めなければ新しく始める */ }
  return user;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(user)); } catch (e) { /* 保存できない端末 */ }
  listeners.forEach((fn) => fn(user));
}

const listeners = [];
/** 本人の情報が変わったときに呼ぶ関数を登録する（上の帯の表示など）。 */
export function onUserChange(fn) { listeners.push(fn); }

/** ニックネームの前後の空白を取り、長さを確かめる。正しければ整えた文字を、だめなら null を返す。 */
export function cleanNickname(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || [...s].length > NICKNAME_MAX) return null;
  return s;
}

export function setNickname(name) { getUser().nickname = name; save(); }
export function finishOnboarding() { getUser().onboarded = true; save(); }

export function getAvatar(world) { return getUser().avatars[world] || null; }
export function setAvatar(world, charId) {
  const u = getUser();
  u.avatars[world] = charId;
  u.lastAvatar = charId;
  save();
}

export function ownsCharacter(charId) { return getUser().owned.includes(charId); }
