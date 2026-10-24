// home/src/shops.js
// 広場の施設の画面：銀行（通帳）、呉服屋（キャラクターの解放・衣装の色違い）、道具屋（サービス）、
// 政府庁舎の掲示板（国庫の残高・税率・お知らせ）。
// お金の出入りはすべて shared/economy.js を通す（消費税の上乗せ、通帳への記録）。

import { t, onLangChange } from '../../shared/i18n.js';
import {
  getBalance, getLedger, isInArrears, canAfford, pay, consumptionTax, priceWithTax,
  formatHiyama, onWalletChange, onTreasuryChange, getTreasury, SETTINGS,
} from '../../shared/economy.js';
import { backend } from '../../shared/auth.js';
import { getNotices, getPersonalNotices, onNoticesChange, noticeText } from '../../shared/notices.js';
import { fx } from '../../shared/theme.js';
import {
  ownsCharacter, addCharacter, ownsCostume, addCostume, getCostume, setCostume,
  itemCount, addItem, onUserChange,
} from '../../shared/auth.js';
import {
  CHARACTERS, UNLOCK_PRICE, COSTUMES, COLOR_HEX, costumePrice, faceUrl, nameKey, motifKey,
} from '../../shared/characters.js';
import { FACILITIES } from './config.js';

let root, confirmEl;
let current = null;        // 開いている施設のID
let gofukuTab = 'chars';
let keeperLine = 'welcome';
let onToast = () => {};

const money = (n) => t('money', { amount: formatHiyama(n) });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 通帳に保存した差し込み（'i18n:鍵' の形）を、今の言語の文字に直す */
function resolveVars(vars = {}) {
  const out = {};
  for (const [k, v] of Object.entries(vars)) out[k] = typeof v === 'string' && v.startsWith('i18n:') ? t(v.slice(5)) : v;
  return out;
}

function keeperOf(id) { return id === 'gov' ? 'tsukasa' : FACILITIES.find((f) => f.id === id).keeper; }

function build() {
  root = document.createElement('div');
  root.className = 'shop';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.hidden = true;
  document.body.append(root);

  confirmEl = document.createElement('div');
  confirmEl.className = 'confirm';
  confirmEl.setAttribute('role', 'alertdialog');
  confirmEl.setAttribute('aria-modal', 'true');
  confirmEl.hidden = true;
  document.body.append(confirmEl);

  const rerender = () => { if (current) render(); };
  onLangChange(() => { rerender(); if (!confirmEl.hidden) confirmEl.hidden = true; });
  onWalletChange(rerender);
  onTreasuryChange(() => { if (current === 'gov') render(); });
  onNoticesChange(() => { if (current === 'gov') render(); });
  onUserChange(rerender);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!confirmEl.hidden) confirmEl.hidden = true;
    else if (current) closeShop();
  });
}

// ── 共通の枠：番人の顔とセリフ、閉じるボタン ──
function frame(id, bodyHtml) {
  const keeper = keeperOf(id);
  const lineKeyName = id === 'bank' || id === 'gov' ? `${id}.line.welcome` : `${id}.line.${keeperLine}`;
  return `
    <div class="shop__head">
      <img class="shop__keeper" src="${faceUrl(keeper)}" alt="" width="256" height="256">
      <div class="shop__head-text">
        <h2 class="shop__title" id="shop-title">${esc(t(`facility.${id}`))}</h2>
        <p class="shop__keeper-name">${esc(t('facility.keeper', { name: t(nameKey(keeper)) }))}</p>
      </div>
    </div>
    <p class="shop__speech">${esc(t('quote', { line: t(lineKeyName) }))}</p>
    <div class="shop__body">${bodyHtml}</div>
    <div class="shop__foot"><button type="button" class="btn shop__close" data-act="close">${esc(t('shop.close'))}</button></div>`;
}

