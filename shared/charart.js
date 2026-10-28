// shared/charart.js
// v1.2：キャラクターの仮の絵を、その場で描く（線画の簡単なシルエット。assets の PNG と同じ描き方）。
//   ・v1.2 で増えた13人は、PNG の代わりにこれで描く
//   ・衣装は「種類 × 色」になり、だれでも、どの衣装でも着られるので、着替えた姿もこれで描く
//   描いた絵は、同じものを2回描かないように覚えておく（data: の URL）。
//   座標は 1024×1536 の立ち絵のもの（PNG と同じ）。顔アイコンは (312,140)〜(712,540) を 256×256 に。

const W = 1024, H = 1536;
const SUMI = '#111111', WHITE = '#ffffff', NEZ = '#8a8a8a', HAI = '#c9c9c9';
const LW = 6;
const STAND_SCALE = 0.5;   // 立ち絵は 512×768 で描く（軽くするため。表示はどこでも小さいので十分）

// ───────────── 描く道具 ─────────────
function painter(g) {
  const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  return {
    poly(pts, fill = WHITE, line = SUMI, w = LW) {
      path(pts); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (line) { g.strokeStyle = line; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); }
    },
    line(pts, col = SUMI, w = LW) { path(pts); g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); },
    ell(cx, cy, rx, ry, fill = WHITE, line = SUMI, w = LW) {
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (line) { g.strokeStyle = line; g.lineWidth = w; g.stroke(); }
    },
    arc(cx, cy, rx, ry, a0, a1, col = SUMI, w = LW) {
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, (a0 * Math.PI) / 180, (a1 * Math.PI) / 180);
      g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.stroke();
    },
    chord(cx, cy, rx, ry, a0, a1, fill = SUMI) {
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, (a0 * Math.PI) / 180, (a1 * Math.PI) / 180); g.closePath();
      g.fillStyle = fill; g.fill();
    },
    rect(x0, y0, x1, y1, fill = WHITE, line = SUMI, w = LW) { this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill, line, w); },
    text(s, x, y, size, col = SUMI) { g.fillStyle = col; g.font = `800 ${size}px 'M PLUS 1p', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); },
  };
}

// ───────────── 化学紋（胸の丸い紋） ─────────────
function crest(p, kind, cx, cy, r = 44) {
  p.ell(cx, cy, r, r, WHITE, SUMI, 4);
  const k = r / 44;
  const rad = (d) => (d * Math.PI) / 180;
  const ring = (n, rr, a0 = 90) => Array.from({ length: n }, (_, i) => [cx + rr * k * Math.cos(rad(a0 + (360 / n) * i)), cy + rr * k * Math.sin(rad(a0 + (360 / n) * i))]);
  switch (kind) {
    case 'gov': { const pts = ring(6, 26); p.line([...pts, pts[0]], SUMI, 4); p.ell(cx, cy, 6 * k, 6 * k, SUMI, null); break; }
    case 'water': {
      const ox = cx, oy = cy - 8 * k;
      for (const s of [-1, 1]) { const a = rad(90 + s * 52); const hx = ox + 28 * k * Math.cos(a), hy = oy + 28 * k * Math.sin(a); p.line([[ox, oy], [hx, hy]], SUMI, 4); p.ell(hx, hy, 7 * k, 7 * k, WHITE, SUMI, 3); }
      p.ell(ox, oy, 12 * k, 12 * k, WHITE, SUMI, 4); break;
    }
    case 'nitrate': case 'silver': {
      for (const [x, y] of ring(3, 26, -90)) { p.line([[cx, cy], [x, y]], SUMI, 4); p.ell(x, y, 7 * k, 7 * k, WHITE, SUMI, 3); }
      p.ell(cx, cy, 7 * k, 7 * k, SUMI, null);
      if (kind === 'silver') { p.ell(cx + 22 * k, cy + 22 * k, 11 * k, 11 * k, '#C0C6C9', SUMI, 3); }
      break;
    }
    case 'snow': {
      for (let i = 0; i < 3; i++) { const a = rad(90 + 60 * i); p.line([[cx - 22 * k * Math.cos(a), cy - 22 * k * Math.sin(a)], [cx + 22 * k * Math.cos(a), cy + 22 * k * Math.sin(a)]], SUMI, 4); }
      for (const [x, y] of ring(3, 33, -60)) p.ell(x, y, 5 * k, 5 * k, SUMI, null);
      break;
    }
    case 'mist': for (const j of [-14, 0, 14]) { const pts = []; for (let tt = 0; tt <= 52 * k; tt += 2) pts.push([cx - 26 * k + tt, cy + j * k + 5 * k * Math.sin(tt / 6)]); p.line(pts, SUMI, 3); } break;
    case 'ethanol': { const pts = [[cx - 26 * k, cy + 8 * k], [cx - 6 * k, cy - 10 * k], [cx + 14 * k, cy + 8 * k]]; p.line(pts, SUMI, 4); p.line([pts[2], [cx + 28 * k, cy - 6 * k]], SUMI, 4); p.ell(cx + 14 * k, cy + 8 * k, 6 * k, 6 * k, WHITE, SUMI, 3); break; }
    case 'hexane': p.line(Array.from({ length: 6 }, (_, i) => [cx - 30 * k + 12 * k * i, cy + (i % 2 === 0 ? 8 : -8) * k]), SUMI, 4); break;
    case 'iodine': p.line([[cx - 14 * k, cy], [cx + 14 * k, cy]], SUMI, 4); p.ell(cx - 16 * k, cy, 11 * k, 11 * k, SUMI, null); p.ell(cx + 16 * k, cy, 11 * k, 11 * k, SUMI, null); break;
    case 'colloid': p.ell(cx, cy, 10 * k, 10 * k, SUMI, null); for (const [x, y] of ring(8, 24, 0)) p.ell(x, y, 5 * k, 5 * k, WHITE, SUMI, 3); break;
    case 'iron': {   // 体心立方格子
      const s = 20 * k, d = 9 * k;
      const f = [[cx - s, cy - s + d], [cx + s - d, cy - s + d], [cx + s - d, cy + s], [cx - s, cy + s]];
      const b = f.map(([x, y]) => [x + d, y - d]);
      p.line([...b, b[0]], SUMI, 3); p.line([...f, f[0]], SUMI, 4); f.forEach((q, i) => p.line([q, b[i]], SUMI, 3));
      [...f, ...b].forEach(([x, y]) => p.ell(x, y, 4 * k, 4 * k, SUMI, null)); p.ell(cx + d / 2 - 1, cy + 2, 6 * k, 6 * k, '#E6B422', SUMI, 3);
      break;
    }
    case 'nacl': for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const x = cx + (i - 1) * 17 * k, y = cy + (j - 1) * 17 * k; const big = (i + j) % 2 === 0; p.ell(x, y, (big ? 8 : 5) * k, (big ? 8 : 5) * k, big ? WHITE : SUMI, SUMI, 3); } break;
    case 'benzene': { const pts = ring(6, 27, 90); p.line([...pts, pts[0]], SUMI, 4); p.ell(cx, cy, 14 * k, 14 * k, null, SUMI, 3); break; }
    case 'oh': p.line([[cx - 12 * k, cy], [cx + 16 * k, cy]], SUMI, 4); p.ell(cx - 12 * k, cy, 13 * k, 13 * k, WHITE, SUMI, 4); p.ell(cx + 18 * k, cy, 7 * k, 7 * k, WHITE, SUMI, 3); p.text('−', cx - 12 * k, cy - 22 * k, 20 * k); break;
    case 'alum': { const t = [cx, cy - 28 * k], bt = [cx, cy + 28 * k], l = [cx - 24 * k, cy], rr = [cx + 24 * k, cy], m = [cx + 6 * k, cy + 8 * k]; p.line([t, l, bt, rr, t], SUMI, 4); p.line([t, m, bt], SUMI, 3); p.line([l, m, rr], SUMI, 3); break; }
    case 'acetic': { p.line([[cx - 26 * k, cy + 6 * k], [cx - 4 * k, cy + 6 * k], [cx + 12 * k, cy - 12 * k]], SUMI, 4); p.line([[cx - 4 * k, cy + 6 * k], [cx + 14 * k, cy + 22 * k]], SUMI, 4); p.ell(cx + 14 * k, cy - 14 * k, 6 * k, 6 * k, WHITE, SUMI, 3); p.ell(cx + 16 * k, cy + 24 * k, 6 * k, 6 * k, WHITE, SUMI, 3); break; }
    case 'co2': p.line([[cx - 26 * k, cy - 4 * k], [cx + 26 * k, cy - 4 * k]], SUMI, 3); p.line([[cx - 26 * k, cy + 4 * k], [cx + 26 * k, cy + 4 * k]], SUMI, 3); p.ell(cx, cy, 9 * k, 9 * k, SUMI, null); p.ell(cx - 28 * k, cy, 9 * k, 9 * k, WHITE, SUMI, 3); p.ell(cx + 28 * k, cy, 9 * k, 9 * k, WHITE, SUMI, 3); break;
    case 'cacl2': p.ell(cx, cy, 12 * k, 12 * k, SUMI, null); p.ell(cx - 26 * k, cy + 12 * k, 8 * k, 8 * k, WHITE, SUMI, 3); p.ell(cx + 26 * k, cy + 12 * k, 8 * k, 8 * k, WHITE, SUMI, 3); p.text('2+', cx, cy - 22 * k, 13 * k); break;
    case 'milk': for (const [x, y, r2] of [[cx - 12, cy - 8, 11], [cx + 14, cy - 4, 8], [cx - 2, cy + 14, 9], [cx + 18, cy + 18, 5], [cx - 22, cy + 16, 5]]) p.ell(cx + (x - cx) * k, cy + (y - cy) * k, r2 * k, r2 * k, WHITE, SUMI, 3); break;
    case 'cuso4': { const pts = [[cx, cy - 28 * k], [cx + 18 * k, cy], [cx, cy + 28 * k], [cx - 18 * k, cy]]; p.poly(pts, '#3a8cff', SUMI, 4); p.line([pts[0], pts[2]], WHITE, 2); break; }
    case 'soap': { p.ell(cx, cy, 10 * k, 10 * k, null, SUMI, 3); for (const [x, y] of ring(8, 26, 0)) { p.line([[cx + (x - cx) * 0.45, cy + (y - cy) * 0.45], [x, y]], SUMI, 3); p.ell(x, y, 5 * k, 5 * k, SUMI, null); } break; }
    case 'glucose': { const pts = ring(6, 22, 90); p.line([...pts, pts[0]], SUMI, 4); p.ell(pts[0][0], pts[0][1], 6 * k, 6 * k, WHITE, SUMI, 3); for (const q of pts.slice(2, 5)) p.line([q, [cx + (q[0] - cx) * 1.5, cy + (q[1] - cy) * 1.5]], SUMI, 3); break; }
    default: p.ell(cx, cy, 8 * k, 8 * k, SUMI, null);
  }
}

// ───────────── 顔と髪 ─────────────
function face(p, expr, male) {
  p.ell(512, 318, 92, 112, WHITE, SUMI, LW);
  p.line([[492, 428], [488, 478]]); p.line([[532, 428], [536, 478]]);
  const ey = 330;
  for (const [ex, s] of [[474, -1], [550, 1]]) {
    p.line(s < 0 ? [[ex - 20, ey - 34 + (male ? 2 : 0)], [ex + 20, ey - 38 - (male ? 0 : 2)]] : [[ex - 20, ey - 38 - (male ? 0 : 2)], [ex + 20, ey - 34 + (male ? 2 : 0)]], SUMI, 4);
    if (expr === 'normal') { p.arc(ex, ey + 6, 18, 14, 200, 340, SUMI, 5); p.ell(ex, ey + 2, 6, 8, SUMI, null); }
    else if (expr === 'smile') p.arc(ex, ey + 10, 17, 13, 200, 340, SUMI, 5);
    else { p.ell(ex, ey, 13, 15, WHITE, SUMI, 4); p.ell(ex, ey + 1, 5, 6, SUMI, null); }
  }
  if (expr === 'normal') p.line([[502, 390], [522, 390]], SUMI, 4);
  else if (expr === 'smile') p.arc(512, 378, 20, 16, 20, 160, SUMI, 4);
  else p.ell(512, 394, 9, 12, WHITE, SUMI, 4);
  p.line([[512, 342], [507, 364], [514, 366]], NEZ, 3);
}
function hairBack(p, style, col) {
  if (style === 'long') p.poly([[398, 260], [626, 260], [650, 720], [374, 720]], col, col);
  else if (style === 'ponytail') p.poly([[560, 230], [640, 220], [690, 600], [620, 640]], col, col);
  else if (style === 'twin') { p.poly([[392, 250], [430, 240], [400, 640], [340, 620]], col, col); p.poly([[594, 240], [632, 250], [684, 620], [624, 640]], col, col); }
  p.ell(512, 300, 112, 132, col, null);
}
function hairFront(p, style, male, col) {
  p.chord(512, 300, 106, 126, 180, 360, col);
  if (style === 'spiky') {
    for (let x0 = 404; x0 < 610; x0 += 30) p.poly([[x0, 230], [x0 + 30, 230], [x0 + 18, 196 - ((x0 / 30) % 2) * 18]], col, null);
    for (let x0 = 420; x0 < 600; x0 += 34) p.poly([[x0, 280], [x0 + 34, 280], [x0 + 22, 322]], col, null);
  } else if (male) {
    for (let x0 = 420; x0 < 600; x0 += 34) p.poly([[x0, 280], [x0 + 34, 280], [x0 + 22, 318]], col, null);
  } else {
    p.poly([[412, 286], [612, 286], [600, 300], [530, 296], [512, 312], [494, 296], [424, 300]], col, null);
    p.poly([[408, 290], [426, 290], [420, 420], [402, 400]], col, null);
    p.poly([[598, 290], [616, 290], [622, 400], [604, 420]], col, null);
  }
  if (style === 'bun') p.ell(512, 168, 54, 46, col, null);
}

// ───────────── 衣装の種類（だれでも着られる） ─────────────
const TORSO = [[430, 470], [594, 470], [700, 540], [676, 1490], [348, 1490], [324, 540]];
function sleeves(p, fill, len = 1010, line = SUMI, fillR = null) {
  p.poly([[330, 540], [206, 610], [206, len], [338, len - 20]], fill, line);
  p.poly([[694, 540], [818, 610], [818, len], [686, len - 20]], fillR || fill, line);
}
function collar(p, col = SUMI, under = WHITE) {
  p.poly([[474, 470], [512, 470], [512, 640], [470, 700]], under, col, 4);
  p.poly([[550, 470], [590, 476], [470, 840], [430, 820]], under, col, 4);
}
function kimono(p, body = WHITE, obi = null, { sleeve = null, sleeveR = null, longSleeve = false } = {}) {
  p.poly(TORSO, body, SUMI);
  sleeves(p, sleeve || body, longSleeve ? 1180 : 1010, SUMI, sleeveR);
  collar(p, SUMI, WHITE);
  if (obi) p.rect(334, 840, 690, 940, obi, SUMI);
  p.line([[512, 940], [520, 1490]], SUMI, 4);
}
/** 衣装を描く。返り値は、紋を置く場所 [x, y] */
const OUTFITS = {
  haori(p, c) {
    kimono(p, WHITE, NEZ);
    p.poly([[430, 470], [480, 470], [470, 1300], [340, 1300], [324, 540]], c, SUMI);
    p.poly([[594, 470], [544, 470], [554, 1300], [684, 1300], [700, 540]], c, SUMI);
    sleeves(p, c, 1030);
    return [620, 640];
  },
  apron(p, c) {
    kimono(p, WHITE, c);
    p.poly([[380, 940], [644, 940], [660, 1380], [364, 1380]], NEZ, SUMI);
    for (const a of [-70, -50, -30]) { const r = (a * Math.PI) / 180; p.line([[420, 1120], [420 + 90 * Math.cos(r), 1120 + 90 * Math.sin(r)]], c, 5); }
    return [620, 640];
  },
  coat(p, c) {
    p.poly([[430, 470], [594, 470], [712, 540], [700, 1480], [324, 1480], [312, 540]], c, SUMI);
    sleeves(p, c, 1040);
    p.poly([[430, 470], [512, 600], [594, 470], [560, 460], [512, 540], [464, 460]], WHITE, SUMI);
    p.line([[512, 600], [512, 1480]], SUMI, 4);
    for (let y = 660; y < 1100; y += 110) { p.ell(470, y, 9, 9, SUMI, null); p.ell(554, y, 9, 9, SUMI, null); }
    return [620, 680];
  },
  hakama(p, c) {
    p.poly([[430, 470], [594, 470], [700, 540], [690, 860], [334, 860], [324, 540]], WHITE, SUMI);
    sleeves(p, WHITE, 1060);
    collar(p);
    p.poly([[334, 840], [690, 840], [740, 1490], [284, 1490]], c, SUMI);
    for (const x of [420, 512, 604]) p.line([[x, 860], [x + (x - 512) * 0.4, 1480]], SUMI, 3);
    return [620, 640];
  },
  yukata(p, c) {
    kimono(p, c, WHITE);
    // 浴衣の水玉
    for (let y = 560; y < 1460; y += 90) for (let x = 360; x < 680; x += 80) if (!(y > 830 && y < 950)) p.ell(x + ((y / 90) % 2) * 40, y, 10, 10, 'rgba(255,255,255,0.75)', null);
    return [620, 640];
  },
  furisode(p, c) { kimono(p, c, WHITE, { longSleeve: true }); return [620, 640]; },
  samue(p, c) {
    p.poly([[430, 470], [594, 470], [700, 540], [690, 960], [334, 960], [324, 540]], c, SUMI);
    p.poly([[330, 540], [250, 620], [262, 920], [334, 910]], c, SUMI);
    p.poly([[694, 540], [774, 620], [762, 920], [690, 910]], c, SUMI);
    p.poly([[550, 470], [590, 476], [470, 840], [430, 820]], c, WHITE, 3);
    p.poly([[344, 950], [500, 950], [490, 1490], [360, 1490]], SUMI, WHITE, 3);
    p.poly([[524, 950], [680, 950], [664, 1490], [534, 1490]], SUMI, WHITE, 3);
    return [620, 640];
  },
  tsume(p, c) {
    p.poly([[420, 470], [604, 470], [700, 540], [690, 1490], [334, 1490], [324, 540]], c, SUMI);
    p.poly([[330, 540], [240, 620], [250, 1040], [334, 1030]], c, SUMI);
    p.poly([[694, 540], [784, 620], [774, 1040], [690, 1030]], c, SUMI);
    p.rect(462, 440, 562, 500, c, WHITE, 3);
    p.line([[512, 500], [512, 1490]], WHITE, 3);
    for (let y = 560; y < 1000; y += 90) p.ell(512, y, 8, 8, '#E6B422', SUMI, 2);
    p.line([[334, 1010], [690, 1010]], WHITE, 3);
    return [420, 660];
  },
  labcoat(p, c) {
    p.poly([[430, 470], [594, 470], [700, 540], [690, 1420], [334, 1420], [324, 540]], c, SUMI);   // 中の服
    p.poly([[324, 540], [430, 470], [500, 470], [470, 1460], [320, 1460]], WHITE, SUMI);
    p.poly([[700, 540], [594, 470], [524, 470], [554, 1460], [704, 1460]], WHITE, SUMI);
    sleeves(p, WHITE, 1040);
    p.line([[430, 470], [492, 760]], c, 8); p.line([[594, 470], [532, 760]], c, 8);
    p.rect(356, 1080, 446, 1170, WHITE, SUMI, 4); p.rect(578, 1080, 668, 1170, WHITE, SUMI, 4);
    p.line([[600, 1060], [606, 1120]], c, 6);
    p.line([[334, 1420], [690, 1420]], SUMI, 4);
    p.poly([[372, 1420], [500, 1420], [492, 1490], [380, 1490]], SUMI, null);
    p.poly([[524, 1420], [652, 1420], [644, 1490], [532, 1490]], SUMI, null);
    return [620, 700];
  },
  happi(p, c) {
    p.poly([[344, 950], [500, 950], [490, 1490], [360, 1490]], SUMI, WHITE, 3);
    p.poly([[524, 950], [680, 950], [664, 1490], [534, 1490]], SUMI, WHITE, 3);
    p.poly([[430, 470], [594, 470], [710, 540], [700, 1060], [324, 1060], [314, 540]], c, SUMI);
    p.poly([[330, 540], [222, 600], [232, 860], [334, 850]], c, SUMI);
    p.poly([[694, 540], [802, 600], [792, 860], [690, 850]], c, SUMI);
    p.line([[440, 470], [470, 1060]], WHITE, 22); p.line([[584, 470], [554, 1060]], WHITE, 22);
    p.line([[324, 1030], [700, 1030]], WHITE, 10);
    for (let x = 350; x < 690; x += 46) p.line([[x, 1060], [x + 20, 1060]], WHITE, 4);
    return [620, 700];
  },
};
export const OUTFIT_TYPES = Object.keys(OUTFITS);

// ───────────── キャラクターごとの絵の設定 ─────────────
// hair：髪型、male：男性の顔、crest：胸の紋、look：いつもの衣装 [種類, 色]、png：assets に PNG の絵がある
export const LOOKS = {
  tsukasa: { hair: 'bun', male: true, crest: 'gov', look: ['tsume', '#111111'], png: true },
  minato: { hair: 'short', male: true, crest: 'water', look: ['haori', '#165E83'], png: true },
  karin: { hair: 'short', male: true, crest: 'nitrate', look: ['apron', '#1E50A2'], png: true },
  toma: { hair: 'short', male: true, crest: 'snow', look: ['coat', '#83CCD2'], png: true },
  kasumi: { hair: 'short', male: true, crest: 'mist', look: ['hakama', '#68BE8D'], png: true, hat: true },
  eta: { hair: 'ponytail', male: true, crest: 'ethanol', look: ['yukata', '#111111'], png: true },
  hexa: { hair: 'long', male: false, crest: 'hexane', look: ['yukata', '#C9C9C9'], png: true },
  you: { hair: 'long', male: false, crest: 'iodine', look: ['furisode', '#7058A3'], png: true },
  kou: { hair: 'short', male: true, crest: 'colloid', look: ['samue', '#111111'], png: true },
  // v1.2：13人（それぞれが物質の擬人化）
  teppei: { hair: 'spiky', male: true, crest: 'iron', look: ['tsume', '#E6B422'], gold: true },
  shou: { hair: 'short', male: true, crest: 'silver', look: ['labcoat', '#C0C6C9'] },
  hirona: { hair: 'long', male: false, crest: 'nacl', look: ['furisode', '#83CCD2'] },
  yuuki: { hair: 'spiky', male: true, crest: 'benzene', look: ['happi', '#223A70'] },
  hiroki: { hair: 'short', male: true, crest: 'oh', look: ['coat', '#68BE8D'] },
  alice: { hair: 'ponytail', male: false, crest: 'alum', look: ['furisode', '#F09199'] },
  marine: { hair: 'long', male: false, crest: 'acetic', look: ['yukata', '#EB6101'] },
  takamasa: { hair: 'short', male: true, crest: 'co2', look: ['hakama', '#223A70'] },
  shigeru: { hair: 'short', male: true, crest: 'cacl2', look: ['samue', '#8A8A8A'] },
  miku: { hair: 'twin', male: false, crest: 'milk', look: ['happi', '#F09199'] },
  asuka: { hair: 'bun', male: false, crest: 'cuso4', look: ['furisode', '#1E50A2'] },
  shiho: { hair: 'long', male: false, crest: 'soap', look: ['labcoat', '#83CCD2'] },
  kazue: { hair: 'bun', male: false, crest: 'glucose', look: ['yukata', '#F8B500'] },
};

/** 1枚描く（1024×1536 の座標で） */
function drawFigure(g, id, expr, outfit) {
  const L = LOOKS[id] || LOOKS.minato;
  const p = painter(g);
  const [type, color] = outfit || L.look;
  const hairCol = SUMI;
  hairBack(p, L.hair, hairCol);
  const at = (OUTFITS[type] || OUTFITS.haori)(p, color);
  crest(p, L.crest, at[0], at[1]);
  face(p, expr, L.male);
  hairFront(p, L.hair, L.male, hairCol);
  if (id === 'kasumi') p.poly([[452, 196], [572, 196], [560, 110], [500, 92]], SUMI, SUMI);
  if (id === 'you') { p.ell(424, 210, 20, 20, '#7058A3', SUMI, 4); p.ell(400, 250, 20, 20, '#7058A3', SUMI, 4); }
  if (id === 'eta') p.ell(600, 228, 18, 14, WHITE, SUMI, 4);
  if (id === 'hexa') p.poly(Array.from({ length: 6 }, (_, i) => [600 + 22 * Math.cos((Math.PI / 3) * i), 214 + 22 * Math.sin((Math.PI / 3) * i)]), HAI, SUMI, 4);
  if (L.gold) {   // テッペイ：金の冠と光
    p.poly([[440, 196], [584, 196], [596, 132], [556, 168], [512, 112], [468, 168], [428, 132]], '#E6B422', SUMI, 4);
    p.ell(512, 150, 9, 9, '#ff5e70', SUMI, 3);
  }
  if (id === 'alice') p.poly([[580, 200], [620, 180], [624, 220]], '#F09199', SUMI, 4);
  if (id === 'miku') { p.ell(400, 250, 14, 14, '#F09199', SUMI, 3); p.ell(624, 250, 14, 14, '#F09199', SUMI, 3); }
  if (id === 'shou' || id === 'shiho') { p.ell(474, 332, 28, 24, null, SUMI, 4); p.ell(550, 332, 28, 24, null, SUMI, 4); p.line([[502, 330], [522, 330]], SUMI, 4); }
  if (id === 'asuka') { p.line([[548, 150], [610, 110]], '#1E50A2', 6); p.ell(612, 108, 9, 9, '#3a8cff', SUMI, 3); }
  if (id === 'kazue') p.ell(560, 160, 14, 14, '#F8B500', SUMI, 3);
}

const cache = new Map();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const outfitKey = (o) => (o ? o.join(':') : 'base');

/** 立ち絵（data: の URL） */
export function genStand(id, expr = 'normal', outfit = null) {
  const key = `s|${id}|${expr}|${outfitKey(outfit)}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(W * STAND_SCALE, H * STAND_SCALE);
  const g = c.getContext('2d');
  g.scale(STAND_SCALE, STAND_SCALE);
  drawFigure(g, id, expr, outfit);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
/** 顔アイコン（256×256、data: の URL） */
export function genFace(id, outfit = null) {
  const key = `f|${id}|${outfitKey(outfit)}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.scale(256 / 400, 256 / 400);
  g.translate(-312, -140);
  drawFigure(g, id, 'normal', outfit);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
