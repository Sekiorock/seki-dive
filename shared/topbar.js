// shared/topbar.js
// 画面の上の帯。左にニックネームと顔アイコン、右に（残高）・QR・言語の切り替え。
// 残高は home v0.3、ニックネームと顔アイコンは home v0.2 で本物にする。
// QRコードの表示ボタンはホームだけ（showQR: true のときだけ出す）。

import { createLangToggle } from './i18n.js';

/**
 * @param {object} opt
 * @param {HTMLElement} opt.mount  帯を入れる要素
 * @param {boolean} [opt.showQR]   QRボタンを出すか（ホームだけ true）
 * @param {Function} [opt.onQR]    QRボタンを押したとき
 */
export function createTopbar({ mount, showQR = false, onQR }) {
  mount.classList.add('topbar');
  mount.innerHTML = '';

  // 左：顔アイコンとニックネーム（v0.1 ではゲスト表示）
  const left = document.createElement('div');
  left.className = 'topbar__left';
  const face = document.createElement('span');
  face.className = 'topbar__face';
  face.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'topbar__name';
  name.dataset.i18n = 'topbar.guest';
  left.append(face, name);

  // 右：（残高はv0.3で追加）QR、言語
  const right = document.createElement('div');
  right.className = 'topbar__right';

  if (showQR) {
    const qr = document.createElement('button');
    qr.type = 'button';
    qr.className = 'btn btn--small topbar__qr';
    qr.dataset.i18nAria = 'topbar.qrLabel';
    qr.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
      '<path d="M1 1h5v5H1zM10 1h5v5h-5zM1 10h5v5H1z" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
      '<path d="M3 3h1v1H3zM12 3h1v1h-1zM3 12h1v1H3zM10 10h2v2h-2zM13 10h2v2h-2zM10 13h2v2h-2zM13 13h2v2h-2z" fill="currentColor"/>' +
      '</svg><span data-i18n="qr.button"></span>';
    qr.addEventListener('click', () => onQR && onQR());
    right.append(qr);
  }
  right.append(createLangToggle());

  mount.append(left, right);
  return { left, right };
}
