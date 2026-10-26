// crystal/src/scene3d.js
// Three.js の3D空間（全体の仕様書 8章：固体の実験台）。
//   ・実験台の上にビーカー。水の高さは水と溶液の量に合わせて変わる。硫酸銅(II)が溶けると、濃さに合わせて青くなる。
//   ・ビーカーの底に、結晶（溶け残り・析出した結晶）がたまる。結晶の形は物質ごと
//     （KNO₃：針のような柱、KCl・NaCl：立方体、CuSO₄·5H₂O：青い平行六面体）。
//   ・ビーカーの下の加熱板は、温度に合わせて青〜朱に光る。温度計の赤い柱も伸び縮みする。
//   ・背後に溶解度曲線の板が浮かび、「今の状態」の点が曲線の上を動く。
// 軽く保つため、結晶のかけらは RENDER.maxCrystals 個まで、影は使わない。

import { RENDER, RANGE } from './config.js';
import { TABLE, TEMPS, SOLUTES } from './solubility.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { labelTexture } from '../../shared/patterns.js';
import { t } from '../../shared/i18n.js';

const ACC = ACCENTS.crystal;
const BEAKER = { r: 1.25, h: 2.8, y: 0.35 };
const PANEL_Y = 3.9;   // 溶解度曲線のパネルの高さ
// 結晶の形と色
const CRYSTAL_LOOK = {
  KNO3: { shape: 'needle', color: '#eef4ff', glow: '#9fc2ff' },
  KCl: { shape: 'cube', color: '#f4f6ff', glow: '#b8c6ff' },
  NaCl: { shape: 'cube', color: '#ffffff', glow: '#c9d4ff' },
  CuSO4: { shape: 'rhomb', color: '#2f7dff', glow: '#4C86FF' },
};
// 溶解度曲線の色（曲線の板）
const CURVE_COLOR = { KNO3: '#FFC074', KCl: '#8FF3FA', NaCl: '#ffffff', CuSO4: '#4C86FF' };
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070b26, 14, 30);
  scene.add(new THREE.HemisphereLight(0xa8c0ff, 0x0a0f25, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(3, 7, 5);
  scene.add(key);
  const rimA = new THREE.PointLight(hexToInt(ACC.a1.neon), 1.0, 12, 1.5);
  rimA.position.set(-3, 3, 2);
  const rimB = new THREE.PointLight(hexToInt(ACC.a2.neon), 0.8, 12, 1.5);
  rimB.position.set(3, 2, 2);
  scene.add(rimA, rimB);

  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 80);
  const view = { az: 0, el: 0.32, dist: 9.2 };
  const target = new THREE.Vector3(0, 1.9, 0);
  function placeCamera() {
    camera.position.set(target.x + Math.sin(view.az) * Math.cos(view.el) * view.dist,
      target.y + Math.sin(view.el) * view.dist, target.z + Math.cos(view.az) * Math.cos(view.el) * view.dist);
    camera.lookAt(target);
  }

  // ── 実験台（六角の模様の天板と、光るふち） ──
  const deckTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0b1230'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(76,134,255,0.45)'; g.lineWidth = 2;
    const r = 22;
    for (let row = -1; row < 9; row++) for (let col = -1; col < 8; col++) {
      const cx = col * r * 1.75 + (row % 2 ? r * 0.87 : 0), cy = row * r * 1.5;
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (Math.PI / 3) * i; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.stroke();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    tx.repeat.set(4, 4);
    return tx;
  })();
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.3, 6), new THREE.MeshStandardMaterial({ map: deckTex, emissiveMap: deckTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.7, color: 0x8899cc }));
  deck.position.y = -0.15;
  scene.add(deck);
  const deckEdge = new THREE.Mesh(new THREE.TorusGeometry(5.05, 0.04, 4, 6), new THREE.MeshBasicMaterial({ color: hexToInt(ACC.a2.neon), toneMapped: false }));
  deckEdge.rotation.x = Math.PI / 2;
  deckEdge.rotation.z = Math.PI / 6;
  scene.add(deckEdge);

  // ── 加熱板（温度で色が変わる） ──
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x222838, emissive: 0x4C86FF, emissiveIntensity: 0.6, roughness: 0.4 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.3, 32), plateMat);
  plate.position.y = 0.15;
  scene.add(plate);
  const plateGlow = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: 0x4C86FF, toneMapped: false }));
  plateGlow.rotation.x = Math.PI / 2;
  plateGlow.position.y = 0.31;
  scene.add(plateGlow);

  // ── ビーカー（すきとおったガラス、目盛り） ──
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(BEAKER.r, BEAKER.r, BEAKER.h, 40, 1, true), glassMat);
  glass.position.y = BEAKER.y + BEAKER.h / 2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(BEAKER.r, 40), glassMat);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = BEAKER.y + 0.01;
  scene.add(glass, bottom);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.7, toneMapped: false });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BEAKER.r, 0.025, 6, 48), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BEAKER.y + BEAKER.h;
  scene.add(rim);
  // 目盛り（100 mL ごと）
  for (let ml = 100; ml < RENDER.beakerMl; ml += 100) {
    const y = BEAKER.y + (ml / RENDER.beakerMl) * BEAKER.h;
    const tick = new THREE.Mesh(new THREE.TorusGeometry(BEAKER.r + 0.005, 0.01, 3, 24, Math.PI / 3), rimMat);
    tick.rotation.x = Math.PI / 2;
    tick.rotation.z = Math.PI / 2 + Math.PI / 6;
    tick.position.y = y;
    scene.add(tick);
  }

  // ── 水（溶液） ──
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fc6ff, transparent: true, opacity: 0.38, roughness: 0.15, emissive: 0x1E50A2, emissiveIntensity: 0.25, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(BEAKER.r - 0.03, BEAKER.r - 0.03, 1, 40), waterMat);
  scene.add(water);
  const surf = new THREE.Mesh(new THREE.RingGeometry(BEAKER.r * 0.3, BEAKER.r - 0.04, 40), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  surf.rotation.x = -Math.PI / 2;
  scene.add(surf);

  // ── 温度計 ──
  const thermo = new THREE.Group();
  thermo.position.set(BEAKER.r * 0.55, BEAKER.y, -BEAKER.r * 0.35);
  thermo.rotation.z = -0.12;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, BEAKER.h + 0.8, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  tube.position.y = (BEAKER.h + 0.8) / 2;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5e70, toneMapped: false }));
  bulb.position.y = 0.1;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), new THREE.MeshBasicMaterial({ color: 0xff5e70, toneMapped: false }));
  thermo.add(tube, bulb, column);
  scene.add(thermo);

  // ── 結晶のかけら（形ごとに、使い回す） ──
  const geos = {
    needle: new THREE.BoxGeometry(0.07, 0.07, 0.42),
    cube: new THREE.BoxGeometry(0.16, 0.16, 0.16),
    rhomb: (() => { const g = new THREE.BoxGeometry(0.22, 0.09, 0.15); g.applyMatrix4(new THREE.Matrix4().makeShear(0.35, 0, 0)); return g; })(),
  };
  const pools = {};
  for (const [shape, geo] of Object.entries(geos)) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.05, emissive: 0x334477, emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });
    const mesh = new THREE.InstancedMesh(geo, mat, RENDER.maxCrystals);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    pools[shape] = mesh;
  }
  // 1つ1つのかけらの置き場所（ビーカーの底に、山のように積もる）
  const SPOTS = (() => {
    const rnd = rand(7);
    const list = [];
    for (let i = 0; i < RENDER.maxCrystals; i++) {
      const layer = Math.floor(i / 14);
      const rr = (BEAKER.r - 0.25) * Math.sqrt(rnd()) * (1 - layer * 0.18);
      const a = rnd() * Math.PI * 2;
      list.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: BEAKER.y + 0.06 + layer * 0.09 + rnd() * 0.04, ry: rnd() * Math.PI, rx: (rnd() - 0.5) * 0.6, rz: (rnd() - 0.5) * 0.5, s: 0.75 + rnd() * 0.5 });
    }
    return list;
  })();

  // ── 結晶が出たときのきらめき ──
  const sparkGeo = new THREE.BufferGeometry();
  const SPN = 60;
  const spPos = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);
  let sparkStart = -1;

  // ── 溶解度曲線の板 ──
  const CW = 768, CH = 512;
  const curveCanvas = document.createElement('canvas');
  curveCanvas.width = CW; curveCanvas.height = CH;
  const curveTex = new THREE.CanvasTexture(curveCanvas);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.2), new THREE.MeshBasicMaterial({ map: curveTex, transparent: true, depthWrite: false, toneMapped: false }));
  panel.position.set(0, PANEL_Y, -2.6);
  scene.add(panel);
  const YMAX = 180;
  function drawCurve(st) {
    const g = curveCanvas.getContext('2d');
    g.clearRect(0, 0, CW, CH);
    const L = 86, R = CW - 26, T = 54, B = CH - 70;
    // 板（角を切った形）
    g.fillStyle = 'rgba(6,10,28,0.82)';
    g.beginPath(); g.moveTo(24, 0); g.lineTo(CW, 0); g.lineTo(CW, CH - 24); g.lineTo(CW - 24, CH); g.lineTo(0, CH); g.lineTo(0, 24); g.closePath(); g.fill();
    g.strokeStyle = ACC.a1.neon; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ffffff'; g.font = `700 28px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(t('cr.curve.title'), 24, 12);
    const X = (T0) => L + ((R - L) * T0) / 80;
    const Y = (v) => B - ((B - T) * Math.min(v, YMAX)) / YMAX;
    // 目盛り
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.fillStyle = 'rgba(220,230,255,0.75)'; g.font = `500 20px ${FONT}`;
    for (let x = 0; x <= 80; x += 20) { g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), B); g.stroke(); g.textAlign = 'center'; g.fillText(`${x}`, X(x), B + 8); }
    for (let y = 0; y <= YMAX; y += 40) { g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(R, Y(y)); g.stroke(); g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(`${y}`, L - 8, Y(y)); g.textBaseline = 'top'; }
    g.textAlign = 'center'; g.fillText(t('cr.curve.x'), (L + R) / 2, B + 34);
    g.save(); g.translate(22, (T + B) / 2); g.rotate(-Math.PI / 2); g.fillText(t('cr.curve.y'), 0, 0); g.restore();
    // 曲線（選んでいる物質は太く明るく）
    const sel = SOLUTES[st.solute].parts.map((p) => p.id);
    for (const id of Object.keys(TABLE)) {
      const on = sel.includes(id);
      g.strokeStyle = CURVE_COLOR[id];
      g.globalAlpha = on ? 1 : 0.28;
      g.lineWidth = on ? 5 : 2;
      g.shadowColor = CURVE_COLOR[id]; g.shadowBlur = on ? 12 : 0;
      g.beginPath();
      TEMPS.forEach((T0, i) => g[i ? 'lineTo' : 'moveTo'](X(T0), Y(TABLE[id][i])));
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = CURVE_COLOR[id]; g.font = `700 20px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      const last = TABLE[id][TABLE[id].length - 1];
      g.fillText({ KNO3: 'KNO₃', KCl: 'KCl', NaCl: 'NaCl', CuSO4: 'CuSO₄' }[id], Math.min(X(80) - 90, X(72)), Y(Math.min(last, YMAX)) - 16 + (id === 'NaCl' ? 30 : 0));
    }
    g.globalAlpha = 1;
    // 今の状態の点
    if (st.mass > 0) {
      const px = X(st.temp), py = Y(st.point.y);
      const over = st.point.y > YMAX;
      const col = st.eq.state === 'supersaturated' ? '#FF5E70' : st.eq.state === 'saturated' ? '#FFC074' : '#8FF3FA';
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(px, B); g.lineTo(px, py); g.lineTo(L, py); g.stroke();
      g.setLineDash([]);
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 18;
      g.beginPath(); g.arc(px, py, 13, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff'; g.font = `700 22px ${FONT}`; g.textAlign = px > CW - 220 ? 'right' : 'left'; g.textBaseline = 'bottom';
      g.fillText(`${over ? '▲ ' : ''}${st.point.y.toFixed(1)} g`, px + (px > CW - 220 ? -18 : 18), py - 8);
    }
    curveTex.needsUpdate = true;
  }

  // ── 画面の大きさ ──
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では、少し離れて全体が入るように
    view.dist = 9.2 * Math.max(1, 0.75 / Math.min(1, w / h) * 0.62 + 0.25) * RENDER.zoomOut;
    // 下の操作盤にビーカーが隠れないように、絵全体を上へずらす（縦長の画面だけ）
    const shift = w < h ? Math.round(h * RENDER.shiftUp) : 0;
    if (shift) camera.setViewOffset(w, h, 0, shift, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    placeCamera();
  }
  window.addEventListener('resize', resize);
  resize();

  // ── 指でなぞって、少しだけ回る ──
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.az = THREE.MathUtils.clamp(view.az - (e.clientX - drag.x) * 0.006, -0.9, 0.9);
    view.el = THREE.MathUtils.clamp(view.el + (e.clientY - drag.y) * 0.004, 0.05, 0.9);
    drag = { x: e.clientX, y: e.clientY };
    placeCamera();
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  // ── 状態を3Dに映す ──
  let shown = { crystal: {}, waterH: 0.5, blue: 0 };
  let goal = { crystal: {}, waterH: 0.5, blue: 0, temp: 60 };
  let lastCurveKey = '';
  let last = 0;

  function setState(st) {
    const e = st.eq;
    // 溶液のかさ（mL）の目安：水 + 溶けている溶質の 0.4 倍
    const ml = e.water + e.dissolved * 0.4;
    goal.waterH = Math.max(0.05, Math.min(BEAKER.h - 0.1, (ml / RENDER.beakerMl) * BEAKER.h));
    const cu = e.parts.find((p) => p.id === 'CuSO4');
    goal.blue = cu ? Math.min(1, (cu.dissolved / Math.max(1, e.water)) * 100 / 40) : 0;
    goal.crystal = {};
    e.parts.forEach((p) => { goal.crystal[p.id] = p.crystal; });
    goal.temp = st.temp;
    const key = `${st.solute}|${st.temp}|${st.point.y.toFixed(1)}|${e.state}|${st.mass}`;
    if (key !== lastCurveKey) { lastCurveKey = key; drawCurve(st); }
  }

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function placeCrystals() {
    // 形ごとに、かけらの数と大きさを決める
    const byShape = { needle: [], cube: [], rhomb: [] };
    let slot = 0;
    for (const [id, m] of Object.entries(shown.crystal)) {
      if (m < 0.05) continue;
      const look = CRYSTAL_LOOK[id];
      const n = Math.min(RENDER.maxCrystals - slot, Math.max(1, Math.round(m / RENDER.gramsPerPiece)));
      const scale = Math.cbrt(Math.max(m, 0.4) / (n * RENDER.gramsPerPiece)) * (m < RENDER.gramsPerPiece ? 0.8 : 1);
      for (let i = 0; i < n; i++) byShape[look.shape].push({ spot: SPOTS[slot++], scale, color: look.color });
    }
    for (const [shape, mesh] of Object.entries(pools)) {
      const list = byShape[shape];
      mesh.count = list.length;
      list.forEach((c, i) => {
        const sp = c.spot;
        tmpE.set(sp.rx, sp.ry, sp.rz);
        tmpQ.setFromEuler(tmpE);
        const s = sp.s * Math.min(2.2, c.scale);
        tmpM.compose(tmpV.set(sp.x, sp.y, sp.z), tmpQ, tmpS.set(s, s, s));
        mesh.setMatrixAt(i, tmpM);
        mesh.setColorAt(i, new THREE.Color(c.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  return {
    setState,
    /** 結晶が一気に出たときのきらめき */
    sparkle() {
      sparkStart = last;
      for (let i = 0; i < SPN; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * (BEAKER.r - 0.2);
        spPos.set([Math.cos(a) * r, BEAKER.y + 0.2 + Math.random() * shown.waterH, Math.sin(a) * r], i * 3);
        spVel.set([(Math.random() - 0.5) * 0.6, -0.6 - Math.random(), (Math.random() - 0.5) * 0.6], i * 3);
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    redraw(st) { lastCurveKey = ''; setState(st); },
    /** 溶解度曲線のパネルを出すか（タイトルの画面では文字と重なるので隠す） */
    showPanel(on) { panel.visible = !!on; },
    frame(nowMs) {
      const now = nowMs / 1000;
      const dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      const k = 1 - Math.exp(-RENDER.ease * dt);
      // 結晶と水の高さを、新しい値へなめらかに近づける
      let changed = false;
      const ids = new Set([...Object.keys(goal.crystal), ...Object.keys(shown.crystal)]);
      for (const id of ids) {
        const g0 = goal.crystal[id] || 0, s0 = shown.crystal[id] || 0;
        const v = Math.abs(g0 - s0) < 0.02 ? g0 : s0 + (g0 - s0) * k;
        if (v !== s0) changed = true;
        shown.crystal[id] = v;
      }
      if (changed || !placeCrystals.done) { placeCrystals(); placeCrystals.done = true; }
      shown.waterH += (goal.waterH - shown.waterH) * k;
      shown.blue += (goal.blue - shown.blue) * k;
      water.scale.y = shown.waterH;
      water.position.y = BEAKER.y + shown.waterH / 2;
      surf.position.y = BEAKER.y + shown.waterH + 0.005;
      const c = new THREE.Color(0x9fc6ff).lerp(new THREE.Color(0x1f6bff), shown.blue);
      waterMat.color.copy(c);
      waterMat.opacity = 0.38 + shown.blue * 0.3;
      surf.rotation.z = now * 0.2;
      // 温度：加熱板の色と、温度計
      const hot = (goal.temp - RANGE.temp.min) / (RANGE.temp.max - RANGE.temp.min);
      const pc = new THREE.Color(0x4C86FF).lerp(new THREE.Color(0xff6a2e), hot);
      plateMat.emissive.copy(pc);
      plateMat.emissiveIntensity = 0.4 + hot * 0.8 + Math.sin(now * 3) * 0.05 * hot;
      plateGlow.material.color.copy(pc);
      const colH = 0.2 + hot * (BEAKER.h - 0.2);
      column.scale.y = colH;
      column.position.y = 0.1 + colH / 2;
      // きらめき
      if (sparkStart >= 0) {
        const kk = (now - sparkStart) / 1.2;
        if (kk >= 1) { sparkStart = -1; sparkMat.opacity = 0; }
        else {
          for (let i = 0; i < SPN; i++) {
            spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] = Math.max(BEAKER.y + 0.05, spPos[i * 3 + 1] + spVel[i * 3 + 1] * dt); spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
          }
          sparkGeo.attributes.position.needsUpdate = true;
          sparkMat.opacity = 1 - kk;
        }
      }
      // 曲線の板は、ゆっくり浮かぶ
      panel.position.y = PANEL_Y + Math.sin(now * 0.8) * 0.05;
      renderer.render(scene, camera);
    },
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