// ── 銀行：残高と通帳 ──
function bankHtml() {
  const bal = getBalance();
  const rows = getLedger().map((e) => {
    const d = new Date(e.at);
    const pad = (n) => String(n).padStart(2, '0');
    const when = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const income = e.amount >= 0;
    const detail = income
      ? `${t('bank.gross')} ${formatHiyama(e.gross)}${e.tax ? ` ／ ${t('bank.itax')} ${formatHiyama(e.tax)}` : ''} ／ ${t('bank.net')} ${formatHiyama(e.amount)}`
      : `${t('bank.price')} ${formatHiyama(e.gross)}${e.tax ? ` ／ ${t('bank.ctax')} ${formatHiyama(e.tax)}` : ''} ／ ${t('bank.paid')} ${formatHiyama(-e.amount)}`;
    return `
      <li class="ledger__row ${income ? 'is-in' : 'is-out'}">
        <div class="ledger__main">
          <span class="ledger__when">${when}</span>
          <span class="ledger__type">${esc(t(`ledger.type.${e.type}`))}</span>
          <span class="ledger__item">${esc(t(e.itemKey, resolveVars(e.itemVars)))}</span>
          <span class="ledger__partner">${esc(t(e.partnerKey))}</span>
          <span class="ledger__detail">${esc(detail)}</span>
        </div>
        <div class="ledger__nums">
          <span class="ledger__amount">${income ? '+' : '−'}${formatHiyama(Math.abs(e.amount))}</span>
          <span class="ledger__balance">${esc(t('bank.after'))} ${formatHiyama(e.balance)}</span>
        </div>
      </li>`;
  }).join('');
  return `
    <div class="bank__balance-box">
      <span class="bank__label">${esc(t('bank.balance'))}</span>
      <span class="bank__balance ${bal < 0 ? 'is-arrears' : ''}">${formatHiyama(bal)}</span>
      <span class="bank__unit">${esc(t('money', { amount: '' }).trim())}</span>
    </div>
    ${isInArrears() ? `<p class="shop__alert">${esc(t('bank.arrears'))}</p>` : ''}
    <p class="shop__disclaimer">${esc(t('hiyama.disclaimer'))}</p>
    <h3 class="shop__sub">${esc(t('bank.passbook'))}</h3>
    ${rows ? `<ol class="ledger">${rows}</ol>` : `<p class="shop__empty">${esc(t('bank.empty'))}</p>`}`;
}

// ── 政府庁舎の掲示板：国庫の残高、税率、お知らせ ──
function govHtml() {
  const tr = getTreasury();
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  const rates = [
    ['gov.incomeTax', pct(SETTINGS.incomeTaxRate)],
    ['gov.consumptionTax', pct(SETTINGS.consumptionTaxRate)],
    ['gov.betTax', pct(SETTINGS.betTaxRate)],
    ['gov.dailyCap', money(SETTINGS.dailyRewardCap)],
  ].map(([k, v]) => `<li><span>${esc(t(k))}</span><b>${esc(v)}</b></li>`).join('');
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const notices = [...getPersonalNotices().map((n) => ({ ...n, mine: true })), ...getNotices()]
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .map((n) => `
      <li class="notice ${n.major ? 'is-major' : ''} ${n.mine ? 'is-mine' : ''}">
        <span class="notice__when">${n.at ? fmtDate(n.at) : ''}${n.mine ? ` ・ ${esc(t('gov.forYou'))}` : ''}</span>
        <p class="notice__text">${esc(noticeText(n))}</p>
      </li>`).join('');
  const net = backend.mode === 'online' ? t('gov.online') : t(backend.reason === 'noconfig' ? 'gov.localNoConfig' : 'gov.localOffline');
  return `
    <div class="bank__balance-box treasury-box">
      <span class="bank__label">${esc(t('gov.treasury'))}</span>
      <span class="bank__balance">${tr === null ? '—' : formatHiyama(tr)}</span>
      <span class="bank__unit">${esc(t('money', { amount: '' }).trim())}</span>
    </div>
    <p class="shop__note">${esc(t('gov.treasuryNote'))}</p>
    <h3 class="shop__sub">${esc(t('gov.rates'))}</h3>
    <ul class="rates">${rates}</ul>
    <h3 class="shop__sub">${esc(t('gov.notices'))}</h3>
    ${notices ? `<ol class="notices">${notices}</ol>` : `<p class="shop__empty">${esc(t('gov.noNotices'))}</p>`}
    <p class="net-status ${backend.mode === 'online' ? 'is-online' : ''}"><i></i>${esc(net)}</p>`;
}

// ── 買うボタン（値段、税込、買えない理由） ──
function buyButton(act, price, extra = '') {
  const ok = canAfford(price);
  const reason = isInArrears() ? t('shop.arrears') : (ok ? '' : t('shop.short'));
  return `
    <div class="buy">
      <span class="buy__price">${esc(money(price))}</span>
      <span class="buy__tax">${esc(t('shop.taxIncl', { total: formatHiyama(priceWithTax(price)) }))}</span>
      <button type="button" class="btn btn--small btn--primary" data-act="${act}" ${extra} ${ok ? '' : 'disabled'}>${esc(t('shop.buy'))}</button>
      ${reason ? `<span class="buy__why">${esc(reason)}</span>` : ''}
    </div>`;
}

