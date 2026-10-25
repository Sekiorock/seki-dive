// hydration/src/scene3d.js
// Three.js の3D空間（ハイドレーション・ビート仕様書 2章・8章、全体の仕様書 3章）。
//   ・画面の下寄りにプレイヤーの水分子（折れ線形。O が1つ、H が2つ）。カメラは少し後ろから奥を見る。
//   ・溶質は、奥の霧の中から1本の道に沿って手前に飛んでくる。手前に判定リング。
//   ・背景の奥に NaCl の結晶。正しく水和させるたびにイオンが1個ずつはがれる。
//   ・正しく叩くと、水分子が6個、正しい向きで溶質を取り囲み（Na⁺ なら O が内向き）、水和イオンになって漂っていく。
// 色：δ−（O）は朱、δ+（H）は群青。色を見分けにくい人のために、必ず「−」「+」の記号を添える。
// 軽く保つため、分子は同時に40個まで、影は使わない。

import { NOTE, RENDER, CRYSTAL } from './config.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { laneTexture, labelTexture } from '../../shared/patterns.js';
import { t } from '../../shared/i18n.js';

const ACC = ACCENTS.hydration;
const MINUS = ACC.a1;   // 朱：δ−（O、陰イオン）
const PLUS = ACC.a2;    // 群青：δ+（H、陽イオン）
const RING_Y = 1.35;    // ノーツが飛ぶ高さ
const WATER_POS = new THREE.Vector3(0, 0.42, 1.25);

