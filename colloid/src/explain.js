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
  if (area === 4) {
    // 電気泳動：正の粒（＋）が陰極（−）へ動く
    let dots = '';
    for (let q = 0; q < 9; q++) dots += `<g class="cl-move" style="--d:${(q * 0.25).toFixed(2)}s"><circle class="cl-feoh" cx="${160 + (q % 3) * 34}" cy="${58 + Math.floor(q / 3) * 30}" r="10"/><text class="cl-pic__in" x="${160 + (q % 3) * 34}" y="${62 + Math.floor(q / 3) * 30}">＋</text></g>`;
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.el.alt'))}">
      <rect class="cl-water" x="30" y="34" width="240" height="112"/>
      <rect class="cl-pole is-neg" x="34" y="30" width="10" height="120"/><rect class="cl-pole is-pos" x="256" y="30" width="10" height="120"/>
      <text class="cl-pic__t" x="39" y="22">${esc(t('cl.pic.el.neg'))}</text><text class="cl-pic__t" x="261" y="22">${esc(t('cl.pic.el.pos'))}</text>
      ${dots}
      <text class="cl-pic__s" x="150" y="156">${esc(t('cl.pic.el.cap'))}</text>
    </svg>`;
  }
  if (area === 5) {
    // 凝析：正の粒のまわりに、反対の電荷のイオン（SO₄²⁻）が来て、電荷が打ち消されると、粒が集まって沈む
    let p = '';
    [[60, 50], [110, 70], [80, 100], [140, 44], [40, 92]].forEach(([x, y], i) => { p += `<g class="cl-sink" style="--tx:${(150 - x) * 0.5}px;--ty:${(130 - y) * 0.9}px;--d:${(i * 0.2).toFixed(1)}s"><circle class="cl-feoh" cx="${x}" cy="${y}" r="11"/><text class="cl-pic__in" x="${x}" y="${y + 4}">＋</text></g>`; });
    let ions = '';
    [[200, 50], [240, 80], [215, 112], [262, 44]].forEach(([x, y], i) => { ions += `<text class="cl-ion is-so4" x="${x}" y="${y}" style="--d:${(i * 0.5).toFixed(1)}s">SO₄²⁻</text>`; });
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.co.alt'))}">
      <rect class="cl-water" x="4" y="20" width="292" height="136"/>
      ${p}${ions}
      <text class="cl-pic__t" x="80" y="14">${esc(t('cl.pic.co.pos'))}</text><text class="cl-pic__t" x="230" y="14">${esc(t('cl.pic.co.ion'))}</text>
      <text class="cl-pic__s" x="150" y="152">${esc(t('cl.pic.co.cap'))}</text>
    </svg>`;
  }
  if (area === 6) {
    // ゾル → ゲル → キセロゲル
    const rnd = rand(6);
    let sol = '', gel = '', xer = '';
    for (let q = 0; q < 9; q++) sol += `<circle class="cl-solp" cx="${18 + rnd() * 64}" cy="${48 + rnd() * 70}" r="5" style="--d:${(rnd() * 1.2).toFixed(2)}s"/>`;
    const net = (x0, y0, w, h, cls) => { let o = ''; const pts = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push([x0 + (i * w) / 2, y0 + (j * h) / 2]); pts.forEach(([x, y], i) => { if (i % 3 < 2) o += `<line class="${cls}" x1="${x}" y1="${y}" x2="${pts[i + 1][0]}" y2="${pts[i + 1][1]}"/>`; if (i < 6) o += `<line class="${cls}" x1="${x}" y1="${y}" x2="${pts[i + 3][0]}" y2="${pts[i + 3][1]}"/>`; o += `<circle class="cl-solp" cx="${x}" cy="${y}" r="5"/>`; }); return o; };
    gel = net(122, 54, 56, 60, 'cl-net');
    xer = net(232, 66, 40, 40, 'cl-net is-dry');
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.sg.alt'))}">
      <rect class="cl-water" x="6" y="36" width="88" height="96"/><rect class="cl-water" x="106" y="36" width="88" height="96"/><rect class="cl-box" x="206" y="36" width="88" height="96"/>
      ${sol}${gel}${xer}
      <text class="cl-pic__t" x="50" y="26">${esc(t('cl.term.sol'))}</text><text class="cl-pic__t" x="150" y="26">${esc(t('cl.term.gel'))}</text><text class="cl-pic__t" x="250" y="26">${esc(t('cl.term.xero'))}</text>
      <text class="cl-pic__s" x="50" y="150">${esc(t('cl.pic.sg.a'))}</text><text class="cl-pic__s" x="150" y="150">${esc(t('cl.pic.sg.b'))}</text><text class="cl-pic__s" x="250" y="150">${esc(t('cl.pic.sg.c'))}</text>
      <text class="cl-pic__arrow" x="100" y="88">▶</text><text class="cl-pic__arrow" x="200" y="88">▶</text>
    </svg>`;
  }
  if (area === 7) {
    // 保護コロイド：炭素の粒（疎水）を、にかわ（親水）が包む。塩のイオンが来ても集まらない
    let ions = '';
    for (let q = 0; q < 6; q++) ions += `<text class="cl-ion is-bounce" x="${30 + q * 46}" y="${q % 2 ? 40 : 140}" style="--d:${(q * 0.3).toFixed(1)}s">${q % 2 ? 'Na⁺' : 'Cl⁻'}</text>`;
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.pr.alt'))}">
      <rect class="cl-water" x="4" y="20" width="292" height="136"/>
      <circle class="cl-shell" cx="100" cy="88" r="34"/><circle class="cl-carbon" cx="100" cy="88" r="20"/>
      <circle class="cl-carbon" cx="220" cy="80" r="14"/><circle class="cl-carbon" cx="236" cy="96" r="14"/><circle class="cl-carbon" cx="214" cy="100" r="14"/>
      ${ions}
      <text class="cl-pic__t" x="100" y="14">${esc(t('cl.pic.pr.a'))}</text><text class="cl-pic__t" x="225" y="14">${esc(t('cl.pic.pr.b'))}</text>
      <text class="cl-pic__s" x="100" y="150">${esc(t('cl.pic.pr.as'))}</text><text class="cl-pic__s" x="225" y="150">${esc(t('cl.pic.pr.bs'))}</text>
    </svg>`;
  }
  if (area === 8) {
    const icons = ['🔔', '🔍', '🛍', '⚡', '🧪', '💧', '🛡'];
    let o = '';
    icons.forEach((ic, i) => { const a = Math.PI * (0.05 + 0.9 * (i / 6)); o += `<text class="cl-pic__icon" x="${(150 - Math.cos(a) * 120).toFixed(1)}" y="${(140 - Math.sin(a) * 110).toFixed(1)}" style="--d:${(i * 0.25).toFixed(2)}s">${ic}</text>`; });
    return `<svg class="cl-pic" viewBox="0 0 300 160" role="img" aria-label="${esc(t('cl.pic.sh.alt'))}">
      <path class="cl-torii" d="M110 150 V70 M190 150 V70 M96 64 H204 M104 82 H196"/>
      <circle class="cl-moon" cx="150" cy="110" r="22"/>
      ${o}
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
