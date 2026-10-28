// home/src/shops.js
// 広場の施設の画面：銀行（通帳）、呉服屋（キャラクターの解放・衣装の色違い）、道具屋（サービス）、
// 政府庁舎の掲示板（国庫の残高・税率・お知らせ）。
// お金の出入りはすべて shared/economy.js を通す（消費税の上乗せ、通帳への記録）。

import { t, onLangChange } from '../../shared/i18n.js';
import {
  getBalance, getLedger, isInArrears, canAfford, pay, consumptionTax, priceWithTax,
  formatHiyama, onWalletChange, onTreasuryChange, getTreasury, getLeaderboard, getSettings, onSettingsChange, SETTINGS,
} from '../../shared/economy.js';
import { backend } from '../../shared/auth.js';
import { getNotices, getPersonalNotices, onNoticesChange, noticeText } from '../../shared/notices.js';
import { fx } from '../../shared/theme.js';
import {
  ownsCharacter, addCharacter, ownsCostume, addCostume, getCostume, setCostume,
  itemCount, addItem, useItem, onUserChange, getUser,
} from '../../shared/auth.js';
import {
  CHARACTERS, UNLOCK_PRICE, COSTUME_TYPES, COSTUME_COLORS, COLOR_HEX, PREMIUM_COLORS, costumeId, costumePrice, parseCostume,
  faceUrl, standUrl, nameKey, motifKey, nameTag, say,
} from '../../shared/characters.js';
import { FACILITIES } from './config.js';
import { ITEMS, SHOP_GROUPS, itemDef } from '../../shared/items.js';
import { incomeTaxRate, consumptionTaxRate, taxRelief, zukanPages, isTaxFree, todayCap, CAP_UP } from '../../shared/economy.js';
import { patchUser } from '../../shared/auth.js';

let root, confirmEl;
let current = null;        // 開いている施設のID
let gofukuTab = 'chars';
let ckType = 'haori';        // v1.2：ロック呉服屋で見ている衣装の種類
let ckColor = 'ai';         // 見ている色
let ckWho = null;           // 着せる人（はじめは、いまのアバター）
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
  onSettingsChange(() => { if (current === 'gov') render(); });
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
      <figure class="char-fig char-fig--img shop__keeperfig"><img class="shop__keeper" src="${faceUrl(keeper)}" alt="" width="256" height="256">${nameTag(t, keeper)}</figure>
      <div class="shop__head-text">
        <h2 class="shop__title" id="shop-title">${esc(t(`facility.${id}`))}</h2>
        <p class="shop__keeper-name">${esc(t('facility.keeper', { name: t(nameKey(keeper)) }))}</p>
      </div>
    </div>
    <p class="shop__speech">${esc(say(t, keeper, t(lineKeyName)))}</p>
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

// ── 長者番付（先生が「出す」にしているときだけ） ──
function leaderboardHtml() {
  const lb = getLeaderboard();
  if (!getSettings().leaderboardOn || !lb || !lb.list) return '';
  const d = new Date(lb.at || 0);
  return `
    <h3 class="shop__sub">${esc(t('gov.leaderboard'))}<span class="costume-block__lock">${esc(t('gov.leaderboardAt', { date: `${d.getMonth() + 1}/${d.getDate()}` }))}</span></h3>
    <ol class="leaderboard">${lb.list.map((x) => `<li><span>${esc(x.nickname)}</span><b>${formatHiyama(x.balance)}</b></li>`).join('')}</ol>`;
}