function fontFamily() {
  return "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif";
}

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
/** 球の上に貼る、電荷の記号（+ または −）の札 */
function signSprite(sign, hex, size) {
  const tex = labelTexture((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.shadowColor = hex; g.shadowBlur = 10;
    g.font = `800 ${h * 0.9}px ${fontFamily()}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sign, w / 2, h / 2 + h * 0.04);
  }, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  s.scale.set(size, size, 1);
  s.renderOrder = 5;
  return s;
}
const ball = (r) => new THREE.SphereGeometry(r, 24, 16);
function shiny(hex, emissive = 0.25, glowHex = hex) {
  return new THREE.MeshStandardMaterial({ color: hexToInt(hex), roughness: 0.4, metalness: 0.1, emissive: hexToInt(glowHex), emissiveIntensity: emissive });
}

// ───────────── 水分子（折れ線形。H-O-H の角度は約104.5°） ─────────────
const HOH = THREE.MathUtils.degToRad(104.5);
/** 水分子を作る。向き：O から見て、2つの H は +y の側に開く（O は −y の側） */
function buildWater(scale = 1, withSigns = true) {
  const g = new THREE.Group();
  const o = new THREE.Mesh(ball(0.42 * scale), shiny(MINUS.hex, 0.5, MINUS.neon));
  g.add(o);
  const bond = 0.55 * scale;
  for (const s of [-1, 1]) {
    const a = s * HOH / 2;
    const h = new THREE.Mesh(ball(0.26 * scale), shiny(PLUS.hex, 0.5, PLUS.neon));
    h.position.set(Math.sin(a) * bond, Math.cos(a) * bond, 0);
    g.add(h);
    if (withSigns) {
      const sp = signSprite('+', PLUS.neon, 0.34 * scale);
      sp.position.set(Math.sin(a) * bond * 1.55, Math.cos(a) * bond * 1.55, 0.1);
      g.add(sp);
    }
  }
  if (withSigns) {
    const sm = signSprite('−', MINUS.neon, 0.4 * scale);
    sm.position.set(0, -0.62 * scale, 0.1);
    g.add(sm);
  }
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

// ───────────── 溶質の札（化学式と、補助輪の文字「陽イオン」など） ─────────────
function drawNoteLabel(g, w, h, def) {
  const hex = def.charge === 'plus' ? PLUS.neon : MINUS.neon;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(6,10,28,0.78)';
  const cut = 14;
  g.beginPath();
  g.moveTo(cut, 6); g.lineTo(w - 6, 6); g.lineTo(w - 6, h - cut); g.lineTo(w - cut, h - 6); g.lineTo(6, h - 6); g.lineTo(6, cut); g.closePath();
  g.fill();
  g.lineWidth = 3; g.strokeStyle = hex; g.shadowColor = hex; g.shadowBlur = 10; g.stroke();
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${h * 0.44}px ${fontFamily()}`;
  g.fillText(def.formula, w / 2, h * 0.38);
  g.fillStyle = hex;
  g.font = `700 ${h * 0.22}px 'M PLUS 1p', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif`;
  g.fillText(t(def.kindKey), w / 2, h * 0.76);
}

// ───────────── 3D空間 ─────────────
export function createScene(canvas, { noteDefs }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070b26, RENDER.fogNear, RENDER.fogFar);
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0a0f25, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 0.65);
  key.position.set(3, 6, 6);
  scene.add(key);
  const rim = new THREE.PointLight(hexToInt(MINUS.neon), 1.2, 14, 1.5);
  rim.position.set(-3, 2, 1);
  scene.add(rim);
  const rim2 = new THREE.PointLight(hexToInt(PLUS.neon), 1.2, 14, 1.5);
  rim2.position.set(3, 2, 1);
  scene.add(rim2);

  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 120);
  camera.position.set(0, 2.6, 5.6);
  camera.lookAt(0, 1.05, -10);

  // ── 道：和柄の床と、左右の光る縁（左は朱、右は群青。左右のボタンと同じ色） ──
  const laneTex = laneTexture(MINUS.neon, PLUS.neon);
  const laneMat = new THREE.MeshStandardMaterial({ map: laneTex, emissiveMap: laneTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0.2, color: 0x9aa6ff });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 64), laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0, -26);
  scene.add(lane);
  const railMat = [MINUS.neon, PLUS.neon].map((h) => new THREE.MeshBasicMaterial({ color: hexToInt(h), toneMapped: false }));
  [-1.62, 1.62].forEach((x, i) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 64), railMat[i]);
    r.position.set(x, 0.03, -26);
    scene.add(r);
  });

  // ── 道の上の門（六角の枠）：奥から手前へ流れて、速さを感じさせる ──
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.55, toneMapped: false });
  const gateGeo = new THREE.TorusGeometry(2.3, 0.035, 4, 6);
  const gates = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(gateGeo, gateMat);
    m.rotation.z = Math.PI / 6;
    m.position.set(0, RING_Y, -i * 7);
    scene.add(m);
    gates.push(m);
  }

  // ── 判定リング ──
  const ring = new THREE.Group();
  ring.position.set(0, RING_Y, NOTE.judgeZ);
  const ringMain = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const ringIn = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.02, 6, 6), new THREE.MeshBasicMaterial({ color: hexToInt(ACCENTS.home.a2.neon), toneMapped: false }));
  ring.add(ringMain, ringIn, glowSprite('#8fb4ff', 3.4));
  scene.add(ring);

  // 正しく叩いたときに広がる輪（使い回す）
  const bursts = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.06, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(ring.position);
    m.visible = false;
    scene.add(m);
    return { mesh: m, start: -1 };
  });

  // ── プレイヤーの水分子 ──
  const water = buildWater(0.62);
  const waterPivot = new THREE.Group();
  waterPivot.position.copy(WATER_POS);
  waterPivot.add(water);
  scene.add(waterPivot);
  // 向き：idle では H を上に開いて O を下。O を向ける＝O を奥（−z）に、H を向ける＝H を奥に
  // x の軸のまわりに +90° 回すと O の側（−y）が奥を向き、−90° 回すと H の側（+y）が奥を向く
  const ROT = { idle: new THREE.Euler(-0.35, 0, 0), O: new THREE.Euler(Math.PI / 2, 0, 0), H: new THREE.Euler(-Math.PI / 2, 0, 0) };
  let waterTarget = ROT.idle, waterHold = 0, shake = 0;
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
    crystalInfo.push({ p, r, isNa, alive: true, leaving: -1 });
    mtx.compose(p, new THREE.Quaternion(), new THREE.Vector3(r, r, r));
    crystal.setMatrixAt(k, mtx);
    crystal.setColorAt(k, col.set(isNa ? PLUS.neon : MINUS.neon));
    k++;
  }
  const crystalGroup = new THREE.Group();
  crystalGroup.position.set(...CRYSTAL.position);
  crystalGroup.add(crystal, glowSprite('#7c9bff', 7));
  scene.add(crystalGroup);
  // はがす順番：外側（中心から遠い）から
  const peelOrder = crystalInfo.map((c, i) => i).sort((a, b) => crystalInfo[b].p.length() - crystalInfo[a].p.length());
  let peeled = 0;

  // ── 流れる光の粒（速さを感じる） ──
  const PCOUNT = 160;
  const pPos = new Float32Array(PCOUNT * 3);
  for (let i = 0; i < PCOUNT; i++) pPos.set([(Math.random() - 0.5) * 22, Math.random() * 10 - 1, -Math.random() * 60], i * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: glowTexture(), color: 0x9fbcff, size: 0.28, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  scene.add(particles);

  // ── 溶質ノーツ（使い回す） ──
  const labelCache = {};
  function labelFor(id) {
    if (!labelCache[id]) labelCache[id] = labelTexture((g, w, h) => drawNoteLabel(g, w, h, noteDefs[id]), 256, 128);
    return labelCache[id];
  }
  const noteMats = {};
  for (const [id, def] of Object.entries(noteDefs)) noteMats[id] = def.charge === 'plus' ? shiny(PLUS.hex, 0.55, PLUS.neon) : shiny(MINUS.hex, 0.55, MINUS.neon);
  const SLOTS = 14;
  const slots = Array.from({ length: SLOTS }, () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(ball(1), noteMats.Na);
    const glow = glowSprite('#ffffff', 2.2);
    const sign = signSprite('+', PLUS.neon, 0.6);
    sign.position.set(0, 0, 1.05);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelFor('Na'), transparent: true, depthTest: false, toneMapped: false }));
    label.scale.set(1.7, 0.85, 1);
    label.renderOrder = 6;
    g.add(body, glow, sign, label);
    g.visible = false;
    scene.add(g);
    return { g, body, glow, sign, label, note: null };
  });
  const signTex = { plus: signSprite('+', PLUS.neon, 1).material.map, minus: signSprite('−', MINUS.neon, 1).material.map };

  function assign(slot, note) {
    const def = noteDefs[note.noteId];
    slot.note = note;
    note.slot = slot;
    slot.body.material = noteMats[def.id];
    slot.body.scale.setScalar(def.radius);
    slot.glow.material.color.set(def.charge === 'plus' ? PLUS.neon : MINUS.neon);
    slot.glow.scale.setScalar(def.radius * 3.2);
    slot.sign.material.map = signTex[def.charge];
    slot.sign.position.z = def.radius + 0.05;
    slot.sign.scale.setScalar(def.radius * 0.9);
    slot.label.material.map = labelFor(def.id);
    slot.label.position.set(0, def.radius + 0.62, 0);
    slot.g.scale.setScalar(1);
    slot.g.visible = true;
  }
  function release(slot) {
    if (slot.note) slot.note.slot = null;
    slot.note = null;
    slot.g.visible = false;
  }

  // ── 水和の演出：6個の水分子が溶質を取り囲み、漂っていく ──
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.1, emissive: 0x222244, emissiveIntensity: 0.5, transparent: true });
  const shells = Array.from({ length: 3 }, () => {
    const g = new THREE.Group();
    const ion = new THREE.Mesh(ball(1), noteMats.Na);
    g.add(ion);
    const ws = DIRS.map(() => { const m = new THREE.Mesh(smallWaterGeometry(), waterMat); g.add(m); return m; });
    g.visible = false;
    scene.add(g);
    return { g, ion, ws, start: -1, drift: new THREE.Vector3() };
  });
  let shellNext = 0;
  const up = new THREE.Vector3(0, 1, 0);
  function startShell(def, now) {
    const s = shells[shellNext]; shellNext = (shellNext + 1) % shells.length;
    s.ion.material = noteMats[def.id];
    s.ion.scale.setScalar(def.radius);
    const dist = def.radius + 0.42;
    s.ws.forEach((m, i) => {
      const d = DIRS[i];
      m.position.copy(d).multiplyScalar(dist + 1.4);   // 遠くから寄ってくる
      m.userData.target = d.clone().multiplyScalar(dist);
      // 陽イオン：O が内向き（H が外向き）→ 分子の +y（H の側）を外向きに。陰イオン：H が内向き
      const outward = def.charge === 'plus' ? d : d.clone().negate();
      m.quaternion.setFromUnitVectors(up, outward);
      m.material.opacity = 1;
    });
    s.g.position.set(0, RING_Y, NOTE.judgeZ);
    s.g.rotation.set(0, 0, 0);
    s.drift.set((Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random()), 1.2 + Math.random(), -1.5);
    s.start = now;
    s.g.visible = true;
  }

  // ── 画面の大きさ ──
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では道が細く見えるので、少し下がって広く見せる
    const portrait = h / w;
    camera.position.set(0, 2.5 + Math.max(0, portrait - 1.4) * 0.9, 5.4 + Math.max(0, portrait - 1.4) * 2.2);
    camera.lookAt(0, 1.0, -10);
    camera.setViewOffset(w, h, 0, h * 0.06, w, h);
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
    redrawLabels() { for (const k2 of Object.keys(labelCache)) { labelCache[k2].dispose(); delete labelCache[k2]; } slots.forEach((s) => { if (s.note) s.label.material.map = labelFor(s.note.noteId); }); },

    /** 左右のボタンを押したとき：水分子をその向きに回す */
    press(input) { waterTarget = ROT[input] || ROT.idle; waterHold = 0.18; },
    /** 正しく水和したとき */
    hit(note, judgement, now, peel = true) {
      const def = noteDefs[note.noteId];
      if (note.slot) release(note.slot);
      startShell(def, now);
      const b = bursts.find((x) => x.start < 0) || bursts[0];
      b.start = now; b.mesh.visible = true;
      b.mesh.material.color.set(judgement === 'perfect' ? '#ffffff' : def.charge === 'plus' ? PLUS.neon : MINUS.neon);
      // 結晶からイオンを1個はがす
      if (peel && peeled < peelOrder.length) { crystalInfo[peelOrder[peeled]].leaving = now; peeled += 1; }
    },
    /** 向きを間違えた（逆向き）：溶質が水分子をはじき返す */
    wrong(note, now) { note.bounceAt = now; shake = 0.35; },
    /** 結晶のイオンの数（何回の水和で1個はがすかを決めるのに使う） */
    crystalCount: count,
    /** 新しく曲を始めるとき：ノーツ・演出・結晶を元に戻す */
    reset() {
      slots.forEach(release);
      shells.forEach((sh) => { sh.start = -1; sh.g.visible = false; });
      bursts.forEach((b) => { b.start = -1; b.mesh.visible = false; });
      crystalInfo.forEach((c, i) => {
        c.leaving = -1;
        mtx.compose(c.p, new THREE.Quaternion(), new THREE.Vector3(c.r, c.r, c.r));
        crystal.setMatrixAt(i, mtx);
      });
      crystal.instanceMatrix.needsUpdate = true;
      peeled = 0;
      shake = 0;
    },

    /** 毎回の描き直し。now は「聞こえている音の時刻」から曲の始まりを引いた秒 */
    frame(notes, cursor, now) {
      const dt = Math.min(0.1, Math.max(0, now - lastFrame));
      lastFrame = now;
      const approach = NOTE.approachSec;
      const span = NOTE.judgeZ - NOTE.spawnZ;
      // 新しく見えてきたノーツに、使い回しの部品を割り当てる
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
        let z = NOTE.judgeZ - ((nt.t - now) / approach) * span;
        if (nt.state === 'wrong') {
          const k3 = (now - nt.bounceAt) / 0.45;
          if (k3 >= 1) { release(s); continue; }
          z = NOTE.judgeZ - k3 * 6;
          s.g.position.set(Math.sin(k3 * 9) * 0.25, RING_Y + k3 * 1.2, z);
          s.g.scale.setScalar(1 - k3 * 0.6);
          continue;
        }
        if (nt.state === 'miss' && z > NOTE.passZ) { release(s); continue; }
        if (nt.state === 'hit') { release(s); continue; }
        s.g.position.set(0, RING_Y + Math.sin((nt.t - now) * 3) * 0.04, z);
        s.body.rotation.y = now * 1.5;
        if (nt.state === 'miss') s.g.scale.setScalar(Math.max(0.2, 1 - (z / NOTE.passZ)));
      }
      // 水和の殻
      for (const sh of shells) {
        if (sh.start < 0) continue;
        const k4 = now - sh.start;
        if (k4 > 1.6) { sh.start = -1; sh.g.visible = false; continue; }
        const gather = Math.min(1, k4 / 0.18);
        sh.ws.forEach((m) => {
          m.position.lerp(m.userData.target, gather);
          m.material.opacity = Math.max(0, 1 - Math.max(0, k4 - 1.0) / 0.6);
        });
        const drift = Math.max(0, k4 - 0.25);
        sh.g.position.set(sh.drift.x * drift, RING_Y + sh.drift.y * drift * 0.6, NOTE.judgeZ + sh.drift.z * drift);
        sh.g.rotation.set(drift * 1.2, drift * 1.7, 0);
      }
      // 広がる輪
      for (const b of bursts) {
        if (b.start < 0) continue;
        const k5 = (now - b.start) / 0.45;
        if (k5 >= 1) { b.start = -1; b.mesh.visible = false; continue; }
        b.mesh.scale.setScalar(1 + k5 * 1.6);
        b.mesh.material.opacity = 1 - k5;
      }
      // 拍の脈動（判定リングと門）
      const beat = 60 / timing.bpm;
      const phase = ((now % beat) + beat) % beat / beat;
      const pulse = Math.exp(-phase * 7);
      ring.scale.setScalar(1 + pulse * 0.07);
      ringIn.rotation.z = now * 0.8;
      const speed = span / approach;
      gates.forEach((m, i) => {
        let z = -((i * 7 - now * speed) % 49 + 49) % 49;
        m.position.z = z + 3;
        m.material.opacity = 0.25 + pulse * 0.35 + comboLevel * 0.08;
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
