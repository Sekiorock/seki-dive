// shared/characters.js
// キャラクターの設定（仕様書 4章。v1.2 で22人に）。名前・説明・セリフの文字は shared/i18n/ に置き、ここには鍵だけを書く。
// 画像は assets/characters/{id}/ に置く。同じファイル名・大きさの画像に置き換えれば、プログラムを直さずに差し替えられる。
//   stand-normal.png / stand-smile.png / stand-surprise.png  立ち絵 1024×1536（背景透過）
//   face.png                                                顔アイコン 256×256

import { genStand, genFace, LOOKS } from './charart.js';

// 解放の値段（ヒヤマ）。ロック呉服屋で買う。消費税は別（shared/economy.js）。
// v1.2：13人が加わった。テッペイは特別に高いが、テッペイでいる間は税も罰金もかからない（TAX_FREE_CHAR）
export const UNLOCK_PRICE = {
  eta: 3000, hexa: 3000, you: 3000, kou: 5000,
  shou: 3000, hirona: 3000, yuuki: 3000, hiroki: 3000, alice: 3500, marine: 3500,
  takamasa: 4000, shigeru: 4000, miku: 4000, asuka: 4500, shiho: 4500, kazue: 4500,
  teppei: 30000,
};
/** この人でいる間は、税（所得税・消費税・勝負税）も罰金もかからない */
export const TAX_FREE_CHAR = 'teppei';

// selectable: アバターとして選べるか（キタローは政府の広報官なので選べない）
// start: 最初から使えるか
export const CHARACTERS = [
  { id: 'tsukasa', selectable: false, start: false, accent: '#F8B500' },
  { id: 'minato',  selectable: true,  start: true,  accent: '#165E83' },
  { id: 'karin',   selectable: true,  start: true,  accent: '#1E50A2' },
  { id: 'toma',    selectable: true,  start: true,  accent: '#83CCD2' },
  { id: 'kasumi',  selectable: true,  start: true,  accent: '#68BE8D' },
  { id: 'eta',     selectable: true,  start: false, accent: '#111111' },
  { id: 'hexa',    selectable: true,  start: false, accent: '#8A8A8A' },
  { id: 'you',     selectable: true,  start: false, accent: '#7058A3' },
  { id: 'kou',     selectable: true,  start: false, accent: '#111111' },
  // v1.2：物質の擬人化の13人（絵は shared/charart.js がその場で描く）
  { id: 'shou',     selectable: true, start: false, accent: '#C0C6C9' },
  { id: 'hirona',   selectable: true, start: false, accent: '#83CCD2' },
  { id: 'yuuki',    selectable: true, start: false, accent: '#223A70' },
  { id: 'hiroki',   selectable: true, start: false, accent: '#68BE8D' },
  { id: 'alice',    selectable: true, start: false, accent: '#F09199' },
  { id: 'marine',   selectable: true, start: false, accent: '#EB6101' },
  { id: 'takamasa', selectable: true, start: false, accent: '#223A70' },
  { id: 'shigeru',  selectable: true, start: false, accent: '#8A8A8A' },
  { id: 'miku',     selectable: true, start: false, accent: '#F09199' },
  { id: 'asuka',    selectable: true, start: false, accent: '#1E50A2' },
  { id: 'shiho',    selectable: true, start: false, accent: '#83CCD2' },
  { id: 'kazue',    selectable: true, start: false, accent: '#F8B500' },
  { id: 'teppei',   selectable: true, start: false, accent: '#E6B422', special: true },
];

export const DEFAULT_AVATAR = 'minato';
export const EXPRESSIONS = ['normal', 'smile', 'surprise'];

// アバターとして選べるキャラクターのセリフの鍵（i18n の char.{id}.line.{name}）
export const LINE_NAMES = ['greet', 'select', 'enter'];

// assets フォルダの場所（このファイルの場所から求めるので、どのワールドのページからでも同じ）
const ASSET_BASE = new URL('../assets/characters/', import.meta.url);

export function getCharacter(id) { return CHARACTERS.find((c) => c.id === id); }
export function selectableCharacters() { return CHARACTERS.filter((c) => c.selectable); }

