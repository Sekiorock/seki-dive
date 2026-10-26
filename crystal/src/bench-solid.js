// crystal/src/bench-solid.js
// 固体の実験台の3D（全体の仕様書 8章）。
//   ・加熱板の上にビーカー。水の高さは溶液の量に合わせて変わる。硫酸銅(II)が溶けると、濃さに合わせて青くなる。
//   ・ビーカーの底に、結晶（溶け残り・析出した結晶）がたまる。結晶の形は物質ごとに本物に寄せる（crystals.js）。
//   ・加熱板は温度に合わせて青〜朱に光る。温度計の赤い柱も伸び縮みする。
//   ・背後に溶解度曲線の板が浮かび、「今の状態」の点が曲線の上を動く。

import { RENDER, RANGE } from './config.js';
import { TABLE, TEMPS, SOLUTES } from './solubility.js';
import { crystalKinds } from './crystals.js';
import { ACCENTS } from '../../shared/theme.js';
import { t } from '../../shared/i18n.js';

const ACC = ACCENTS.crystal;
export const BEAKER = { r: 1.25, h: 2.8, y: 0.35 };
const PANEL = { y: 4.75, z: -2.4, w: 5.0, h: 3.33 };   // 溶解度曲線の板（ビーカーの上・うしろ）
const CURVE_COLOR = { KNO3: '#FFC074', KCl: '#8FF3FA', NaCl: '#ffffff', CuSO4: '#4C86FF' };
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

/** 加熱板（温度で色が変わる）。気体の実験台でも使う */
export function makeHotPlate(radius = 1.6) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x222838, emissive: 0x4C86FF, emissiveIntensity: 0.6, roughness: 0.4 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.1, 0.3, 32), mat);
  plate.position.y = 0.15;
  const glow = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.15, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: 0x4C86FF, toneMapped: false }));
  glow.rotation.x = Math.PI / 2;
  glow.position.y = 0.31;
  group.add(plate, glow);
  return {
    group,
    /** hot：0（冷たい）〜1（熱い） */
    set(hot, now) {
      const c = new THREE.Color(0x4C86FF).lerp(new THREE.Color(0xff6a2e), hot);
      mat.emissive.copy(c);
      mat.emissiveIntensity = 0.4 + hot * 0.8 + Math.sin(now * 3) * 0.05 * hot;
      glow.material.color.copy(c);
    },
  };
}

/** 温度計。height は管の長さ */
export function makeThermometer(height) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, height, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  tube.position.y = height / 2;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5e70, toneMapped: false }));
  bulb.position.y = 0.1;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8), new THREE.MeshBasicMaterial({ color: 0xff5e70, toneMapped: false }));
  g.add(tube, bulb, column);
  return {
    group: g,
    set(hot) { const h = 0.2 + hot * (height - 0.6); column.scale.y = h; column.position.y = 0.1 + h / 2; },
  };
}

/** ガラスの材質 */
export function glassMaterial(envMap, opacity = 0.16) {
  return new THREE.MeshPhysicalMaterial({ color: 0xcfe0ff, transparent: true, opacity, roughness: 0.04, metalness: 0, clearcoat: 1, envMap, envMapIntensity: 1.1, side: THREE.DoubleSide, depthWrite: false });
}

