// shared/patterns.js
// 3Dの壁・屋根・床・柱に貼る和柄の模様を、端末の中でキャンバスに描く（全ワールド共通）。
// 画像ファイルを増やさないため（GitHub に上げるファイルを少なく保つ）、すべてここで作る。
// 描いた絵は「色」と「光る部分」の両方に使う（線がネオンのように光る）。

const TAU = Math.PI * 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function tex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}

function glowLine(g, color, width, blur) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.shadowColor = color;
  g.shadowBlur = blur;
}

// ───────────── 和柄の描き方 ─────────────
/** 青海波（せいがいは）：重なる半円の波 */
function seigaiha(g, x0, y0, w, h, r, color, lw = 2) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  glowLine(g, color, lw, 6);
  for (let row = -1, y = y0 - r; y < y0 + h + r; row++, y += r / 2) {
    const off = (row % 2) * r;
    for (let x = x0 - r * 2 + off; x < x0 + w + r * 2; x += r * 2) {
      for (let k = 1; k >= 0.3; k -= 0.23) {
        g.beginPath(); g.arc(x, y + r, r * k, Math.PI, TAU); g.stroke();
      }
    }
  }
  g.restore();
}

/** 麻の葉（あさのは）：三角の格子と、その中心への線 */
function asanoha(g, x0, y0, w, h, s, color, lw = 1.5) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  glowLine(g, color, lw, 5);
  const th = s * Math.sqrt(3) / 2;
  for (let row = -1, y = y0 - th; y < y0 + h + th; row++, y += th) {
    const off = (row % 2) * s / 2;
    for (let x = x0 - s + off; x < x0 + w + s; x += s) {
      for (const tri of [[[x, y + th], [x + s, y + th], [x + s / 2, y]], [[x + s / 2, y], [x + s * 1.5, y], [x + s, y + th]]]) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        g.beginPath();
        g.moveTo(...tri[0]); g.lineTo(...tri[1]); g.lineTo(...tri[2]); g.closePath();
        for (const p of tri) { g.moveTo(...p); g.lineTo(cx, cy); }
        g.stroke();
      }
    }
  }
  g.restore();
}

/** 亀甲（きっこう）：六角形の並び（ベンゼン環のようにも見える） */
function kikko(g, x0, y0, w, h, r, color, lw = 2) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  glowLine(g, color, lw, 6);
  const dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = -1, y = y0 - r; y < y0 + h + r; row++, y += dy) {
    const off = (row % 2) * dx / 2;
    for (let x = x0 - dx + off; x < x0 + w + dx; x += dx) {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = TAU * i / 6 + Math.PI / 6;
        const px = x + r * 0.9 * Math.cos(a), py = y + r * 0.9 * Math.sin(a);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath(); g.stroke();
    }
  }
  g.restore();
}

/** 七宝（しっぽう）：重なる円 */
function shippo(g, x0, y0, w, h, r, color, lw = 1.6) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  glowLine(g, color, lw, 5);
  for (let y = y0 - r; y < y0 + h + r; y += r) {
    for (let x = x0 - r; x < x0 + w + r; x += r) {
      g.beginPath(); g.arc(x, y, r / Math.SQRT2, 0, TAU); g.stroke();
    }
  }
  g.restore();
}

// ───────────── 床（広場の円） ─────────────
/** 中心に亀甲の輪、その外に青海波、さらに外に麻の葉の帯。帯の境に光る輪と、方角の飾り */
export function floorTexture(neon1, neon2) {
  const N = 1536, c = canvas(N, N), g = c.getContext('2d');
  const C = N / 2;
  g.fillStyle = '#070C24';
  g.fillRect(0, 0, N, N);
  // 石畳のうっすらした目地
  g.strokeStyle = 'rgba(120,150,255,0.06)';
  g.lineWidth = 1;
  for (let r = 60; r < C; r += 48) { g.beginPath(); g.arc(C, C, r, 0, TAU); g.stroke(); }
  const ring = (r0, r1, draw) => {
    g.save();
    g.beginPath(); g.arc(C, C, r1, 0, TAU); g.arc(C, C, r0, 0, TAU, true); g.clip('evenodd');
    draw();
    g.restore();
  };
  ring(C * 0.2, C * 0.34, () => kikko(g, 0, 0, N, N, 26, 'rgba(255,200,58,0.4)', 1.6));
  ring(C * 0.42, C * 0.68, () => seigaiha(g, 0, 0, N, N, 34, 'rgba(54,169,255,0.26)', 1.3));
  ring(C * 0.76, C * 0.95, () => asanoha(g, 0, 0, N, N, 46, 'rgba(169,133,255,0.28)', 1.2));
  // 帯の境の光る輪
  for (const [r, col, w] of [[0.2, neon2, 4], [0.34, neon2, 3], [0.42, neon1, 3], [0.68, neon1, 3], [0.76, '#A985FF', 3], [0.95, neon1, 6], [0.985, neon1, 2]]) {
    g.save(); glowLine(g, col, w, 18); g.beginPath(); g.arc(C, C, C * r, 0, TAU); g.stroke(); g.restore();
  }
  // 8方向の光る印（羅針盤のように）
  g.save();
  g.translate(C, C);
  for (let i = 0; i < 16; i++) {
    g.rotate(TAU / 16);
    glowLine(g, i % 2 ? 'rgba(54,169,255,0.5)' : neon2, i % 2 ? 2 : 3, 12);
    g.beginPath(); g.moveTo(0, -C * 0.69); g.lineTo(0, -C * (i % 2 ? 0.72 : 0.75)); g.stroke();
  }
  // 内側の帯の目盛り
  for (let i = 0; i < 72; i++) {
    g.rotate(TAU / 72);
    glowLine(g, 'rgba(255,200,58,0.6)', 2, 4);
    g.beginPath(); g.moveTo(0, -C * 0.355); g.lineTo(0, -C * (i % 6 ? 0.37 : 0.4)); g.stroke();
  }
  g.restore();
  return tex(c);
}

