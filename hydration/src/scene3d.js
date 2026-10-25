// hydration/src/scene3d.js
// Three.js の3D空間（ハイドレーション・ビート仕様書 2章・3章・8章、全体の仕様書 3章）。
//   ・画面の下寄りにプレイヤーの水分子（折れ線形。O が1つ、H が2つ）。
//   ・カメラは高い所から道を見下ろす（v0.2：手前の粒子が奥の粒子を隠さないように）。
//   ・溶質は、奥の霧の中から1本の道に沿って手前に飛んでくる。手前に判定リング。
//   ・溶質ごとに分子の模型（models.js）。補助輪の段階で、色・記号・文字が変わる。
//   ・正しく叩くと、溶質の種類に合わせた水和の演出：
//       イオン：水分子6個が正しい向きで取り囲む（Na⁺ なら O が内向き）
//       -OH をもつ分子・極性分子・糖：-OH のところに水分子3個が水素結合する
//       HCl：H に水分子が付き「H₃O⁺ + Cl⁻」の文字が浮かぶ
//   ・見送るノーツ（無極性分子・溶けにくい結晶）は、押さなければ判定リングを通り抜けて手前へ消える。
//   ・背景の奥に NaCl の結晶。正しく水和させるたびにイオンが1個ずつはがれる。
// 色：δ−（O）は朱、δ+（H）は群青。色を見分けにくい人のために、必ず「−」「+」の記号を添える。
// 軽く保つため、分子は同時に RENDER.maxMolecules 個まで、影は使わない。

import { NOTE, RENDER, CRYSTAL } from './config.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { laneTexture, labelTexture } from '../../shared/patterns.js';
import { t } from '../../shared/i18n.js';
import { createModel, frameColor, MINUS, PLUS } from './models.js';

const RING_Y = 0.95;    // ノーツが飛ぶ高さ
const WATER_POS = new THREE.Vector3(0, 0.45, 0.95);

const FONT_EN = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif";
const FONT_JA = "'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif";

