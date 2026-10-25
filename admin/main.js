// admin/main.js
// 科学政府セキオロックの管理画面（先生だけ）。仕様書 5章。
//   概要      ：国庫の残高、生徒の数、残高の合計、点検で気になる生徒、授業交付金のボタン
//   生徒      ：残高と最後に動いた日時、通帳、点検の結果。1人ずつ特別交付金・罰金
//   支給・罰金：授業交付金・特別交付金・罰金を、全員または選んだ生徒に（理由は必ず。本人に通知が届く）
//   お知らせ  ：掲示板に出す（日本語は必ず、英語は任意。重大発表も）
//   設定      ：税率、金額、ワールドの開閉、対戦の可否、任意の税と長者番付。税率を変えるとキタローが自動で発表
//   国庫の記録：国庫の出入り
// 書き込みは、生徒の端末と同じく「トランザクション」で行う（同時に書いても数が狂わない）。

import { VERSION, GATES } from '../home/src/config.js';
import { initI18n, t, tIn, onLangChange, applyToDom, createLangToggle, getLang } from '../shared/i18n.js';
import { applyTheme } from '../shared/theme.js';
import { initAdminBackend, adminBackend, adminSignIn, adminSignOut } from '../shared/auth.js';
import { SETTINGS, REMOTE_KEYS, formatHiyama } from '../shared/economy.js';

const root = document.getElementById('admin');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => t('money', { amount: formatHiyama(n) });
const pct = (x) => Math.round(x * 1000) / 10;

const state = {
  tab: 'overview',
  users: {}, wallets: {}, ledger: {}, treasury: null, treasuryLog: [], notices: [], settings: {},
  detail: null,          // 通帳を開いている生徒の uid
  search: '',
  money: { kind: 'lesson', target: 'all', amount: null, reason: '', picked: new Set() },
  busy: false,
  nt: { ja: '', en: '', major: false },   // 書きかけのお知らせ
  draft: {},                               // 保存前の設定
};

