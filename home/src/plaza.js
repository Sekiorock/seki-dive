// home/src/plaza.js
// 3Dの広場（v0.5：ゲーミング風サイバー和風）。Three.js（cdnjs、グローバルの THREE）を読み込んだあとに使う。
// 見た目：夜の広場。床・壁・屋根・柱に和柄（亀甲・青海波・麻の葉・格子・瓦）を入れ、線がネオンのように光る。
//         角ばった鳥居と町家風の建物、五重の塔のような政府庁舎、提灯と石灯籠、浮かぶ光の粒。影は使わない。
// 軽く保つため、1つの門・建物の部品は、材質ごとに1つの形にまとめて描く（画面の物体はおよそ60個）。

import { PLAZA, GATE, GATES, STANDEE, FACILITY, FACILITIES, GOV, FX } from './config.js';
import { standUrl } from '../../shared/characters.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { t } from '../../shared/i18n.js';
import { formatHiyama } from '../../shared/economy.js';
import {
  floorTexture, wallTexture, roofTexture, lacquerTexture, signAtlas, lanternTexture, portalTexture, hexRingTexture,
} from './patterns.js';

const HOME = ACCENTS.home;
const VIOLET = '#A985FF';

// ───────────── 材質 ─────────────
/** 漆塗り（つやは控えめ）。模様の絵があれば貼り、その線を光らせる */
function lacquer(hex, map = null, glow = 0) {
  return new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : hexToInt(hex), map, roughness: 0.38, metalness: 0.25,
    emissive: map && glow ? 0xffffff : 0x000000, emissiveMap: glow ? map : null, emissiveIntensity: glow,
  });
}
/** 自分で光るネオン */
function neon(hex, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: hexToInt(hex), transparent: opacity < 1, opacity, toneMapped: false });
}
/** 光を足し合わせる、すけた絵（入口の光の輪など） */
function additive(map, opacity = 1) {
  return new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
}

// ───────────── 形をまとめる（描く回数を減らす） ─────────────
/** parts: [{ geo, pos, rot, scale, uv:[u0,v0,u1,v1] }] を1つの形にまとめる。uv は絵の一部だけを貼るとき */
function merge(parts) {
  const pos = [], nor = [], uvs = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    e.set(...(p.rot || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), q, new THREE.Vector3(...(p.scale || [1, 1, 1])));
    g.applyMatrix4(m);
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    const uv = g.attributes.uv ? g.attributes.uv.array : new Float32Array(g.attributes.position.count * 2);
    const [u0, v0, u1, v1] = p.uv || [0, 0, 1, 1];
    for (let i = 0; i < uv.length; i += 2) uvs.push(u0 + uv[i] * (u1 - u0), v0 + uv[i + 1] * (v1 - v0));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return out;
}

