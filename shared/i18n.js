// shared/i18n.js
// 言語の切り替えボタンと、画面の文字（ja.json / en.json）の読み込み。
// 画面の文字はすべて JSON に置き、プログラムの中には書かない。

const STORAGE_KEY = 'sekidive.lang';
const SUPPORTED = ['ja', 'en'];
const DEFAULT_LANG = 'ja';

const dict = { ja: {}, en: {} };
let current = DEFAULT_LANG;
const listeners = [];

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(v) ? v : DEFAULT_LANG;
  } catch (e) {
    return DEFAULT_LANG;
  }
}

function save(lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* 保存できない端末では毎回日本語から */ }
}

/**
 * 文字の辞書を読み込む。
 * @param {string} sharedPath そのページから見た shared フォルダの場所（例 'shared/' や '../shared/'）
 */
export async function initI18n(sharedPath) {
  current = readSaved();
  const load = async (lang) => {
    const res = await fetch(`${sharedPath}i18n/${lang}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`i18n ${lang}.json: ${res.status}`);
    dict[lang] = await res.json();
  };
  await Promise.all(SUPPORTED.map(load));
  document.documentElement.lang = current;
  applyToDom();
  return current;
}

/** 鍵から文字を取り出す。{name} のような差し込みにも対応。 */
export function t(key, vars) {
  let s = dict[current][key];
  if (s === undefined) s = dict[DEFAULT_LANG][key];
  if (s === undefined) {
    console.warn(`[i18n] 文字の鍵がありません: ${key}`);
    return key;
  }
  if (vars) {
    for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
  }
  return s;
}

/** 言語を指定して文字を取り出す（言語を選ぶ画面で、両方の言語を並べて出すときに使う）。 */
export function tIn(lang, key) {
  const s = (dict[lang] || {})[key];
  return s === undefined ? t(key) : s;
}

export function getLang() { return current; }

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === current) return;
  current = lang;
  save(lang);
  document.documentElement.lang = lang;
  applyToDom();
  listeners.forEach((fn) => fn(lang));
}

/** 言語が変わったときに呼ぶ関数を登録する。プレイ中の画面はここで一時停止する。 */
export function onLangChange(fn) { listeners.push(fn); }

/** data-i18n="鍵" を付けた要素の文字、data-i18n-aria="鍵" を付けた要素の読み上げ名を入れ替える。 */
export function applyToDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  const titleKey = document.body && document.body.dataset.titleKey;
  if (titleKey) document.title = `${t(titleKey)} | ${t('app.title')}`;
}

/** 「日本語｜EN」の切り替えボタンを作る。 */
export function createLangToggle() {
  const wrap = document.createElement('div');
  wrap.className = 'lang-toggle';
  wrap.setAttribute('role', 'group');
  wrap.dataset.i18nAria = 'topbar.langLabel';

  const make = (lang, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-toggle__btn';
    b.textContent = label;           // 「日本語」「EN」はどちらの言語でも同じ表記
    b.lang = lang;
    b.addEventListener('click', () => setLang(lang));
    return b;
  };
  const ja = make('ja', '日本語');
  const sep = document.createElement('span');
  sep.className = 'lang-toggle__sep';
  sep.textContent = '｜';
  sep.setAttribute('aria-hidden', 'true');
  const en = make('en', 'EN');
  wrap.append(ja, sep, en);

  const refresh = () => {
    ja.setAttribute('aria-pressed', String(current === 'ja'));
    en.setAttribute('aria-pressed', String(current === 'en'));
  };
  refresh();
  onLangChange(refresh);
  return wrap;
}
