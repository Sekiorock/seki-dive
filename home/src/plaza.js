// home/src/plaza.js
// 3Dの広場（v0.4 からサイバー和風）。Three.js（cdnjs、グローバルの THREE）を読み込んだあとに使う。
// 見た目：夜の広場に、丸くツルツルした漆塗りの鳥居と建物。伝統色のネオンが光る。影は使わない。
// 軽く保つため、1つの門・建物の部品は、色ごとに1つの形にまとめて描く（画面の物体は60個まで）。

import { PLAZA, GATE, GATES, STANDEE, FACILITY, FACILITIES, GOV } from './config.js';
import { standUrl } from '../../shared/characters.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { t } from '../../shared/i18n.js';
import { formatHiyama } from '../../shared/economy.js';

// ───────────── 材質 ─────────────
/** 漆塗りのようなつやのある材質 */
function lacquer(hex, rough = 0.22) {
  return new THREE.MeshPhysicalMaterial({
    color: hexToInt(hex), roughness: rough, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08,
  });
}
/** 自分で光るネオン */
function neon(hex, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: hexToInt(hex), transparent: opacity < 1, opacity, toneMapped: false });
}

// ───────────── 形をまとめる（描く回数を減らす） ─────────────
/** parts: [{ geo, pos:[x,y,z], rot:[x,y,z], scale:[x,y,z] }] を1つの形にまとめる */
function merge(parts) {
  const pos = [], nor = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const p of parts) {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    e.set(...(p.rot || [0, 0, 0]));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), q, new THREE.Vector3(...(p.scale || [1, 1, 1])));
    g.applyMatrix4(m);   // 法線（面の向き）も一緒に回るので、丸い面はなめらかなまま
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
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
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
/** 同じ色の光の粒をまとめて1つの物体にする */
function glowPoints(points, hex, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTexture(), color: hexToInt(hex), size, sizeAttenuation: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
}

