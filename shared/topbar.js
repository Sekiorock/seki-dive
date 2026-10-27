// shared/topbar.js
// 画面の上の帯。左にニックネームと顔アイコン、右に残高・QR・言語の切り替え。
// 残高は山吹色で表示する（仕様書 5章）。ニックネームがまだないときは「ゲスト」と出す。
// QRコードの表示ボタンはホームだけ（showQR: true のときだけ出す）。
// ワールドの中では、左上に「ホームへ」ボタンを出す（onHome を渡したときだけ。全体の仕様書 1章）。

import { createLangToggle, onLangChange, t } from './i18n.js';
import { getUser, onUserChange, getCostume } from './auth.js';
import { faceUrl, nameKey } from './characters.js';
import { getBalance, onWalletChange, onMoneyEvent, formatHiyama } from './economy.js';
import { fx } from './theme.js';

/**
 * @param {object} opt
 * @param {HTMLElement} opt.mount  帯を入れる要素
 * @param {boolean} [opt.showQR]   QRボタンを出すか（ホームだけ true）
 * @param {Function} [opt.onQR]    QRボタンを押したとき
 * @param {Function} [opt.onBalance] 残高を押したとき（ホームでは銀行の通帳を開く）
 * @param {Function} [opt.onHome]  「ホームへ」を押したとき（ワールドの中だけ）
 */
export function createTopbar({ mount, showQR = false, onQR, onBalance, onHome }) {
  mount.classList.add('topbar');
  mount.innerHTML = '';

  // 左：顔アイコン（最後に選んだアバター）とニックネーム
  const left = document.createElement('div');
  left.className = 'topbar__left';
  const face = document.createElement('img');
  face.className = 'topbar__face';
  face.alt = '';
  face.width = 30; face.height = 30;
  const name = document.createElement('span');
  name.className = 'topbar__name';
  if (onHome) {
    const home = document.createElement('button');
    home.type = 'button';
    home.className = 'btn btn--small topbar__home';
    home.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 8 8 2.5 14 8M4 7v6.5h3V10h2v3.5h3V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span data-i18n="topbar.home"></span>';
    home.addEventListener('click', () => onHome());
    left.append(home);
    left.classList.add('has-home');
  }
  // 顔の下に、キャラクターの名前の札
  const faceFig = document.createElement('figure');
  faceFig.className = 'char-fig topbar__fig';
  const faceTag = document.createElement('figcaption');
  faceTag.className = 'char-tag';
  faceFig.append(face, faceTag);
  left.append(faceFig, name);

  const refreshIdentity = () => {
    const u = getUser();
    const src = faceUrl(u.lastAvatar, getCostume(u.lastAvatar));
    if (face.getAttribute('src') !== src) face.setAttribute('src', src);
    name.textContent = u.nickname || t('topbar.guest');
    faceTag.textContent = u.lastAvatar ? t(nameKey(u.lastAvatar)) : '';
    faceTag.hidden = !u.lastAvatar;
  };
  refreshIdentity();
  onUserChange(refreshIdentity);
  onLangChange(refreshIdentity);

  // 右：残高、（ホームだけ）QR、言語
  const right = document.createElement('div');
  right.className = 'topbar__right';

  const bal = document.createElement('button');
  bal.type = 'button';
  bal.className = 'topbar__balance';
  bal.innerHTML = '<span class="topbar__coin" aria-hidden="true"></span><span class="topbar__amount"></span>';
  const amountEl = bal.querySelector('.topbar__amount');
  let counting = false;
  const refreshBalance = () => {
    const b = getBalance();
    if (!counting) amountEl.textContent = formatHiyama(b);
    bal.classList.toggle('is-arrears', b < 0);
    bal.setAttribute('aria-label', t('topbar.balanceLabel', { amount: formatHiyama(b) }));
  };
  refreshBalance();
  onWalletChange(refreshBalance);
  onLangChange(refreshBalance);
  // 交付金・賞金・報酬を受け取ったときは、残高の数字が金に光りながら増える（出来事の発光）
  onMoneyEvent((e) => {
    if (e.type !== 'grant' && e.type !== 'prize' && e.type !== 'reward') return;
    const from = e.balance - e.amount;
    counting = true;
    fx.countUp(amountEl, from, e.balance);
    setTimeout(() => { counting = false; refreshBalance(); }, 1300);
  });
  bal.addEventListener('click', () => onBalance && onBalance());
  right.append(bal);

  if (showQR) {
    const qr = document.createElement('button');
    qr.type = 'button';
    qr.className = 'btn btn--small topbar__qr';
    qr.dataset.i18nAria = 'topbar.qrLabel';
    qr.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
      '<path d="M1 1h5v5H1zM10 1h5v5h-5zM1 10h5v5H1z" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M3 3h1v1H3zM12 3h1v1h-1zM3 12h1v1H3zM10 10h2v2h-2zM13 10h2v2h-2zM10 13h2v2h-2zM13 13h2v2h-2z" fill="currentColor"/>' +
      '</svg>';
    qr.addEventListener('click', () => onQR && onQR());
    right.append(qr);
  }
  right.append(createLangToggle());

  mount.append(left, right);
  return { left, right };
}
