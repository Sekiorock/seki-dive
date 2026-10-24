// shared/topbar.js
// 画面の上の帯。左にニックネームと顔アイコン、右に残高・QR・言語の切り替え。
// 残高は山吹色で表示する（仕様書 5章）。ニックネームがまだないときは「ゲスト」と出す。
// QRコードの表示ボタンはホームだけ（showQR: true のときだけ出す）。

import { createLangToggle, onLangChange, t } from './i18n.js';
import { getUser, onUserChange, getCostume } from './auth.js';
import { faceUrl } from './characters.js';
import { getBalance, onWalletChange, formatHiyama } from './economy.js';

/**
 * @param {object} opt
 * @param {HTMLElement} opt.mount  帯を入れる要素
 * @param {boolean} [opt.showQR]   QRボタンを出すか（ホームだけ true）
 * @param {Function} [opt.onQR]    QRボタンを押したとき
 * @param {Function} [opt.onBalance] 残高を押したとき（ホームでは銀行の通帳を開く）
 */
export function createTopbar({ mount, showQR = false, onQR, onBalance }) {
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
  left.append(face, name);

  const refreshIdentity = () => {
    const u = getUser();
    const src = faceUrl(u.lastAvatar, getCostume(u.lastAvatar));
    if (face.getAttribute('src') !== src) face.setAttribute('src', src);
    name.textContent = u.nickname || t('topbar.guest');
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
  const refreshBalance = () => {
    const b = getBalance();
    bal.querySelector('.topbar__amount').textContent = formatHiyama(b);
    bal.classList.toggle('is-arrears', b < 0);
    bal.setAttribute('aria-label', t('topbar.balanceLabel', { amount: formatHiyama(b) }));
  };
  refreshBalance();
  onWalletChange(refreshBalance);
  onLangChange(refreshBalance);
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