// ───────────── 光の粒（ネオンのにじみ） ─────────────
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** 光の粒をまとめて1つの物体にする。points: [[x,y,z,'#色'], ...] */
function glowPoints(points, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => p.slice(0, 3)), 3));
  const col = new THREE.Color();
  geo.setAttribute('color', new THREE.Float32BufferAttribute(points.flatMap((p) => col.set(p[3]).toArray()), 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTexture(), vertexColors: true, size, sizeAttenuation: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
}

// ───────────── 文字の札（名札・額・国庫の掲示板） ─────────────
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function fontFamily() {
  if (document.documentElement.lang === 'en') return "'Chakra Petch', 'M PLUS 1p', 'Noto Sans', sans-serif";
  return "'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif";
}
function fitText(ctx, text, maxWidth, size, weight) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${fontFamily()}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 12);
  return s;
}
/** 両端がとがった、ゲームの名札。neonHex の色でふちが光る */
function hudPath(ctx, x, y, w, h, cut) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + h / 2);
  ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
}
function drawLabel(canvas, text, neonHex, subHex, closed = false) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const pad = 14, h = H - pad * 2;
  ctx.save();
  ctx.shadowColor = closed ? '#555' : neonHex; ctx.shadowBlur = 20;
  hudPath(ctx, pad, pad, W - pad * 2, h, h / 2);
  const grd = ctx.createLinearGradient(pad, 0, W - pad, 0);
  grd.addColorStop(0, closed ? 'rgba(60,60,70,0.95)' : 'rgba(30,60,140,0.95)');
  grd.addColorStop(0.5, 'rgba(8,12,32,0.95)');
  grd.addColorStop(1, closed ? 'rgba(60,60,70,0.95)' : 'rgba(70,40,140,0.95)');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = closed ? '#777' : neonHex;
  ctx.stroke();
  ctx.restore();
  // 走査線
  ctx.save();
  hudPath(ctx, pad, pad, W - pad * 2, h, h / 2); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.restore();
  // 左の菱形の印
  ctx.save();
  ctx.fillStyle = closed ? '#888' : subHex; ctx.shadowColor = subHex; ctx.shadowBlur = closed ? 0 : 14;
  const cx = pad + h * 0.85, cy = H / 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - 13); ctx.lineTo(cx + 13, cy); ctx.lineTo(cx, cy + 13); ctx.lineTo(cx - 13, cy); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = closed ? '#aaa' : '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = neonHex; ctx.shadowBlur = closed ? 0 : 12;
  fitText(ctx, text, W - h * 2.4, 60, 800);
  ctx.fillText(text, W / 2 + 12, H / 2 + 3);
}

function makeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}
function makeSprite(canvas, w, h) {
  const tex = makeTexture(canvas);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, toneMapped: false }));
  s.scale.set(w, h, 1);
  s.renderOrder = 10;
  return { sprite: s, tex };
}

// ───────────── 門（角ばった鳥居と、中に浮かぶ光の輪） ─────────────
function drawPlaque(canvas, id) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const acc = ACCENTS[id];
  ctx.fillStyle = '#060a1e';
  ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.shadowColor = acc.a2.neon; ctx.shadowBlur = 16; ctx.lineWidth = 8; ctx.strokeStyle = acc.a2.neon;
  ctx.strokeRect(10, 10, W - 20, H - 20); ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, W - 48, H - 48);
  const scale = t(`scale.${id}`);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = acc.a2.neon; ctx.shadowBlur = 16;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitText(ctx, scale, W - 70, 84, 800);
  const words = scale.split(' ');
  if (size < 60 && words.length > 1) {   // 長い言葉（Semipermeable membrane）は2行に
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(' '), l2 = words.slice(mid).join(' ');
    const s2 = Math.min(fitText(ctx, l1, W - 70, 64, 800), fitText(ctx, l2, W - 70, 64, 800));
    ctx.font = `800 ${s2}px ${fontFamily()}`;
    ctx.fillText(l1, W / 2, H / 2 - s2 * 0.55);
    ctx.fillText(l2, W / 2, H / 2 + s2 * 0.6);
  } else {
    ctx.fillText(scale, W / 2, H / 2 + 4);
  }
}