// ── 衣装（v1.2：「種類 × 色」。だれでも、どの衣装でも着られる。1度買えば、全員が着られる） ──
//   衣装のID は '種類.色'（例 'haori.ai'）。'base' は、その人のいつもの衣装（最初から持っている）。
//   種類の名前は i18n の costume.{種類}、色の名前は color.{色}。
export const COSTUME_TYPES = [
  { id: 'haori', price: 800 }, { id: 'apron', price: 600 }, { id: 'coat', price: 1000 },
  { id: 'hakama', price: 1000 }, { id: 'yukata', price: 600 }, { id: 'furisode', price: 1500 },
  { id: 'samue', price: 600 }, { id: 'tsume', price: 1200 }, { id: 'labcoat', price: 800 },
  { id: 'happi', price: 900 },
];
// 色見本の色（ロック呉服屋と、アバター選択の画面の小さな丸）。premium の色は、値段に PREMIUM_EXTRA を足す
export const COLOR_HEX = {
  ai: '#165E83', gunjo: '#4C6CB3', wakatake: '#68BE8D', enji: '#B94047', shu: '#EB6101',
  sumire: '#7058A3', byakugun: '#83CCD2', ruri: '#1E50A2', yamabuki: '#F8B500', nezumi: '#8A8A8A',
  kurenai: '#D7003A', momo: '#F09199', kon: '#223A70', matsuba: '#42602D', sumi: '#222222',
  kogane: '#E6B422', gin: '#C0C6C9',
};
export const PREMIUM_COLORS = ['kogane', 'gin'];
export const PREMIUM_EXTRA = 600;
export const COSTUME_COLORS = Object.keys(COLOR_HEX);

export const costumeId = (type, color) => `${type}.${color}`;
export function parseCostume(cid) {
  if (!cid || cid === 'base' || !cid.includes('.')) return null;
  const [type, color] = cid.split('.');
  return COSTUME_TYPES.some((x) => x.id === type) && COLOR_HEX[color] ? { type, color } : null;
}
export function costumePrice(cid) {
  const c = parseCostume(cid);
  if (!c) return 0;
  return COSTUME_TYPES.find((x) => x.id === c.type).price + (PREMIUM_COLORS.includes(c.color) ? PREMIUM_EXTRA : 0);
}
/** v1.1 までの「その人だけの色違い」を、新しい衣装のIDに直す（その人のいつもの衣装の種類 × その色） */
export function legacyCostume(charId, color) {
  const L = LOOKS[charId];
  return L && COLOR_HEX[color] ? costumeId(L.look[0], color) : null;
}

const hasPng = (id) => !!(LOOKS[id] && LOOKS[id].png);
const outfitOf = (cid) => { const c = parseCostume(cid); return c ? [c.type, COLOR_HEX[c.color]] : null; };

export function standUrl(id, expression = 'normal', costume = 'base') {
  const o = outfitOf(costume);
  if (!o && hasPng(id)) return new URL(`${id}/stand-${expression}.png`, ASSET_BASE).href;
  return genStand(id, expression, o);
}
export function faceUrl(id, costume = 'base') {
  const o = outfitOf(costume);
  if (!o && hasPng(id)) return new URL(`${id}/face.png`, ASSET_BASE).href;
  return genFace(id, o);
}

/** i18n の鍵 */
export const nameKey = (id) => `char.${id}.name`;
export const motifKey = (id) => `char.${id}.motif`;
export const roleKey = (id) => `char.${id}.role`;
export const lineKey = (id, name) => `char.${id}.line.${name}`;

// ── 名前の見せ方（v1.0：キャラクターの顔・立ち絵の下には、いつも名前の札。セリフの文頭にも名前） ──
const escH = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** 名前の札（HTML）。t は i18n の t */
export function nameTag(t, id, cls = '') { return `<span class="char-tag${cls ? ` ${cls}` : ''}">${escH(t(nameKey(id)))}</span>`; }
/** 顔アイコンと、その下の名前の札（HTML）。label を渡すと、名前の代わりにその文字（対戦の参加者のニックネームなど） */
export function faceFig(t, id, { costume = 'base', size = 40, cls = '', label = null } = {}) {
  return `<figure class="char-fig${cls ? ` ${cls}` : ''}" style="--fs:${size}px"><img src="${faceUrl(id, costume)}" alt="" width="${size}" height="${size}">`
    + `<figcaption class="char-tag">${escH(label ?? t(nameKey(id)))}</figcaption></figure>`;
}
/** 名前つきのセリフ：「タケヒロ「……」」（英語は Takehiro: “…”） */
export function say(t, id, line) { return t('quoteBy', { name: t(nameKey(id)), line }); }
/** 立ち絵の img に、名前の札をつける（すでにあれば、文字だけ書きかえる） */
export function tagStand(t, img, id, { face = false } = {}) {
  if (!img) return;
  let fig = img.parentElement;
  if (!fig || !fig.classList.contains('char-fig')) {
    fig = document.createElement('figure');
    fig.className = face ? 'char-fig char-fig--img' : 'char-fig char-fig--stand';
    img.replaceWith(fig);
    fig.append(img);
    const cap = document.createElement('figcaption');
    cap.className = 'char-tag';
    fig.append(cap);
  }
  fig.querySelector('.char-tag').textContent = t(nameKey(id));
}
