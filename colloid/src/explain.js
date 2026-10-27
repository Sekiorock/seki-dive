// colloid/src/explain.js
// 「しくみ」の絵（SVG）と、粒の大きさのものさし。どのエリアでも同じものさしを見せて、
// 「コロイド粒子は 10⁻⁹〜10⁻⁷ m。分子・イオンより大きく、泥の粒より小さい」を、くり返し目にするようにする。

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

/** エリアごとのしくみの絵 */
export function pictureSvg(area, t) {
  if (area === 2) {
    // ブラウン運動：大きな粒（コロイド粒子）に、小さな水分子が四方からぶつかり、粒がジグザグに動く
    const rnd = rand(4);
    let mol = '';
    for (let q = 0; q < 14; q++) {
      const a = (q / 14) * Math.PI * 2;
      const x = 150 + Math.cos(a) * 62, y = 78 + Math.sin(a) * 50;
      mol += `<circle class="cl-mol" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" style="--tx:${(-Math.cos(a) * 26).toFixed(1)}px;--ty:${(-Math.sin(a) * 20).toFixed(1)}px;--d:${(rnd() * 1.6).toFixed(2)}s"/>`;
    }
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.brown.alt'))}">
      <rect class="cl-box" x="4" y="4" width="292" height="152"/>
      <polyline class="cl-trace" points="40,120 62,96 55,70 88,82 96,52 120,66 112,38"/>
      <circle class="cl-trace-dot" cx="112" cy="38" r="5"/>
      ${mol}<circle class="cl-big" cx="150" cy="78" r="20"/>
      <text x="150" y="82" class="cl-pic__in">${esc(t('cl.pic.brown.big'))}</text>
      <text x="236" y="146" class="cl-pic__s">${esc(t('cl.pic.brown.mol'))}</text>
      <text x="80" y="146" class="cl-pic__s">${esc(t('cl.pic.brown.path'))}</text>
    </svg>`;
  }
  if (area === 3) {
    // 透析：セロハンの袋の穴より小さいイオンは外へ出て、大きなコロイド粒子は残る
    const rnd = rand(9);
    let ions = '';
    for (let q = 0; q < 8; q++) ions += `<text class="cl-ion ${q % 2 ? 'is-cl' : 'is-h'}" x="${100 + rnd() * 50}" y="${60 + rnd() * 70}" style="--d:${(q * 0.4).toFixed(2)}s">${q % 2 ? 'Cl⁻' : 'H⁺'}</text>`;
    let big = '';
    for (const [x, y] of [[96, 70], [128, 96], [104, 120], [140, 66], [118, 140]]) big += `<circle class="cl-feoh" cx="${x}" cy="${y}" r="10"/>`;
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.dial.alt'))}">
      <rect class="cl-water" x="4" y="20" width="292" height="136"/>
      <path class="cl-bag" d="M70 30 Q60 150 120 152 Q180 150 172 30 Z"/>
      ${big}${ions}
      <text x="122" y="16" class="cl-pic__t">${esc(t('cl.pic.dial.bag'))}</text>
      <text x="236" y="40" class="cl-pic__t">${esc(t('cl.pic.dial.water'))}</text>
      <text x="236" y="146" class="cl-pic__s">${esc(t('cl.pic.dial.out'))}</text>
    </svg>`;
  }
  // チンダル現象：横から光を当てると、コロイド溶液だけ光の通り道が見える
  const rnd = rand(2);
  let sp = '';
  for (let q = 0; q < 16; q++) sp += `<circle class="cl-spark" cx="${168 + rnd() * 116}" cy="${80 + (rnd() - 0.5) * 14}" r="${(1.2 + rnd() * 1.6).toFixed(1)}" style="--d:${(rnd() * 1.4).toFixed(2)}s"/>`;
  return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.tyn.alt'))}">
    <rect class="cl-beaker" x="20" y="34" width="116" height="110"/><rect class="cl-beaker is-colloid" x="166" y="34" width="116" height="110"/>
    <rect class="cl-ray" x="0" y="77" width="300" height="6"/>
    <rect class="cl-path" x="166" y="74" width="116" height="12"/>
    ${sp}
    <text x="78" y="26" class="cl-pic__t">${esc(t('cl.pic.tyn.sol'))}</text><text x="224" y="26" class="cl-pic__t">${esc(t('cl.pic.tyn.col'))}</text>
    <text x="78" y="128" class="cl-pic__s">${esc(t('cl.pic.tyn.solS'))}</text><text x="224" y="128" class="cl-pic__s">${esc(t('cl.pic.tyn.colS'))}</text>
  </svg>`;
}

/**
 * 粒の大きさのものさし（10⁻¹⁰ m 〜 10⁻⁵ m、対数の目盛り）。hi：強調する帯（'ion' | 'colloid' | 'mud'）、marks：見せる線（'cello' | 'paper' | 'light'）
 */
export function rulerHtml(t, hi = 'colloid', marks = []) {
  const pos = (e) => `${(((e + 10) / 5) * 100).toFixed(1)}%`;      // 10^e m → 0〜100%
  const band = (id, a, b) => `<i class="cl-ruler__band is-${id}${hi === id ? ' is-hi' : ''}" style="left:${pos(a)};width:calc(${pos(b)} - ${pos(a)})"><span>${esc(t(`cl.ruler.${id}`))}</span></i>`;
  const ticks = [-10, -9, -8, -7, -6, -5].map((e) => `<i class="cl-ruler__tick" style="left:${pos(e)}"><span>10<sup>${e}</sup></span></i>`).join('');
  const mk = { cello: -9, paper: -6, light: -8 };
  const lines = marks.map((m) => `<i class="cl-ruler__mark is-${m}" style="left:${pos(mk[m])}"><span>${esc(t(`cl.ruler.${m}`))}</span></i>`).join('');
  return `<div class="cl-ruler"><div class="cl-ruler__bar">${band('ion', -10, -9)}${band('colloid', -9, -7)}${band('mud', -7, -5)}${lines}</div><div class="cl-ruler__ticks">${ticks}</div><p class="cl-ruler__unit">m</p></div>`;
}
