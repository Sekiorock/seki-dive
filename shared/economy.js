// shared/economy.js
// 通貨ヒヤマの財布・通帳・国庫・税・交付金・罰金（仕様書 5章）。
//
// ・Firebase につながっているとき（v0.4〜）：wallets / ledger / treasury / treasuryLog / settings を使う。
//   残高の増減は「トランザクション」（同時に書いても数が狂わない書き方）で行う。
// ・つながっていないとき：この端末の中（localStorage）だけで動く（v0.3 と同じ）。
//
// お金の流れ（仕様書 5章の表）
//   報酬・賞金 ：政府から本人へ。所得税（10%）を国庫へ
//   交付金     ：国庫から本人へ（国庫の残高を超える交付金は出せない）
//   買い物・サービス：本体は政府へ、消費税（10%）は国庫へ
//   罰金       ：本人から国庫へ（残高が足りなければ滞納＝マイナスになる）
// ヒヤマはゲームの中だけの通貨で、現実のお金や物とは交換できない。

import { backend, getUser } from './auth.js';

// ── 金額の設定（Firebase の settings に値があれば、そちらが優先。home v0.5 から管理画面で変える） ──
export const SETTINGS = {
  foundingGrant: 1000,        // 開国交付金（最初にゲームを始めたとき）
  initialTreasury: 100000,    // 国庫の初期残高
  incomeTaxRate: 0.10,        // 所得税：報酬と賞金から差し引く
  consumptionTaxRate: 0.10,   // 消費税：買い物とサービスに上乗せ
  betTaxRate: 0.10,           // 勝負税：対戦の賞金から差し引く（対戦の版で使う）
  dailyRewardCap: 2000,       // 1日に受け取れる報酬の上限（5つのワールドの合計）
  itemMax: 9,                 // 道具屋の品を、1種類につき持てる数
  ledgerShow: 100,            // 通帳に表示する行の数（新しいほうから）
  lessonGrant: 300,           // 授業交付金（先生が授業の始めに配る）
  battleFee: 100,             // 対戦の参加料（対戦の版で使う）
  quitFine: 200,              // 対戦の途中退出・放置の罰金（対戦の版で使う）
  residentTax: 100,           // 住民税（任意。先生が徴収を押したときに1人あたり）
  assetTaxRate: 0.05,         // 資産税（任意。基準を超えた分にかける割合）
  assetTaxThreshold: 5000,    // 資産税がかかり始める残高
  services: [                 // 道具屋のサービス（使えるのは各ワールドができてから）
    { id: 'hint', price: 50 },
    { id: 'practice', price: 100 },
    { id: 'zukan', price: 150 },
  ],
};
// 管理画面から変えてよい項目
export const REMOTE_KEYS = ['foundingGrant', 'incomeTaxRate', 'consumptionTaxRate', 'betTaxRate', 'dailyRewardCap', 'itemMax',
  'lessonGrant', 'battleFee', 'quitFine', 'residentTax', 'assetTaxRate', 'assetTaxThreshold'];

// 数でない設定（ワールドの開閉、対戦の可否、任意の税のオン・オフ）。Firebase の settings から届く
let settingsRaw = {};
const settingsListeners = [];
/** 設定の生の値（worldsOpen, battleMode, residentTaxOn, assetTaxOn, leaderboardOn など） */
export function getSettings() { return settingsRaw; }
/** 設定が変わったときに呼ぶ。fn(設定) */
export function onSettingsChange(fn) { settingsListeners.push(fn); fn(settingsRaw); }
/** ワールドの門が開いているか（先生が閉じていなければ開いている） */
export function isWorldOpen(world) { return !(settingsRaw.worldsOpen && settingsRaw.worldsOpen[world] === false); }

const KEY = 'sekidive.wallet';
const TREASURY_KEY = 'sekidive.treasury';

function blankWallet() {
  return { balance: 0, foundingGranted: false, rewardDay: '', rewardToday: 0 };
}