export function createSolidBench({ envMap }) {
  const group = new THREE.Group();

  const hot = makeHotPlate();
  group.add(hot.group);

  // ── ビーカー（すきとおったガラス、目盛り） ──
  const glassMat = glassMaterial(envMap);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(BEAKER.r, BEAKER.r, BEAKER.h, 40, 1, true), glassMat);
  glass.position.y = BEAKER.y + BEAKER.h / 2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(BEAKER.r, 40), glassMat);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = BEAKER.y + 0.01;
  group.add(glass, bottom);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.7, toneMapped: false });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BEAKER.r, 0.025, 6, 48), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BEAKER.y + BEAKER.h;
  group.add(rim);
  for (let ml = 100; ml < RENDER.beakerMl; ml += 100) {
    const tick = new THREE.Mesh(new THREE.TorusGeometry(BEAKER.r + 0.005, 0.01, 3, 24, Math.PI / 3), rimMat);
    tick.rotation.x = Math.PI / 2;
    tick.rotation.z = Math.PI / 2 + Math.PI / 6;
    tick.position.y = BEAKER.y + (ml / RENDER.beakerMl) * BEAKER.h;
    group.add(tick);
  }

  // ── 水（溶液） ──
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fc6ff, transparent: true, opacity: 0.26, roughness: 0.15, emissive: 0x1E50A2, emissiveIntensity: 0.25, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(BEAKER.r - 0.03, BEAKER.r - 0.03, 1, 40), waterMat);
  water.renderOrder = 2;
  group.add(water);
  const surf = new THREE.Mesh(new THREE.RingGeometry(BEAKER.r * 0.3, BEAKER.r - 0.04, 40), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  surf.rotation.x = -Math.PI / 2;
  group.add(surf);

  const thermo = makeThermometer(BEAKER.h + 0.8);
  thermo.group.position.set(BEAKER.r * 0.55, BEAKER.y, -BEAKER.r * 0.35);
  thermo.group.rotation.z = -0.12;
  group.add(thermo.group);

  // ── 結晶のかけら（物質ごとに、使い回す） ──
  const kinds = crystalKinds(envMap);
  const pools = {};
  for (const [id, k] of Object.entries(kinds)) {
    const mesh = new THREE.InstancedMesh(k.geo, k.mat, RENDER.maxCrystals);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    pools[id] = mesh;
  }
  // 1つ1つのかけらの置き場所（ビーカーの底に、山のように積もる）
  const SPOTS = (() => {
    const rnd = rand(7);
    const list = [];
    for (let i = 0; i < RENDER.maxCrystals; i++) {
      const layer = Math.floor(i / 14);
      const rr = (BEAKER.r - 0.28) * Math.sqrt(rnd()) * (1 - layer * 0.18);
      const a = rnd() * Math.PI * 2;
      list.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: BEAKER.y + 0.07 + layer * 0.09 + rnd() * 0.04, ry: rnd() * Math.PI * 2, rx: rnd() - 0.5, rz: rnd() - 0.5, s: 0.75 + rnd() * 0.5 });
    }
    return list;
  })();

  // ── 結晶が出たときのきらめき ──
  const sparkGeo = new THREE.BufferGeometry();
  const SPN = 60;
  const spPos = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  group.add(new THREE.Points(sparkGeo, sparkMat));
  let sparkStart = -1;

  // ── 溶解度曲線の板 ──
  const CW = 1024, CH = 682;
  const curveCanvas = document.createElement('canvas');
  curveCanvas.width = CW; curveCanvas.height = CH;
  const curveTex = new THREE.CanvasTexture(curveCanvas);
  curveTex.anisotropy = 4;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), new THREE.MeshBasicMaterial({ map: curveTex, transparent: true, depthWrite: false, toneMapped: false }));
  panel.position.set(0, PANEL.y, PANEL.z);
  group.add(panel);
  const YMAX = 180;
  function drawCurve(st) {
    const g = curveCanvas.getContext('2d');
    const k = CW / 768;
    g.setTransform(k, 0, 0, k, 0, 0);
    const W = 768, H = 512;
    g.clearRect(0, 0, W, H);
    const L = 86, R = W - 26, T = 54, B = H - 70;
    g.fillStyle = 'rgba(6,10,28,0.86)';
    g.beginPath(); g.moveTo(24, 0); g.lineTo(W, 0); g.lineTo(W, H - 24); g.lineTo(W - 24, H); g.lineTo(0, H); g.lineTo(0, 24); g.closePath(); g.fill();
    g.strokeStyle = ACC.a1.neon; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#ffffff'; g.font = `700 28px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(t('cr.curve.title'), 24, 12);
    const X = (T0) => L + ((R - L) * T0) / 80;
    const Y = (v) => B - ((B - T) * Math.min(v, YMAX)) / YMAX;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.fillStyle = 'rgba(220,230,255,0.75)'; g.font = `500 20px ${FONT}`;
    for (let x = 0; x <= 80; x += 10) {
      g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), B); g.stroke();
      if (x % 20 === 0) { g.textAlign = 'center'; g.fillText(`${x}`, X(x), B + 8); }
    }
    for (let y = 0; y <= YMAX; y += 20) {
      g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(R, Y(y)); g.stroke();
      if (y % 40 === 0) { g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(`${y}`, L - 8, Y(y)); g.textBaseline = 'top'; }
    }
    g.textAlign = 'center'; g.fillText(t('cr.curve.x'), (L + R) / 2, B + 34);
    g.save(); g.translate(22, (T + B) / 2); g.rotate(-Math.PI / 2); g.fillText(t('cr.curve.y'), 0, 0); g.restore();
    const sel = SOLUTES[st.solute].parts.map((p) => p.id);
    for (const id of Object.keys(TABLE)) {
      const on = sel.includes(id);
      g.strokeStyle = CURVE_COLOR[id];
      g.globalAlpha = on ? 1 : 0.3;
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
      g.fillStyle = '#ffffff'; g.font = `700 22px ${FONT}`; g.textAlign = px > W - 220 ? 'right' : 'left'; g.textBaseline = 'bottom';
      g.fillText(`${over ? '▲ ' : ''}${st.point.y.toFixed(1)} g`, px + (px > W - 220 ? -18 : 18), py - 8);
    }
    curveTex.needsUpdate = true;
  }

  // ── 状態を3Dに映す ──
  const shown = { crystal: {}, waterH: 0.5, blue: 0 };
  const goal = { crystal: {}, waterH: 0.5, blue: 0, temp: 60 };
  let lastCurveKey = '';
  let last = 0;
  let placed = false;

  function setState(st) {
    const e = st.eq;
    const ml = e.water + e.dissolved * 0.4;   // 溶液のかさ（mL）の目安
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
    let slot = 0;
    const counts = {};
    for (const id of Object.keys(pools)) counts[id] = [];
    for (const [id, m] of Object.entries(shown.crystal)) {
      if (m < 0.05 || !pools[id]) continue;
      const n = Math.min(RENDER.maxCrystals - slot, Math.max(1, Math.round(m / RENDER.gramsPerPiece)));
      const scale = Math.cbrt(Math.max(m, 0.4) / (n * RENDER.gramsPerPiece)) * (m < RENDER.gramsPerPiece ? 0.8 : 1);
      for (let i = 0; i < n; i++) counts[id].push({ spot: SPOTS[slot++], scale });
    }
    for (const [id, mesh] of Object.entries(pools)) {
      const list = counts[id];
      const tilt = kinds[id].tilt;
      mesh.count = list.length;
      list.forEach((c, i) => {
        const sp = c.spot;
        tmpE.set(sp.rx * tilt, sp.ry, sp.rz * tilt);
        tmpQ.setFromEuler(tmpE);
        const s = sp.s * Math.min(2.2, c.scale);
        tmpM.compose(tmpV.set(sp.x, sp.y, sp.z), tmpQ, tmpS.set(s, s, s));
        mesh.setMatrixAt(i, tmpM);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    group,
    setState,
    redraw(st) { lastCurveKey = ''; setState(st); },
    /** タイトルの画面では、曲線の板を隠す（文字と重なるので） */
    showExtras(on) { panel.visible = !!on; },
    sparkle() {
      sparkStart = last;
      for (let i = 0; i < SPN; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * (BEAKER.r - 0.2);
        spPos.set([Math.cos(a) * r, BEAKER.y + 0.2 + Math.random() * shown.waterH, Math.sin(a) * r], i * 3);
        spVel.set([(Math.random() - 0.5) * 0.6, -0.6 - Math.random(), (Math.random() - 0.5) * 0.6], i * 3);
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    /** 視点のボタン：{ 名前: { target, w, h, az, el } }。w・h は見せたい範囲の幅と高さ */
    views() {
      return {
        all: { target: [0, 2.85, -0.9], w: 5.4, h: 6.5, az: 0, el: 0.2 },
        crystal: { target: [0, BEAKER.y + 0.3, 0], w: 3.4, h: 1.9, az: 0.25, el: 0.95 },
        graph: { target: [0, PANEL.y, PANEL.z], w: PANEL.w * 1.02, h: PANEL.h * 1.02, az: 0, el: 0.03 },
      };
    },
    frame(now, dt) {
      last = now;
      const k = 1 - Math.exp(-RENDER.ease * dt);
      let changed = false;
      const ids = new Set([...Object.keys(goal.crystal), ...Object.keys(shown.crystal)]);
      for (const id of ids) {
        const g0 = goal.crystal[id] || 0, s0 = shown.crystal[id] || 0;
        const v = Math.abs(g0 - s0) < 0.02 ? g0 : s0 + (g0 - s0) * k;
        if (v !== s0) changed = true;
        shown.crystal[id] = v;
      }
      if (changed || !placed) { placeCrystals(); placed = true; }
      shown.waterH += (goal.waterH - shown.waterH) * k;
      shown.blue += (goal.blue - shown.blue) * k;
      water.scale.y = shown.waterH;
      water.position.y = BEAKER.y + shown.waterH / 2;
      surf.position.y = BEAKER.y + shown.waterH + 0.005;
      waterMat.color.copy(new THREE.Color(0x9fc6ff).lerp(new THREE.Color(0x1f6bff), shown.blue));
      waterMat.opacity = 0.26 + shown.blue * 0.3;
      surf.rotation.z = now * 0.2;
      const h = (goal.temp - RANGE.temp.min) / (RANGE.temp.max - RANGE.temp.min);
      hot.set(h, now);
      thermo.set(h);
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
      panel.position.y = PANEL.y + Math.sin(now * 0.8) * 0.04;
    },
  };
}