// ── 呉服屋：キャラクターの解放と衣装の色違い ──
function gofukuHtml() {
  const tabs = `
    <div class="tabs" role="tablist">
      <button type="button" role="tab" class="tabs__tab" aria-selected="${gofukuTab === 'chars'}" data-act="tab" data-tab="chars">${esc(t('gofuku.tabChars'))}</button>
      <button type="button" role="tab" class="tabs__tab" aria-selected="${gofukuTab === 'costumes'}" data-act="tab" data-tab="costumes">${esc(t('gofuku.tabCostumes'))}</button>
    </div>`;
  if (gofukuTab === 'chars') {
    const list = CHARACTERS.filter((c) => c.selectable && !c.start).map((c) => {
      const owned = ownsCharacter(c.id);
      return `
        <li class="goods">
          <img class="goods__face ${owned ? '' : 'is-locked'}" src="${faceUrl(c.id)}" alt="" width="256" height="256">
          <div class="goods__text">
            <span class="goods__name">${esc(t(nameKey(c.id)))}</span>
            <span class="goods__desc">${esc(t(motifKey(c.id)))}</span>
          </div>
          ${owned ? `<span class="goods__owned">${esc(t('shop.owned'))}</span>` : buyButton('unlock', UNLOCK_PRICE[c.id], `data-char="${c.id}"`)}
        </li>`;
    }).join('');
    return `${tabs}<ul class="goods-list">${list}</ul>`;
  }
  const blocks = CHARACTERS.filter((c) => c.selectable).map((c) => {
    const has = ownsCharacter(c.id);
    const wearing = getCostume(c.id);
    const cells = ['base', ...COSTUMES[c.id]].map((col) => {
      const owned = ownsCostume(c.id, col);
      const price = costumePrice(c.id, col);
      const label = col === 'base' ? t('gofuku.base') : t(`color.${col}`);
      const swatch = col === 'base' ? '#FFFFFF' : COLOR_HEX[col];
      let action;
      if (!has) action = '';
      else if (wearing === col) action = `<span class="costume__state">${esc(t('shop.wearing'))}</span>`;
      else if (owned) action = `<button type="button" class="btn btn--small" data-act="wear" data-char="${c.id}" data-col="${col}">${esc(t('shop.wear'))}</button>`;
      else action = `<button type="button" class="btn btn--small btn--primary" data-act="costume" data-char="${c.id}" data-col="${col}" ${canAfford(price) ? '' : 'disabled'}>${esc(formatHiyama(price))}</button>`;
      return `
        <li class="costume ${wearing === col && has ? 'is-wearing' : ''}">
          <img class="costume__face ${has ? '' : 'is-locked'}" src="${faceUrl(c.id, col)}" alt="" width="256" height="256" loading="lazy">
          <span class="costume__name"><i class="costume__swatch" style="background:${swatch}"></i>${esc(label)}</span>
          ${action}
        </li>`;
    }).join('');
    return `
      <section class="costume-block">
        <h3 class="shop__sub">${esc(t(nameKey(c.id)))}${has ? '' : `<span class="costume-block__lock">${esc(t('gofuku.needChar'))}</span>`}</h3>
        <ul class="costume-list">${cells}</ul>
      </section>`;
  }).join('');
  const short = isInArrears() ? `<p class="shop__alert">${esc(t('shop.arrears'))}</p>` : '';
  return `${tabs}${short}${blocks}`;
}

// ── 道具屋：サービス ──
function douguHtml() {
  const list = SETTINGS.services.map((s) => {
    const n = itemCount(s.id);
    const full = n >= SETTINGS.itemMax;
    return `
      <li class="goods">
        <div class="goods__text">
          <span class="goods__name">${esc(t(`service.${s.id}.name`))}</span>
          <span class="goods__desc">${esc(t(`service.${s.id}.desc`))}</span>
          <span class="goods__have">${esc(t('dougu.have', { n }))}</span>
        </div>
        ${full ? `<span class="goods__owned">${esc(t('dougu.max'))}</span>` : buyButton('service', s.price, `data-item="${s.id}"`)}
      </li>`;
  }).join('');
  return `<p class="shop__note">${esc(t('dougu.note'))}</p><ul class="goods-list">${list}</ul>`;
}