function buildGate(def) {
  const g = new THREE.Group();
  g.name = `gate-${def.id}`;
  const acc = ACCENTS[def.id];
  const H = GATE.pillarHeight, R = GATE.pillarRadius;
  const half = GATE.width / 2 + R;
  const topLen = GATE.width + R * 2 + GATE.beamOverhang * 2;
  const lift = GATE.kasagiLift;

  // 漆塗りの本体（八角の柱・貫・島木・笠木）：差し色1に、亀甲の金の地紋
  const body = [];
  for (const sx of [-1, 1]) body.push({ geo: new THREE.CylinderGeometry(R * 0.9, R, H, 8), pos: [sx * half, H / 2, 0], rot: [0, Math.PI / 8, 0] });
  const nukiY = H * 0.68;
  body.push({ geo: new THREE.BoxGeometry(GATE.width + R * 2 + 0.6, 0.24, 0.24), pos: [0, nukiY, 0] });
  body.push({ geo: new THREE.BoxGeometry(topLen - 0.5, 0.24, 0.36), pos: [0, H + 0.02, 0] });
  // 笠木：まっすぐな中央と、少し反った両端
  const midLen = topLen * 0.6, endLen = (topLen - midLen) / 2 + 0.05;
  const endAng = Math.atan2(lift, endLen);
  body.push({ geo: new THREE.BoxGeometry(midLen, 0.32, 0.56), pos: [0, H + 0.3, 0] });
  for (const sx of [-1, 1]) {
    body.push({ geo: new THREE.BoxGeometry(endLen, 0.32, 0.56), pos: [sx * (midLen / 2 + endLen / 2 - 0.03), H + 0.3 + lift / 2, 0], rot: [0, 0, sx * endAng] });
  }
  // 額束（がくづか）：貫と島木の間の短い柱
  body.push({ geo: new THREE.BoxGeometry(0.2, H - nukiY, 0.2), pos: [0, (H + nukiY) / 2, 0] });
  const bodyMat = lacquer(acc.a1.hex, lacquerTexture(acc.a1.hex, 'rgba(255,215,120,0.55)'), 0.15);
  g.add(new THREE.Mesh(merge(body), bodyMat));
  g.userData.bodyMat = bodyMat;

  // 黒い部分：笠木の上の黒い板、柱の根巻き、四角い礎石
  const dark = [{ geo: new THREE.BoxGeometry(midLen + 0.1, 0.1, 0.62), pos: [0, H + 0.5, 0] }];
  for (const sx of [-1, 1]) {
    dark.push({ geo: new THREE.BoxGeometry(endLen, 0.1, 0.62), pos: [sx * (midLen / 2 + endLen / 2 - 0.03), H + 0.5 + lift / 2, 0], rot: [0, 0, sx * endAng] });
    dark.push({ geo: new THREE.CylinderGeometry(R * 1.15, R * 1.2, 0.45, 8), pos: [sx * half, 0.5, 0], rot: [0, Math.PI / 8, 0] });
    dark.push({ geo: new THREE.BoxGeometry(R * 3.2, 0.28, R * 3.2), pos: [sx * half, 0.14, 0] });
  }
  g.add(new THREE.Mesh(merge(dark), lacquer('#0b0f22')));

  // ネオン：柱の前後の縦の線、根巻きの輪、笠木の下のふち（差し色2）
  const lines = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) lines.push({ geo: new THREE.BoxGeometry(0.035, H - 1, 0.035), pos: [sx * half, H / 2 + 0.3, sz * R * 0.93] });
    lines.push({ geo: new THREE.BoxGeometry(R * 3.25, 0.04, R * 3.25), pos: [sx * half, 0.3, 0] });
    lines.push({ geo: new THREE.TorusGeometry(R * 1.18, 0.03, 4, 8), pos: [sx * half, 0.74, 0], rot: [Math.PI / 2, 0, Math.PI / 8] });
  }
  lines.push({ geo: new THREE.BoxGeometry(midLen, 0.04, 0.6), pos: [0, H + 0.13, 0] });
  lines.push({ geo: new THREE.BoxGeometry(GATE.width + R * 2 + 0.62, 0.04, 0.26), pos: [0, nukiY - 0.13, 0] });
  const lineMat = neon(acc.a2.neon);
  g.add(new THREE.Mesh(merge(lines), lineMat));
  g.userData.lineMat = lineMat;

  // 入口に浮かぶ光の輪（ゆっくり回る）
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(GATE.width * 0.95, GATE.width * 0.95), additive(portalTexture(acc.a1.neon, acc.a2.neon), 0.85));
  portal.position.set(0, nukiY * 0.52, 0);
  g.add(portal);

  // 光の粒（柱の根もとと、笠木の両端）
  g.add(glowPoints([
    [-half, 0.74, R * 1.2, acc.a2.neon], [half, 0.74, R * 1.2, acc.a2.neon],
    [-half, 0.74, -R * 1.2, acc.a2.neon], [half, 0.74, -R * 1.2, acc.a2.neon],
    [-topLen / 2, H + 0.3 + lift, 0, acc.a1.neon], [topLen / 2, H + 0.3 + lift, 0, acc.a1.neon],
  ], 1.1));

  // 額（潜る大きさ）：表からも裏からも読める板
  const plaqueCanvas = makeCanvas(512, 220);
  drawPlaque(plaqueCanvas, def.id);
  const plaqueTex = makeTexture(plaqueCanvas);
  const face = new THREE.MeshBasicMaterial({ map: plaqueTex, toneMapped: false });
  const side = new THREE.MeshBasicMaterial({ color: 0x060a1e });
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.67, 0.12), [side, side, side, side, face, face]);
  plaque.position.set(0, (H + nukiY) / 2, 0);
  g.add(plaque);

  // 名札
  const labelCanvas = makeCanvas(700, 150);
  let open = true;
  const draw = () => drawLabel(labelCanvas, open ? t(`world.${def.id}`) : t('gate.closedLabel', { name: t(`world.${def.id}`) }), acc.a1.neon, acc.a2.neon, !open);
  draw();
  const label = makeSprite(labelCanvas, 5.3, 1.14);
  label.sprite.position.set(0, GATE.labelHeight, 0);
  g.add(label.sprite);

  // タップの当たり判定（見えない箱）
  const hit = new THREE.Mesh(new THREE.BoxGeometry(topLen, GATE.labelHeight + 0.6, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = (GATE.labelHeight + 0.6) / 2;
  hit.userData.gateId = def.id;
  g.add(hit);

  const a = THREE.MathUtils.degToRad(def.angleDeg);
  g.position.set(Math.sin(a) * GATE.distanceFromCenter, 0, -Math.cos(a) * GATE.distanceFromCenter);
  g.lookAt(0, 0, 0);

  const openColor = lineMat.color.clone();
  return {
    group: g, hit, portal,
    redraw: () => { draw(); label.tex.needsUpdate = true; drawPlaque(plaqueCanvas, def.id); plaqueTex.needsUpdate = true; },
    /** 先生が門を閉じたときは、光を消して灰色にする */
    setOpen: (v) => {
      open = v;
      portal.visible = v;
      lineMat.color.copy(v ? openColor : new THREE.Color(0x3a3f55));
      bodyMat.color.set(v ? 0xffffff : 0x4a4d5c);
      bodyMat.emissiveIntensity = v ? 0.15 : 0;
      draw(); label.tex.needsUpdate = true;
    },
  };
}

// ───────────── 施設（町家風の建物：格子の壁、瓦の切妻屋根、看板、のれん、提灯） ─────────────
const KANJI = { bank: '銀', gofuku: '呉', dougu: '道' };

function buildFacility(def) {
  const g = new THREE.Group();
  g.name = `facility-${def.id}`;
  const F = FACILITY;
  const front = F.depth / 2;

  // 壁：格子と麻の葉の欄間（線が光る）
  g.add(new THREE.Mesh(merge([{ geo: new THREE.BoxGeometry(F.width, F.wallHeight, F.depth), pos: [0, F.wallHeight / 2, 0] }]),
    lacquer('#121a3c', wallTexture(HOME.a1.neon), 0.55)));

  // 切妻屋根（瓦）：2枚の傾いた板
  const ov = 0.45, pitch = Math.atan2(F.roofHeight, F.depth / 2 + ov);
  const slope = Math.hypot(F.roofHeight, F.depth / 2 + ov);
  const roofParts = [];
  for (const sz of [-1, 1]) {
    roofParts.push({ geo: new THREE.BoxGeometry(F.width + ov * 2, 0.12, slope), pos: [0, F.wallHeight + F.roofHeight / 2, sz * (F.depth / 2 + ov) / 2], rot: [sz * pitch, 0, 0] });
  }
  // 妻（屋根の下の三角の壁）
  const tri = new THREE.Shape();
  tri.moveTo(-F.depth / 2, 0); tri.lineTo(F.depth / 2, 0); tri.lineTo(0, F.roofHeight * 0.95); tri.lineTo(-F.depth / 2, 0);
  const gable = new THREE.ShapeGeometry(tri);
  for (const sx of [-1, 1]) roofParts.push({ geo: gable, pos: [sx * F.width / 2, F.wallHeight, 0], rot: [0, sx * Math.PI / 2, 0] });
  g.add(new THREE.Mesh(merge(roofParts), lacquer('#1d2a5e', roofTexture(HOME.a1.neon), 0.35)));

  // ネオン：棟（むね）の線、軒先の線、壁の角の縦の線
  const lines = [
    { geo: new THREE.BoxGeometry(F.width + ov * 2 + 0.1, 0.07, 0.07), pos: [0, F.wallHeight + F.roofHeight + 0.04, 0] },
  ];
  for (const sz of [-1, 1]) lines.push({ geo: new THREE.BoxGeometry(F.width + ov * 2, 0.05, 0.05), pos: [0, F.wallHeight - 0.02, sz * (F.depth / 2 + ov)] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lines.push({ geo: new THREE.BoxGeometry(0.05, F.wallHeight, 0.05), pos: [sx * F.width / 2, F.wallHeight / 2, sz * front] });
  g.add(new THREE.Mesh(merge(lines), neon(HOME.a2.neon)));

  // 看板（縦）とのれん：1枚の絵の左右を使う
  const atlas = signAtlas(KANJI[def.id], HOME.a1.neon, HOME.a2.neon);
  g.add(new THREE.Mesh(merge([
    { geo: new THREE.PlaneGeometry(0.62, 1.25), pos: [F.width / 2 - 0.45, F.wallHeight * 0.55, front + 0.06], uv: [0, 0, 0.5, 1] },
    { geo: new THREE.PlaneGeometry(1.4, 1.0), pos: [-0.3, F.wallHeight - 0.62, front + 0.04], uv: [0.5, 0, 1, 1] },
  ]), new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false })));

  // 提灯（軒先に2つ）
  const lanterns = [];
  for (const sx of [-1, 1]) lanterns.push({ geo: new THREE.CylinderGeometry(0.17, 0.17, 0.4, 10), pos: [sx * (F.width / 2 + 0.1), F.wallHeight - 0.4, front + ov * 0.6] });
  g.add(new THREE.Mesh(merge(lanterns), new THREE.MeshBasicMaterial({ map: lanternTexture('#ffd27a'), toneMapped: false })));
  g.add(glowPoints([
    [-(F.width / 2 + 0.1), F.wallHeight - 0.4, front + ov * 0.6, '#ffb45c'],
    [F.width / 2 + 0.1, F.wallHeight - 0.4, front + ov * 0.6, '#ffb45c'],
    [0, F.wallHeight + F.roofHeight + 0.05, 0, HOME.a2.neon],
  ], 1.5));

  // 名札
  const labelCanvas = makeCanvas(560, 140);
  const draw = () => drawLabel(labelCanvas, t(`facility.${def.id}`), HOME.a1.neon, HOME.a2.neon);
  draw();
  const label = makeSprite(labelCanvas, 3.7, 0.92);
  label.sprite.position.set(0, F.labelHeight, 0);
  g.add(label.sprite);

  const hitH = F.labelHeight + 0.5;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(F.width + 1, hitH, F.depth + 1), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = hitH / 2;
  hit.userData.facilityId = def.id;
  g.add(hit);

  const a = THREE.MathUtils.degToRad(def.angleDeg);
  g.position.set(Math.sin(a) * F.distanceFromCenter, 0, -Math.cos(a) * F.distanceFromCenter);
  g.lookAt(0, 0, 0);
  return { group: g, hit, redraw: () => { draw(); label.tex.needsUpdate = true; } };
}

// ───────────── 政府庁舎（三重の塔）と、国庫の掲示板 ─────────────
function drawTreasury(canvas, amount) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = HOME.a2.neon; ctx.shadowBlur = 22;
  ctx.beginPath();
  const c = 34;
  ctx.moveTo(16 + c, 16); ctx.lineTo(W - 16, 16); ctx.lineTo(W - 16, H - 16 - c); ctx.lineTo(W - 16 - c, H - 16); ctx.lineTo(16, H - 16); ctx.lineTo(16, 16 + c); ctx.closePath();
  const grd = ctx.createLinearGradient(0, 16, 0, H - 16);
  grd.addColorStop(0, 'rgba(60,46,8,0.95)');
  grd.addColorStop(1, 'rgba(12,10,4,0.95)');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = HOME.a2.neon;
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 18; y < H - 18; y += 4) ctx.fillRect(18, y, W - 36, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFE7A6';
  ctx.font = `800 36px ${fontFamily()}`;
  ctx.fillText(`◆ ${t('gov.treasury')} ◆`, W / 2, 64);
  ctx.shadowColor = HOME.a2.neon; ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFFFFF';
  const num = amount === null ? '—' : formatHiyama(amount);
  ctx.font = `700 88px 'Chakra Petch', ${fontFamily()}`;
  let size = 88;
  while (ctx.measureText(num).width > W - 140 && size > 30) { size -= 4; ctx.font = `700 ${size}px 'Chakra Petch', ${fontFamily()}`; }
  ctx.fillText(num, W / 2, 148);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFC83A';
  ctx.font = `700 28px ${fontFamily()}`;
  ctx.fillText(t('money', { amount: '' }).trim(), W / 2, 210);
}