// ───────────── 壁（施設・政府庁舎） ─────────────
/** 下は格子（こうし）、上は麻の葉の欄間。黒い柱と横木で区切る */
export function wallTexture(neon) {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#121a3c';
  g.fillRect(0, 0, W, H);
  // 上の欄間（らんま）：麻の葉
  g.fillStyle = '#0b1029';
  g.fillRect(0, 0, W, H * 0.34);
  asanoha(g, 0, 0, W, H * 0.34, 40, neon, 1.6);
  // 下：縦の格子
  g.fillStyle = '#1a2450';
  g.fillRect(0, H * 0.38, W, H * 0.62);
  for (let x = 14; x < W; x += 22) {
    g.fillStyle = '#0a0f26';
    g.fillRect(x, H * 0.38, 8, H * 0.62);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x + 1, H * 0.38, 2, H * 0.62);
  }
  // 柱と横木（光る縁）
  g.fillStyle = '#05081a';
  g.fillRect(0, H * 0.34, W, H * 0.04);
  g.fillRect(0, 0, 14, H); g.fillRect(W - 14, 0, 14, H);
  g.save(); glowLine(g, neon, 3, 12);
  g.beginPath(); g.moveTo(0, H * 0.36); g.lineTo(W, H * 0.36); g.stroke();
  g.beginPath(); g.moveTo(7, 0); g.lineTo(7, H); g.moveTo(W - 7, 0); g.lineTo(W - 7, H); g.stroke();
  g.restore();
  return tex(c);
}

/** 瓦屋根（かわらやね）：細い縦の筋と、横の段 */
export function roofTexture(neon) {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1d2a5e'); grd.addColorStop(1, '#0a1030');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) {
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 3, H);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 10, 0, 6, H);
  }
  for (let y = 0; y < H; y += 32) {
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, y, W, 4);
    g.fillStyle = 'rgba(160,200,255,0.18)'; g.fillRect(0, y + 4, W, 1);
  }
  // 軒先の光る線
  g.save(); glowLine(g, neon, 4, 10); g.beginPath(); g.moveTo(0, H - 3); g.lineTo(W, H - 3); g.stroke(); g.restore();
  return tex(c, 3, 2);
}

/** 鳥居の柱・笠木：漆の色に、細い亀甲の金の地紋 */
export function lacquerTexture(baseHex, lineColor) {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = baseHex; g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.25)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  kikko(g, 0, 0, W, H, 18, lineColor, 1.2);
  return tex(c, 1, 3);
}

// ───────────── 看板・のれん・提灯（1枚の絵に並べて描く） ─────────────
/**
 * 施設の飾りの絵：左半分に縦の看板（漢字1文字）、右半分にのれん（麻の葉と家紋の輪）。
 * 1枚にまとめると、描く回数が減って軽くなる。
 */
export function signAtlas(kanji, neon1, neon2) {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
  // 左：縦の看板
  g.fillStyle = '#0a0f28'; g.fillRect(0, 0, 256, H);
  g.save(); glowLine(g, neon2, 6, 16); g.strokeRect(12, 12, 232, H - 24); g.restore();
  g.save(); glowLine(g, neon1, 2, 8); g.strokeRect(26, 26, 204, H - 52); g.restore();
  g.fillStyle = '#ffffff';
  g.shadowColor = neon1; g.shadowBlur = 24;
  g.font = `900 190px 'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(kanji, 128, H / 2 + 6);
  g.shadowBlur = 0;
  // 右：のれん
  g.fillStyle = '#123a7a'; g.fillRect(256, 0, 256, H);
  asanoha(g, 256, 0, 256, H, 36, 'rgba(160,210,255,0.55)', 1.4);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 256 + 84; x < W; x += 85) g.fillRect(x - 2, H * 0.25, 4, H * 0.75);   // のれんの切れ目
  g.save(); glowLine(g, neon2, 5, 14); g.beginPath(); g.arc(384, H * 0.55, 54, 0, TAU); g.stroke(); g.restore();
  g.fillStyle = '#ffffff'; g.shadowColor = neon2; g.shadowBlur = 14;
  g.font = `900 64px 'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif`;
  g.fillText(kanji, 384, H * 0.55 + 3);
  return tex(c);
}

