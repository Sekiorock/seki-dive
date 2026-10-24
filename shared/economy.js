// shared/economy.js
// 通貨ヒヤマの財布・通帳・税・交付金・罰金（仕様書 5章）。
// home v0.3 では端末の中（localStorage）だけで動く。
// home v0.4 で Firebase（wallets / ledger / treasury）に移し、税と罰金を国庫に入れる。
// ヒヤマはゲームの中だけの通貨で、現実のお金や物とは交換できない。

// ── 金額の設定（home v0.5 から管理画面で変えられるようにする） ──
export const SETTINGS = {
  foundingGrant: 1000,        // 開国交付金（最初にゲームを始めたとき）
  incomeTaxRate: 0.10,        // 所得税：報酬と賞金から差し引く
  consumptionTaxRate: 0.10,   // 消費税：買い物とサービスに上乗せ
  dailyRewardCap: 2000,       // 1日に受け取れる報酬の上限（5つのワールドの合計）
  itemMax: 9,                 // 道具屋の品を、1種類につき持てる数
  services: [                 // 道具屋のサービス（使えるのは各ワールドができてから）
    { id: 'hint', price: 50 },
    { id: 'practice', price: 100 },
    { id: 'zukan', price: 150 },
  ],
};

const KEY = 'sekidive.wallet';

function blank() {
  return {
    balance: 0,
    ledger: [],               // 新しいものが先頭
    foundingGranted: false,
    rewardDay: '',            // 報酬の上限を数えている日（YYYY-MM-DD）
    rewardToday: 0,
  };
}

let wallet = null;
const listeners = [];

function load() {
  if (wallet) return wallet;
  wallet = blank();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') wallet = { ...wallet, ...saved };
  } catch (e) { /* 読めなければ新しく始める */ }
  return wallet;
}

function save(entry) {
  try { localStorage.setItem(KEY, JSON.stringify(wallet)); } catch (e) { /* 保存できない端末 */ }
  listeners.forEach((fn) => fn(wallet, entry));
}

/** 財布が変わったときに呼ぶ関数を登録する（上の帯の残高、通帳など）。fn(wallet, 今回の記録) */
export function onWalletChange(fn) { listeners.push(fn); }

export function getBalance() { return load().balance; }
export function getLedger() { return load().ledger; }
/** 滞納（残高がマイナス）中は、買い物と対戦の参加ができない */
export function isInArrears() { return load().balance < 0; }

/** 消費税（1ヒヤマ未満は切り捨て） */
export function consumptionTax(price) { return Math.floor(price * SETTINGS.consumptionTaxRate); }
export function priceWithTax(price) { return price + consumptionTax(price); }
export function canAfford(price) { return !isInArrears() && load().balance >= priceWithTax(price); }

/** 通帳に1行を書き、残高を変える */
function record({ type, itemKey, itemVars = {}, partnerKey, gross, tax = 0, amount }) {
  const w = load();
  w.balance += amount;
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    type,            // grant / reward / purchase / service / fine
    itemKey,         // 内容の i18n の鍵
    itemVars,        // 内容の差し込み（キャラクターの鍵など）
    partnerKey,      // 相手の i18n の鍵
    gross,           // 税の前の金額（収入は税引き前、支出は本体の値段）
    tax,             // 税（所得税または消費税）
    amount,          // 残高の増減（収入はプラス、支出はマイナス）
    balance: w.balance,
  };
  w.ledger.unshift(entry);
  save(entry);
  return entry;
}

/** 交付金を受け取る（税はかからない）。国庫から本人へ。 */
export function grant({ itemKey, itemVars, amount }) {
  return record({ type: 'grant', itemKey, itemVars, partnerKey: 'party.treasury', gross: amount, amount });
}

/** 開国交付金。1人1回だけ。支給したら記録を、すでに支給済みなら null を返す。 */
export function grantFounding() {
  const w = load();
  if (w.foundingGranted) return null;
  w.foundingGranted = true;
  return grant({ itemKey: 'ledger.item.founding', amount: SETTINGS.foundingGrant });
}
export function foundingGranted() { return load().foundingGranted; }

/**
 * 報酬を受け取る（所得税を差し引く。1日の上限を超えた分は受け取れない）。各ワールドができてから使う。
 * @returns 記録。上限に達していて受け取れないときは null
 */
export function reward({ itemKey, itemVars, gross }) {
  const w = load();
  const today = new Date().toLocaleDateString('sv-SE');   // YYYY-MM-DD（端末の時刻）
  if (w.rewardDay !== today) { w.rewardDay = today; w.rewardToday = 0; }
  const allowed = Math.max(0, Math.min(gross, SETTINGS.dailyRewardCap - w.rewardToday));
  if (allowed <= 0) return null;
  w.rewardToday += allowed;
  const tax = Math.floor(allowed * SETTINGS.incomeTaxRate);
  return record({ type: 'reward', itemKey, itemVars, partnerKey: 'party.government', gross: allowed, tax, amount: allowed - tax });
}

/**
 * 支払う（買い物・サービス）。消費税を上乗せする。
 * @returns {{ok: true, entry} | {ok: false, reason: 'arrears' | 'short'}}
 */
export function pay({ type = 'purchase', itemKey, itemVars, price }) {
  if (isInArrears()) return { ok: false, reason: 'arrears' };
  const tax = consumptionTax(price);
  if (load().balance < price + tax) return { ok: false, reason: 'short' };
  const entry = record({ type, itemKey, itemVars, partnerKey: 'party.government', gross: price, tax, amount: -(price + tax) });
  return { ok: true, entry };
}

/** 罰金（残高が足りなければマイナス＝滞納になる）。対戦の版と管理画面で使う。 */
export function fine({ itemKey, itemVars, amount }) {
  return record({ type: 'fine', itemKey, itemVars, partnerKey: 'party.treasury', gross: amount, amount: -amount });
}

/** 金額を 1,234 のように区切る（数字はどちらの言語でも同じ表記） */
export function formatHiyama(n) { return Math.round(n).toLocaleString('en-US'); }