function buildGov() {
  const g = new THREE.Group();
  g.name = 'gov';
  const tiers = GOV.tiers;   // [{ size, height }]
  // 石の基壇（八角）
  g.add(new THREE.Mesh(merge([
    { geo: new THREE.CylinderGeometry(GOV.baseRadius, GOV.baseRadius + 0.2, 0.36, 8), pos: [0, 0.18, 0], rot: [0, Math.PI / 8, 0] },
    { geo: new THREE.CylinderGeometry(GOV.baseRadius - 0.45, GOV.baseRadius - 0.3, 0.3, 8), pos: [0, 0.5, 0], rot: [0, Math.PI / 8, 0] },
  ]), lacquer('#141A38')));

  // 各階の壁（格子と麻の葉）と、屋根（四角い瓦屋根）
  const walls = [], roofs = [], lines = [];
  let y = 0.65;
  tiers.forEach((tr, i) => {
    walls.push({ geo: new THREE.BoxGeometry(tr.size, tr.height, tr.size), pos: [0, y + tr.height / 2, 0] });
    y += tr.height;
    const roofW = tr.size + 1.0, roofH = 0.55;
    roofs.push({ geo: new THREE.CylinderGeometry(tr.size * 0.32, roofW * 0.71, roofH, 4, 1), pos: [0, y + roofH / 2, 0], rot: [0, Math.PI / 4, 0] });
    // 軒先の光る四角
    const e = roofW * 0.5;
    for (const [dx, dz, w, d] of [[0, e, roofW, 0.06], [0, -e, roofW, 0.06], [e, 0, 0.06, roofW], [-e, 0, 0.06, roofW]]) {
      lines.push({ geo: new THREE.BoxGeometry(w, 0.06, d), pos: [dx, y + 0.02, dz] });
    }
    y += roofH * (i === tiers.length - 1 ? 1 : 0.6);
  });
  g.add(new THREE.Mesh(merge(walls), lacquer('#121a3c', wallTexture(VIOLET), 0.55)));
  g.add(new THREE.Mesh(merge(roofs), lacquer('#1d2a5e', roofTexture(HOME.a2.neon), 0.3)));
  // 相輪（そうりん）：塔のてっぺんの棒と輪
  const topY = y;
  lines.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), pos: [0, topY + 0.65, 0] });
  for (let k = 0; k < 5; k++) lines.push({ geo: new THREE.TorusGeometry(0.2 - k * 0.025, 0.025, 4, 12), pos: [0, topY + 0.2 + k * 0.2, 0], rot: [Math.PI / 2, 0, 0] });
  lines.push({ geo: new THREE.TorusGeometry(GOV.baseRadius + 0.05, 0.05, 4, 8), pos: [0, 0.37, 0], rot: [Math.PI / 2, 0, Math.PI / 8] });
  g.add(new THREE.Mesh(merge(lines), neon(HOME.a2.neon)));
  g.add(glowPoints([[0, topY + 1.35, 0, HOME.a2.neon], [0, topY + 0.2, 0, HOME.a2.neon]], 2.4));

  // 塔のまわりを回る六角の光の帯（文字が流れる）
  const ringTex = hexRingTexture(HOME.a1.neon);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(GOV.ringRadius, GOV.ringRadius, 0.42, 6, 1, true), additive(ringTex, 0.9));
  ring.position.y = GOV.ringHeight;
  g.add(ring);

  // 宙に浮かぶ国庫の掲示板
  const boardCanvas = makeCanvas(600, 250);
  let amount = null;
  drawTreasury(boardCanvas, amount);
  const board = makeSprite(boardCanvas, 5.2, 2.17);
  board.sprite.position.y = GOV.boardHeight;
  g.add(board.sprite);

  const hitH = GOV.boardHeight + 1;
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(GOV.baseRadius, GOV.baseRadius, hitH, 8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = hitH / 2;
  hit.userData.facilityId = 'gov';
  g.add(hit);

  return {
    group: g, hit, board: board.sprite, ring, ringTex,
    setTreasury: (n) => { amount = n; drawTreasury(boardCanvas, amount); board.tex.needsUpdate = true; },
    redraw: () => { drawTreasury(boardCanvas, amount); board.tex.needsUpdate = true; },
  };
}