// ───────────── 文字の板（名札・額・掲示板） ─────────────
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function fontFamily() {
  return document.documentElement.lang === 'en'
    ? "'Nunito', 'M PLUS Rounded 1c', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif"
    : "'M PLUS Rounded 1c', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif";
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
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** 丸いガラスの名札。neonHex の色でふちが光る */
function drawPill(canvas, text, neonHex, dotHex) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const pad = 14;
  ctx.save();
  ctx.shadowColor = neonHex;
  ctx.shadowBlur = 18;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, (H - pad * 2) / 2);
  const grd = ctx.createLinearGradient(0, pad, 0, H - pad);
  grd.addColorStop(0, 'rgba(40,58,120,0.95)');
  grd.addColorStop(0.5, 'rgba(14,22,56,0.95)');
  grd.addColorStop(1, 'rgba(10,16,42,0.95)');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = neonHex;
  ctx.stroke();
  ctx.restore();
  // つや（上半分の白いハイライト）
  ctx.save();
  roundRect(ctx, pad + 10, pad + 6, W - pad * 2 - 20, (H - pad * 2) / 2 - 8, (H - pad * 2) / 4);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fill();
  ctx.restore();
  // 左の光る丸
  if (dotHex) {
    ctx.save();
    ctx.shadowColor = dotHex; ctx.shadowBlur = 16;
    ctx.fillStyle = dotHex;
    ctx.beginPath(); ctx.arc(pad + 34, H / 2, 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = neonHex;
  ctx.shadowBlur = 10;
  fitText(ctx, text, W - 130, 60, 800);
  ctx.fillText(text, W / 2 + (dotHex ? 16 : 0), H / 2 + 3);
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

// ───────────── 門（丸い柱と、反った笠木の鳥居） ─────────────
function drawPlaque(canvas, id) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const acc = ACCENTS[id];
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 6, 6, W - 12, H - 12, 40);
  ctx.fillStyle = '#0B1230';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = acc.a2.neon;
  ctx.shadowColor = acc.a2.neon; ctx.shadowBlur = 16;
  ctx.stroke();
  const scale = t(`scale.${id}`);
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = acc.a2.neon; ctx.shadowBlur = 14;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitText(ctx, scale, W - 50, 84, 800);
  const words = scale.split(' ');
  if (size < 60 && words.length > 1) {   // 長い言葉（Semipermeable membrane）は2行に
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(' '), l2 = words.slice(mid).join(' ');
    const s2 = Math.min(fitText(ctx, l1, W - 50, 64, 800), fitText(ctx, l2, W - 50, 64, 800));
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

  // 漆塗りの本体（柱・貫・笠木）：差し色1
  const body = [];
  const seg = 28;
  for (const sx of [-1, 1]) {
    body.push({ geo: new THREE.CylinderGeometry(R * 0.92, R, H, seg), pos: [sx * half, H / 2, 0] });
  }
  // 貫（ぬき）：丸い横木、両端は丸く
  const nukiY = H * 0.68, nukiR = 0.15, nukiLen = GATE.width + R * 2 + 0.5;
  body.push({ geo: new THREE.CylinderGeometry(nukiR, nukiR, nukiLen, 20), pos: [0, nukiY, 0], rot: [0, 0, Math.PI / 2] });
  for (const sx of [-1, 1]) body.push({ geo: new THREE.SphereGeometry(nukiR, 16, 12), pos: [sx * nukiLen / 2, nukiY, 0] });
  // 笠木（かさぎ）：両端が上に反った丸い木
  const lift = GATE.kasagiLift;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-topLen / 2, H + 0.32 + lift, 0),
    new THREE.Vector3(-topLen / 4, H + 0.36, 0),
    new THREE.Vector3(0, H + 0.34, 0),
    new THREE.Vector3(topLen / 4, H + 0.36, 0),
    new THREE.Vector3(topLen / 2, H + 0.32 + lift, 0),
  ]);
  body.push({ geo: new THREE.TubeGeometry(curve, 40, 0.24, 18, false) });
  for (const sx of [-1, 1]) body.push({ geo: new THREE.SphereGeometry(0.24, 18, 14), pos: [sx * topLen / 2, H + 0.32 + lift, 0] });
  // 島木（しまぎ）：笠木の下の丸い横木
  body.push({ geo: new THREE.CylinderGeometry(0.14, 0.14, topLen - 0.6, 20), pos: [0, H - 0.02, 0], rot: [0, 0, Math.PI / 2] });
  g.add(new THREE.Mesh(merge(body), lacquer(acc.a1.hex)));

  // 根元の丸い台：濃い漆
  const bases = [-1, 1].map((sx) => ({ geo: new THREE.CylinderGeometry(R * 1.55, R * 1.8, 0.32, seg), pos: [sx * half, 0.16, 0] }));
  bases.push(...[-1, 1].map((sx) => ({ geo: new THREE.SphereGeometry(R * 1.55, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2), pos: [sx * half, 0.32, 0], scale: [1, 0.35, 1] })));
  g.add(new THREE.Mesh(merge(bases), lacquer('#141A38', 0.3)));

  // 柱に巻くネオンの輪：差し色2
  const rings = [];
  for (const sx of [-1, 1]) {
    for (const y of [H * 0.32, H * 0.42]) rings.push({ geo: new THREE.TorusGeometry(R * 1.08, 0.045, 10, 40), pos: [sx * half, y, 0], rot: [Math.PI / 2, 0, 0] });
  }
  g.add(new THREE.Mesh(merge(rings), neon(acc.a2.neon)));

  // 光の粒（輪と笠木の両端のにじみ）
  const pts = [];
  for (const sx of [-1, 1]) { pts.push([sx * half, H * 0.37, R * 1.1]); pts.push([sx * half, H * 0.37, -R * 1.1]); }
  g.add(glowPoints(pts, acc.a2.neon, 1.0));
  g.add(glowPoints([[-topLen / 2, H + 0.32 + lift, 0], [topLen / 2, H + 0.32 + lift, 0]], acc.a1.neon, 1.3));

  // 額（潜る大きさ）：表と裏
  const plaqueCanvas = makeCanvas(512, 200);
  drawPlaque(plaqueCanvas, def.id);
  const plaqueTex = makeTexture(plaqueCanvas);
  const plaqueY = (nukiY + H) / 2;
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.98),
      new THREE.MeshBasicMaterial({ map: plaqueTex, transparent: true, toneMapped: false }));
    m.position.set(0, plaqueY, side * 0.12);
    if (side < 0) m.rotation.y = Math.PI;
    g.add(m);
  }

  // 名札
  const labelCanvas = makeCanvas(680, 150);
  const draw = () => drawPill(labelCanvas, t(`world.${def.id}`), acc.a1.neon, acc.a2.neon);
  draw();
  const label = makeSprite(labelCanvas, 5.2, 1.15);
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

  return {
    group: g, hit,
    redraw: () => { draw(); label.tex.needsUpdate = true; drawPlaque(plaqueCanvas, def.id); plaqueTex.needsUpdate = true; },
  };
}