// ───────────── 小さな部品 ─────────────
let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
function glowSprite(hex, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: hexToInt(hex), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.set(size, size, 1);
  return s;
}
function textSprite(draw, w, h, sx, sy) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(draw, w, h), transparent: true, depthTest: false, toneMapped: false }));
  s.scale.set(sx, sy, 1);
  s.renderOrder = 6;
  return s;
}
function signDraw(sign, hex) {
  return (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.shadowColor = hex; g.shadowBlur = 10;
    g.font = `800 ${h * 0.9}px ${FONT_EN}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sign, w / 2, h / 2 + h * 0.04);
  };
}
const ball = (r) => new THREE.SphereGeometry(r, 24, 16);
function shiny(hex, emissive = 0.25, glowHex = hex) {
  return new THREE.MeshStandardMaterial({ color: hexToInt(hex), roughness: 0.4, metalness: 0.1, emissive: hexToInt(glowHex), emissiveIntensity: emissive });
}
/** 文字が幅に収まるように、字の大きさを下げて書く */
function fitText(g, text, x, y, maxW, size, weight, family) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (s > 10 && g.measureText(text).width > maxW) { s -= 1; g.font = `${weight} ${s}px ${family}`; }
  g.fillText(text, x, y);
}

// ───────────── 水分子（折れ線形。H-O-H の角度は約104.5°） ─────────────
const HOH = THREE.MathUtils.degToRad(104.5);
/** プレイヤーの水分子。向き：O から見て、2つの H は +y の側に開く（O は −y の側） */
function buildWater(scale = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ball(0.42 * scale), shiny(MINUS.hex, 0.5, MINUS.neon)));
  const bond = 0.55 * scale;
  for (const s of [-1, 1]) {
    const a = s * HOH / 2;
    const h = new THREE.Mesh(ball(0.26 * scale), shiny(PLUS.hex, 0.5, PLUS.neon));
    h.position.set(Math.sin(a) * bond, Math.cos(a) * bond, 0);
    g.add(h);
    const sp = textSprite(signDraw('+', PLUS.neon), 128, 128, 0.34 * scale, 0.34 * scale);
    sp.position.set(Math.sin(a) * bond * 1.55, Math.cos(a) * bond * 1.55, 0.1);
    g.add(sp);
  }
  const sm = textSprite(signDraw('−', MINUS.neon), 128, 128, 0.4 * scale, 0.4 * scale);
  sm.position.set(0, -0.62 * scale, 0.1);
  g.add(sm);
  return g;
}

/** 水和に使う小さな水分子（1つの形にまとめて軽くする）。O から +y 方向に H が開く */
let smallWaterGeo = null;
function smallWaterGeometry() {
  if (smallWaterGeo) return smallWaterGeo;
  const parts = [];
  const add = (r, x, y, color) => {
    const geo = new THREE.SphereGeometry(r, 12, 8).toNonIndexed();
    geo.translate(x, y, 0);
    const c = new THREE.Color(color);
    const cols = [];
    for (let i = 0; i < geo.attributes.position.count; i++) cols.push(c.r, c.g, c.b);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    parts.push(geo);
  };
  add(0.2, 0, 0, MINUS.neon);
  for (const s of [-1, 1]) { const a = s * HOH / 2; add(0.13, Math.sin(a) * 0.27, Math.cos(a) * 0.27, PLUS.neon); }
  const pos = [], nor = [], col = [];
  for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); col.push(...p.attributes.color.array); }
  smallWaterGeo = new THREE.BufferGeometry();
  smallWaterGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  smallWaterGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  smallWaterGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return smallWaterGeo;
}

// ───────────── 溶質の札（化学式と、補助輪の段階1では種類の文字） ─────────────
function drawNoteLabel(g, w, h, def, assist) {
  const hex = frameColor(def, assist);
  const twoSide = assist < 3 && hex === '#ffffff';
  const showKind = assist <= 1;
  g.clearRect(0, 0, w, h);
  const bh = showKind ? h - 12 : h * 0.62;
  const top = showKind ? 6 : (h - bh) / 2;
  const cut = 12;
  g.beginPath();
  g.moveTo(6 + cut, top); g.lineTo(w - 6, top); g.lineTo(w - 6, top + bh - cut); g.lineTo(w - 6 - cut, top + bh); g.lineTo(6, top + bh); g.lineTo(6, top + cut); g.closePath();
  g.fillStyle = 'rgba(6,10,28,0.8)';
  g.fill();
  g.lineWidth = 3;
  if (twoSide) {
    // 両方の色を使う分子（-OH をもつ分子・極性分子・HCl）：枠の左が朱（O）、右が群青（H）
    const grd = g.createLinearGradient(6, 0, w - 6, 0);
    grd.addColorStop(0, MINUS.neon); grd.addColorStop(0.45, MINUS.neon); grd.addColorStop(0.55, PLUS.neon); grd.addColorStop(1, PLUS.neon);
    g.strokeStyle = grd; g.shadowColor = '#ffffff';
  } else {
    g.strokeStyle = hex; g.shadowColor = hex;
  }
  g.shadowBlur = 10; g.stroke();
  g.shadowBlur = 8; g.shadowColor = '#000';
  g.fillStyle = '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (showKind) {
    fitText(g, def.formula, w / 2, top + bh * 0.36, w - 28, Math.round(h * 0.42), 700, FONT_EN);
    g.fillStyle = twoSide ? '#ffffff' : hex;
    const kind = def.nameKey ? `${t(def.nameKey)}・${t(`hb.kind.${def.group}`)}` : t(`hb.kind.${def.group}`);
    fitText(g, kind, w / 2, top + bh * 0.77, w - 24, Math.round(h * 0.22), 700, FONT_JA);
  } else {
    fitText(g, def.formula, w / 2, h / 2 + 1, w - 28, Math.round(h * 0.44), 700, FONT_EN);
  }
}

// ───────────── 3D空間 ─────────────
export function createScene(canvas, { noteDefs }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070b26, RENDER.fogNear, RENDER.fogFar);
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0a0f25, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(3, 8, 6);
  scene.add(key);
  const rim = new THREE.PointLight(hexToInt(MINUS.neon), 1.2, 14, 1.5);
  rim.position.set(-3, 2, 1);
  scene.add(rim);
  const rim2 = new THREE.PointLight(hexToInt(PLUS.neon), 1.2, 14, 1.5);
  rim2.position.set(3, 2, 1);
  scene.add(rim2);

  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 140);

  // ── 道：和柄の床と、左右の光る縁（左は朱、右は群青。左右のボタンと同じ色） ──
  const laneTex = laneTexture(MINUS.neon, PLUS.neon);
  const laneMat = new THREE.MeshStandardMaterial({ map: laneTex, emissiveMap: laneTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.2, color: 0x9aa6ff });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 70), laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0, -29);
  scene.add(lane);
  const railMat = [MINUS.neon, PLUS.neon].map((h) => new THREE.MeshBasicMaterial({ color: hexToInt(h), toneMapped: false }));
  [-1.62, 1.62].forEach((x, i) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 70), railMat[i]);
    r.position.set(x, 0.03, -29);
    scene.add(r);
  });
  // 道の上の拍の線（1拍ごとに床に引かれた線。粒子の間隔の目安になる）
  const beatLineMat = new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false });
  const beatLines = Array.from({ length: 16 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.05), beatLineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    scene.add(m);
    return m;
  });

  // ── 道の上の門（六角の枠）：奥から手前へ流れて、速さを感じさせる ──
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.4, toneMapped: false });
  const gateGeo = new THREE.TorusGeometry(2.1, 0.03, 4, 6);
  const gates = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(gateGeo, gateMat);
    m.rotation.z = Math.PI / 6;
    m.position.set(0, RING_Y, -i * 7);
    scene.add(m);
    gates.push(m);
  }

  // ── 判定リング（床に寝かせた輪と、立てた細い輪） ──
  const ring = new THREE.Group();
  ring.position.set(0, RING_Y, NOTE.judgeZ);
  const ringMain = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const ringIn = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.018, 6, 6), new THREE.MeshBasicMaterial({ color: hexToInt(ACCENTS.home.a2.neon), toneMapped: false }));
  ring.add(ringMain, ringIn, glowSprite('#8fb4ff', 2.6));
  scene.add(ring);
  const floorRing = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, toneMapped: false }));
  floorRing.rotation.x = -Math.PI / 2;
  floorRing.position.set(0, 0.025, NOTE.judgeZ);
  scene.add(floorRing);

  // 正しく叩いたときに広がる輪（使い回す）
  const bursts = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.82, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(ring.position);
    m.visible = false;
    scene.add(m);
    return { mesh: m, start: -1 };
  });

  // ── プレイヤーの水分子 ──
  const water = buildWater(0.56);
  const waterPivot = new THREE.Group();
  waterPivot.position.copy(WATER_POS);
  waterPivot.add(water);
  scene.add(waterPivot);
  // 向き：idle では H を上に開いて O を下。O を向ける＝O を奥（−z）に、H を向ける＝H を奥に
  // 同時押し（OH）では横に寝かせて、O と H の両方を奥へ向ける
  const ROT = {
    idle: new THREE.Euler(-0.35, 0, 0),
    O: new THREE.Euler(Math.PI / 2, 0, 0),
    H: new THREE.Euler(-Math.PI / 2, 0, 0),
    OH: new THREE.Euler(0, 0, Math.PI / 2),
  };
  let waterTarget = ROT.idle, waterHold = 0, shake = 0;
  let lastPress = { input: null, at: -9 };
  const qTmp = new THREE.Quaternion();

  // ── 背景の NaCl の結晶（3×3×3、Na⁺ は小さい群青、Cl⁻ は大きい朱） ──
  const n = CRYSTAL.size, count = n * n * n;
  const crystal = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, emissive: 0x222244, emissiveIntensity: 0.6 }), count);
  const crystalInfo = [];
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  let k = 0;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) {
    const isNa = (x + y + z) % 2 === 0;
    const p = new THREE.Vector3((x - 1) * CRYSTAL.spacing, (y - 1) * CRYSTAL.spacing, (z - 1) * CRYSTAL.spacing);
    const r = isNa ? 0.32 : 0.48;
    crystalInfo.push({ p, r, isNa, leaving: -1 });
    mtx.compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r));
    crystal.setMatrixAt(k, mtx);
    crystal.setColorAt(k, col.set(isNa ? PLUS.neon : MINUS.neon));
    k++;
  }
  const crystalGroup = new THREE.Group();
  crystalGroup.position.set(...CRYSTAL.position);
  crystalGroup.add(crystal, glowSprite('#7c9bff', 7));
  scene.add(crystalGroup);
  const peelOrder = crystalInfo.map((c, i) => i).sort((a, b) => crystalInfo[b].p.length() - crystalInfo[a].p.length());
  let peeled = 0;

  // ── 流れる光の粒（速さを感じる） ──
  const PCOUNT = 140;
  const pPos = new Float32Array(PCOUNT * 3);
  for (let i = 0; i < PCOUNT; i++) pPos.set([(Math.random() < 0.5 ? -1 : 1) * (2.4 + Math.random() * 10), Math.random() * 10 - 1, -Math.random() * 60], i * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ map: glowTexture(), color: 0x9fbcff, size: 0.26, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));

  // ── 補助輪の段階・飛んでくる秒数（曲ごとに setPlay で決める） ──
  let assist = 1;
  let approach = NOTE.approachSec;

  // ── 分子の模型（溶質の種類ごとに使い回す） ──
  const modelPool = new Map();
  function takeModel(id) {
    const list = modelPool.get(id) || [];
    const m = list.pop() || createModel(noteDefs[id], assist);
    m.userData.setAssist(assist);
    m.visible = true;
    m.rotation.set(0, 0, 0);
    m.position.set(0, 0, 0);
    m.scale.setScalar(1);
    return m;
  }
  function giveModel(m) {
    if (!m) return;
    if (m.parent) m.parent.remove(m);
    const id = m.userData.noteId;
    if (!modelPool.has(id)) modelPool.set(id, []);
    modelPool.get(id).push(m);
  }

  // ── 札（化学式など） ──
  const labelCache = {};
  function labelFor(id) {
    const keyL = `${id}|${assist}`;
    if (!labelCache[keyL]) labelCache[keyL] = labelTexture((g, w, h) => drawNoteLabel(g, w, h, noteDefs[id], assist), 256, 128);
    return labelCache[keyL];
  }

  // ── 溶質ノーツ（使い回す入れ物） ──
  const SLOTS = Math.min(28, RENDER.maxMolecules);
  const slots = Array.from({ length: SLOTS }, () => {
    const g = new THREE.Group();
    const holder = new THREE.Group();   // 模型を入れて回す
    const glow = glowSprite('#ffffff', 1.6);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: null, transparent: true, depthTest: false, toneMapped: false }));
    label.renderOrder = 6;
    g.add(holder, glow, label);
    g.visible = false;
    scene.add(g);
    return { g, holder, glow, label, model: null, note: null };
  });

  function assign(slot, note) {
    const def = noteDefs[note.noteId];
    slot.note = note;
    note.slot = slot;
    slot.model = takeModel(def.id);
    slot.holder.add(slot.model);
    slot.holder.rotation.set(0, 0, 0);
    const big = def.model === 'glucose' || def.model === 'sucrose' || def.model === 'hexane' || def.model === 'naphthalene';
    slot.glow.material.color.set(frameColor(def, assist));
    slot.glow.material.opacity = def.answer === 'PASS' ? 0.35 : 0.8;
    slot.glow.scale.setScalar((big ? 2.4 : 1.7) * def.r * 1.6);
    slot.label.material.map = labelFor(def.id);
    const lw = (assist <= 1 ? 1.35 : 1.1) * RENDER.labelScale / RENDER.noteScale;
    slot.label.scale.set(lw, lw * 0.5, 1);
    slot.label.position.set(0, def.r + lw * 0.32, 0);
    // 糖の2つ目からの -OH は札を出さない（連続していると分かれば十分）
    slot.label.visible = def.group !== 'sugarOH';
    slot.g.scale.setScalar(RENDER.noteScale);
    slot.holder.scale.setScalar(modelScale(def));
    slot.g.visible = true;
  }
  // 原子が小さい分子（エタノールなど）は、少し大きく見せる
  function modelScale(def) { return def.model === 'ion' || def.model === 'crystal' ? 1 : 1.3; }
  function release(slot) {
    if (slot.note) slot.note.slot = null;
    slot.note = null;
    giveModel(slot.model);
    slot.model = null;
    slot.g.visible = false;
  }

  // ── 水和の演出 ──
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: 0x222244, emissiveIntensity: 0.5, transparent: true });
  const up = new THREE.Vector3(0, 1, 0);
  const SIX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
  const THREE_DIRS = [[0.2, 1, 0.3], [0.95, -0.2, 0.35], [-0.6, -0.5, 0.65]].map((d) => new THREE.Vector3(...d).normalize());
  const hclTex = labelTexture((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowBlur = 12;
    g.font = `700 ${h * 0.5}px ${FONT_EN}`;
    g.shadowColor = PLUS.neon; g.fillStyle = '#dfe6ff';
    g.fillText('H₃O⁺', w * 0.24, h / 2);
    g.shadowColor = '#fff'; g.fillStyle = '#fff';
    g.fillText('+', w * 0.5, h / 2);
    g.shadowColor = MINUS.neon; g.fillStyle = '#ffd2b5';
    g.fillText('Cl⁻', w * 0.74, h / 2);
  }, 256, 64);
  const shells = Array.from({ length: 4 }, () => {
    const g = new THREE.Group();
    const holder = new THREE.Group();
    g.add(holder);
    const ws = SIX.map(() => { const m = new THREE.Mesh(smallWaterGeometry(), waterMat); m.visible = false; g.add(m); return m; });
    const text = new THREE.Sprite(new THREE.SpriteMaterial({ map: hclTex, transparent: true, depthTest: false, toneMapped: false }));
    text.scale.set(3.4, 0.85, 1);
    text.position.set(0, 1.2, 0);
    text.renderOrder = 7;
    text.visible = false;
    g.add(text);
    g.visible = false;
    scene.add(g);
    return { g, holder, ws, text, model: null, start: -1, drift: new THREE.Vector3() };
  });
  let shellNext = 0;

  /** 水分子を、溶質の場所 at から dir の方向に置く。inward が 'O' なら O を溶質に向ける */
  function placeWater(m, at, dir, dist, inward) {
    m.visible = true;
    m.position.copy(dir).multiplyScalar(dist + 1.2).add(at);   // 遠くから寄ってくる
    m.userData.target = dir.clone().multiplyScalar(dist).add(at);
    // 小さな水分子は O から +y の方向に H が開く。O を内向き＝+y を外向きに
    const outward = inward === 'O' ? dir : dir.clone().negate();
    m.quaternion.setFromUnitVectors(up, outward);
  }

  function startShell(def, now) {
    const s = shells[shellNext]; shellNext = (shellNext + 1) % shells.length;
    giveModel(s.model);
    s.model = takeModel(def.id);
    s.holder.add(s.model);
    s.holder.scale.setScalar(1);
    s.ws.forEach((m) => { m.visible = false; });
    s.text.visible = false;
    const site = s.model.userData.site;
    const g = def.group;
    if (g === 'cation' || g === 'anion' || g === 'hclCl') {
      const dist = def.r + 0.4;
      s.ws.forEach((m, i) => placeWater(m, new THREE.Vector3(), SIX[i], dist, g === 'cation' ? 'O' : 'H'));
    } else if (g === 'hcl') {
      // H に水分子の O が付いて H₃O⁺ に。Cl⁻ はあとから来るノーツ
      placeWater(s.ws[0], site, new THREE.Vector3(0, 0, 1), 0.36, 'O');
      s.text.visible = true;
    } else {
      // -OH のところに、水分子が水素結合（O 側にも H 側にも付く）
      THREE_DIRS.forEach((d, i) => placeWater(s.ws[i], site, d, 0.45, i === 0 ? 'H' : 'O'));
    }
    s.g.position.set(0, RING_Y, NOTE.judgeZ);
    s.g.rotation.set(0, 0, 0);
    s.g.scale.setScalar(RENDER.noteScale);
    s.drift.set((Math.random() < 0.5 ? -1 : 1) * (2.0 + Math.random()), 1.3 + Math.random(), -1.5);
    s.start = now;
    s.g.visible = true;
  }

  // ── 見送り成功のしるし（通り抜けたときに道の横で光る） ──
  const passMarks = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xc9d1de, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(ring.position);
    m.rotation.z = Math.PI / 6;
    m.visible = false;
    scene.add(m);
    return { mesh: m, start: -1 };
  });

  // ── 画面の大きさ ──
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, RENDER.cameraY, RENDER.cameraZ);
    camera.lookAt(0, RENDER.lookAtY, RENDER.lookAtZ);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ── 拍に合わせた動き ──
  let timing = { t0: 0, bpm: 90 };
  let comboLevel = 0;
  let lastFrame = 0;

  return {
    setTiming(t0, bpm) { timing = { t0, bpm }; },
    setComboLevel(lv) { comboLevel = lv; },
    /** 曲ごとの設定：飛んでくる秒数と補助輪の段階 */
    setPlay({ approachSec, assist: a }) {
      approach = approachSec || NOTE.approachSec;
      if (a && a !== assist) { assist = a; this.redrawLabels(); }
    },
    redrawLabels() {
      for (const k2 of Object.keys(labelCache)) { labelCache[k2].dispose(); delete labelCache[k2]; }
      slots.forEach((s) => { if (s.note) s.label.material.map = labelFor(s.note.noteId); });
    },

    /** 左右のボタンを押したとき：水分子をその向きに回す。左右がほぼ同時なら横に寝かせる */
    press(input, now = 0) {
      const both = lastPress.input && lastPress.input !== input && now - lastPress.at < 0.12;
      waterTarget = both ? ROT.OH : (ROT[input] || ROT.idle);
      waterHold = both ? 0.26 : 0.18;
      lastPress = { input, at: now };
    },
    /** 正しく水和したとき */
    hit(note, judgement, now, peel = true) {
      const def = noteDefs[note.noteId];
      if (note.slot) release(note.slot);
      startShell(def, now);
      const b = bursts.find((x) => x.start < 0) || bursts[0];
      b.start = now; b.mesh.visible = true;
      b.mesh.material.color.set(judgement === 'perfect' ? '#ffffff' : frameColor(def, assist));
      if (peel && peeled < peelOrder.length) { crystalInfo[peelOrder[peeled]].leaving = now; peeled += 1; }
    },
    /** 見送り成功：模型はそのまま手前へ通り抜ける */
    pass(note, now) {
      const p = passMarks.find((x) => x.start < 0) || passMarks[0];
      p.start = now; p.mesh.visible = true;
    },
    /** 向きを間違えた・誤水和：溶質が水分子をはじき返す */
    wrong(note, now) { note.bounceAt = now; shake = 0.35; },
    crystalCount: count,
    /** 新しく曲を始めるとき：ノーツ・演出・結晶を元に戻す */
    reset() {
      slots.forEach(release);
      shells.forEach((sh) => { sh.start = -1; sh.g.visible = false; giveModel(sh.model); sh.model = null; });
      bursts.forEach((b) => { b.start = -1; b.mesh.visible = false; });
      passMarks.forEach((b) => { b.start = -1; b.mesh.visible = false; });
      crystalInfo.forEach((c, i) => {
        c.leaving = -1;
        mtx.compose(c.p, new THREE.Quaternion(), new THREE.Vector3(c.r, c.r, c.r));
        crystal.setMatrixAt(i, mtx);
      });
      crystal.instanceMatrix.needsUpdate = true;
      peeled = 0;
      shake = 0;
      lastFrame = 0;
    },

    /** 毎回の描き直し。now は「聞こえている音の時刻」から曲の始まりを引いた秒 */
    frame(notes, cursor, now) {
      const dt = Math.min(0.1, Math.max(0, now - lastFrame));
      lastFrame = now;
      const span = NOTE.judgeZ - NOTE.spawnZ;
      const speed = span / approach;
      // 新しく見えてきたノーツに、使い回しの入れ物を割り当てる（見送り中のノーツは cursor より前にもある）
      for (let i = cursor; i < notes.length; i++) {
        const nt = notes[i];
        if (nt.t - approach > now) break;
        if (!nt.slot && nt.state === 'pending') {
          const free = slots.find((s) => !s.note);
          if (free) assign(free, nt);
        }
      }
      for (const s of slots) {
        const nt = s.note;
        if (!nt) continue;
        const def = noteDefs[nt.noteId];
        let z = NOTE.judgeZ - ((nt.t - now) / approach) * span;
        if (nt.state === 'wrong') {
          const kb = (now - nt.bounceAt) / 0.45;
          if (kb >= 1) { release(s); continue; }
          s.g.position.set(Math.sin(kb * 9) * 0.25, RING_Y + kb * 1.2, NOTE.judgeZ - kb * 6);
          s.g.scale.setScalar(RENDER.noteScale * (1 - kb * 0.6));
          continue;
        }
        const flying = nt.state === 'miss' || (nt.state === 'hit' && def.answer === 'PASS');
        if (nt.state === 'hit' && !flying) { release(s); continue; }
        if (flying && z > NOTE.passZ) { release(s); continue; }
        s.g.position.set(0, RING_Y + Math.sin((nt.t - now) * 3) * 0.04, z);
        s.holder.rotation.y = now * 1.2 + (nt.chainIdx || 0) * 0.6;
        s.holder.rotation.x = Math.sin(now * 0.9 + nt.t) * 0.25;
        // 判定リングを過ぎたノーツの札は消す（手前で大きく写って、ボタンにかぶらないように）
        if (z > NOTE.judgeZ + 0.3) s.label.visible = false;
        if (flying) {
          const kf = Math.max(0, z / NOTE.passZ);
          s.g.scale.setScalar(RENDER.noteScale * Math.max(0.25, 1 - kf * 0.7));
          s.label.visible = false;
        }
      }
      // 水和の殻
      for (const sh of shells) {
        if (sh.start < 0) continue;
        const k4 = now - sh.start;
        if (k4 > 1.7) { sh.start = -1; sh.g.visible = false; giveModel(sh.model); sh.model = null; continue; }
        const gather = Math.min(1, k4 / 0.18);
        const fade = Math.max(0, 1 - Math.max(0, k4 - 1.1) / 0.6);
        sh.ws.forEach((m) => { if (m.visible) m.position.lerp(m.userData.target, gather); });
        waterMat.opacity = 1;
        sh.text.material.opacity = fade;
        const drift = Math.max(0, k4 - 0.25);
        sh.g.position.set(sh.drift.x * drift, RING_Y + sh.drift.y * drift * 0.6, NOTE.judgeZ + sh.drift.z * drift);
        sh.holder.rotation.set(drift * 0.8, drift * 1.4, 0);
        sh.g.scale.setScalar(RENDER.noteScale * (k4 > 1.1 ? fade : 1));
      }
      // 広がる輪
      for (const b of bursts) {
        if (b.start < 0) continue;
        const k5 = (now - b.start) / 0.45;
        if (k5 >= 1) { b.start = -1; b.mesh.visible = false; continue; }
        b.mesh.scale.setScalar(1 + k5 * 1.6);
        b.mesh.material.opacity = 1 - k5;
      }
      for (const p of passMarks) {
        if (p.start < 0) continue;
        const kp = (now - p.start) / 0.4;
        if (kp >= 1) { p.start = -1; p.mesh.visible = false; continue; }
        p.mesh.scale.setScalar(1 + kp * 0.5);
        p.mesh.material.opacity = 0.7 * (1 - kp);
      }
      // 拍の脈動（判定リングと門）
      const beat = 60 / timing.bpm;
      const phase = ((now % beat) + beat) % beat / beat;
      const pulse = Math.exp(-phase * 7);
      ring.scale.setScalar(1 + pulse * 0.07);
      ringIn.rotation.z = now * 0.8;
      floorRing.material.opacity = 0.55 + pulse * 0.4;
      gates.forEach((m, i) => {
        const z = -((i * 7 - now * speed) % 49 + 49) % 49;
        m.position.z = z + 3;
        m.material.opacity = 0.2 + pulse * 0.3 + comboLevel * 0.07;
      });
      // 拍の線：1拍ぶんの距離ごとに、ノーツと同じ速さで流れる
      const beatDist = beat * speed;
      const firstBeat = Math.ceil(now / beat);
      beatLines.forEach((m, i) => {
        const tb = (firstBeat + i) * beat;
        const z = NOTE.judgeZ - ((tb - now) / approach) * span;
        m.visible = z > NOTE.spawnZ && beatDist > 0.5;
        m.position.z = z;
      });
      laneTex.offset.y = (now * speed / 8) % 1;
      laneMat.emissiveIntensity = 0.45 + pulse * 0.25 + comboLevel * 0.12;
      // 光の粒
      const pp = pGeo.attributes.position.array;
      for (let i = 0; i < PCOUNT; i++) {
        pp[i * 3 + 2] += speed * dt * 0.6;
        if (pp[i * 3 + 2] > 6) pp[i * 3 + 2] = -60;
      }
      pGeo.attributes.position.needsUpdate = true;
      // 結晶：ゆっくり回り、はがれたイオンは外へ飛んで消える
      crystalGroup.rotation.y = now * 0.15;
      crystalGroup.rotation.x = 0.4;
      crystalInfo.forEach((c, i) => {
        if (c.leaving < 0) return;
        const k6 = (now - c.leaving) / 0.8;
        const out = c.p.clone().normalize().multiplyScalar(k6 * 3);
        const r = k6 >= 1 ? 0 : c.r * (1 - k6);
        mtx.compose(c.p.clone().add(out), new THREE.Quaternion(), new THREE.Vector3(r, r, r));
        crystal.setMatrixAt(i, mtx);
        if (k6 >= 1) c.leaving = -2;
      });
      crystal.instanceMatrix.needsUpdate = true;
      // 水分子の向き（押した向きに素早く回り、しばらくしたら元に戻る）
      waterHold -= dt;
      if (waterHold <= 0) waterTarget = ROT.idle;
      qTmp.setFromEuler(waterTarget);
      water.quaternion.slerp(qTmp, Math.min(1, dt * 22));
      shake = Math.max(0, shake - dt);
      waterPivot.position.set(WATER_POS.x + Math.sin(now * 80) * shake * 0.25, WATER_POS.y + Math.sin(now * 2) * 0.05, WATER_POS.z);
      renderer.render(scene, camera);
    },
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
