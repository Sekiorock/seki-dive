// colloid/src/cheer.js
// 正解・おしい・エリア突破の演出（光と動き）。音は shared/sfx.js。
//   ok   ：画面がふわっと光り、ネオンの輪が広がって、「正解」の文字が判子のように押される。光のかけらと花びらが飛ぶ。連続正解は「◯連」
//   ng   ：画面のふちが菫色に一瞬またたき、「おしい」が小さくゆれる
//   big  ：エリア突破。大きな文字と、下から灯籠の光が立ちのぼる

const COLORS = ['#5CF2A8', '#A985FF', '#FFD86B', '#ff9ac8', '#8FF3FA'];

function layer(cls) {
  const el = document.createElement('div');
  el.className = `cl-cheer ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}
function shards(n, spread = 160) {
  let h = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const d = spread * (0.7 + Math.random() * 0.6);
    const petal = i % 3 === 0;
    h += `<i class="cl-cheer__${petal ? 'petal' : 'shard'}" style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px;--r:${Math.round(Math.random() * 360)}deg;--c:${COLORS[i % COLORS.length]};--d:${(Math.random() * 0.12).toFixed(2)}s"></i>`;
  }
  return h;
}

export const cheer = {
  /** text：大きな文字、sub：小さな英字、combo：連続の数 */
  ok({ text, sub, combo = 1, comboText = '' }) {
    const el = layer('is-ok');
    el.innerHTML = `<i class="cl-cheer__flash"></i><i class="cl-cheer__ring"></i><i class="cl-cheer__ring is-2"></i>${shards(18)}`
      + `<div class="cl-cheer__stamp"><b>${text}</b><small>${sub}</small>${combo >= 2 ? `<em>${comboText}</em>` : ''}</div>`;
    setTimeout(() => el.remove(), 1500);
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) { /* 何もしない */ } }
  },
  ng({ text }) {
    const el = layer('is-ng');
    el.innerHTML = `<i class="cl-cheer__edge"></i><div class="cl-cheer__oshii">${text}</div>`;
    setTimeout(() => el.remove(), 900);
  },
  big({ text, sub }) {
    const el = layer('is-big');
    let lan = '';
    for (let i = 0; i < 14; i++) lan += `<i class="cl-cheer__lantern" style="--x:${(Math.random() * 100).toFixed(0)}%;--d:${(Math.random() * 0.8).toFixed(2)}s;--s:${(0.7 + Math.random() * 0.6).toFixed(2)}"></i>`;
    el.innerHTML = `<i class="cl-cheer__flash"></i>${lan}<i class="cl-cheer__ring is-big"></i>${shards(28, 220)}<div class="cl-cheer__stamp is-big"><b>${text}</b><small>${sub}</small></div>`;
    setTimeout(() => el.remove(), 2600);
  },
};
