// home/src/plaza.js
// 白い3D広場と4つの門を作る。Three.js（cdnjs）を読み込んだあとに使う（グローバルの THREE）。
// 見た目：つや消しの白に細い墨の輪郭線。奥は白い霧に溶ける。影は使わない。

import { PLAZA, GATE, GATES } from './config.js';
import { BASE, ACCENTS, hexToInt } from '../../shared/theme.js';
import { t } from '../../shared/i18n.js';

const SUMI = hexToInt(BASE.sumi);
const NEZUMI = hexToInt(BASE.nezumi);

const lineMat = () => new THREE.LineBasicMaterial({ color: SUMI });
const whiteMat = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

/** 面に墨の輪郭線を付けた立体を作る。 */
function outlined(geometry, material = whiteMat()) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 20), lineMat());
  group.add(mesh, edges);
  group.userData.mesh = mesh;
  return group;
}

/** 文字を描いたキャンバスを作る（日本語・英語の切り替えで描き直す）。 */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function fontFamily() {
  return document.documentElement.lang === 'en'
    ? "'Noto Sans', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif"
    : "'Noto Sans JP', 'Noto Sans CJK JP', sans-serif";
}

/** 文字が枠に収まるように大きさを縮める。 */
function fitText(ctx, text, maxWidth, size, weight) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${fontFamily()}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 12);
  return s;
}

/** 門の上に浮かぶ名札（ワールド名）。常にカメラの方を向く。 */
function drawNameLabel(canvas, id) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  const acc = ACCENTS[id];
  ctx.clearRect(0, 0, W, H);
  // 白地に墨の細い枠
  ctx.fillStyle = BASE.white;
  ctx.fillRect(4, 4, W - 8, H - 8);
  ctx.strokeStyle = BASE.sumi;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  // 左端に差し色の細い帯（差し色1・2）
  ctx.fillStyle = acc.a1.hex;
  ctx.fillRect(4, 4, 18, H - 8);
  ctx.fillStyle = acc.a2.hex;
  ctx.fillRect(22, 4, 6, H - 8);
  // ワールド名
  const name = t(`world.${id}`);
  ctx.fillStyle = BASE.sumi;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitText(ctx, name, W - 80, 64, 700);
  ctx.fillText(name, W / 2 + 12, H / 2 + 2);
}

/** 門の額（潜る大きさ）。表と裏の両方に貼る。 */
function drawScalePlaque(canvas, id) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.fillStyle = BASE.white;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = BASE.sumi;
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  const scale = t(`scale.${id}`);
  ctx.fillStyle = BASE.sumi;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitText(ctx, scale, W - 40, 84, 700);
  const words = scale.split(' ');
  // 長い言葉（例 Semipermeable membrane）は2行に分ける
  if (size < 60 && words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    const l1 = words.slice(0, mid).join(' '), l2 = words.slice(mid).join(' ');
    const s2 = Math.min(fitText(ctx, l1, W - 40, 64, 700), fitText(ctx, l2, W - 40, 64, 700));
    ctx.font = `700 ${s2}px ${fontFamily()}`;
    ctx.fillText(l1, W / 2, H / 2 - s2 * 0.55);
    ctx.fillText(l2, W / 2, H / 2 + s2 * 0.6);
  } else {
    ctx.fillText(scale, W / 2, H / 2 + 3);
  }
}

function makeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
  return tex;
}