// いま画面に出している値（Firebase のときは、届いた値をここに写す）
let wallet = null;
let ledger = [];          // 新しいものが先頭
let treasury = null;      // 国庫の残高（わからないときは null）
let leaderboard = null;   // 長者番付 { at, list: [{ nickname, balance }] }
const listeners = [];
const moneyListeners = [];
const treasuryListeners = [];

const online = () => backend.mode === 'online';
const fb = () => backend.fb;
const r = (path) => backend.fb.ref(backend.db, path);

// ───────────── 読み込み ─────────────
function loadLocal() {
  wallet = blankWallet();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      ledger = Array.isArray(saved.ledger) ? saved.ledger : [];
      delete saved.ledger;
      wallet = { ...wallet, ...saved };
    }
    const t = JSON.parse(localStorage.getItem(TREASURY_KEY) || 'null');
    treasury = typeof t === 'number' ? t : SETTINGS.initialTreasury;
  } catch (e) { treasury = SETTINGS.initialTreasury; }
}

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...wallet, ledger }));
    localStorage.setItem(TREASURY_KEY, JSON.stringify(treasury));
  } catch (e) { /* 保存できない端末 */ }
}

let started = null;
/**
 * 財布を使えるようにする。auth.js の initBackend() のあとに1回呼ぶ。
 * Firebase のときは、残高・通帳・国庫・設定を見張り、変わるたびに画面へ知らせる。
 */
export function initEconomy() {
  if (started) return started;
  started = online() ? startRemote() : Promise.resolve(loadLocal());
  return started;
}

async function startRemote() {
  const { uid } = backend;
  const F = fb();
  wallet = blankWallet();
  // 国庫：まだなければ初期残高で作る
  await F.runTransaction(r('treasury'), (cur) => (cur === null ? SETTINGS.initialTreasury : undefined), { applyLocally: false });
  // 財布：まだなければ作る
  const ws = await F.get(r(`wallets/${uid}`));
  if (!ws.exists()) await F.set(r(`wallets/${uid}`), blankWallet());

  await new Promise((resolve) => {
    let got = 0;
    const once = () => { got += 1; if (got === 3) resolve(); };
    let first1 = true, first2 = true, first3 = true;
    F.onValue(r(`wallets/${uid}`), (s) => {
      wallet = { ...blankWallet(), ...(s.val() || {}) };
      notify();
      if (first1) { first1 = false; once(); }
    });
    F.onValue(F.query(r(`ledger/${uid}`), F.limitToLast(SETTINGS.ledgerShow)), (s) => {
      const list = [];
      s.forEach((c) => { list.push({ id: c.key, ...c.val() }); });
      ledger = list.reverse();
      notify();
      if (first2) { first2 = false; once(); }
    });
    F.onValue(r('treasury'), (s) => {
      treasury = typeof s.val() === 'number' ? s.val() : null;
      treasuryListeners.forEach((fn) => fn(treasury));
      if (first3) { first3 = false; once(); }
    });
  });
  // 長者番付（先生が更新したもの。掲示板に出すかどうかは設定の leaderboardOn）
  F.onValue(r('public/leaderboard'), (s) => {
    leaderboard = s.val() || null;
    treasuryListeners.forEach((fn) => fn(treasury));
  }, () => {});
  // 設定（税率など）：あれば上書き
  F.onValue(r('settings'), (s) => {
    const v = s.val() || {};
    for (const k of REMOTE_KEYS) if (typeof v[k] === 'number') SETTINGS[k] = v[k];
    settingsRaw = v;
    settingsListeners.forEach((fn) => fn(v));
    notify();
  });
}

function notify(entry) { listeners.forEach((fn) => fn(wallet, entry)); }

/** 財布や通帳が変わったときに呼ぶ関数を登録する（上の帯の残高、通帳など）。 */
export function onWalletChange(fn) { listeners.push(fn); }
/** 自分の操作でお金が動いたときに呼ぶ（発光の演出に使う）。fn(記録) */
export function onMoneyEvent(fn) { moneyListeners.push(fn); }
/** 国庫の残高が変わったときに呼ぶ。fn(残高) */
export function onTreasuryChange(fn) { treasuryListeners.push(fn); if (treasury !== null) fn(treasury); }

