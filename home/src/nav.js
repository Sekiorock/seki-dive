// home/src/nav.js
// 画面下の「施設と門の一覧」ボタン。歩かずに、すぐ施設や門へ移れる（仕様書 6章）。

import { t, onLangChange } from '../../shared/i18n.js';
import { GATES, FACILITIES } from './config.js';
import { ACCENTS } from '../../shared/theme.js';
import { isWorldOpen } from '../../shared/economy.js';

export function createNav({ onGate, onFacility }) {
  const btn = document.getElementById('nav-open');
  const sheet = document.getElementById('nav-sheet');

  const render = () => {
    btn.textContent = t('nav.open');
    const gate = (g) => `
      <li><button type="button" class="nav__item ${isWorldOpen(g.id) ? '' : 'is-closed'}" data-gate="${g.id}">
        <i class="nav__mark" style="background:${ACCENTS[g.id].a1.neon};color:${ACCENTS[g.id].a1.neon}"></i>
        <span>${t(`world.${g.id}`)}</span><small>${t(`scale.${g.id}`)}</small>
      </button></li>`;
    const fac = (f) => `
      <li><button type="button" class="nav__item" data-facility="${f.id}">
        <i class="nav__mark nav__mark--facility"></i><span>${t(`facility.${f.id}`)}</span>
      </button></li>`;
    sheet.innerHTML = `
      <div class="nav__box">
        <h2 class="nav__head">${t('nav.gates')}</h2>
        <ul class="nav__list">${GATES.map(gate).join('')}</ul>
        <h2 class="nav__head">${t('nav.facilities')}</h2>
        <ul class="nav__list">${[{ id: 'gov' }, ...FACILITIES].map(fac).join('')}</ul>
        <button type="button" class="btn nav__close">${t('shop.close')}</button>
      </div>`;
  };

  const close = () => { sheet.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    render();
    sheet.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    sheet.querySelector('.nav__item').focus();
  });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('.nav__close')) { close(); return; }
    const b = e.target.closest('.nav__item');
    if (!b) return;
    close();
    if (b.dataset.gate) onGate(b.dataset.gate);
    else onFacility(b.dataset.facility);
  });
  onLangChange(() => { btn.textContent = t('nav.open'); if (!sheet.hidden) render(); });
  render();
}
