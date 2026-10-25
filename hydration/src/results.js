// hydration/src/results.js
// 結果の画面。v0.1 は、スコア、判定の内訳、最大コンボ、水和したイオンの数、アバターの立ち絵。
// 間違いの種類ごとの解説と図鑑は v0.4、水和ゲージとクリアは v0.3、ヒヤマの報酬はそのあとで足す。

import { t } from '../../shared/i18n.js';
import { standUrl, nameKey, lineKey } from '../../shared/characters.js';
import { getCostume } from '../../shared/auth.js';
import { formatHiyama } from '../../shared/economy.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {HTMLElement} el   結果の画面の入れ物
 * @param {object} r         { stageNo, stageTitleKey, score, stats, avatar }
 */
export function renderResult(el, r) {
  const s = r.stats;
  const good = r.score >= 700000;
  const hydrated = s.perfect + s.great + s.good;
  const m = s.mistakes || {};
  const cells = [
    ['perfect', s.perfect], ['great', s.great], ['good', s.good], ['miss', s.miss],
  ].map(([k, v]) => `<li class="is-${k}"><span>${esc(t(`hb.j.${k}`))}</span><b>${v}</b></li>`).join('');
  el.innerHTML = `
    <div class="hb-result__head">
      <p class="hb-result__label">${esc(t('hb.result.title'))}</p>
      <p class="hb-result__stage">${esc(t('hb.stageLabel', { n: r.stageNo }))} ・ ${esc(t(r.stageTitleKey))}</p>
    </div>
    <div class="hb-result__hero">
      <img class="hb-result__stand" src="${standUrl(r.avatar, good ? 'smile' : 'surprise', getCostume(r.avatar))}" alt="${esc(t(nameKey(r.avatar)))}" width="1024" height="1536">
      <div class="hb-result__score">
        <span>${esc(t('hb.result.score'))}</span>
        <b>${formatHiyama(r.score)}</b>
        <p class="hb-result__line">${esc(t('quote', { line: t(lineKey('minato', good ? 'hbResultGood' : 'hbResultTry')) }))}</p>
      </div>
    </div>
    <ul class="hb-result__grid">
      ${cells}
      <li class="is-wrong is-wide"><span>${esc(t('hb.j.wrong'))}</span><b>${s.wrong}</b></li>
      <li class="is-wide"><span>${esc(t('hb.result.maxCombo'))}</span><b>${s.maxCombo}</b></li>
      <li class="is-wide"><span>${esc(t('hb.result.hydrated'))}</span><b>${esc(t('hb.result.count', { n: hydrated }))}</b></li>
    </ul>
    ${s.wrong ? `<p class="hb-result__note">${esc(t('hb.result.wrongDetail', { a: m.cationH || 0, b: m.anionO || 0 }))}</p>` : ''}
    <p class="hb-result__note">${esc(t('hb.result.later'))}</p>
    <div class="hb-result__actions">
      <button type="button" class="btn btn--primary" data-act="retry">${esc(t('hb.result.retry'))}</button>
      <button type="button" class="btn" data-act="to-title">${esc(t('hb.result.toTitle'))}</button>
    </div>`;
}
