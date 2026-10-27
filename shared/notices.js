// shared/notices.js
// 政府からのお知らせ（仕様書 5章・6章）。
//   notices/{ID}               全員へのお知らせ  { ja, en, at, major }
//   personalNotices/{uid}/{ID} 本人だけへのお知らせ { ja, en, at, kind }  kind: 'grant' / 'fine' / 'info'
// ・まだ見ていない「重大発表」（major: true）は、画面を暗くして中央に出す（出来事の発光）。
// ・ふつうのお知らせは、短いお知らせ（トースト）で知らせる。
// ・本人への罰金は紅、交付金は金で、画面の縁を光らせる。
// ・英語が書かれていないお知らせは、英語の画面でも日本語のまま出す（仕様書 2章）。
// お知らせを書くのは先生（home v0.5 の管理画面。それまでは Firebase のコンソールから）。

import { backend } from './auth.js';
import { t, getLang } from './i18n.js';
import { fx } from './theme.js';
import { faceUrl, nameKey } from './characters.js';

const SEEN_KEY = 'sekidive.seenNotices';
const SHOW = 20;   // 掲示板に出す数（新しいほうから）

let all = [];          // 全員へのお知らせ（新しいものが先頭）
let personal = [];     // 本人へのお知らせ
const listeners = [];
let toastFn = () => {};
let queue = Promise.resolve();

function seen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch (e) { return new Set(); }
}
function markSeen(id) {
  const s = seen();
  s.add(id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200))); } catch (e) { /* 保存できない端末 */ }
}

/** お知らせの文を今の言語で返す（英語がなければ日本語のまま） */
export function noticeText(n) {
  if (getLang() === 'en' && n.en) return n.en;
  return n.ja || n.en || '';
}

export function getNotices() { return all; }
export function getPersonalNotices() { return personal; }
export function onNoticesChange(fn) { listeners.push(fn); }

function toList(snap) {
  const list = [];
  snap.forEach((c) => { list.push({ id: c.key, ...c.val() }); });
  return list.sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** まだ見ていないお知らせを、1つずつ順番に出す */
function present(n, isPersonal) {
  const key = `${isPersonal ? 'p' : 'n'}:${n.id}`;
  if (seen().has(key)) return;
  markSeen(key);
  queue = queue.then(async () => {
    const text = noticeText(n);
    if (!isPersonal && n.major) {
      await fx.announce({
        title: t('notice.majorTitle'),
        text,
        faceSrc: faceUrl('tsukasa'),
        faceName: t(nameKey('tsukasa')),
        closeLabel: t('notice.ok'),
      });
      return;
    }
    if (isPersonal && n.kind === 'fine') fx.penalty();
    if (isPersonal && n.kind === 'grant') fx.celebrate();
    toastFn(t(isPersonal ? 'notice.personalPrefix' : 'notice.prefix', { text, name: t(nameKey('tsukasa')) }));
    await new Promise((res) => setTimeout(res, 1500));
  });
}

/**
 * お知らせを見張り始める。
 * @param {Function} showToast 短いお知らせを出す関数
 */
export function initNotices(showToast) {
  toastFn = showToast || toastFn;
  if (backend.mode !== 'online') return;
  const F = backend.fb;
  const ref = (p) => F.ref(backend.db, p);
  F.onValue(F.query(ref('notices'), F.orderByChild('at'), F.limitToLast(SHOW)), (snap) => {
    all = toList(snap);
    listeners.forEach((fn) => fn());
    // 古いものから順に出す
    [...all].reverse().forEach((n) => present(n, false));
  });
  F.onValue(F.query(ref(`personalNotices/${backend.uid}`), F.limitToLast(SHOW)), (snap) => {
    personal = toList(snap);
    listeners.forEach((fn) => fn());
    [...personal].reverse().forEach((n) => present(n, true));
  });
}
