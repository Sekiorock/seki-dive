// hydration/src/zukan.js
// 図鑑（ハイドレーション・ビート仕様書 5章・8章、v0.4）。
//   ・模型：溶質ノーツの3D模型を1つずつ回して見られる。水のとき・ヘキサンのときの正しい入力も出す。
//   ・解説：結果の画面で「図鑑に保存」した、間違いの種類ごとの解説を読み返せる。

import { t } from '../../shared/i18n.js';
import { NOTES, ZUKAN_ORDER, answerIn } from './notes.js';
import { showModel, hideModel } from './viewer.js';
import { MISTAKE_ORDER, isSaved, savedKinds } from './progress.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { tab: 'models', id: ZUKAN_ORDER[0] };

function answerText(a) { return t(`hb.zukan.ans.${a}`); }

export function renderZukan(root) {
  root.querySelectorAll('.hb-zukan__tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)));
  const body = root.querySelector('#zukan-body');
  if (state.tab === 'models') {
    const d = NOTES[state.id];
    body.innerHTML = `
      <div class="hb-zukan__stage">
        <div class="hb-zukan__view" id="zukan-view"></div>
        <div class="hb-zukan__info">
          <p class="hb-zukan__formula">${esc(d.formula)}</p>
          <p class="hb-zukan__name">${esc(t(d.nameKey))}</p>
          <p class="hb-zukan__kind">${esc(t(`hb.kindName.${d.group}`))}</p>
          <p class="hb-zukan__ans">${esc(t('hb.zukan.inWater'))}<b>${esc(answerText(answerIn(d, 'water')))}</b><br>
            ${esc(t('hb.zukan.inHexane'))}<b>${esc(answerText(answerIn(d, 'hexane')))}</b></p>
        </div>
      </div>
      <p class="hb-zukan__empty">${esc(t(`hb.zukan.about.${d.group}`))}</p>
      <div class="hb-zukan__grid">
        ${ZUKAN_ORDER.map((id) => `<button type="button" class="hb-zukan__chip${id === state.id ? ' is-on' : ''}" data-act="zukan-pick" data-id="${id}" aria-pressed="${id === state.id}">${esc(NOTES[id].formula)}</button>`).join('')}
      </div>`;
    showModel(body.querySelector('#zukan-view'), state.id);
  } else {
    hideModel();
    const n = savedKinds().length;
    body.innerHTML = `
      <p class="hb-zukan__empty">${esc(t('hb.zukan.notesLead', { n, total: MISTAKE_ORDER.length }))}</p>
      ${MISTAKE_ORDER.map((k) => (isSaved(k)
        ? `<div class="hb-zukan__note"><b>${esc(t(`hb.mistake.${k}`))}</b><p>${esc(t(`hb.explain.${k}`))}</p></div>`
        : `<div class="hb-zukan__note is-locked"><b>${esc(t(`hb.mistake.${k}`))}</b><p>${esc(t('hb.zukan.locked'))}</p></div>`)).join('')}`;
  }
}

export function zukanTab(root, tab) { state.tab = tab; renderZukan(root); }
export function zukanPick(root, id) { if (NOTES[id]) { state.id = id; renderZukan(root); } }
export function closeZukan() { hideModel(); }