// ── 政府庁舎の掲示板：国庫の残高、税率、お知らせ ──
function govHtml() {
  const tr = getTreasury();
  const pct = (x) => `${Math.round(x * 1000) / 10}%`;
  const mine = (base, now) => (Math.abs(base - now) > 1e-9 ? `${pct(base)}（${t("gov.yours", { r: pct(now) })}）` : pct(base));
  const rates = [
    ['gov.incomeTax', mine(SETTINGS.incomeTaxRate, incomeTaxRate())],
    ['gov.consumptionTax', mine(SETTINGS.consumptionTaxRate, consumptionTaxRate())],
    ['gov.betTax', mine(SETTINGS.betTaxRate, isTaxFree() ? 0 : SETTINGS.betTaxRate)],
    ['gov.dailyCap', todayCap() > SETTINGS.dailyRewardCap ? `${money(SETTINGS.dailyRewardCap)} → ${t('gov.yours', { r: money(todayCap()) })}` : money(SETTINGS.dailyRewardCap)],
  ].map(([k, v]) => `<li><span>${esc(t(k))}</span><b>${esc(v)}</b></li>`).join('')
    + `<li class="rates__relief"><span>${esc(t('gov.relief'))}</span><b>${esc(t('gov.reliefVal', { n: zukanPages(), r: pct(taxRelief()) }))}</b></li>`
    + (isTaxFree() ? `<li class="rates__relief"><span>${esc(t('gov.taxFree'))}</span><b>${esc(t('char.teppei.name'))}</b></li>` : '');
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
    ${leaderboardHtml()}
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
        <li class="goods${c.special ? ' is-special' : ''}">
          <figure class="char-fig char-fig--img"><img class="goods__face ${owned ? '' : 'is-locked'}" src="${faceUrl(c.id)}" alt="" width="256" height="256">${nameTag(t, c.id)}</figure>
          <div class="goods__text">
            <span class="goods__name">${esc(t(nameKey(c.id)))}${c.special ? `<em class="goods__special">${esc(t('gofuku.special'))}</em>` : ''}</span>
            <span class="goods__desc">${esc(t(motifKey(c.id)))}</span>
            ${c.special ? `<span class="goods__perk">${esc(t('gofuku.teppeiPerk'))}</span>` : ''}
          </div>
          ${owned ? `<span class="goods__owned">${esc(t('shop.owned'))}</span>` : buyButton('unlock', UNLOCK_PRICE[c.id], `data-char="${c.id}"`)}
        </li>`;
    }).join('');
    return `${tabs}<ul class="goods-list">${list}</ul>`;
  }
  // v1.2：衣装は「種類 × 色」。1度買えば、だれでも着られる
  const owners = CHARACTERS.filter((c) => c.selectable && ownsCharacter(c.id));
  if (!ckWho || !ownsCharacter(ckWho)) ckWho = ownsCharacter(getUser().lastAvatar) ? getUser().lastAvatar : owners[0].id;
  const cid = costumeId(ckType, ckColor);
  const owned = ownsCostume(cid);
  const price = costumePrice(cid);
  const wearing = getCostume(ckWho);
  const who = `<div class="ck-who" role="radiogroup" aria-label="${esc(t('gofuku.who'))}"><span>${esc(t('gofuku.who'))}</span>${owners.map((c) => `<button type="button" class="ck-who__b" role="radio" aria-checked="${c.id === ckWho}" data-act="ck-who" data-char="${c.id}"><img src="${faceUrl(c.id, getCostume(c.id))}" alt="${esc(t(nameKey(c.id)))}" width="40" height="40"></button>`).join('')}</div>`;
  const types = `<div class="ck-types">${COSTUME_TYPES.map((x) => `<button type="button" class="ck-type${x.id === ckType ? ' is-on' : ''}" data-act="ck-type" data-type="${x.id}">${esc(t(`costume.${x.id}`))}<small>${esc(formatHiyama(x.price))}〜</small></button>`).join('')}</div>`;
  const colors = `<div class="ck-colors">${COSTUME_COLORS.map((c) => {
    const id = costumeId(ckType, c);
    return `<button type="button" class="swatch ck-color${c === ckColor ? ' is-on' : ''}${ownsCostume(id) ? ' is-owned' : ''}${PREMIUM_COLORS.includes(c) ? ' is-premium' : ''}" data-act="ck-color" data-col="${c}" aria-label="${esc(t(`color.${c}`))}" title="${esc(t(`color.${c}`))}" style="--swatch:${COLOR_HEX[c]}"></button>`;
  }).join('')}</div>`;
  let action;
  if (wearing === cid) action = `<span class="costume__state">${esc(t('shop.wearing'))}</span><button type="button" class="btn btn--small" data-act="ck-base">${esc(t('gofuku.toBase'))}</button>`;
  else if (owned) action = `<button type="button" class="btn btn--small btn--primary" data-act="ck-wear">${esc(t('gofuku.wearOn', { name: t(nameKey(ckWho)) }))}</button>`;
  else action = buyButton('ck-buy', price);
  const preview = `<div class="ck-preview"><figure class="char-fig char-fig--stand"><img class="ck-stand" src="${standUrl(ckWho, 'smile', cid)}" alt="" width="1024" height="1536">${nameTag(t, ckWho)}</figure>`
    + `<div class="ck-info"><b>${esc(t('gofuku.costumeName', { type: t(`costume.${ckType}`), color: t(`color.${ckColor}`) }))}</b>`
    + `${owned ? `<span class="goods__owned">${esc(t('shop.owned'))}</span>` : ''}<p class="goods__desc">${esc(t('gofuku.anyone'))}</p>${action}</div></div>`;
  const short = isInArrears() ? `<p class="shop__alert">${esc(t('shop.arrears'))}</p>` : '';
  return `${tabs}${short}${who}${preview}${types}${colors}`;
}

// ── ロック物販：品の一覧（v1.2：ワールドごとに、ヒント券3段階・通行手形・レバレッジ券・道具） ──
let douguGroup = 'home';
function douguHtml() {
  const tabs = `<div class="tabs tabs--wrap" role="tablist">${SHOP_GROUPS.map((g) => `<button type="button" role="tab" class="tabs__tab" aria-selected="${douguGroup === g}" data-act="dg-tab" data-g="${g}">${esc(t(`dougu.group.${g}`))}</button>`).join('')}</div>`;
  const list = ITEMS.filter((x) => x.world === douguGroup).map((x) => {
    const n = itemCount(x.id);
    const max = x.kind === 'perm' ? 1 : SETTINGS.itemMax;
    const full = n >= max;
    const use = x.id === 'capUp' && n > 0 ? `<button type="button" class="btn btn--small" data-act="use-cap">${esc(t('dougu.useNow'))}</button>` : '';
    return `
      <li class="goods${x.kind === 'perm' ? ' is-key' : ''}${x.world === 'lever' ? ' is-lever' : ''}">
        <div class="goods__text">
          <span class="goods__name">${esc(t(`item.${x.id}.name`))}${x.kind === 'perm' ? `<em class="goods__special">${esc(t('dougu.perm'))}</em>` : ''}</span>
          <span class="goods__desc">${esc(t(`item.${x.id}.desc`, { m: x.mult || '', f: x.mult ? Math.round((x.mult - 1) * 100) / 100 : '' }))}</span>
          <span class="goods__have">${esc(x.kind === 'perm' ? (n ? t('shop.owned') : '') : t('dougu.have', { n }))}</span>
        </div>
        ${use}${full ? `<span class="goods__owned">${esc(t(x.kind === 'perm' ? 'shop.owned' : 'dougu.max'))}</span>` : buyButton('item', x.price, `data-item="${x.id}"`)}
      </li>`;
  }).join('');
  return `${tabs}<p class="shop__note">${esc(t(`dougu.note.${douguGroup}`))}</p><ul class="goods-list">${list}</ul>`;
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
  if (act === 'dg-tab') { douguGroup = b.dataset.g; render(); return; }
  if (act === 'use-cap') {
    if (!useItem('capUp')) return;
    const day = new Date().toLocaleDateString('sv-SE');
    const cb = getUser().capBoost || {};
    patchUser({ capBoost: { day, extra: (cb.day === day ? cb.extra || 0 : 0) + CAP_UP } });
    onToast(t('dougu.capUsed', { cap: formatHiyama(todayCap()) }));
    render();
    return;
  }
  if (act === 'ck-type') { ckType = b.dataset.type; render(); return; }
  if (act === 'ck-color') { ckColor = b.dataset.col; render(); return; }
  if (act === 'ck-who') { ckWho = b.dataset.char; render(); return; }
  if (act === 'ck-wear') { setCostume(ckWho, costumeId(ckType, ckColor)); return; }
  if (act === 'ck-base') { setCostume(ckWho, 'base'); return; }

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
  } else if (act === 'ck-buy') {
    const cid = costumeId(ckType, ckColor);
    const price = costumePrice(cid);
    const itemName = t('gofuku.costumeName', { type: t(`costume.${ckType}`), color: t(`color.${ckColor}`) });
    confirmBuy({
      itemName, price,
      onYes: async () => {
        const r = await pay({ type: 'purchase', itemKey: 'ledger.item.costume2', itemVars: { type: `i18n:costume.${ckType}`, color: `i18n:color.${ckColor}` }, price });
        if (r.ok) { addCostume(cid); setCostume(ckWho, cid); afterBuy(itemName); fx.newItem(); } else failed(r);
      },
    });
  } else if (act === 'item') {
    const x = itemDef(b.dataset.item);
    const itemName = t(`item.${x.id}.name`);
    confirmBuy({
      itemName, price: x.price,
      onYes: async () => {
        const r = await pay({ type: 'service', itemKey: 'ledger.item.service', itemVars: { item: `i18n:item.${x.id}.name` }, price: x.price });
        if (r.ok) { addItem(x.id); afterBuy(itemName); if (x.kind === 'perm') fx.newItem(); } else failed(r);
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
