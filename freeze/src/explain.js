// freeze/src/explain.js
// 「わかる」ための絵と目盛り（v0.4）。どれも HTML と SVG だけで描く（3D は使わない）。
//   pictureSvg：しくみの絵（粒がまざると、水が氷になりにくい／蒸気になりにくい／水が粒の多い側へ移る）
//   ionsHtml  ：電解質が水の中で粒に分かれるようす
//   lineBar   ：数直線の目盛り（凍るゾーン、いまの気温、凍る温度、予報など）。準備・撒く・夜・朝で同じ形を使い、
//               「粒が増える → 凍るゾーンの境目が左（低い温度）へ動く」を、くり返し目にするようにする。

import { IONS } from './tutorial.js';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

/** 水の分子（青）を格子に並べる。jitter：ゆれるだけ（液体のまま）か、ばらばらから格子へ集まる（凍る）か */
function molecules(x0, y0, cols, rows, gap, mode, seed) {
  const rnd = rand(seed);
  let out = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = x0 + i * gap + (j % 2 ? gap / 2 : 0), cy = y0 + j * gap * 0.86;
      const dx = ((rnd() - 0.5) * gap * 1.6).toFixed(1), dy = ((rnd() - 0.5) * gap * 1.6).toFixed(1);
      const d = (rnd() * 1.2).toFixed(2);
      out += `<circle class="fz-mol fz-mol--${mode}" cx="${cx}" cy="${cy}" r="4.2" style="--dx:${dx}px;--dy:${dy}px;--d:${d}s"/>`;
    }
  }
  return out;
}
function grains(list, seed) {
  const rnd = rand(seed);
  return list.map(([x, y]) => `<rect class="fz-grain" x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1.5" style="--d:${(rnd() * 1.5).toFixed(2)}s"/>`).join('');
}

/** しくみの絵 */
export function pictureSvg(pic, t) {
  if (pic === 'osmo') {
    // U字管：左は真水、右は粒あり。水の分子が膜をこえて右へ移り、右の液面が上がる
    let mol = '';
    const rnd = rand(7);
    for (let q = 0; q < 9; q++) mol += `<circle class="fz-mol fz-mol--cross" cx="${70 + rnd() * 30}" cy="${84 + rnd() * 30}" r="4" style="--d:${(q * 0.35).toFixed(2)}s"/>`;
    return `<svg class="fz-pic" viewBox="0 0 300 150" role="img" aria-label="${esc(t('fz.how.osmo.alt'))}">
      <path class="fz-glass" d="M40 30 V120 Q40 140 60 140 H240 Q260 140 260 120 V30"/>
      <rect class="fz-water" x="42" y="76" width="106" height="62"/><rect class="fz-water fz-water--sea" x="152" y="56" width="106" height="82"/>
      <line class="fz-memb" x1="150" y1="30" x2="150" y2="140"/>
      ${mol}${grains([[180, 90], [215, 110], [240, 80], [200, 126], [230, 128]], 3)}
      <text x="95" y="24" class="fz-pic__t">${esc(t('fz.how.osmo.l'))}</text><text x="205" y="24" class="fz-pic__t">${esc(t('fz.how.osmo.r'))}</text>
      <text x="150" y="148" class="fz-pic__s">${esc(t('fz.how.osmo.m'))}</text>
    </svg>`;
  }
  if (pic === 'vapor') {
    // 水面から分子が飛び出す。粒があると、水面の一部を粒がふさいで、飛び出す分子が少ない
    const fly = (x0, n, seed) => { const rnd = rand(seed); let o = ''; for (let q = 0; q < n; q++) o += `<circle class="fz-mol fz-mol--fly" cx="${x0 + 10 + rnd() * 100}" cy="78" r="4" style="--d:${(q * 0.45).toFixed(2)}s"/>`; return o; };
    return `<svg class="fz-pic" viewBox="0 0 300 150" role="img" aria-label="${esc(t('fz.how.vapor.alt'))}">
      <rect class="fz-box" x="6" y="18" width="138" height="124"/><rect class="fz-box" x="156" y="18" width="138" height="124"/>
      <rect class="fz-water" x="8" y="80" width="134" height="60"/><rect class="fz-water" x="158" y="80" width="134" height="60"/>
      ${molecules(22, 94, 7, 3, 16, 'jit', 1)}${molecules(172, 94, 7, 3, 16, 'jit', 2)}
      ${grains([[176, 84], [204, 86], [234, 84], [262, 86], [190, 112], [250, 120]], 4)}
      ${fly(8, 6, 5)}${fly(158, 2, 6)}
      <text x="75" y="14" class="fz-pic__t">${esc(t('fz.how.pure'))}</text><text x="225" y="14" class="fz-pic__t">${esc(t('fz.how.mixed'))}</text>
      <text x="75" y="40" class="fz-pic__s">${esc(t('fz.how.vapor.a'))}</text><text x="225" y="40" class="fz-pic__s">${esc(t('fz.how.vapor.b'))}</text>
    </svg>`;
  }
  // ice：左は水だけ（0℃で分子が格子に並んで氷）、右は粒あり（粒がじゃまで並べない → 凍らない）
  return `<svg class="fz-pic" viewBox="0 0 300 150" role="img" aria-label="${esc(t('fz.how.ice.alt'))}">
    <rect class="fz-box" x="6" y="18" width="138" height="124"/><rect class="fz-box" x="156" y="18" width="138" height="124"/>
    <rect class="fz-ice" x="8" y="20" width="134" height="120"/>
    ${molecules(26, 46, 7, 5, 16, 'lock', 1)}${molecules(176, 46, 7, 5, 16, 'jit', 2)}
    ${grains([[186, 54], [230, 70], [262, 96], [200, 108], [246, 126], [214, 88]], 4)}
    <text x="75" y="14" class="fz-pic__t">${esc(t('fz.how.pure'))}</text><text x="225" y="14" class="fz-pic__t">${esc(t('fz.how.mixed'))}</text>
    <text x="75" y="148" class="fz-pic__s">${esc(t('fz.how.ice.a'))}</text><text x="225" y="148" class="fz-pic__s">${esc(t('fz.how.ice.b'))}</text>
  </svg>`;
}

