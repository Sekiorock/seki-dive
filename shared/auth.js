// shared/auth.js
// Firebase への接続（匿名ログイン）と、本人の情報
// （ニックネーム、言語、ワールドごとのアバター、持っているキャラクター・衣装・道具）。
//
// ・Firebase の設定（shared/firebase-config.js）があれば、匿名ログインして users/{uid} に保存する。
// ・設定がない、またはつながらないときは「この端末だけ」（localStorage）で動く。
// ・先生のログイン（メールとパスワード）は、管理画面を作る home v0.5 でここに足す。

import { CHARACTERS, DEFAULT_AVATAR } from './characters.js';
import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION, CONNECT_TIMEOUT_MS } from './firebase-config.js';

const KEY = 'sekidive.user';
export const NICKNAME_MAX = 10;   // ニックネームの最大の文字数

// ───────────── Firebase への接続 ─────────────
/** 今の接続の状態。mode：'online'（Firebase）または 'local'（この端末だけ） */
export const backend = {
  mode: 'local',
  reason: '',       // 'noconfig'（設定がない） / 'offline'（つながらない）
  uid: null,
  db: null,         // Firebase の Database
  fb: null,         // Firebase の Database の関数（ref, onValue, runTransaction など）
};

let readyPromise = null;
/** Firebase につなぐ（1回だけ）。つながらなくても、エラーにはせず local で返す。 */
export function initBackend() {
  if (!readyPromise) readyPromise = connect();
  return readyPromise;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function connect() {
  if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) {
    backend.reason = 'noconfig';
    return backend;
  }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
    const [appM, authM, dbM] = await withTimeout(Promise.all([
      import(`${base}firebase-app.js`),
      import(`${base}firebase-auth.js`),
      import(`${base}firebase-database.js`),
    ]), CONNECT_TIMEOUT_MS);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    await withTimeout((async () => {
      await auth.authStateReady();                       // 前回のログインを読み込む
      if (!auth.currentUser) await authM.signInAnonymously(auth);
    })(), CONNECT_TIMEOUT_MS);
    backend.uid = auth.currentUser.uid;
    backend.db = dbM.getDatabase(app);
    backend.fb = dbM;
    backend.mode = 'online';
    await withTimeout(loadRemoteProfile(), CONNECT_TIMEOUT_MS);
  } catch (e) {
    // 校内の通信が止められているときなど。エラーにはせず「この端末だけ」で動く
    console.info('[セキオダイブ] Firebase につながらないため、この端末だけで動きます。', e && e.message);
    backend.mode = 'local';
    backend.reason = 'offline';
    backend.db = null;
  }
  return backend;
}

