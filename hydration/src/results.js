// hydration/src/results.js
// 結果の画面。v0.1 は、スコア、判定の内訳、最大コンボ、水和したイオンの数、アバターの立ち絵。
// v0.2：難易度、見送り成功の数、間違いの種類ごとの回数（名前だけ）を足した。
// v0.3：CLEAR／FAILED、水和ゲージ、最高点の更新、新しく開いたステージの知らせ。
// 間違いの種類ごとの解説と図鑑は v0.4、水和ゲージとクリアは v0.3、ヒヤマの報酬はそのあとで足す。

import { t } from '../../shared/i18n.js';
import { standUrl, nameKey, lineKey } from '../../shared/characters.js';
import { getCostume } from '../../shared/auth.js';
import { formatHiyama } from '../../shared/economy.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {HTMLElement} el   結果の画面の入れ物
 * @param {object} r         { stageLabel, stageTitleKey, diffId, score, stats, avatar, clear, gauge, clearPct, news, unlockedLabel }
 */
export function renderResult(el, r) {
  const s = r.stats;
  const good = r.clear;
  const hydrated = s.perfect + s.great + s.good - (s.passed || 0);
  const m = s.mistakes || {};
  const ORDER = ['cationH', 'anionO', 'ohOneSide', 'hclOrder', 'nonpolarHydrated', 'insolubleDissolved', 'timing'];
  const kinds = ORDER.filter((k) => m[k]).map((k) => [k, m[k]]);
  const cells = [
    ['perfect', s.perfect], ['great', s.great], ['good', s.good], ['miss', s.miss],
  ].map(([k, v]) => `<li class="is-${k}"><span>${esc(t(`hb.j.${k}`))}</span><b>${v}</b></li>`).join('');
  el.innerHTML = `
    <div class="hb-result__head">
      <p class="hb-result__label">${esc(t('hb.result.title'))}</p>
      <p class="hb-result__badge ${r.clear ? 'is-clear' : 'is-failed'}">${esc(t(r.clear ? 'hb.result.clear' : 'hb.result.failed'))}</p>
      <p class="hb-result__stage">${esc(r.stageLabel)} ・ ${esc(t(r.stageTitleKey))} ・ ${esc(t(`hb.diff.${r.diffId}`))}</p>
    </div>
    <div class="hb-result__hero">
      <img class="hb-result__stand" src="${standUrl(r.avatar, good ? 'smile' : 'surprise', getCostume(r.avatar))}" alt="${esc(t(nameKey(r.avatar)))}" width="1024" height="1536">
      <div class="hb-result__score">
        <span>${esc(t('hb.result.score'))}</span>
        <b>${formatHiyama(r.score)}</b>
        ${r.news && r.news.newRecord ? `<em class="hb-result__new">${esc(t('hb.result.newRecord'))}</em>` : ''}
        <p class="hb-result__line">${esc(t('quote', { line: t(lineKey('minato', good ? 'hbResultGood' : 'hbResultTry')) }))}</p>
      </div>
    </div>
    ${r.unlockedLabel ? `<p class="hb-result__news">${esc(t('hb.result.unlocked', r.unlockedLabel))}</p>` : ''}
    ${r.clear ? '' : `<p class="hb-result__news is-fail">${esc(t('hb.result.failNote', { pct: r.clearPct }))}</p>`}
    <ul class="hb-result__grid">
      <li class="is-wide is-gauge"><span>${esc(t('hb.result.gauge'))}</span><b>${Math.floor(r.gauge)}%</b></li>
      ${cells}
      <li class="is-wrong is-wide"><span>${esc(t('hb.result.wrong'))}</span><b>${s.wrong}</b></li>
      <li class="is-wide"><span>${esc(t('hb.result.maxCombo'))}</span><b>${s.maxCombo}</b></li>
      <li class="is-wide"><span>${esc(t('hb.result.hydrated'))}</span><b>${esc(t('hb.result.count', { n: hydrated }))}</b></li>
      ${s.passed ? `<li class="is-wide"><span>${esc(t('hb.result.passed'))}</span><b>${esc(t('hb.result.count', { n: s.passed }))}</b></li>` : ''}
    </ul>
    <div class="hb-result__mistakes">
      <p class="hb-result__sub">${esc(t('hb.result.mistakes'))}</p>
      ${kinds.length ? `<ul>${kinds.map(([k, v]) => `<li><span>${esc(t(`hb.mistake.${k}`))}</span><b>${esc(t('hb.mistake.count', { n: v }))}</b></li>`).join('')}</ul>`
        : `<p class="hb-result__note">${esc(t('hb.result.noMistakes'))}</p>`}
    </div>
    <p class="hb-result__note">${esc(t('hb.result.later'))}</p>
    <div class="hb-result__actions">
      <button type="button" class="btn btn--primary" data-act="retry">${esc(t('hb.result.retry'))}</button>
      <button type="button" class="btn" data-act="to-title">${esc(t('hb.result.toTitle'))}</button>
    </div>`;
}