// ───────────── 施設（丸い屋根の建物） ─────────────
/** 角を丸めた箱（押し出しの面取り） */
function roundedBox(w, h, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2 + r, y = r, ww = w - r * 2, hh = h - r * 2;
  s.moveTo(x, y);
  s.lineTo(x + ww, y);
  s.lineTo(x + ww, y + hh);
  s.lineTo(x, y + hh);
  s.lineTo(x, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: d - r * 2, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 5, curveSegments: 8 });
  geo.translate(0, -r + r, -(d - r * 2) / 2);
  return geo;
}

function buildFacility(def) {
  const g = new THREE.Group();
  g.name = `facility-${def.id}`;
  const F = FACILITY;
  const home = ACCENTS.home;

  // 白い真珠のような壁（角は丸い）
  g.add(new THREE.Mesh(roundedBox(F.width, F.wallHeight, F.depth, 0.32), lacquer('#E9EEFF', 0.18)));
  // 丸い屋根（ドーム）：藍の漆
  const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), lacquer(home.a1.hex));
  roof.scale.set(F.width / 2 + 0.35, F.roofHeight, F.depth / 2 + 0.35);
  roof.position.y = F.wallHeight + 0.02;
  g.add(roof);

  // ネオン：屋根の縁の輪（山吹）と、入口ののれん（藍のネオン、丸い3枚）
  const front = F.depth / 2 + 0.33;
  const neonParts = [{ geo: new THREE.TorusGeometry(1, 0.05, 10, 60), pos: [0, F.wallHeight + 0.04, 0], rot: [Math.PI / 2, 0, 0], scale: [F.width / 2 + 0.38, F.depth / 2 + 0.38, 1] }];
  g.add(new THREE.Mesh(merge(neonParts), neon(home.a2.neon)));
  const noren = [];
  for (let i = -1; i <= 1; i++) {
    noren.push({ geo: new THREE.CircleGeometry(0.24, 24), pos: [i * 0.5, 1.15, front], scale: [1, 1.5, 1] });
  }
  noren.push({ geo: new THREE.CylinderGeometry(0.035, 0.035, 1.6, 10), pos: [0, 1.58, front], rot: [0, 0, Math.PI / 2] });
  g.add(new THREE.Mesh(merge(noren), neon(home.a1.neon)));
  g.add(glowPoints([[0, 1.15, front + 0.05], [-F.width / 2, F.wallHeight + 0.05, 0], [F.width / 2, F.wallHeight + 0.05, 0]], home.a1.neon, 1.2));

  // 名札
  const labelCanvas = makeCanvas(560, 140);
  const draw = () => drawPill(labelCanvas, t(`facility.${def.id}`), home.a1.neon, home.a2.neon);
  draw();
  const label = makeSprite(labelCanvas, 3.7, 0.92);
  label.sprite.position.set(0, F.labelHeight, 0);
  g.add(label.sprite);

  const hitH = F.labelHeight + 0.5;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(F.width + 0.8, hitH, F.depth + 0.8), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = hitH / 2;
  hit.userData.facilityId = def.id;
  g.add(hit);

  const a = THREE.MathUtils.degToRad(def.angleDeg);
  g.position.set(Math.sin(a) * F.distanceFromCenter, 0, -Math.cos(a) * F.distanceFromCenter);
  g.lookAt(0, 0, 0);
  return { group: g, hit, redraw: () => { draw(); label.tex.needsUpdate = true; } };
}