export function getBalance() { return wallet ? wallet.balance : 0; }
export function getLedger() { return ledger; }
export function getTreasury() { return treasury; }
/** 長者番付（先生が更新したもの） */
export function getLeaderboard() { return leaderboard; }
export function foundingGranted() { return !!(wallet && wallet.foundingGranted); }
/** 滞納（残高がマイナス）中は、買い物と対戦の参加ができない */
export function isInArrears() { return getBalance() < 0; }

/** 消費税（1ヒヤマ未満は切り捨て） */
export function consumptionTax(price) { return Math.floor(price * SETTINGS.consumptionTaxRate); }
export function priceWithTax(price) { return price + consumptionTax(price); }
export function canAfford(price) { return !isInArrears() && getBalance() >= priceWithTax(price); }

// ───────────── 書き込みの土台 ─────────────
function newEntry({ type, itemKey, itemVars = {}, partnerKey, gross, tax = 0, amount, balance }) {
  return {
    at: new Date().toISOString(),
    type,            // grant / reward / purchase / service / fine
    itemKey,         // 内容の i18n の鍵
    itemVars,        // 内容の差し込み（'i18n:鍵' の形で保存し、表示のときに今の言語に直す）
    partnerKey,      // 相手の i18n の鍵
    gross,           // 税の前の金額（収入は税引き前、支出は本体の値段）
    tax,             // 税（所得税または消費税）
    amount,          // 残高の増減（収入はプラス、支出はマイナス）
    balance,         // 取引のあとの残高
  };
}

/**
 * 残高を変えて、通帳に1行を書く。
 * @param fieldsOf () => 記録の中身（amount は残高の増減）。change を通ったあとに呼ぶ
 * @param change   (w) => 財布の印などを書き換える関数。続けられないときは false を返す
 * @returns 記録。続けられなかったときは null
 */
async function commit(fieldsOf, change) {
  if (!online()) {
    const w = { ...wallet };
    if (change(w) === false) return null;
    const fields = fieldsOf();
    w.balance += fields.amount;
    wallet = w;
    const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...newEntry({ ...fields, balance: wallet.balance }) };
    ledger.unshift(entry);
    saveLocal();
    notify(entry);
    moneyListeners.forEach((fn) => fn(entry));
    return entry;
  }
  const F = fb();
  const { uid } = backend;
  let fields = null;
  const res = await F.runTransaction(r(`wallets/${uid}`), (w) => {
    const cur = { ...blankWallet(), ...(w || {}) };
    if (change(cur) === false) return undefined;   // やめる
    fields = fieldsOf();
    cur.balance += fields.amount;
    return cur;
  });
  if (!res.committed) return null;
  const entry = newEntry({ ...fields, balance: res.snapshot.val().balance });
  const ref = F.push(r(`ledger/${uid}`));
  await F.set(ref, entry);
  const full = { id: ref.key, ...entry };
  moneyListeners.forEach((fn) => fn(full));
  return full;
}

/** 国庫を増やす・減らす。減らすときに残高が足りなければ false */
async function moveTreasury(delta, logFields) {
  if (!delta) return true;
  if (!online()) {
    if (treasury + delta < 0) return false;
    treasury += delta;
    saveLocal();
    treasuryListeners.forEach((fn) => fn(treasury));
    return true;
  }
  const F = fb();
  const res = await F.runTransaction(r('treasury'), (cur) => {
    const v = typeof cur === 'number' ? cur : SETTINGS.initialTreasury;
    if (v + delta < 0) return undefined;
    return v + delta;
  });
  if (!res.committed) return false;
  await F.set(F.push(r('treasuryLog')), {
    at: new Date().toISOString(), uid: backend.uid, nickname: getUser().nickname || '',
    amount: delta, balance: res.snapshot.val(), ...logFields,
  });
  return true;
}