// ───────────── 小さな道具 ─────────────
let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 3600);
}
function when(at) {
  if (!at) return '';
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function resolveVars(vars = {}) {
  const out = {};
  for (const [k, v] of Object.entries(vars)) out[k] = typeof v === 'string' && v.startsWith('i18n:') ? t(v.slice(5)) : v;
  return out;
}
/** 今の設定の値（Firebase の settings があればそれ、なければ初めの値） */
function cur(key) { return typeof state.settings[key] === 'number' ? state.settings[key] : SETTINGS[key]; }

const F = () => adminBackend.fb;
const ref = (p) => adminBackend.fb.ref(adminBackend.db, p);

/** 生徒の一覧（財布か本人の情報がある人） */
function students() {
  const ids = new Set([...Object.keys(state.wallets), ...Object.keys(state.users)]);
  return [...ids].map((uid) => ({
    uid,
    name: (state.users[uid] && state.users[uid].nickname) || '（no name）',
    balance: (state.wallets[uid] && state.wallets[uid].balance) || 0,
    updated: state.users[uid] && state.users[uid].updatedAt,
    issues: check(uid),
  })).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

// ───────────── 点検：不自然な出入りを見つける（仕様書 12章「知っておくべき限界」） ─────────────
function check(uid) {
  const rows = Object.entries(state.ledger[uid] || {}).sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
  const issues = [];
  let run = 0, chainBad = 0, founding = 0, sum = 0, big = 0;
  const daily = {};
  for (const e of rows) {
    run += e.amount;
    sum += e.amount;
    if (Math.abs(e.balance - run) > 0.5) { chainBad += 1; run = e.balance; }
    if (e.itemKey === 'ledger.item.founding') founding += 1;
    if (e.amount > 2000 && e.type !== 'grant') big += 1;
    if (e.type === 'reward' && e.at) { const day = e.at.slice(0, 10); daily[day] = (daily[day] || 0) + (e.gross || 0); }
  }
  const balance = (state.wallets[uid] && state.wallets[uid].balance) || 0;
  if (chainBad) issues.push(t('admin.check.chain', { n: chainBad }));
  if (Math.abs(sum - balance) > 0.5) issues.push(t('admin.check.balance', { balance: formatHiyama(balance), sum: formatHiyama(sum) }));
  if (founding > 1) issues.push(t('admin.check.founding', { n: founding }));
  if (big) issues.push(t('admin.check.bigIncome', { amount: formatHiyama(2000) }));
  for (const [day, amt] of Object.entries(daily)) if (amt > cur('dailyRewardCap')) issues.push(t('admin.check.dailyCap', { day, amount: formatHiyama(amt) }));
  return issues;
}

// ───────────── 書き込み ─────────────
async function moveTreasury(delta) {
  const res = await F().runTransaction(ref('treasury'), (v) => {
    const now = typeof v === 'number' ? v : SETTINGS.initialTreasury;
    if (now + delta < 0) return undefined;
    return now + delta;
  });
  return res.committed ? res.snapshot.val() : null;
}
async function moveWallet(uid, delta) {
  const res = await F().runTransaction(ref(`wallets/${uid}`), (w) => {
    const c = { balance: 0, foundingGranted: false, rewardDay: '', rewardToday: 0, ...(w || {}) };
    c.balance += delta;
    return c;
  });
  return res.snapshot.val().balance;
}
async function addLedger(uid, fields, balance) {
  await F().set(F().push(ref(`ledger/${uid}`)), { at: new Date().toISOString(), tax: 0, ...fields, balance });
}
async function notifyPersonal(uid, kind, key, vars) {
  await F().set(F().push(ref(`personalNotices/${uid}`)), {
    ja: tIn('ja', key, varsIn('ja', vars)), en: tIn('en', key, varsIn('en', vars)), kind, at: Date.now(),
  });
}
/** 差し込みのうち 'i18n:鍵' の形のものを、その言語の文字に直す */
function varsIn(lang, vars) {
  const out = {};
  for (const [k, v] of Object.entries(vars)) out[k] = typeof v === 'string' && v.startsWith('i18n:') ? tIn(lang, v.slice(5)) : v;
  return out;
}
async function logTreasury(fields) {
  await F().set(F().push(ref('treasuryLog')), { at: new Date().toISOString(), uid: adminBackend.uid, nickname: 'teacher', ...fields });
}

/** 交付金（授業・特別）：国庫から本人へ。国庫の残高を超える交付金は出せない */
async function giveGrant(uids, amount, kind, reason) {
  const total = amount * uids.length;
  const after = await moveTreasury(-total);
  if (after === null) { toast(t('admin.money.shortTreasury')); return false; }
  const itemKey = kind === 'lesson' ? 'ledger.item.lessonGrant' : 'ledger.item.specialGrant';
  const kindKey = kind === 'lesson' ? 'i18n:admin.money.lesson' : 'i18n:admin.money.special';
  for (const uid of uids) {
    const bal = await moveWallet(uid, amount);
    await addLedger(uid, { type: 'grant', itemKey, itemVars: { reason }, partnerKey: 'party.treasury', gross: amount, amount }, bal);
    await notifyPersonal(uid, 'grant', 'admin.grantNotice', { kind: kindKey, amount: formatHiyama(amount), reason });
  }
  await logTreasury({ type: 'grant', amount: -total, balance: after, count: uids.length, reason, itemKey });
  return true;
}

/** 罰金：本人から国庫へ（残高が足りなければ滞納＝マイナス） */
async function giveFine(uids, amount, reason) {
  for (const uid of uids) {
    const bal = await moveWallet(uid, -amount);
    await addLedger(uid, { type: 'fine', itemKey: 'ledger.item.adminFine', itemVars: { reason }, partnerKey: 'party.treasury', gross: amount, amount: -amount }, bal);
    await notifyPersonal(uid, 'fine', 'admin.fineNotice', { amount: formatHiyama(amount), reason });
  }
  const after = await moveTreasury(amount * uids.length);
  await logTreasury({ type: 'fine', amount: amount * uids.length, balance: after, count: uids.length, reason, itemKey: 'ledger.item.adminFine' });
  return true;
}

/** 住民税・資産税を徴収する（任意の税） */
async function collectTax(kind) {
  let total = 0, n = 0;
  for (const s of students()) {
    let amt = 0;
    if (kind === 'resident') amt = cur('residentTax');
    else amt = Math.floor(Math.max(0, s.balance - cur('assetTaxThreshold')) * cur('assetTaxRate'));
    if (amt <= 0) continue;
    const bal = await moveWallet(s.uid, -amt);
    const itemKey = kind === 'resident' ? 'ledger.item.residentTax' : 'ledger.item.assetTax';
    await addLedger(s.uid, { type: 'tax', itemKey, itemVars: {}, partnerKey: 'party.treasury', gross: amt, amount: -amt }, bal);
    await notifyPersonal(s.uid, 'tax', 'admin.taxCollectNotice', { kind: kind === 'resident' ? 'i18n:admin.residentTax' : 'i18n:admin.assetTax', amount: formatHiyama(amt) });
    total += amt; n += 1;
  }
  if (total) {
    const after = await moveTreasury(total);
    await logTreasury({ type: 'collect', amount: total, balance: after, count: n, itemKey: kind === 'resident' ? 'ledger.item.residentTax' : 'ledger.item.assetTax' });
  }
  return { total, n };
}

async function updateLeaderboard() {
  const list = students().sort((a, b) => b.balance - a.balance).slice(0, 10).map((s) => ({ nickname: s.name, balance: s.balance }));
  await F().set(ref('public/leaderboard'), { at: Date.now(), list });
}

// ───────────── 画面 ─────────────
/** 上の見出し（1回だけ作る。言語の切り替えボタンはここ） */
function buildHeader() {
  const h = document.getElementById('admin-head');
  h.innerHTML = `
    <div class="adm-head__titles">
      <h1 class="adm-head__title" data-i18n="admin.title"></h1>
      <p class="adm-head__sub" data-i18n="admin.subtitle"></p>
    </div>
    <div class="adm-head__lang"></div>`;
  h.querySelector('.adm-head__lang').append(createLangToggle());
  applyToDom(h);
}

function tabs() {
  const list = ['overview', 'students', 'money', 'notices', 'settings', 'log'];
  return `
    <div class="adm-user">
      <span>${esc(t('admin.signedInAs', { email: adminBackend.email }))}</span>
      <button type="button" class="btn btn--small" data-act="logout">${esc(t('admin.logout'))}</button>
    </div>
    <nav class="adm-tabs" role="tablist">
      ${list.map((k) => `<button type="button" role="tab" class="adm-tabs__tab" aria-selected="${state.tab === k}" data-act="tab" data-tab="${k}">${esc(t(`admin.tab.${k}`))}</button>`).join('')}
    </nav>`;
}

function overview() {
  const ss = students();
  const sum = ss.reduce((a, s) => a + s.balance, 0);
  const alerts = ss.filter((s) => s.issues.length);
  return `
    <div class="adm-cards">
      <div class="adm-card adm-card--gold"><span>${esc(t('admin.ov.treasury'))}</span><b>${state.treasury === null ? '—' : formatHiyama(state.treasury)}</b></div>
      <div class="adm-card"><span>${esc(t('admin.ov.students'))}</span><b>${esc(t('admin.ov.people', { n: ss.length }))}</b></div>
      <div class="adm-card"><span>${esc(t('admin.ov.circulation'))}</span><b>${formatHiyama(sum)}</b></div>
      <div class="adm-card ${alerts.length ? 'adm-card--warn' : ''}"><span>${esc(t('admin.ov.alerts'))}</span><b>${esc(t('admin.ov.people', { n: alerts.length }))}</b></div>
    </div>
    <button type="button" class="btn btn--primary adm-wide" data-act="quick-lesson">${esc(t('admin.ov.quickGrant', { amount: formatHiyama(cur('lessonGrant')) }))}</button>
    <h2 class="shop__sub">${esc(t('admin.ov.alerts'))}</h2>
    ${alerts.length ? `<ul class="adm-list">${alerts.map((s) => `
      <li><button type="button" class="adm-row is-warn" data-act="open-student" data-uid="${s.uid}">
        <span class="adm-row__name">${esc(s.name)}</span><span class="adm-row__num">${formatHiyama(s.balance)}</span>
        <span class="adm-row__issues">${s.issues.map(esc).join('<br>')}</span>
      </button></li>`).join('')}</ul>` : `<p class="shop__empty">${esc(t('admin.ov.alertsNone'))}</p>`}`;
}

function studentsTab() {
  if (state.detail) return studentDetail(state.detail);
  const q = state.search.trim().toLowerCase();
  const ss = students().filter((s) => !q || s.name.toLowerCase().includes(q));
  return `
    <input class="adm-input" type="search" data-input="search" placeholder="${esc(t('admin.st.search'))}" value="${esc(state.search)}">
    ${ss.length ? `<ul class="adm-list">${ss.map((s) => `
      <li><button type="button" class="adm-row ${s.issues.length ? 'is-warn' : ''}" data-act="open-student" data-uid="${s.uid}">
        <span class="adm-row__name">${esc(s.name)}</span>
        <span class="adm-row__num ${s.balance < 0 ? 'is-minus' : ''}">${formatHiyama(s.balance)}</span>
        <span class="adm-row__meta">${esc(t('admin.st.updated'))}：${esc(when(s.updated))}</span>
        <span class="adm-row__issues">${s.issues.length ? `⚠ ${s.issues.map(esc).join('<br>⚠ ')}` : esc(t('admin.st.ok'))}</span>
      </button></li>`).join('')}</ul>` : `<p class="shop__empty">${esc(t('admin.st.empty'))}</p>`}`;
}

function studentDetail(uid) {
  const s = students().find((x) => x.uid === uid);
  if (!s) { state.detail = null; return studentsTab(); }
  const rows = Object.entries(state.ledger[uid] || {}).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 100).map(([, e]) => {
    const income = e.amount >= 0;
    return `
      <li class="ledger__row ${income ? 'is-in' : 'is-out'}">
        <div class="ledger__main">
          <span class="ledger__when">${esc(when(e.at))}</span>
          <span class="ledger__type">${esc(t(`ledger.type.${e.type}`))}</span>
          <span class="ledger__item">${esc(t(e.itemKey || '', resolveVars(e.itemVars)))}</span>
        </div>
        <div class="ledger__nums">
          <span class="ledger__amount">${income ? '+' : '−'}${formatHiyama(Math.abs(e.amount))}</span>
          <span class="ledger__balance">${esc(t('bank.after'))} ${formatHiyama(e.balance)}</span>
        </div>
      </li>`;
  }).join('');
  return `
    <button type="button" class="btn btn--small" data-act="close-student">← ${esc(t('admin.st.close'))}</button>
    <h2 class="shop__sub">${esc(t('admin.st.detail', { name: s.name }))}</h2>
    <div class="bank__balance-box"><span class="bank__label">${esc(t('admin.st.balance'))}</span><span class="bank__balance ${s.balance < 0 ? 'is-arrears' : ''}">${formatHiyama(s.balance)}</span></div>
    ${s.issues.length ? `<p class="adm-warn">⚠ ${s.issues.map(esc).join('<br>⚠ ')}</p>` : ''}
    <div class="adm-two">
      <button type="button" class="btn btn--primary" data-act="student-money" data-kind="special" data-uid="${uid}">${esc(t('admin.st.grant'))}</button>
      <button type="button" class="btn btn--danger" data-act="student-money" data-kind="fine" data-uid="${uid}">${esc(t('admin.st.fine'))}</button>
    </div>
    ${rows ? `<ol class="ledger">${rows}</ol>` : `<p class="shop__empty">${esc(t('admin.st.noLedger'))}</p>`}`;
}

function moneyTab() {
  const m = state.money;
  if (m.amount === null) m.amount = m.kind === 'lesson' ? cur('lessonGrant') : 100;
  const ss = students();
  const targets = m.target === 'all' ? ss.map((s) => s.uid) : [...m.picked];
  const total = targets.length * (Number(m.amount) || 0);
  const tr = state.treasury;
  const after = tr === null ? null : (m.kind === 'fine' ? tr + total : tr - total);
  const kinds = ['lesson', 'special', 'fine'];
  return `
    <label class="adm-label">${esc(t('admin.money.kind'))}</label>
    <div class="tabs adm-tabs3">${kinds.map((k) => `<button type="button" class="tabs__tab" aria-selected="${m.kind === k}" data-act="money-kind" data-kind="${k}">${esc(t(`admin.money.${k}`))}</button>`).join('')}</div>
    <label class="adm-label">${esc(t('admin.money.target'))}</label>
    <div class="tabs">${['all', 'pick'].map((k) => `<button type="button" class="tabs__tab" aria-selected="${m.target === k}" data-act="money-target" data-target="${k}">${esc(t(`admin.money.${k}`))}</button>`).join('')}</div>
    ${m.target === 'pick' ? `
      <div class="adm-two adm-two--small">
        <button type="button" class="btn btn--small" data-act="pick-all">${esc(t('admin.money.selectAll'))}</button>
        <button type="button" class="btn btn--small" data-act="pick-none">${esc(t('admin.money.selectNone'))}</button>
      </div>
      <ul class="adm-picks">${ss.map((s) => `
        <li><label class="adm-pick"><input type="checkbox" data-pick="${s.uid}" ${m.picked.has(s.uid) ? 'checked' : ''}>
          <span>${esc(s.name)}</span><b>${formatHiyama(s.balance)}</b></label></li>`).join('')}</ul>` : ''}
    <label class="adm-label" for="adm-amount">${esc(t('admin.money.amount'))}</label>
    <input id="adm-amount" class="adm-input" type="number" min="1" step="1" inputmode="numeric" data-input="amount" value="${esc(m.amount)}">
    <label class="adm-label" for="adm-reason">${esc(t('admin.money.reason'))}</label>
    <input id="adm-reason" class="adm-input" type="text" maxlength="60" data-input="reason" placeholder="${esc(t('admin.money.reasonPlaceholder'))}" value="${esc(m.reason)}">
    <p class="adm-preview">${esc(t('admin.money.preview', { n: targets.length, amount: formatHiyama(Number(m.amount) || 0), total: formatHiyama(total) }))}<br>
      ${after === null ? '' : esc(t('admin.money.previewTreasury', { before: formatHiyama(tr), after: formatHiyama(after) }))}</p>
    <button type="button" class="btn ${m.kind === 'fine' ? 'btn--danger' : 'btn--primary'} adm-wide" data-act="money-run" ${state.busy ? 'disabled' : ''}>${esc(t('admin.money.run'))}</button>`;
}

function noticesTab() {
  const list = [...state.notices].sort((a, b) => (b.at || 0) - (a.at || 0));
  return `
    <label class="adm-label" for="nt-ja">${esc(t('admin.nt.ja'))}</label>
    <textarea id="nt-ja" class="adm-input adm-textarea" rows="3" maxlength="200" data-input="ntJa">${esc(state.nt.ja)}</textarea>
    <label class="adm-label" for="nt-en">${esc(t('admin.nt.en'))}</label>
    <textarea id="nt-en" class="adm-input adm-textarea" rows="3" maxlength="300" data-input="ntEn">${esc(state.nt.en)}</textarea>
    <label class="adm-check"><input type="checkbox" id="nt-major" data-input="ntMajor" ${state.nt.major ? 'checked' : ''}> <span>${esc(t('admin.nt.major'))}</span></label>
    <button type="button" class="btn btn--primary adm-wide" data-act="notice-post">${esc(t('admin.nt.post'))}</button>
    <h2 class="shop__sub">${esc(t('admin.nt.list'))}</h2>
    ${list.length ? `<ol class="notices">${list.map((n) => `
      <li class="notice ${n.major ? 'is-major' : ''}">
        <span class="notice__when">${esc(when(n.at))}</span>
        <p class="notice__text">${esc(n.ja)}${n.en ? `<br><span class="adm-en">${esc(n.en)}</span>` : ''}</p>
        <button type="button" class="btn btn--small" data-act="notice-delete" data-id="${n.id}">${esc(t('admin.nt.delete'))}</button>
      </li>`).join('')}</ol>` : `<p class="shop__empty">${esc(t('admin.nt.empty'))}</p>`}`;
}

function num(id, key, isRate = false, step = 1) {
  const v = key in state.draft ? state.draft[key] : (isRate ? pct(cur(key)) : cur(key));
  return `<label class="adm-field"><span>${esc(t(`admin.set.${key}`))}</span><input class="adm-input" type="number" min="0" step="${step}" inputmode="decimal" data-set="${key}" data-input="set-${key}" data-rate="${isRate ? 1 : 0}" value="${esc(v)}"></label>`;
}
const flagOn = (key) => (key in state.draft ? state.draft[key] : !!state.settings[key]);

function settingsTab() {
  const s = state.settings;
  const worldsOpen = s.worldsOpen || {};
  const mode = s.battleMode || 'class';
  return `
    <h2 class="shop__sub">${esc(t('admin.set.taxes'))}</h2>
    <div class="adm-grid">${num('', 'incomeTaxRate', true, 0.5)}${num('', 'consumptionTaxRate', true, 0.5)}${num('', 'betTaxRate', true, 0.5)}</div>
    <h2 class="shop__sub">${esc(t('admin.set.amounts'))}</h2>
    <div class="adm-grid">${['foundingGrant', 'lessonGrant', 'dailyRewardCap', 'battleFee', 'quitFine', 'itemMax'].map((k) => num('', k)).join('')}</div>
    <h2 class="shop__sub">${esc(t('admin.set.worlds'))}</h2>
    <ul class="adm-list">${GATES.map((g) => `
      <li class="adm-switch"><span>${esc(t(`world.${g.id}`))}</span>
        <div class="tabs">${['open', 'closed'].map((k) => `<button type="button" class="tabs__tab" aria-selected="${(worldsOpen[g.id] !== false) === (k === 'open')}" data-act="world" data-world="${g.id}" data-open="${k === 'open'}">${esc(t(`admin.set.${k}`))}</button>`).join('')}</div>
      </li>`).join('')}</ul>
    <h2 class="shop__sub">${esc(t('admin.set.battle'))}</h2>
    <div class="tabs adm-tabs3">${['class', 'always', 'off'].map((k) => `<button type="button" class="tabs__tab" aria-selected="${mode === k}" data-act="battle" data-mode="${k}">${esc(t(`admin.set.battle.${k}`))}</button>`).join('')}</div>
    <p class="shop__note">${esc(t('admin.set.battleNote'))}</p>
    <h2 class="shop__sub">${esc(t('admin.set.optional'))}</h2>
    <label class="adm-check"><input type="checkbox" data-flag="residentTaxOn" ${flagOn('residentTaxOn') ? 'checked' : ''}> <span>${esc(t('admin.set.residentTaxOn'))}</span></label>
    <div class="adm-grid">${num('', 'residentTax')}</div>
    <label class="adm-check"><input type="checkbox" data-flag="assetTaxOn" ${flagOn('assetTaxOn') ? 'checked' : ''}> <span>${esc(t('admin.set.assetTaxOn'))}</span></label>
    <div class="adm-grid">${num('', 'assetTaxRate', true, 0.5)}${num('', 'assetTaxThreshold')}</div>
    <label class="adm-check"><input type="checkbox" data-flag="leaderboardOn" ${flagOn('leaderboardOn') ? 'checked' : ''}> <span>${esc(t('admin.set.leaderboardOn'))}</span></label>
    <button type="button" class="btn btn--primary adm-wide" data-act="settings-save">${esc(t('admin.set.save'))}</button>
    <div class="adm-two adm-two--stack">
      <button type="button" class="btn" data-act="collect" data-kind="resident" ${s.residentTaxOn ? '' : 'disabled'}>${esc(t('admin.set.collectResident'))}</button>
      <button type="button" class="btn" data-act="collect" data-kind="asset" ${s.assetTaxOn ? '' : 'disabled'}>${esc(t('admin.set.collectAsset'))}</button>
      <button type="button" class="btn" data-act="leaderboard" ${s.leaderboardOn ? '' : 'disabled'}>${esc(t('admin.set.updateLeaderboard'))}</button>
    </div>`;
}

function logTab() {
  const list = [...state.treasuryLog].reverse();
  if (!list.length) return `<p class="shop__empty">${esc(t('admin.log.empty'))}</p>`;
  return `<ol class="ledger">${list.map((e) => {
    const isIn = e.amount >= 0;
    const who = e.nickname === 'teacher' ? t('admin.log.teacher') : (e.nickname || e.uid || '');
    const type = t(`admin.log.type.${e.type}`) === `admin.log.type.${e.type}` ? e.type : t(`admin.log.type.${e.type}`);
    return `
      <li class="ledger__row ${isIn ? 'is-in' : 'is-out'}">
        <div class="ledger__main">
          <span class="ledger__when">${esc(when(e.at))}</span>
          <span class="ledger__type">${esc(type)}</span>
          <span class="ledger__item">${esc(e.itemKey ? t(e.itemKey, { reason: e.reason || '', name: '', color: '', item: '' }) : '')}${e.count ? ` ×${e.count}` : ''}</span>
          <span class="ledger__partner">${esc(t('admin.log.by', { name: who }))}${e.reason ? ` ・ ${esc(e.reason)}` : ''}</span>
        </div>
        <div class="ledger__nums">
          <span class="ledger__amount">${isIn ? '+' : '−'}${formatHiyama(Math.abs(e.amount))}</span>
          ${typeof e.balance === 'number' ? `<span class="ledger__balance">${esc(t('gov.treasury'))} ${formatHiyama(e.balance)}</span>` : ''}
        </div>
      </li>`;
  }).join('')}</ol>`;
}

function loginView(message = '') {
  const notAdmin = adminBackend.uid && !adminBackend.isAdmin;
  return `
    <section class="adm-panel adm-login">
      <h2 class="shop__sub">${esc(t('admin.login.title'))}</h2>
      ${notAdmin ? `
        <p class="adm-warn">${esc(t('admin.login.notAdmin'))}</p>
        <p class="shop__note">${esc(t('admin.login.uidHelp'))}</p>
        <p class="adm-uid"><span>${esc(t('admin.login.uid'))}</span><code>${esc(adminBackend.uid)}</code></p>
        <button type="button" class="btn adm-wide" data-act="logout">${esc(t('admin.logout'))}</button>` : `
        <form class="adm-form" data-form="login">
          <label class="adm-label" for="adm-email">${esc(t('admin.login.email'))}</label>
          <input id="adm-email" class="adm-input" type="email" autocomplete="username" required>
          <label class="adm-label" for="adm-pass">${esc(t('admin.login.password'))}</label>
          <input id="adm-pass" class="adm-input" type="password" autocomplete="current-password" required>
          <p class="adm-error" role="alert">${esc(message)}</p>
          <button type="submit" class="btn btn--primary adm-wide">${esc(t('admin.login.submit'))}</button>
        </form>`}
      <a class="btn adm-wide adm-back" href="./">${esc(t('admin.back'))}</a>
    </section>`;
}

function render() {
  if (!adminBackend.ready) {
    const key = adminBackend.reason === 'noconfig' ? 'admin.noconfig' : adminBackend.reason === 'offline' ? 'admin.offline' : 'admin.loading';
    root.innerHTML = `<section class="adm-panel"><p class="adm-warn">${esc(t(key))}</p><a class="btn adm-wide adm-back" href="./">${esc(t('admin.back'))}</a></section>`;
  } else if (!adminBackend.isAdmin) {
    const msg = root.dataset.loginError || '';
    root.innerHTML = loginView(msg);
  } else {
    const body = { overview, students: studentsTab, money: moneyTab, notices: noticesTab, settings: settingsTab, log: logTab }[state.tab]();
    const scroll = root.querySelector('.adm-panel')?.scrollTop || 0;
    const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.input : null;
    root.innerHTML = `${tabs()}<section class="adm-panel">${body}</section>`;
    root.querySelector('.adm-panel').scrollTop = scroll;
    if (focusId) {
      const el = root.querySelector(`[data-input="${focusId}"]`);
      if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
    }
  }
}

// ───────────── 操作 ─────────────
function readSettingsForm() {
  const out = {};
  for (const el of root.querySelectorAll('[data-set]')) {
    const v = Number(el.value);
    if (!Number.isFinite(v) || v < 0) return null;
    out[el.dataset.set] = el.dataset.rate === '1' ? Math.round(v * 10) / 1000 : Math.round(v);
  }
  for (const el of root.querySelectorAll('[data-flag]')) out[el.dataset.flag] = el.checked;
  return out;
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  try {
    if (act === 'tab') { state.tab = b.dataset.tab; state.detail = null; render(); }
    else if (act === 'logout') { await adminSignOut(); root.dataset.loginError = ''; render(); }
    else if (act === 'open-student') { state.tab = 'students'; state.detail = b.dataset.uid; render(); }
    else if (act === 'close-student') { state.detail = null; render(); }
    else if (act === 'student-money') {
      state.tab = 'money';
      state.money = { kind: b.dataset.kind, target: 'pick', amount: b.dataset.kind === 'fine' ? cur('quitFine') : 100, reason: '', picked: new Set([b.dataset.uid]) };
      state.detail = null;
      render();
    }
    else if (act === 'quick-lesson') {
      state.tab = 'money';
      state.money = { kind: 'lesson', target: 'all', amount: cur('lessonGrant'), reason: '', picked: new Set() };
      render();
      root.querySelector('#adm-reason').focus();
    }
    else if (act === 'money-kind') { state.money.kind = b.dataset.kind; state.money.amount = b.dataset.kind === 'lesson' ? cur('lessonGrant') : b.dataset.kind === 'fine' ? cur('quitFine') : 100; render(); }
    else if (act === 'money-target') { state.money.target = b.dataset.target; render(); }
    else if (act === 'pick-all') { students().forEach((s) => state.money.picked.add(s.uid)); render(); }
    else if (act === 'pick-none') { state.money.picked.clear(); render(); }
    else if (act === 'money-run') await runMoney();
    else if (act === 'notice-post') await postNotice();
    else if (act === 'notice-delete') {
      if (!window.confirm(t('admin.nt.deleteConfirm'))) return;
      await F().remove(ref(`notices/${b.dataset.id}`));
    }
    else if (act === 'world') {
      const open = b.dataset.open === 'true';
      await F().update(ref('settings/worldsOpen'), { [b.dataset.world]: open });
    }
    else if (act === 'battle') await F().update(ref('settings'), { battleMode: b.dataset.mode });
    else if (act === 'settings-save') await saveSettings();
    else if (act === 'collect') {
      const kind = b.dataset.kind;
      const label = t(kind === 'resident' ? 'admin.residentTax' : 'admin.assetTax');
      if (!window.confirm(t('admin.set.collectConfirm', { kind: label }))) return;
      const r = await collectTax(kind);
      toast(t('admin.set.collected', { kind: label, n: r.n, total: formatHiyama(r.total) }));
    }
    else if (act === 'leaderboard') { await updateLeaderboard(); toast(t('admin.set.leaderboardUpdated')); }
  } catch (err) {
    console.info('[セキオダイブ] 管理画面の操作ができませんでした。', err && err.message);
    toast(t('shop.error'));
  }
}

async function runMoney() {
  const m = state.money;
  const amount = Math.round(Number(m.amount));
  const reason = (m.reason || '').trim();
  const targets = m.target === 'all' ? students().map((s) => s.uid) : [...m.picked];
  if (!targets.length) { toast(t('admin.money.needTarget')); return; }
  if (!(amount >= 1)) { toast(t('admin.money.needAmount')); return; }
  if (!reason) { toast(t('admin.money.needReason')); root.querySelector('#adm-reason').focus(); return; }
  const kindLabel = t(`admin.money.${m.kind}`);
  if (!window.confirm(t('admin.money.confirm', { kind: kindLabel, n: targets.length }))) return;
  state.busy = true; render();
  try {
    const ok = m.kind === 'fine' ? await giveFine(targets, amount, reason) : await giveGrant(targets, amount, m.kind, reason);
    if (ok) { toast(t('admin.money.done', { kind: kindLabel, n: targets.length })); m.reason = ''; }
  } finally { state.busy = false; render(); }
}

async function postNotice() {
  const ja = state.nt.ja.trim();
  const en = state.nt.en.trim();
  const major = state.nt.major;
  if (!ja) { toast(t('admin.nt.needJa')); return; }
  await F().set(F().push(ref('notices')), { ja, en, major, at: Date.now(), by: 'teacher' });
  state.nt = { ja: '', en: '', major: false };
  toast(t('admin.nt.posted'));
  render();
}

async function saveSettings() {
  const v = readSettingsForm();
  if (!v) { toast(t('admin.set.invalid')); return; }
  const before = { income: cur('incomeTaxRate'), consumption: cur('consumptionTaxRate'), bet: cur('betTaxRate') };
  await F().update(ref('settings'), v);
  state.draft = {};
  toast(t('admin.set.saved'));
  // 税率を変えたときは、広報官キタローが自動で重大発表をする（仕様書 5章）
  if (v.incomeTaxRate !== before.income || v.consumptionTaxRate !== before.consumption || v.betTaxRate !== before.bet) {
    const vars = { income: pct(v.incomeTaxRate), consumption: pct(v.consumptionTaxRate), bet: pct(v.betTaxRate) };
    await F().set(F().push(ref('notices')), {
      ja: tIn('ja', 'admin.taxNotice', vars), en: tIn('en', 'admin.taxNotice', vars), major: true, at: Date.now(), by: 'tsukasa',
    });
    setTimeout(() => toast(t('admin.set.taxAnnounced')), 1200);
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.input === 'search') { state.search = el.value; render(); }
  else if (el.dataset.input === 'amount') { state.money.amount = el.value; updatePreview(); }
  else if (el.dataset.input === 'reason') { state.money.reason = el.value; }
  else if (el.dataset.input === 'ntJa') state.nt.ja = el.value;
  else if (el.dataset.input === 'ntEn') state.nt.en = el.value;
  else if (el.dataset.set) state.draft[el.dataset.set] = el.value;
}
function updatePreview() {
  // 金額を打つたびに全体を描き直すと入力しにくいので、見積もりの行だけ書き換える
  const m = state.money;
  const targets = m.target === 'all' ? students().length : m.picked.size;
  const total = targets * (Number(m.amount) || 0);
  const tr = state.treasury;
  const after = tr === null ? null : (m.kind === 'fine' ? tr + total : tr - total);
  const p = root.querySelector('.adm-preview');
  if (p) p.innerHTML = `${esc(t('admin.money.preview', { n: targets, amount: formatHiyama(Number(m.amount) || 0), total: formatHiyama(total) }))}<br>${after === null ? '' : esc(t('admin.money.previewTreasury', { before: formatHiyama(tr), after: formatHiyama(after) }))}`;
}
function onChange(e) {
  const el = e.target;
  if (el.dataset.input === 'ntMajor') state.nt.major = el.checked;
  if (el.dataset.flag) state.draft[el.dataset.flag] = el.checked;
  if (el.dataset.pick) {
    if (el.checked) state.money.picked.add(el.dataset.pick); else state.money.picked.delete(el.dataset.pick);
    updatePreview();
  }
}
async function onSubmit(e) {
  const form = e.target.closest('[data-form="login"]');
  if (!form) return;
  e.preventDefault();
  try {
    await adminSignIn(form.querySelector('#adm-email').value.trim(), form.querySelector('#adm-pass').value);
    root.dataset.loginError = '';
    if (adminBackend.isAdmin) watch();
  } catch (err) {
    root.dataset.loginError = t('admin.login.error');
  }
  render();
}

// ───────────── データを見張る ─────────────
/** データが続けて届いたときは、描き直しを1回にまとめる（軽くするため） */
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  const on = (path, fn) => F().onValue(ref(path), (s) => { fn(s.val()); scheduleRender(); }, () => {});
  on('users', (v) => { state.users = v || {}; });
  on('wallets', (v) => { state.wallets = v || {}; });
  on('ledger', (v) => { state.ledger = v || {}; });
  on('treasury', (v) => { state.treasury = typeof v === 'number' ? v : null; });
  on('settings', (v) => { state.settings = v || {}; });
  F().onValue(F().query(ref('treasuryLog'), F().limitToLast(200)), (s) => {
    const list = [];
    s.forEach((c) => { list.push({ id: c.key, ...c.val() }); });
    state.treasuryLog = list;
    scheduleRender();
  }, () => {});
  F().onValue(ref('notices'), (s) => {
    const list = [];
    s.forEach((c) => { list.push({ id: c.key, ...c.val() }); });
    state.notices = list;
    scheduleRender();
  }, () => {});
}

async function start() {
  applyTheme('home');
  document.getElementById('version').textContent = VERSION;
  await initI18n('shared/');
  buildHeader();
  render();
  await initAdminBackend();
  if (adminBackend.isAdmin) watch();
  render();
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('change', onChange);
  root.addEventListener('submit', onSubmit);
  onLangChange(() => { applyToDom(); render(); });
  document.documentElement.lang = getLang();
}

start();