// ───────────── 政府庁舎（中央の丸い塔）と、国庫の掲示板 ─────────────
function drawTreasury(canvas, amount) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const home = ACCENTS.home;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.shadowColor = home.a2.neon; ctx.shadowBlur = 22;
  roundRect(ctx, 16, 16, W - 32, H - 32, 46);
  const grd = ctx.createLinearGradient(0, 16, 0, H - 16);
  grd.addColorStop(0, 'rgba(46,38,10,0.95)');
  grd.addColorStop(1, 'rgba(14,12,6,0.95)');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = home.a2.neon;
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFE7A6';
  ctx.font = `800 38px ${fontFamily()}`;
  ctx.fillText(t('gov.treasury'), W / 2, 66);
  ctx.shadowColor = home.a2.neon; ctx.shadowBlur = 18;
  ctx.fillStyle = '#FFFFFF';
  const num = amount === null ? '—' : formatHiyama(amount);
  const size = fitText(ctx, num, W - 160, 86, 800);
  ctx.font = `800 ${size}px 'Nunito', ${fontFamily()}`;
  ctx.fillText(num, W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#FFC83A';
  ctx.font = `700 28px ${fontFamily()}`;
  ctx.fillText(t('money', { amount: '' }).trim(), W / 2, 212);
}

function buildGov() {
  const g = new THREE.Group();
  g.name = 'gov';
  const home = ACCENTS.home;
  // 段になった丸い台
  g.add(new THREE.Mesh(merge([
    { geo: new THREE.CylinderGeometry(GOV.baseRadius, GOV.baseRadius + 0.2, 0.36, 48), pos: [0, 0.18, 0] },
    { geo: new THREE.CylinderGeometry(GOV.baseRadius - 0.45, GOV.baseRadius - 0.3, 0.3, 48), pos: [0, 0.5, 0] },
  ]), lacquer('#141A38', 0.28)));
  // 白い塔と、藍の丸屋根
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(GOV.towerRadius, GOV.towerRadius * 1.08, GOV.towerHeight, 48), lacquer('#E9EEFF', 0.16)));
  g.children[1].position.y = 0.65 + GOV.towerHeight / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(GOV.towerRadius * 1.12, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), lacquer(home.a1.hex));
  dome.position.y = 0.65 + GOV.towerHeight;
  dome.scale.y = 0.85;
  g.add(dome);
  // ネオンの輪（藍と山吹）と、てっぺんの光る玉
  const topY = 0.65 + GOV.towerHeight;
  g.add(new THREE.Mesh(merge([
    { geo: new THREE.TorusGeometry(GOV.towerRadius * 1.13, 0.06, 12, 64), pos: [0, topY + 0.02, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.SphereGeometry(0.2, 20, 14), pos: [0, topY + GOV.towerRadius * 0.95 + 0.25, 0] },
  ]), neon(home.a2.neon)));
  g.add(new THREE.Mesh(merge([
    { geo: new THREE.TorusGeometry(GOV.towerRadius * 1.02, 0.05, 12, 64), pos: [0, 0.65 + GOV.towerHeight * 0.35, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.TorusGeometry(GOV.baseRadius + 0.05, 0.05, 12, 80), pos: [0, 0.36, 0], rot: [Math.PI / 2, 0, 0] },
  ]), neon(home.a1.neon)));
  g.add(glowPoints([[0, topY + GOV.towerRadius * 0.95 + 0.25, 0]], home.a2.neon, 3.2));

  // 宙に浮かぶ国庫の掲示板
  const boardCanvas = makeCanvas(600, 250);
  let amount = null;
  drawTreasury(boardCanvas, amount);
  const board = makeSprite(boardCanvas, 5.2, 2.17);
  board.sprite.position.y = GOV.boardHeight;
  g.add(board.sprite);

  const hitH = GOV.boardHeight + 1;
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(GOV.baseRadius, GOV.baseRadius, hitH, 16), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = hitH / 2;
  hit.userData.facilityId = 'gov';
  g.add(hit);

  return {
    group: g, hit, board: board.sprite,
    setTreasury: (n) => { amount = n; drawTreasury(boardCanvas, amount); board.tex.needsUpdate = true; },
    redraw: () => { drawTreasury(boardCanvas, amount); board.tex.needsUpdate = true; },
  };
}

// ───────────── 地面：夜のつやのある円い広場と、ネオンの同心円 ─────────────
function buildGround() {
  const g = new THREE.Group();
  const home = ACCENTS.home;
  const outer = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.groundSize / 2, 64), new THREE.MeshLambertMaterial({ color: 0x070C22 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.03;
  g.add(outer);

  const disc = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.radius, 96), new THREE.MeshPhysicalMaterial({
    color: 0x0b1230, roughness: 0.55, metalness: 0.2, clearcoat: 0.35, clearcoatRoughness: 0.4,
  }));
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);

  // 同心円（青海波を思わせる丸い光の輪）
  const rings = [];
  for (let r = 1; r <= PLAZA.ringCount; r++) {
    const rr = GOV.baseRadius + 0.5 + (PLAZA.radius - GOV.baseRadius - 0.5) * (r / PLAZA.ringCount);
    rings.push({ geo: new THREE.RingGeometry(rr - 0.025, rr + 0.025, 128), rot: [-Math.PI / 2, 0, 0], pos: [0, 0.01, 0] });
  }
  g.add(new THREE.Mesh(merge(rings), neon(home.a1.neon, 0.35)));
  // 広場の縁：太めのネオンの輪
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PLAZA.radius, 0.07, 10, 160), neon(home.a1.neon));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.04;
  g.add(rim);
  return g;
}

