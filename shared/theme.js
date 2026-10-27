// shared/theme.js
// デザインの土台（v0.4 から「ゲーミング風サイバー和風」：夜の藍の地に、丸くツルツルした部品と、伝統色のネオン）。
// ・各ワールドの差し色は、日本の伝統色（hex）と、それを光らせた「ネオン」の2つを持つ。
// ・金と紅は、出来事のときだけに使う特別な色（仕様書 3章の約束はそのまま守る）。
// ・出来事の発光（fx）もここに置く。

export const BASE = {
  bg: '#060A1A',        // 夜の藍（いちばん奥）
  bg2: '#0C1330',
  fog: '#0A1030',       // 3D空間の霧
  text: '#EEF3FF',
  dim: '#8E9BC7',
  ink: '#111111',       // 墨（立ち絵の線など）
  white: '#FFFFFF',
  // 以前の名前（v0.3 までのプログラムから使われている）
  sumi: '#111111',
  nezumi: '#8A8A8A',
};

// hex：伝統色そのもの、neon：その色を光らせたもの
export const ACCENTS = {
  home:      { a1: { name: '藍',   hex: '#165E83', neon: '#36A9FF' }, a2: { name: '山吹', hex: '#F8B500', neon: '#FFC83A' } },
  hydration: { a1: { name: '朱',   hex: '#EB6101', neon: '#FF7E2E' }, a2: { name: '群青', hex: '#4C6CB3', neon: '#7C9BFF' } },
  crystal:   { a1: { name: '瑠璃', hex: '#1E50A2', neon: '#4C86FF' }, a2: { name: '柑子', hex: '#F6AD49', neon: '#FFC074' } },
  freeze:    { a1: { name: '白群', hex: '#83CCD2', neon: '#8FF3FA' }, a2: { name: '臙脂', hex: '#B94047', neon: '#FF5E70' } },
  colloid:   { a1: { name: '若竹', hex: '#68BE8D', neon: '#5CF2A8' }, a2: { name: '菫',   hex: '#7058A3', neon: '#A985FF' } },
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
  r.setProperty('--neon-1', acc.a1.neon);
  r.setProperty('--neon-2', acc.a2.neon);
  document.body.dataset.world = world;
}

/** '#RRGGBB' を Three.js で使える数値に変える。 */
export function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }

// ───────────────────────── 出来事の発光（仕様書 3章） ─────────────────────────
// 出来事が起きた数秒間だけ光らせ、終わったら元に戻す。

let edgeEl = null;
function edge() {
  if (!edgeEl) {
    edgeEl = document.createElement('div');
    edgeEl.className = 'fx-edge';
    edgeEl.setAttribute('aria-hidden', 'true');
    document.body.append(edgeEl);
  }
  return edgeEl;
}

function play(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth;            // アニメーションをはじめからやり直す
  el.classList.add(cls);
  clearTimeout(el[`_t_${cls}`]);
  el[`_t_${cls}`] = setTimeout(() => el.classList.remove(cls), ms);
}

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const fx = {
  /** 初めてのクリア、フルコンボ、対戦の優勝：画面の縁とアバターが2秒、金に光る */
  celebrate() {
    play(edge(), 'is-gold', 2000);
    const face = document.querySelector('.topbar__face');
    if (face) play(face, 'is-glow-gold', 2000);
  },

  /** 新しいキャラクターや衣装の入手：アバターの輪郭が金に光る */
  newItem(imgEl) {
    const face = document.querySelector('.topbar__face');
    if (face) play(face, 'is-glow-gold', 2000);
    if (imgEl) play(imgEl, 'is-glow-gold', 2000);
  },

  /** 交付金・賞金：残高の数字が光りながら増える */
  countUp(el, from, to, ms = 1200) {
    play(el, 'is-glow-gold', ms + 600);
    if (reduced()) { el.textContent = Math.round(to).toLocaleString('en-US'); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const v = from + (to - from) * (1 - Math.pow(1 - p, 3));
      el.textContent = Math.round(v).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /** 罰金、滞納の始まり：画面の縁が1回だけ紅に脈打つ */
  penalty() { play(edge(), 'is-crimson', 1200); },

  /** 対戦での脱落：自分のアバターが灰色になり、縁が紅に光る（対戦の版で使う） */
  knockout(avatarEl) {
    play(edge(), 'is-crimson-hold', 2400);
    if (avatarEl) avatarEl.classList.add('is-knocked-out');
  },

  /**
   * 政府の重大発表：画面全体を一瞬暗くし、発表文を中央に出す。
   * @returns {Promise} 閉じたときに解決する
   */
  announce({ title, text, faceSrc, faceName = '', closeLabel }) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'fx-announce';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-modal', 'true');
      el.innerHTML = `
        <div class="fx-announce__box">
          ${faceSrc ? `<figure class="char-fig char-fig--img fx-announce__fig"><img class="fx-announce__face" src="${faceSrc}" alt="" width="256" height="256">${faceName ? '<figcaption class="char-tag"></figcaption>' : ''}</figure>` : ''}
          <p class="fx-announce__title"></p>
          <p class="fx-announce__text"></p>
          <button type="button" class="btn btn--primary fx-announce__close"></button>
        </div>`;
      el.querySelector('.fx-announce__title').textContent = title;
      el.querySelector('.fx-announce__text').textContent = text;
      const cap = el.querySelector('.fx-announce__fig .char-tag');
      if (cap) cap.textContent = faceName;
      const btn = el.querySelector('.fx-announce__close');
      btn.textContent = closeLabel;
      btn.addEventListener('click', () => { el.classList.add('is-leaving'); setTimeout(() => { el.remove(); resolve(); }, 250); });
      document.body.append(el);
      requestAnimationFrame(() => el.classList.add('is-shown'));
      btn.focus();
    });
  },
};