function render() {
  const body = { bank: bankHtml, gofuku: gofukuHtml, dougu: douguHtml, gov: govHtml }[current]();
  const scroll = root.querySelector('.shop__body')?.scrollTop || 0;
  root.innerHTML = frame(current, body);
  root.setAttribute('aria-labelledby', 'shop-title');
  root.querySelector('.shop__body').scrollTop = scroll;
}

// ── 買う前の確認 ──
function confirmBuy({ itemName, price, onYes }) {
  const tax = consumptionTax(price);
  const total = price + tax;
  confirmEl.innerHTML = `
    <div class="confirm__box">
      <h3 class="confirm__title">${esc(t('shop.confirmTitle'))}</h3>
      <p class="confirm__item">${esc(itemName)}</p>
      <p class="confirm__price">${esc(t('shop.confirmPrice', { price: formatHiyama(price), tax: formatHiyama(tax), total: formatHiyama(total) }))}</p>
      <p class="confirm__after">${esc(t('shop.confirmAfter', { after: formatHiyama(getBalance() - total) }))}</p>
      <div class="confirm__actions">
        <button type="button" class="btn" data-c="no">${esc(t('shop.confirmNo'))}</button>
        <button type="button" class="btn btn--primary" data-c="yes">${esc(t('shop.confirmYes'))}</button>
      </div>
    </div>`;
  confirmEl.hidden = false;
  confirmEl.querySelector('[data-c="yes"]').focus();
  confirmEl.querySelector('[data-c="no"]').onclick = () => { confirmEl.hidden = true; };
  confirmEl.querySelector('[data-c="yes"]').onclick = () => { confirmEl.hidden = true; onYes(); };
}

function afterBuy(itemName) {
  keeperLine = 'thanks';
  onToast(t('shop.done', { item: itemName }));
  render();
}

function failed(r) {
  onToast(t(r.reason === 'error' ? 'shop.error' : r.reason === 'arrears' ? 'shop.arrears' : 'shop.short'));
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'close') { closeShop(); return; }
  if (act === 'tab') { gofukuTab = b.dataset.tab; render(); return; }
  if (act === 'wear') { setCostume(b.dataset.char, b.dataset.col); return; }

  if (act === 'unlock') {
    const id = b.dataset.char;
    const itemName = t('ledger.item.unlock', { name: t(nameKey(id)) });
    confirmBuy({
      itemName, price: UNLOCK_PRICE[id],
      onYes: async () => {
        const r = await pay({ type: 'purchase', itemKey: 'ledger.item.unlock', itemVars: { name: `i18n:${nameKey(id)}` }, price: UNLOCK_PRICE[id] });
        if (r.ok) { addCharacter(id); afterBuy(itemName); fx.newItem(); } else failed(r);
      },
    });
  } else if (act === 'costume') {
    const id = b.dataset.char, col = b.dataset.col;
    const price = costumePrice(id, col);
    const itemName = t('ledger.item.costume', { name: t(nameKey(id)), color: t(`color.${col}`) });
    confirmBuy({
      itemName, price,
      onYes: async () => {
        const r = await pay({ type: 'purchase', itemKey: 'ledger.item.costume', itemVars: { name: `i18n:${nameKey(id)}`, color: `i18n:color.${col}` }, price });
        if (r.ok) { addCostume(id, col); setCostume(id, col); afterBuy(itemName); fx.newItem(); } else failed(r);
      },
    });
  } else if (act === 'service') {
    const s = SETTINGS.services.find((x) => x.id === b.dataset.item);
    const itemName = t(`service.${s.id}.name`);
    confirmBuy({
      itemName, price: s.price,
      onYes: async () => {
        const r = await pay({ type: 'service', itemKey: 'ledger.item.service', itemVars: { item: `i18n:service.${s.id}.name` }, price: s.price });
        if (r.ok) { addItem(s.id); afterBuy(itemName); } else failed(r);
      },
    });
  }
}

export function openShop(id) {
  if (!root) { build(); root.addEventListener('click', onClick); }
  current = id;
  keeperLine = 'welcome';
  root.hidden = false;
  document.body.classList.add('is-shop-open');
  render();
  root.querySelector('.shop__close').focus();
}

export function closeShop() {
  current = null;
  root.hidden = true;
  confirmEl.hidden = true;
  document.body.classList.remove('is-shop-open');
}

/** 買い物のあとの短いお知らせを出す関数を受け取る */
export function setShopToast(fn) { onToast = fn; }