// ───────────── 地面：和柄の円い広場と、縁の石灯籠 ─────────────
function buildGround() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.groundSize / 2, 48), new THREE.MeshLambertMaterial({ color: 0x050a1c }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.03;
  g.add(outer);

  const floorMap = floorTexture(HOME.a1.neon, HOME.a2.neon);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorMap, emissiveMap: floorMap, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.45, metalness: 0.3, color: 0xb8c4ff,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.radius, 96), floorMat);
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);

  // 石灯籠（いしどうろう）：門と施設のあいだ、広場の縁に8つ
  const stone = [], lights = [], glows = [];
  for (let i = 0; i < 8; i++) {
    const a = THREE.MathUtils.degToRad(22.5 + i * 45);
    const x = Math.sin(a) * PLAZA.lanternRadius, z = -Math.cos(a) * PLAZA.lanternRadius;
    stone.push({ geo: new THREE.BoxGeometry(0.5, 0.15, 0.5), pos: [x, 0.08, z] });
    stone.push({ geo: new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), pos: [x, 0.55, z] });
    stone.push({ geo: new THREE.CylinderGeometry(0.06, 0.42, 0.22, 6), pos: [x, 1.32, z] });
    lights.push({ geo: new THREE.BoxGeometry(0.3, 0.26, 0.3), pos: [x, 1.08, z] });
    glows.push([x, 1.08, z, '#ffb45c']);
  }
  g.add(new THREE.Mesh(merge(stone), lacquer('#2a3150')));
  g.add(new THREE.Mesh(merge(lights), neon('#ffcf7a')));
  g.add(glowPoints(glows, 1.6));
  return { group: g, floorMat };
}

