// crystal/src/bench-gas.js
// 気体の実験台の3D（全体の仕様書 8章、教科書 p.68〜69）。
//   ・加熱板の上に、ふたにピストンと圧力計のついた耐圧のガラス容器。底に水、上に気体。
//   ・水に溶けた気体の分子を、水の中を漂う粒で見せる（粒1つが表す物質量は画面に出す）。
//   ・圧力を上げるとピストンが下がり、上の気体の粒が増える。圧力計の針も動く。
//   ・栓を開けると、溶けきれなくなった気体が泡になって水から出てくる。

import { GAS_RANGE, GASES, GAS_VIEW } from './config.js';
import { makeHotPlate, makeThermometer, glassMaterial } from './bench-solid.js';
import { ACCENTS } from '../../shared/theme.js';

const ACC = ACCENTS.crystal;
const VESSEL = { r: 1.0, h: 4.0, y: 0.35 };
const GAUGE = { x: 1.62, y: 4.0, z: 0.15, r: 0.46 };
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";
const MAX_HEAD = 48;      // 上の気体の粒
const MAX_BUBBLES = 60;

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createGasBench({ envMap }) {
  const group = new THREE.Group();
  const hot = makeHotPlate(1.4);
  group.add(hot.group);

  // ── 容器 ──
  const glassMat = glassMaterial(envMap, 0.18);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL.r, VESSEL.r, VESSEL.h, 40, 1, true), glassMat);
  glass.position.y = VESSEL.y + VESSEL.h / 2;
  group.add(glass);
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa6c4, metalness: 0.85, roughness: 0.3, envMap, envMapIntensity: 1.2 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL.r + 0.12, VESSEL.r + 0.16, 0.16, 6), metal);
  base.position.y = VESSEL.y + 0.02;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL.r + 0.12, VESSEL.r + 0.12, 0.18, 6), metal);
  cap.position.y = VESSEL.y + VESSEL.h + 0.09;
  group.add(base, cap);
  // 光るふち（瑠璃）
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ACC.a1.neon), toneMapped: false });
  for (const y of [VESSEL.y + 0.11, VESSEL.y + VESSEL.h - 0.01]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(VESSEL.r + 0.13, 0.025, 4, 6), ringMat);
    ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.y = y;
    group.add(ring);
  }
  // ピストン（圧力が高いほど下がる）
  const piston = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL.r - 0.04, VESSEL.r - 0.04, 0.16, 40), metal);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 12), metal);
  rod.position.y = 0.8;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color(ACC.a2.neon), emissive: new THREE.Color(ACC.a2.hex), emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.4 }));
  knob.position.y = 1.62;
  piston.add(disk, rod, knob);
  group.add(piston);
  // 栓（右の管の先）
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 10), metal);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(VESSEL.r + 0.3, GAUGE.y - 0.55, 0);
  group.add(pipe);
  const valve = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), new THREE.MeshStandardMaterial({ color: 0xff5e70, emissive: 0x7a1020, emissiveIntensity: 0.6 }));
  valve.position.set(VESSEL.r + 0.62, GAUGE.y - 0.55, 0);
  group.add(valve);

  // ── 圧力計 ──
  const gc = document.createElement('canvas'); gc.width = gc.height = 256;
  (() => {
    const g = gc.getContext('2d');
    g.fillStyle = '#060a1c'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.strokeStyle = ACC.a1.neon; g.lineWidth = 6; g.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    for (let i = 0; i <= 30; i++) {
      const a = a0 + ((a1 - a0) * i) / 30;
      const big = i % 10 === 0;
      g.strokeStyle = i >= 10 ? ACC.a2.neon : '#8ea3d8'; g.lineWidth = big ? 4 : 2;
      g.beginPath(); g.moveTo(128 + Math.cos(a) * (big ? 86 : 96), 128 + Math.sin(a) * (big ? 86 : 96)); g.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.stroke();
      if (big) { g.fillStyle = '#ffffff'; g.font = `700 26px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${i / 10}`, 128 + Math.cos(a) * 64, 128 + Math.sin(a) * 64); }
    }
    g.fillStyle = 'rgba(220,230,255,0.85)'; g.font = `500 18px ${FONT}`; g.textAlign = 'center';
    g.fillText('×10⁵ Pa', 128, 190);
  })();
  const gaugeTex = new THREE.CanvasTexture(gc);
  const gauge = new THREE.Group();
  gauge.position.set(GAUGE.x, GAUGE.y, GAUGE.z);
  const face = new THREE.Mesh(new THREE.CircleGeometry(GAUGE.r, 40), new THREE.MeshBasicMaterial({ map: gaugeTex, toneMapped: false }));
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(GAUGE.r, 0.05, 8, 40), metal);
  const needle = new THREE.Mesh(new THREE.PlaneGeometry(0.03, GAUGE.r * 0.82), new THREE.MeshBasicMaterial({ color: 0xff5e70, toneMapped: false }));
  needle.geometry.translate(0, GAUGE.r * 0.35, 0);
  needle.position.z = 0.01;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), metal);
  stem.rotation.z = Math.PI / 2; stem.position.set(-0.3, -0.25, -0.05);
  gauge.add(face, bezel, needle, stem);
  group.add(gauge);

  const thermo = makeThermometer(VESSEL.h);
  thermo.group.position.set(-VESSEL.r * 0.5, VESSEL.y, -VESSEL.r * 0.45);
  thermo.group.rotation.z = 0.1;
  group.add(thermo.group);

  // ── 水 ──
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x9fc6ff, transparent: true, opacity: 0.3, roughness: 0.15, emissive: 0x1E50A2, emissiveIntensity: 0.28, depthWrite: false });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL.r - 0.03, VESSEL.r - 0.03, 1, 40), waterMat);
  water.renderOrder = 2;
  group.add(water);

  // ── 分子の粒（水に溶けた粒・上の気体の粒・泡） ──
  const dotGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.3 });
  const dissolved = new THREE.InstancedMesh(dotGeo, dotMat, GAS_VIEW.maxDots);
  const head = new THREE.InstancedMesh(dotGeo, dotMat.clone(), MAX_HEAD);
  dissolved.count = 0; head.count = 0;
  dissolved.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(dissolved, head);
  const bubMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, roughness: 0, clearcoat: 1, envMap, envMapIntensity: 1.5, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 12, 10), bubMat, MAX_BUBBLES);
  bubbles.count = 0;
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(bubbles);

  const rnd = rand(11);
  const seeds = Array.from({ length: Math.max(GAS_VIEW.maxDots, MAX_HEAD) }, () => ({ a: rnd() * Math.PI * 2, r: Math.sqrt(rnd()), y: rnd(), ph: rnd() * 6.28, sp: 0.4 + rnd() * 0.8 }));
  let bubList = [];

  const goal = { waterH: 1, piston: 0, needle: 1, temp: 20, dots: [], headDots: [] };
  const shown = { waterH: 1, piston: 0, needle: 1 };
  let unitText = '';

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);
  const colorCache = {};
  const col = (hex) => colorCache[hex] || (colorCache[hex] = new THREE.Color(hex));

  /** st：気体の実験台の状態。unit：粒1つが表す物質量（mol） */
  function setState(st, unit) {
    goal.waterH = 0.25 + (st.volume / GAS_VIEW.maxVolume) * (VESSEL.h * 0.55);
    goal.piston = (st.pressure - GAS_RANGE.pressure.min) / (GAS_RANGE.pressure.max - GAS_RANGE.pressure.min);
    goal.needle = st.pressure;
    goal.temp = st.temp;
    const def = GASES[st.gas];
    // 水に溶けた粒：成分ごとの物質量 ÷ 粒1つの物質量
    const dots = [];
    if (st.eq.henry && unit > 0) {
      for (const p of st.eq.parts) {
        const k = Math.min(GAS_VIEW.maxDots - dots.length, Math.round(p.n / unit));
        for (let i = 0; i < k; i++) dots.push(GASES[p.id].color);
      }
    }
    goal.dots = dots;
    // 上の気体の粒：圧力に比例（成分の割合で色を分ける）
    const nh = Math.min(MAX_HEAD, Math.round(st.pressure * 14));
    const mix = def.mix.length ? def.mix : [{ id: st.gas, frac: 1 }];
    const headDots = [];
    let acc = 0;
    for (const m of mix) {
      acc += m.frac;
      while (headDots.length < Math.round(nh * acc)) headDots.push(GASES[m.id].color);
    }
    goal.headDots = headDots;
    if (st.gas === 'HCl') goal.headDots = headDots.map(() => GASES.HCl.color);
    unitText = unit;
  }

  function place(mesh, list, yMin, yMax, now, wobble) {
    mesh.count = list.length;
    list.forEach((hex, i) => {
      const s = seeds[i];
      const a = s.a + now * 0.15 * s.sp;
      const r = (VESSEL.r - 0.15) * s.r;
      const y = yMin + (yMax - yMin) * (0.08 + 0.84 * ((s.y + Math.sin(now * s.sp * wobble + s.ph) * 0.04 + 1) % 1));
      tmpM.compose(tmpV.set(Math.cos(a) * r, y, Math.sin(a) * r), tmpQ, tmpS);
      mesh.setMatrixAt(i, tmpM);
      mesh.setColorAt(i, col(hex));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  return {
    group,
    setState,
    redraw() {},
    showExtras() {},
    /** 栓を開けたときの泡。count：泡の数 */
    bubble(count) {
      const n = Math.min(MAX_BUBBLES, Math.max(0, Math.round(count)));
      bubList = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 1.4, z: (Math.random() - 0.5) * 1.4, y: VESSEL.y + 0.1 + Math.random() * shown.waterH * 0.9, v: 0.6 + Math.random() * 0.9, s: 0.5 + Math.random() * 0.9, delay: Math.random() * 0.8 }));
    },
    views() {
      const wy = VESSEL.y + shown.waterH / 2;
      return {
        all: { target: [0.35, 2.75, 0], w: 3.9, h: 5.4, az: 0, el: 0.18 },
        water: { target: [0, wy, 0], w: 2.4, h: Math.max(1.6, shown.waterH + 0.5), az: 0.2, el: 0.32 },
        gauge: { target: [GAUGE.x, GAUGE.y, GAUGE.z], w: 1.3, h: 1.3, az: 0, el: 0.02 },
      };
    },
    unit() { return unitText; },
    frame(now, dt) {
      const k = 1 - Math.exp(-6 * dt);
      shown.waterH += (goal.waterH - shown.waterH) * k;
      shown.piston += (goal.piston - shown.piston) * k;
      shown.needle += (goal.needle - shown.needle) * k;
      water.scale.y = shown.waterH;
      water.position.y = VESSEL.y + shown.waterH / 2;
      const top = VESSEL.y + VESSEL.h - 0.12;
      const low = VESSEL.y + shown.waterH + 0.6;
      const py = top - (top - Math.min(top - 0.2, low + 0.6)) * shown.piston * 0.9;
      piston.position.y = py;
      // 針：0〜3×10⁵ Pa を 270°に
      needle.rotation.z = -(Math.PI * 0.75 + (Math.PI * 1.5 * shown.needle) / 3) - Math.PI / 2;
      const h = (goal.temp - GAS_RANGE.temp.min) / (GAS_RANGE.temp.max - GAS_RANGE.temp.min);
      hot.set(h, now);
      thermo.set(h);
      place(dissolved, goal.dots, VESSEL.y + 0.05, VESSEL.y + shown.waterH, now, 0.6);
      place(head, goal.headDots, VESSEL.y + shown.waterH + 0.05, py - 0.1, now, 2.2);
      // 泡：水の中を上がり、水面で消える
      let live = 0;
      bubList.forEach((b) => {
        if (b.delay > 0) { b.delay -= dt; return; }
        b.y += b.v * dt;
        if (b.y > VESSEL.y + shown.waterH) { b.done = true; return; }
        const s = b.s * (1 + (b.y - VESSEL.y) * 0.15);
        tmpM.compose(tmpV.set(b.x + Math.sin(now * 6 + b.v * 9) * 0.03, b.y, b.z), tmpQ, tmpS.set(s, s, s));
        bubbles.setMatrixAt(live++, tmpM);
      });
      tmpS.set(1, 1, 1);
      bubList = bubList.filter((b) => !b.done);
      bubbles.count = live;
      bubbles.instanceMatrix.needsUpdate = true;
    },
  };
}