/** 電解質が粒に分かれるようす */
export function ionsHtml(t, subs) {
  const rows = subs.map((id) => {
    const parts = IONS[id];
    const f = { NaCl: 'NaCl', CaCl2: 'CaCl₂', urea: 'CO(NH₂)₂', glucose: 'C₆H₁₂O₆' }[id] || id;
    const chips = parts ? parts.map((p, i) => `<i class="fz-ion fz-ion--${p.startsWith('Cl') ? 'an' : 'cat'}" style="--k:${i - (parts.length - 1) / 2}">${p}</i>`).join('') : `<i class="fz-ion fz-ion--mol" style="--k:0">${f}</i>`;
    return `<li><b>${f}</b><span class="fz-ions__arrow">→</span><span class="fz-ions__parts">${chips}</span><em>${esc(t('fz.how.parts', { n: parts ? parts.length : 1 }))}</em></li>`;
  });
  return `<ul class="fz-ions">${rows.join('')}</ul>`;
}

/**
 * 数直線の目盛り。o = { min, max, zone: { from, to, cls, label }, marks: [{ v, cls, label }] }
 *   zone：色をぬる範囲（凍るゾーン・沸くゾーン・乾くゾーン）。marks：縦の線と小さな札。
 */
export function lineBar(o) {
  const pos = (v) => `${(Math.max(0, Math.min(1, (v - o.min) / (o.max - o.min))) * 100).toFixed(2)}%`;
  let html = `<span class="fz-line${o.cls ? ` ${o.cls}` : ''}">`;
  if (o.zone) {
    const a = Math.min(o.zone.from, o.zone.to), b = Math.max(o.zone.from, o.zone.to);
    html += `<i class="fz-line__zone ${o.zone.cls || ''}" style="left:${pos(a)};width:calc(${pos(b)} - ${pos(a)})">${o.zone.label ? `<span>${esc(o.zone.label)}</span>` : ''}</i>`;
  }
  for (const m of o.marks || []) html += `<i class="fz-line__mark ${m.cls || ''}" style="left:${pos(m.v)}"><span>${esc(m.label || '')}</span></i>`;
  return `${html}</span>`;
}