// ───────────── 立ち絵の板（ツカサ） ─────────────
function buildStandee(id, height, onLoad) {
  const w = height * (1024 / 1536);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, toneMapped: false });
  const tex = new THREE.TextureLoader().load(standUrl(id, 'normal'), () => onLoad && onLoad());
  mat.map = tex;
  const geo = new THREE.PlaneGeometry(w, height);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.talkId = id;
  // 足もとの光の輪
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 48), neon(ACCENTS.home.a2.neon, 0.9));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const group = new THREE.Group();
  group.add(mesh, ring);
  return { group, mesh };
}

/** 広場全体を作って返す。 */
export function buildPlaza(scene, { onTextureLoad } = {}) {
  scene.add(buildGround());

  const gov = buildGov();
  scene.add(gov.group);

  const standee = buildStandee(STANDEE.id, STANDEE.height, onTextureLoad);
  const sa = THREE.MathUtils.degToRad(STANDEE.angleDeg);
  standee.group.position.set(Math.sin(sa) * STANDEE.distance, 0.02, -Math.cos(sa) * STANDEE.distance);
  scene.add(standee.group);

  const gates = GATES.map((def) => { const x = buildGate(def); scene.add(x.group); return x; });
  const facilities = FACILITIES.map((def) => { const x = buildFacility(def); scene.add(x.group); return x; });

  return {
    hitTargets: [standee.mesh, ...gates.map((x) => x.hit), ...facilities.map((x) => x.hit), gov.hit],
    redrawLabels: () => [...gates, ...facilities, gov].forEach((x) => x.redraw()),
    setTreasury: gov.setTreasury,
    /** 立ち絵の板をカメラの方へ向ける（縦の軸のまわりだけ回す） */
    faceCamera: (camera) => {
      const p = standee.group.position;
      standee.mesh.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    },
    /** ゆっくりした動き（掲示板がふわふわ浮く） */
    animate: (time) => { gov.board.position.y = GOV.boardHeight + Math.sin(time * 0.0015) * 0.12; },
  };
}