// ───────────── 演出：浮かぶ光の粒と、床を走る光の輪 ─────────────
function buildParticles() {
  const n = FX.particles;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), speed = new Float32Array(n);
  const colors = [HOME.a1.neon, HOME.a2.neon, VIOLET, '#8FF3FA'].map((h) => new THREE.Color(h));
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(Math.random()) * PLAZA.radius, a = Math.random() * Math.PI * 2;
    pos.set([Math.sin(a) * r, Math.random() * FX.particleHeight, Math.cos(a) * r], i * 3);
    col.set(colors[i % colors.length].toArray(), i * 3);
    speed[i] = 0.25 + Math.random() * 0.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTexture(), vertexColors: true, size: 0.35, sizeAttenuation: true,
    transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  return {
    points: pts,
    update(dt) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        p[i * 3 + 1] += speed[i] * dt;
        if (p[i * 3 + 1] > FX.particleHeight) p[i * 3 + 1] = 0;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function buildWave() {
  const mat = new THREE.MeshBasicMaterial({ color: hexToInt(HOME.a1.neon), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  return {
    mesh: ring,
    update(time) {
      const p = (time / 1000 % FX.wavePeriod) / FX.wavePeriod;   // 0→1
      const r = GOV.baseRadius + p * (PLAZA.radius - GOV.baseRadius);
      ring.scale.set(r, r, 1);
      mat.opacity = 0.9 * (1 - p);
    },
  };
}

// ───────────── 立ち絵の板（キタロー） ─────────────
function buildStandee(id, height, onLoad) {
  const w = height * (1024 / 1536);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, toneMapped: false });
  mat.map = new THREE.TextureLoader().load(standUrl(id, 'normal'), () => onLoad && onLoad());
  const geo = new THREE.PlaneGeometry(w, height);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.talkId = id;
  // 足もとの光る六角
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.64, 6), neon(HOME.a2.neon, 0.95));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const group = new THREE.Group();
  group.add(mesh, ring);
  return { group, mesh, ring };
}