// ───────────── 本人の情報 ─────────────
function blank() {
  return {
    nickname: '',
    lang: '',                         // 選んだ言語（i18n.js が使う）
    onboarded: false,                 // 初めて起動したときの流れを終えたか
    avatars: {},                      // ワールドごとのアバター { hydration: 'minato', ... }
    lastAvatar: DEFAULT_AVATAR,       // 最後に選んだアバター（上の帯の顔アイコン）
    owned: CHARACTERS.filter((c) => c.start).map((c) => c.id),   // 持っているキャラクター
    costumesOwned: {},                // 持っている衣装の色違い { minato: ['gunjo'], ... }
    costume: {},                      // キャラクターごとに今着ている衣装 { minato: 'gunjo' }
    items: {},                        // 道具屋で買ったもの { hint: 2, ... }
    worlds: {},                       // ワールドごとの記録 { hydration: { clears: {...} } }（hydration v0.3〜）
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

/**
 * Firebase の users/{uid} を読み込む。
 * ・あれば、それを本人の情報にする（ほかの端末で遊んだ続きから）。
 * ・なければ、この端末のニックネームや言語だけを引き継いで新しく作る。
 *   この端末だけで買ったキャラクターや衣装は、Firebase のヒヤマと合わなくなるので引き継がない。
 */
async function loadRemoteProfile() {
  const { db, fb, uid } = backend;
  const snap = await fb.get(fb.ref(db, `users/${uid}`));
  const local = getUser();
  if (snap.exists()) {
    user = { ...blank(), ...snap.val() };
    // Firebase は空の入れ物を保存しないので、なければ作り直す
    user.avatars = user.avatars || {};
    user.costumesOwned = user.costumesOwned || {};
    user.costume = user.costume || {};
    user.items = user.items || {};
    user.worlds = user.worlds || {};
    user.owned = user.owned || blank().owned;
  } else {
    user = { ...blank(), nickname: local.nickname, lang: local.lang, onboarded: local.onboarded, avatars: local.avatars, lastAvatar: local.lastAvatar, worlds: local.worlds || {} };
    if (!user.owned.includes(user.lastAvatar)) user.lastAvatar = DEFAULT_AVATAR;
    await fb.set(fb.ref(db, `users/${uid}`), toRemote(user));
  }
  try { localStorage.setItem(KEY, JSON.stringify(user)); } catch (e) { /* 保存できない端末 */ }
}

/** Firebase に保存する形（値のないものは送らない） */
function toRemote(u) {
  return JSON.parse(JSON.stringify({ ...u, updatedAt: Date.now() }));
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(user)); } catch (e) { /* 保存できない端末 */ }
  if (backend.mode === 'online') {
    backend.fb.set(backend.fb.ref(backend.db, `users/${backend.uid}`), toRemote(user))
      .catch((e) => console.info('[セキオダイブ] 本人の情報を保存できませんでした。', e && e.message));
  }
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
export function setUserLang(lang) { const u = getUser(); if (u.lang !== lang) { u.lang = lang; save(); } }
export function finishOnboarding() { getUser().onboarded = true; save(); }

export function getAvatar(world) { return getUser().avatars[world] || null; }
export function setAvatar(world, charId) {
  const u = getUser();
  u.avatars[world] = charId;
  u.lastAvatar = charId;
  save();
}

// ── キャラクターと衣装 ──
/** ワールドごとの記録（ステージのクリアや最高点など）。Firebase の users/{uid}/worlds にも保存される */
export function getWorldData(world) { return JSON.parse(JSON.stringify((getUser().worlds || {})[world] || {})); }
export function setWorldData(world, data) {
  const u = getUser();
  u.worlds = { ...(u.worlds || {}), [world]: data };
  save();
}
export function ownsCharacter(charId) { return getUser().owned.includes(charId); }
export function addCharacter(charId) {
  const u = getUser();
  if (!u.owned.includes(charId)) { u.owned.push(charId); save(); }
}

export function ownsCostume(charId, costume) {
  return costume === 'base' || (getUser().costumesOwned[charId] || []).includes(costume);
}
export function addCostume(charId, costume) {
  const u = getUser();
  const list = u.costumesOwned[charId] || (u.costumesOwned[charId] = []);
  if (!list.includes(costume)) list.push(costume);
  save();
}
/** そのキャラクターが今着ている衣装（持っていない衣装なら base） */
export function getCostume(charId) {
  const c = getUser().costume[charId] || 'base';
  return ownsCostume(charId, c) ? c : 'base';
}
export function setCostume(charId, costume) {
  if (!ownsCostume(charId, costume)) return;
  getUser().costume[charId] = costume;
  save();
}

// ── 道具屋で買ったもの ──
export function itemCount(itemId) { return getUser().items[itemId] || 0; }
/** 道具屋の品を1つ使う。持っていなければ false */
export function useItem(itemId) {
  if (itemCount(itemId) <= 0) return false;
  addItem(itemId, -1);
  return true;
}
export function addItem(itemId, n = 1) {
  const u = getUser();
  u.items[itemId] = (u.items[itemId] || 0) + n;
  save();
}

// ───────────── 先生のログイン（管理画面 admin.html だけで使う） ─────────────
// 生徒の匿名ログインと混ざらないように、別の名前（'admin'）で Firebase を立ち上げる。
// 同じブラウザで生徒として遊んでいても、先生のログインで生徒のデータが消えることはない。

export const adminBackend = {
  ready: false,
  reason: '',       // 'noconfig'（設定がない） / 'offline'（つながらない）
  db: null, fb: null, auth: null, authM: null,
  uid: null, email: null,
  isAdmin: false,
};

let adminReady = null;
/** 管理画面のための接続（1回だけ）。前回のログインが残っていれば、それを使う。 */
export function initAdminBackend() {
  if (!adminReady) adminReady = (async () => {
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) { adminBackend.reason = 'noconfig'; return adminBackend; }
    try {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/`;
      const [appM, authM, dbM] = await withTimeout(Promise.all([
        import(`${base}firebase-app.js`), import(`${base}firebase-auth.js`), import(`${base}firebase-database.js`),
      ]), CONNECT_TIMEOUT_MS);
      const app = appM.initializeApp(FIREBASE_CONFIG, 'admin');
      adminBackend.auth = authM.getAuth(app);
      adminBackend.authM = authM;
      adminBackend.db = dbM.getDatabase(app);
      adminBackend.fb = dbM;
      await withTimeout(adminBackend.auth.authStateReady(), CONNECT_TIMEOUT_MS);
      adminBackend.ready = true;
      await checkAdmin();
    } catch (e) {
      console.info('[セキオダイブ] 管理画面が Firebase につながりません。', e && e.message);
      adminBackend.reason = 'offline';
    }
    return adminBackend;
  })();
  return adminReady;
}

async function checkAdmin() {
  const u = adminBackend.auth.currentUser;
  adminBackend.uid = u && !u.isAnonymous ? u.uid : null;
  adminBackend.email = u && !u.isAnonymous ? (u.email || '') : null;
  adminBackend.isAdmin = false;
  if (!adminBackend.uid) return;
  const { fb, db } = adminBackend;
  const snap = await fb.get(fb.ref(db, `admins/${adminBackend.uid}`));
  adminBackend.isAdmin = snap.val() === true;
}

/** 先生のメールとパスワードでログインする。失敗したときは、エラーの種類の文字（Firebase の code）を投げる */
export async function adminSignIn(email, password) {
  await adminBackend.authM.signInWithEmailAndPassword(adminBackend.auth, email, password);
  await checkAdmin();
  return adminBackend;
}

export async function adminSignOut() {
  await adminBackend.authM.signOut(adminBackend.auth);
  adminBackend.uid = null; adminBackend.email = null; adminBackend.isAdmin = false;
}