/** 和風の門を1つ作る（2本の柱、笠木、貫、額）。 */
function buildGate(def) {
  const g = new THREE.Group();
  g.name = `gate-${def.id}`;
  g.userData.gateId = def.id;

  const acc = ACCENTS[def.id];
  const H = GATE.pillarHeight;
  const P = GATE.pillarSize;
  const half = GATE.width / 2 + P / 2;

  // 柱（2本）と、柱に巻く差し色の帯
  for (const sx of [-1, 1]) {
    const pillar = outlined(new THREE.BoxGeometry(P, H, P));
    pillar.position.set(sx * half, H / 2, 0);
    g.add(pillar);

    const band1 = outlined(new THREE.BoxGeometry(P * 1.06, GATE.bandHeight, P * 1.06),
      new THREE.MeshLambertMaterial({ color: hexToInt(acc.a1.hex) }));
    band1.position.set(sx * half, H * 0.42, 0);
    g.add(band1);

    const band2 = new THREE.Mesh(new THREE.BoxGeometry(P * 1.07, GATE.bandHeight * 0.22, P * 1.07),
      new THREE.MeshLambertMaterial({ color: hexToInt(acc.a2.hex) }));
    band2.position.set(sx * half, H * 0.42 - GATE.bandHeight * 0.7, 0);
    g.add(band2);

    // 柱の根元の礎石
    const base = outlined(new THREE.BoxGeometry(P * 1.6, 0.25, P * 1.6));
    base.position.set(sx * half, 0.125, 0);
    g.add(base);
  }

  // 笠木（いちばん上の横木）と、貫（その下の横木）
  const topLen = GATE.width + P * 2 + GATE.beamOverhang * 2;
  const kasagi = outlined(new THREE.BoxGeometry(topLen, 0.34, 0.62));
  kasagi.position.set(0, H + 0.17, 0);
  g.add(kasagi);
  const shimaki = outlined(new THREE.BoxGeometry(topLen - 0.3, 0.2, 0.5));
  shimaki.position.set(0, H - 0.1, 0);
  g.add(shimaki);
  const nuki = outlined(new THREE.BoxGeometry(GATE.width + P * 2 + 0.4, 0.22, 0.3));
  nuki.position.set(0, H * 0.66, 0);
  g.add(nuki);

  // 額（潜る大きさ）を笠木と貫の間に。表と裏の両方
  const plaqueCanvas = makeCanvas(512, 176);
  drawScalePlaque(plaqueCanvas, def.id);
  const plaqueTex = makeTexture(plaqueCanvas);
  const plaqueW = GATE.width - 0.2, plaqueH = 1.2;
  const plaqueY = (H * 0.66 + H - 0.1) / 2;
  for (const side of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(plaqueW, plaqueH),
      new THREE.MeshBasicMaterial({ map: plaqueTex }));
    m.position.set(0, plaqueY, side * 0.17);
    if (side < 0) m.rotation.y = Math.PI;
    g.add(m);
  }
  const plaqueFrame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(plaqueW, plaqueH, 0.3)), lineMat());
  plaqueFrame.position.set(0, plaqueY, 0);
  g.add(plaqueFrame);

  // 門の上に浮かぶ名札
  const labelCanvas = makeCanvas(640, 128);
  drawNameLabel(labelCanvas, def.id);
  const labelTex = makeTexture(labelCanvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true, fog: false }));
  label.scale.set(5.0, 1.0, 1);
  label.position.set(0, GATE.labelHeight, 0);
  label.renderOrder = 10;
  g.add(label);

  // タップの当たり判定（見えない箱。門全体を覆う）
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(topLen, GATE.labelHeight + 0.6, 1.6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, (GATE.labelHeight + 0.6) / 2, 0);
  hit.userData.gateId = def.id;
  g.add(hit);

  // 広場の縁に置き、門の正面を中心に向ける
  const a = THREE.MathUtils.degToRad(def.angleDeg);
  const R = GATE.distanceFromCenter;
  g.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
  g.lookAt(0, 0, 0);

  const redraw = () => {
    drawNameLabel(labelCanvas, def.id); labelTex.needsUpdate = true;
    drawScalePlaque(plaqueCanvas, def.id); plaqueTex.needsUpdate = true;
  };
  return { group: g, hit, redraw };
}

/** 白い石畳の円い広場。 */
function buildGround() {
  const g = new THREE.Group();

  // 広場の外：淡い灰の地面
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(PLAZA.groundSize, PLAZA.groundSize),
    new THREE.MeshBasicMaterial({ color: hexToInt(BASE.fog) }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  g.add(outer);

  // 白い円の広場
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(PLAZA.radius, 96),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);

  // 石畳の目地（同心円と放射状の線）
  const pts = [];
  const seg = 96;
  for (let r = 1; r <= PLAZA.ringCount; r++) {
    const rr = PLAZA.centerRadius + (PLAZA.radius - PLAZA.centerRadius) * (r / PLAZA.ringCount);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      pts.push(Math.cos(a0) * rr, 0.01, Math.sin(a0) * rr, Math.cos(a1) * rr, 0.01, Math.sin(a1) * rr);
    }
  }
  for (let i = 0; i < PLAZA.spokeCount; i++) {
    const a = (i / PLAZA.spokeCount) * Math.PI * 2 + Math.PI / PLAZA.spokeCount;
    const r0 = PLAZA.centerRadius + 0.6;
    pts.push(Math.cos(a) * r0, 0.01, Math.sin(a) * r0, Math.cos(a) * PLAZA.radius, 0.01, Math.sin(a) * PLAZA.radius);
  }
  const joints = new THREE.BufferGeometry();
  joints.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(joints, new THREE.LineBasicMaterial({ color: NEZUMI, transparent: true, opacity: 0.45 })));

  // 広場の縁（墨の線）
  const rim = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 128 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * PLAZA.radius, 0.015, Math.sin(a) * PLAZA.radius);
      })),
    lineMat());
  g.add(rim);

  // 中央の台座（v0.4 で政府庁舎を建てる場所）
  const center = outlined(new THREE.CylinderGeometry(PLAZA.centerRadius, PLAZA.centerRadius + 0.15, PLAZA.centerHeight, 48));
  center.position.y = PLAZA.centerHeight / 2;
  g.add(center);

  return g;
}

/** 広場全体を作って返す。 */
export function buildPlaza(scene) {
  scene.add(buildGround());
  const gates = GATES.map((def) => {
    const gate = buildGate(def);
    scene.add(gate.group);
    return gate;
  });
  return {
    hitTargets: gates.map((g) => g.hit),
    redrawLabels: () => gates.forEach((g) => g.redraw()),
  };
}
