// shared/characters.js
// 9人の設定（仕様書 4章）。名前・説明・セリフの文字は shared/i18n/ に置き、ここには鍵だけを書く。
// 画像は assets/characters/{id}/ に置く。同じファイル名・大きさの画像に置き換えれば、プログラムを直さずに差し替えられる。
//   stand-normal.png / stand-smile.png / stand-surprise.png  立ち絵 1024×1536（背景透過）
//   face.png                                                顔アイコン 256×256

// 解放の値段（ヒヤマ）。実際に買えるのは home v0.3 の呉服屋から。
export const UNLOCK_PRICE = {
  eta: 3000,
  hexa: 3000,
  you: 3000,
  kou: 5000,
};

// selectable: アバターとして選べるか（ツカサは政府の広報官なので選べない）
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
];

export const DEFAULT_AVATAR = 'minato';
export const EXPRESSIONS = ['normal', 'smile', 'surprise'];

// アバターとして選べるキャラクターのセリフの鍵（i18n の char.{id}.line.{name}）
export const LINE_NAMES = ['greet', 'select', 'enter'];

// assets フォルダの場所（このファイルの場所から求めるので、どのワールドのページからでも同じ）
const ASSET_BASE = new URL('../assets/characters/', import.meta.url);

export function getCharacter(id) { return CHARACTERS.find((c) => c.id === id); }
export function selectableCharacters() { return CHARACTERS.filter((c) => c.selectable); }

export function standUrl(id, expression = 'normal') {
  return new URL(`${id}/stand-${expression}.png`, ASSET_BASE).href;
}
export function faceUrl(id) {
  return new URL(`${id}/face.png`, ASSET_BASE).href;
}

/** i18n の鍵 */
export const nameKey = (id) => `char.${id}.name`;
export const motifKey = (id) => `char.${id}.motif`;
export const roleKey = (id) => `char.${id}.role`;
export const lineKey = (id, name) => `char.${id}.line.${name}`;
