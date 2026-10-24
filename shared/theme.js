// shared/theme.js
// 白黒の基調と、ワールドごとの差し色（日本の伝統色）。仕様書 3章。
// 出来事の発光（金・紅）は home v0.4 で足す。

export const BASE = {
  white: '#FFFFFF',
  fog: '#F2F2F2',     // 3D空間の霧や床
  sumi: '#111111',    // 文字・線
  nezumi: '#8A8A8A',  // 補助の文字・区切り線
};

export const ACCENTS = {
  home:      { a1: { name: '藍',   hex: '#165E83' }, a2: { name: '山吹', hex: '#F8B500' } },
  hydration: { a1: { name: '朱',   hex: '#EB6101' }, a2: { name: '群青', hex: '#4C6CB3' } },
  crystal:   { a1: { name: '瑠璃', hex: '#1E50A2' }, a2: { name: '柑子', hex: '#F6AD49' } },
  freeze:    { a1: { name: '白群', hex: '#83CCD2' }, a2: { name: '臙脂', hex: '#B94047' } },
  colloid:   { a1: { name: '若竹', hex: '#68BE8D' }, a2: { name: '菫',   hex: '#7058A3' } },
};

// 特別な色（出来事のときだけ使う。ふだんの画面では使わない）
export const EVENT = {
  gold: '#E6B422',
  crimson: '#D7003A',
};

/** ページにワールドの差し色を CSS の変数として設定する。 */
export function applyTheme(world) {
  const acc = ACCENTS[world] || ACCENTS.home;
  const r = document.documentElement.style;
  r.setProperty('--accent-1', acc.a1.hex);
  r.setProperty('--accent-2', acc.a2.hex);
  document.body.dataset.world = world;
}

/** '#RRGGBB' を Three.js で使える数値に変える。 */
export function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }
