// home/src/onboarding.js
// 初めて起動したときの流れ（仕様書 6章）
//   言語の選択 → ニックネームの入力（本名は使わない注意） → 広報官ツカサによる国の説明 → 広場へ
// 開国交付金1,000ヒヤマの支給は、ヒヤマを作る home v0.3 でこの流れに足す。

import { t, tIn, setLang, getLang, onLangChange } from '../../shared/i18n.js';
import { getUser, setNickname, cleanNickname, finishOnboarding, NICKNAME_MAX } from '../../shared/auth.js';
import { standUrl, nameKey, lineKey } from '../../shared/characters.js';
import { ONBOARDING } from './config.js';

export function runOnboarding() {
  const root = document.getElementById('onboard');
  let step = 'lang';
  let talkIndex = 0;
  let nickDraft = getUser().nickname || '';
  let nickError = false;
  let done;

  const render = () => {
    root.innerHTML = '';
    if (step === 'lang') renderLang();
    else if (step === 'nick') renderNick();
    else renderTalk();
  };

  function renderLang() {
    const box = document.createElement('div');
    box.className = 'onboard__panel';
    // まだ言語が決まっていないので、両方の言語で問いかける
    box.innerHTML = `
      <h2 class="onboard__title" lang="ja"></h2>
      <p class="onboard__title onboard__title--sub" lang="en"></p>
      <div class="onboard__langs">
        <button type="button" class="btn onboard__lang" lang="ja" data-lang="ja">日本語</button>
        <button type="button" class="btn onboard__lang" lang="en" data-lang="en">English</button>
      </div>`;
    box.querySelector('h2').textContent = tIn('ja', 'onboard.langTitle');
    box.querySelector('p').textContent = tIn('en', 'onboard.langTitle');
    box.querySelectorAll('[data-lang]').forEach((b) => {
      if (b.dataset.lang === getLang()) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => { setLang(b.dataset.lang); step = 'nick'; render(); });
    });
    root.append(box);
    box.querySelector(`[data-lang="${getLang()}"]`).focus();
  }

  function renderNick() {
    const box = document.createElement('form');
    box.className = 'onboard__panel';
    box.noValidate = true;
    box.innerHTML = `
      <h2 class="onboard__title"></h2>
      <p class="onboard__warn" role="note"></p>
      <label class="onboard__field">
        <input class="onboard__input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">
        <span class="onboard__rule"></span>
      </label>
      <p class="onboard__error" role="alert"></p>
      <button type="submit" class="btn btn--primary onboard__next"></button>`;
    box.querySelector('.onboard__title').textContent = t('onboard.nickTitle');
    box.querySelector('.onboard__warn').textContent = t('onboard.nickWarn');
    const input = box.querySelector('input');
    input.value = nickDraft;
    input.placeholder = t('onboard.nickPlaceholder');
    input.setAttribute('aria-label', t('onboard.nickTitle'));
    box.querySelector('.onboard__rule').textContent = t('onboard.nickRule', { max: NICKNAME_MAX });
    box.querySelector('.onboard__error').textContent = nickError ? t('onboard.nickError', { max: NICKNAME_MAX }) : '';
    box.querySelector('.onboard__next').textContent = t('onboard.next');
    input.addEventListener('input', () => {
      nickDraft = input.value;
      if (nickError) { nickError = false; box.querySelector('.onboard__error').textContent = ''; }
    });
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = cleanNickname(input.value);
      if (!name) {
        nickError = true;
        box.querySelector('.onboard__error').textContent = t('onboard.nickError', { max: NICKNAME_MAX });
        input.focus();
        return;
      }
      setNickname(name);
      step = 'talk';
      talkIndex = 0;
      render();
    });
    root.append(box);
    input.focus();
  }

  function renderTalk() {
    const total = ONBOARDING.talkLines;
    const last = talkIndex === total - 1;
    const box = document.createElement('div');
    box.className = 'onboard__talk';
    box.innerHTML = `
      <img class="onboard__stand" alt="" width="1024" height="1536">
      <div class="onboard__bubble">
        <p class="onboard__speaker"></p>
        <p class="onboard__line" aria-live="polite"></p>
        <div class="onboard__bubble-foot">
          <span class="onboard__step"></span>
          <button type="button" class="btn ${last ? 'btn--primary' : 'btn--small'} onboard__advance"></button>
        </div>
      </div>`;
    const img = box.querySelector('img');
    img.src = standUrl('tsukasa', last ? 'smile' : 'normal');
    img.alt = t(nameKey('tsukasa'));
    box.querySelector('.onboard__speaker').textContent = t(nameKey('tsukasa'));
    box.querySelector('.onboard__line').textContent =
      t(lineKey('tsukasa', `onboard${talkIndex + 1}`), { name: getUser().nickname });
    box.querySelector('.onboard__step').textContent = t('onboard.step', { n: talkIndex + 1, total });
    const adv = box.querySelector('.onboard__advance');
    adv.textContent = last ? t('onboard.toPlaza') : t('onboard.tapNext');
    const next = () => {
      if (last) { finish(); return; }
      talkIndex += 1;
      render();
    };
    adv.addEventListener('click', (e) => { e.stopPropagation(); next(); });
    box.querySelector('.onboard__bubble').addEventListener('click', next);
    root.append(box);
    adv.focus();
  }

  function finish() {
    finishOnboarding();
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('is-onboarding');
    done();
  }

  // 帯の言語ボタンで切り替えたときも、今の画面を描き直す
  onLangChange(() => { if (!root.hidden) render(); });

  return new Promise((resolve) => {
    done = resolve;
    document.body.classList.add('is-onboarding');
    root.hidden = false;
    render();
  });
}