// ───────────── お金の出入り ─────────────
/** 交付金を受け取る（税はかからない）。国庫から本人へ。国庫が足りなければ null */
export async function grant({ itemKey, itemVars, amount }) {
  if (!(await moveTreasury(-amount, { type: 'grant', itemKey }))) return null;
  const entry = await commit(() => ({ type: 'grant', itemKey, itemVars, partnerKey: 'party.treasury', gross: amount, amount }), () => true);
  if (!entry) await moveTreasury(amount, { type: 'refund', itemKey });   // 念のため国庫に戻す
  return entry;
}

/** 開国交付金。1人1回だけ。支給したら記録を、支給済み・国庫が足りないときは null */
export async function grantFounding() {
  if (foundingGranted()) return null;
  const amount = SETTINGS.foundingGrant;
  if (!(await moveTreasury(-amount, { type: 'grant', itemKey: 'ledger.item.founding' }))) return null;
  const entry = await commit(
    () => ({ type: 'grant', itemKey: 'ledger.item.founding', partnerKey: 'party.treasury', gross: amount, amount }),
    (w) => { if (w.foundingGranted) return false; w.foundingGranted = true; return true; },
  );
  if (!entry) await moveTreasury(amount, { type: 'refund', itemKey: 'ledger.item.founding' });   // すでに支給済みだった
  return entry;
}

/**
 * 報酬を受け取る（所得税を国庫へ。1日の上限を超えた分は受け取れない）。各ワールドができてから使う。
 * @returns 記録。上限に達していて受け取れないときは null
 */
export async function reward({ itemKey, itemVars, gross }) {
  const today = new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD（端末の時刻）
  let allowed = 0;
  const entry = await commit(
    () => {
      const tax = Math.floor(allowed * SETTINGS.incomeTaxRate);
      return { type: 'reward', itemKey, itemVars, partnerKey: 'party.government', gross: allowed, tax, amount: allowed - tax };
    },
    (w) => {
      if (w.rewardDay !== today) { w.rewardDay = today; w.rewardToday = 0; }
      allowed = Math.max(0, Math.min(gross, SETTINGS.dailyRewardCap - w.rewardToday));
      if (allowed <= 0) return false;
      w.rewardToday += allowed;
      return true;
    },
  );
  if (!entry) return null;
  await moveTreasury(entry.tax, { type: 'tax', itemKey });
  return entry;
}

/**
 * 支払う（買い物・サービス）。消費税を上乗せし、税は国庫へ。
 * @returns {{ok: true, entry} | {ok: false, reason: 'arrears' | 'short' | 'error'}}
 */
export async function pay({ type = 'purchase', itemKey, itemVars, price }) {
  if (isInArrears()) return { ok: false, reason: 'arrears' };
  const tax = consumptionTax(price);
  if (getBalance() < price + tax) return { ok: false, reason: 'short' };
  try {
    const entry = await commit(
      () => ({ type, itemKey, itemVars, partnerKey: 'party.government', gross: price, tax, amount: -(price + tax) }),
      (w) => w.balance >= price + tax,
    );
    if (!entry) return { ok: false, reason: 'short' };
    await moveTreasury(tax, { type: 'tax', itemKey });
    return { ok: true, entry };
  } catch (e) {
    console.info('[セキオダイブ] 支払いができませんでした。', e && e.message);
    return { ok: false, reason: 'error' };
  }
}

/** 罰金（残高が足りなければマイナス＝滞納になる）。国庫へ。対戦の版と管理画面で使う。 */
export async function fine({ itemKey, itemVars, amount }) {
  const entry = await commit(() => ({ type: 'fine', itemKey, itemVars, partnerKey: 'party.treasury', gross: amount, amount: -amount }), () => true);
  if (entry) await moveTreasury(amount, { type: 'fine', itemKey });
  return entry;
}

/** 金額を 1,234 のように区切る（数字はどちらの言語でも同じ表記） */
export function formatHiyama(n) { return Math.round(n).toLocaleString('en-US'); }