/** 提灯（ちょうちん）：紙の横の骨と、光る中心 */
export function lanternTexture(neon) {
  const W = 128, H = 128, c = canvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#ff7a3a'); grd.addColorStop(0.5, '#ffe2a8'); grd.addColorStop(1, '#ff7a3a');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(120,30,0,0.45)';
  for (let y = 8; y < H; y += 14) g.fillRect(0, y, W, 2);
  g.fillStyle = '#1a0b05'; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 10, W, 10);
  g.strokeStyle = neon; g.lineWidth = 3; g.strokeRect(0, 0, W, H);
  return tex(c);
}

/** 門の中に浮かぶ光の輪（ワープの入口のようなゲームの演出） */
export function portalTexture(neon1, neon2) {
  const N = 512, c = canvas(N, N), g = c.getContext('2d');
  const C = N / 2;
  g.clearRect(0, 0, N, N);
  const grd = g.createRadialGradient(C, C, 0, C, C, C);
  grd.addColorStop(0, 'rgba(255,255,255,0.25)');
  grd.addColorStop(0.5, 'rgba(120,180,255,0.10)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  g.save();
  g.translate(C, C);
  for (let k = 0; k < 4; k++) {
    const r = C * (0.35 + k * 0.17);
    glowLine(g, k % 2 ? neon2 : neon1, k === 3 ? 6 : 3, 18);
    const parts = 6 + k * 3;
    for (let i = 0; i < parts; i++) {
      const a0 = TAU * i / parts, a1 = a0 + TAU / parts * 0.62;
      g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke();
    }
  }
  // 中心の亀甲
  glowLine(g, '#ffffff', 3, 16);
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = TAU * i / 6; const x = Math.cos(a) * C * 0.18, y = Math.sin(a) * C * 0.18; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.stroke();
  g.restore();
  return tex(c);
}

/** 宙に浮かぶ六角の輪（政府庁舎の上） */
export function hexRingTexture(neon) {
  const W = 1024, H = 64, c = canvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(54,169,255,0.12)'; g.fillRect(0, 16, W, 32);
  g.save(); glowLine(g, neon, 3, 10);
  g.beginPath(); g.moveTo(0, 16); g.lineTo(W, 16); g.moveTo(0, 48); g.lineTo(W, 48); g.stroke();
  g.restore();
  g.fillStyle = neon; g.shadowColor = neon; g.shadowBlur = 10;
  g.font = `700 24px 'Chakra Petch', 'Noto Sans', sans-serif`;
  g.textBaseline = 'middle';
  const txt = 'SEKIOROCK · SCIENCE GOVERNMENT · 科学政府 · TREASURY · 国庫 · ';
  let x = 6;
  while (x < W) { g.fillText(txt, x, 33); x += g.measureText(txt).width; }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

/**
 * 1本の道（ハイドレーション・ビートのノーツが飛んでくる道）：
 * 中央に麻の葉、両側に青海波。左右の縁は neonL / neonR の色で光る。縦にくり返して使う。
 */
export function laneTexture(neonL, neonR) {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#070b22'; g.fillRect(0, 0, W, H);
  seigaiha(g, 0, 0, 56, H, 20, 'rgba(120,170,255,0.30)', 1.2);
  seigaiha(g, W - 56, 0, 56, H, 20, 'rgba(120,170,255,0.30)', 1.2);
  asanoha(g, 64, 0, W - 128, H, 40, 'rgba(169,133,255,0.32)', 1.2);
  // 拍ごとの横線（4本で1小節）
  for (let i = 0; i < 4; i++) {
    g.save(); glowLine(g, i === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(140,190,255,0.35)', i === 0 ? 3 : 1.5, 8);
    g.beginPath(); g.moveTo(0, (H / 4) * i + 1); g.lineTo(W, (H / 4) * i + 1); g.stroke(); g.restore();
  }
  // 左右の光る縁
  g.save(); glowLine(g, neonL, 6, 16); g.beginPath(); g.moveTo(4, 0); g.lineTo(4, H); g.stroke(); g.restore();
  g.save(); glowLine(g, neonR, 6, 16); g.beginPath(); g.moveTo(W - 4, 0); g.lineTo(W - 4, H); g.stroke(); g.restore();
  g.save(); glowLine(g, 'rgba(255,255,255,0.35)', 2, 6); g.setLineDash([18, 18]); g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.restore();
  return tex(c, 1, 8);
}

/** 文字や記号の札（化学式など）をキャンバスに描いて、絵にする */
export function labelTexture(draw, w = 256, h = 128) {
  const c = canvas(w, h);
  draw(c.getContext('2d'), w, h);
  return tex(c);
}
