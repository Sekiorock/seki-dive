// shared/avatar.js
// アバター選択の画面（仕様書 4章）。ワールドに入るたびに出す。
// 前回と同じアバターなら「このまま入る」を押すだけ。
// まだ持っていないキャラクターは選べない（解放は home v0.3 の呉服屋から）。

import { t, onLangChange } from './i18n.js';
import {
  selectableCharacters, standUrl, faceUrl, nameKey, motifKey, roleKey, lineKey,
  UNLOCK_PRICE, DEFAULT_AVATAR,
} from './characters.js';
import { getAvatar, setAvatar, ownsCharacter } from './auth.js';

let root = null;
let state = null;   // { world, picked, previous, expression, line, resolve }

function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function build() {
  root = el('div', 'avatar-screen', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'avatar-title' });
  root.hidden = true;
  root.innerHTML = `
    <div class="avatar-screen__head">
      <h2 id="avatar-title" class="avatar-screen__title"></h2>
      <p class="avatar-screen__dest"></p>
    </div>
    <div class="avatar-screen__stage">
      <img class="avatar-screen__stand" alt="" width="1024" height="1536">
      <div class="avatar-screen__info">
        <p class="avatar-screen__prev"></p>
        <p class="avatar-screen__name"></p>
        <p class="avatar-screen__motif"></p>
        <p class="avatar-screen__role"></p>
        <p class="avatar-screen__line"></p>
      </div>
    </div>
    <div class="avatar-screen__list" role="radiogroup"></div>
    <p class="avatar-screen__note"></p>
    <div class="avatar-screen__actions">
      <button type="button" class="btn avatar-screen__back"></button>
      <button type="button" class="btn btn--primary avatar-screen__enter"></button>
    </div>`;
  document.body.append(root);

  const list = root.querySelector('.avatar-screen__list');
  for (const c of selectableCharacters()) {
    const b = el('button', 'avatar-chip', { type: 'button', role: 'radio', 'data-id': c.id });
    b.style.setProperty('--chip-accent', c.accent);
    b.innerHTML = `<img src="${faceUrl(c.id)}" alt="" width="256" height="256"><span class="avatar-chip__lock" aria-hidden="true"></span>`;
    b.addEventListener('click', () => pick(c.id));
    list.append(b);
  }
  root.querySelector('.avatar-screen__back').addEventListener('click', () => close(null));
  root.querySelector('.avatar-screen__enter').addEventListener('click', () => {
    if (!ownsCharacter(state.picked)) return;
    setAvatar(state.world, state.picked);
    close(state.picked);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state) close(null); });
  onLangChange(() => { if (state) render(); });
}

function pick(id) {
  state.picked = id;
  const owned = ownsCharacter(id);
  state.expression = owned ? 'smile' : 'normal';
  state.line = owned ? 'select' : 'greet';
  render();
}

/** 値段を 3,000 のように区切って書く（数字はどちらの言語でも同じ表記） */
const price = (id) => (UNLOCK_PRICE[id] || 0).toLocaleString('en-US');

function render() {
  const { world, picked, previous } = state;
  const owned = ownsCharacter(picked);
  const q = (s) => root.querySelector(s);

  q('.avatar-screen__title').textContent = t('avatar.title');
  q('.avatar-screen__dest').textContent = t('avatar.forWorld', { world: t(`world.${world}`) });

  const img = q('.avatar-screen__stand');
  const src = standUrl(picked, state.expression);
  if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  img.classList.toggle('is-locked', !owned);
  img.alt = t(nameKey(picked));

  q('.avatar-screen__prev').textContent = previous === picked ? t('avatar.previous') : '';
  q('.avatar-screen__name').textContent = t(nameKey(picked));
  q('.avatar-screen__motif').textContent = t(motifKey(picked));
  q('.avatar-screen__role').textContent = t(roleKey(picked));
  q('.avatar-screen__line').textContent = owned
    ? t('quote', { line: t(lineKey(picked, state.line)) })
    : t('avatar.lockedNote');

  root.querySelectorAll('.avatar-chip').forEach((b) => {
    const id = b.dataset.id;
    const has = ownsCharacter(id);
    b.setAttribute('aria-checked', String(id === picked));
    b.setAttribute('aria-label', has ? t(nameKey(id)) : t('avatar.chipLocked', { name: t(nameKey(id)), price: price(id) }));
    b.classList.toggle('is-locked', !has);
    b.querySelector('.avatar-chip__lock').textContent = has ? '' : price(id);
  });

  q('.avatar-screen__note').textContent = owned
    ? t('avatar.note')
    : t('avatar.locked', { price: price(picked) });
  q('.avatar-screen__note').classList.toggle('is-price', !owned);

  const enter = q('.avatar-screen__enter');
  enter.textContent = previous === picked ? t('avatar.enterSame') : t('avatar.enter');
  enter.disabled = !owned;
  q('.avatar-screen__back').textContent = t('avatar.back');
}

function close(result) {
  root.hidden = true;
  document.body.classList.remove('is-avatar-open');
  const resolve = state.resolve;
  state = null;
  resolve(result);
}

/**
 * アバター選択の画面を開く。
 * @param {string} world  行き先のワールド（hydration / crystal / freeze / colloid）
 * @returns {Promise<string|null>} 選んだキャラクターのID。「戻る」なら null
 */
export function openAvatarSelect(world) {
  if (!root) build();
  const previous = getAvatar(world);
  const first = previous && ownsCharacter(previous) ? previous : DEFAULT_AVATAR;
  return new Promise((resolve) => {
    state = { world, picked: first, previous, expression: 'normal', line: 'greet', resolve };
    render();
    root.hidden = false;
    document.body.classList.add('is-avatar-open');
    root.querySelector('.avatar-screen__enter').focus();
  });
}