/** 広場全体を作って返す。 */
export function buildPlaza(scene, { onTextureLoad } = {}) {
  const ground = buildGround();
  scene.add(ground.group);

  const gov = buildGov();
  scene.add(gov.group);

  const standee = buildStandee(STANDEE.id, STANDEE.height, onTextureLoad);
  const sa = THREE.MathUtils.degToRad(STANDEE.angleDeg);
  standee.group.position.set(Math.sin(sa) * STANDEE.distance, 0.02, -Math.cos(sa) * STANDEE.distance);
  scene.add(standee.group);

  const gates = GATES.map((def) => { const x = buildGate(def); scene.add(x.group); return x; });
  const facilities = FACILITIES.map((def) => { const x = buildFacility(def); scene.add(x.group); return x; });

  const particles = buildParticles();
  scene.add(particles.points);
  const wave = buildWave();
  scene.add(wave.mesh);

  let last = 0;
  return {
    hitTargets: [standee.mesh, ...gates.map((x) => x.hit), ...facilities.map((x) => x.hit), gov.hit],
    redrawLabels: () => [...gates, ...facilities, gov].forEach((x) => x.redraw()),
    setTreasury: gov.setTreasury,
    setGateOpen: (id, open) => { const x = gates.find((gg) => gg.hit.userData.gateId === id); if (x) x.setOpen(open); },
    /** 立ち絵の板をカメラの方へ向ける（縦の軸のまわりだけ回す） */
    faceCamera: (camera) => {
      const p = standee.group.position;
      standee.mesh.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    },
    /** 動き：掲示板がふわふわ浮く、光の帯と入口の輪が回る、粒が昇る、光の輪が床を走る、床がゆっくり明滅 */
    animate: (time) => {
      const dt = Math.min(0.1, (time - last) / 1000);
      last = time;
      gov.board.position.y = GOV.boardHeight + Math.sin(time * 0.0015) * 0.12;
      gov.ring.rotation.y = time * 0.0004;
      gov.ringTex.offset.x = (time * 0.00005) % 1;
      gates.forEach((x, i) => { x.portal.rotation.z = time * 0.0006 * (i % 2 ? 1 : -1); });
      standee.ring.rotation.z = time * 0.0008;
      ground.floorMat.emissiveIntensity = 0.28 + Math.sin(time * 0.0012) * 0.07;
      particles.update(dt);
      wave.update(time);
    },
  };
}
