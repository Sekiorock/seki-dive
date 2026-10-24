// home/src/qr-overlay.js
// 参加用のQRコードを画面いっぱいに表示する（ホームだけ）。
// QRコードは端末の中で作る（cdnjs の qrcode-generator を使う）。外部のQR作成サイトには接続しない。

import { PUBLIC_URL } from './config.js';
import { t } from '../../shared/i18n.js';

/** 配るURL。config.js の PUBLIC_URL が空なら、いま開いているページの場所を使う。 */
export function getPublicUrl() {
  if (PUBLIC_URL) return PUBLIC_URL;
  const u = new URL('.', window.location.href);  // 例 https://ユーザー名.github.io/seki-dive/
  u.search = '';
  u.hash = '';
  return u.href;
}

export function createQrOverlay() {
  const el = document.getElementById('qr-overlay');
  const box = el.querySelector('.qr__code');
  const urlText = el.querySelector('.qr__url');
  const closeBtn = el.querySelector('.qr__close');
  let lastFocus = null;

  function render() {
    const url = getPublicUrl();
    urlText.textContent = url;
    box.innerHTML = '';
    if (typeof window.qrcode !== 'function') {
      const p = document.createElement('p');
      p.className = 'qr__error';
      p.dataset.i18n = 'qr.error';   // 言語を切り替えたときも入れ替わる
      p.textContent = t('qr.error');
      box.append(p);
      return false;
    }
    const qr = window.qrcode(0, 'M');   // 型番は自動、誤り訂正レベル M
    qr.addData(url);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    const svg = box.querySelector('svg');
    if (svg) svg.setAttribute('role', 'img');
    return true;
  }

  function open() {
    lastFocus = document.activeElement;
    render();
    el.hidden = false;
    document.body.classList.add('is-qr-open');
    closeBtn.focus();
  }

  function close() {
    el.hidden = true;
    document.body.classList.remove('is-qr-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) close(); });

  return { open, close, isOpen: () => !el.hidden };
}
