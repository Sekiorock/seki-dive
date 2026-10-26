// crystal/src/bench-conc.js
// 濃度の実験台の3D（全体の仕様書 8章、教科書 p.70〜71）。
//   ・メスシリンダーに溶液。液の高さは溶液の体積（質量 ÷ 密度）に合わせて変わる。
//   ・溶けている溶質の粒（粒1つ = CONC_VIEW.molPerDot mol）が液の中を漂う。

import { CONC_SOLUTES, CONC_VIEW } from './config.js';
import { glassMaterial } from './bench-solid.js';
import { ACCENTS } from '../../shared/theme.js';

const ACC = ACCENTS.crystal;
const CYL = { r: 0.72, h: 4.6, y: 0.3 };
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createConcBench({ envMap }) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3456, metalness: 0.6, roughness: 0.35, envMap });
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.22, 6), metal);
  foot.position.y = 0.11;
  group.add(foot);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.03, 4, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(ACC.a2.neon), toneMapped: false }));
  edge.rotation.x = Math.PI / 2; edge.rotation.z = Math.PI / 6; edge.position.y = 0.23;
  group.add(edge);

  const glassMat = glassMaterial(envMap, 0.17);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(CYL.r, CYL.r, CYL.h, 36, 1, true), glassMat);
  glass.position.y = CYL.y + CYL.h / 2;
  group.add(glass);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.75, toneMapped: false });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(CYL.r, 0.025, 6, 36), rimMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = CYL.y + CYL.h;
  group.add(rim);
  // 目盛り：100 mL ごと、200 mL ごとに数字
  const yOf = (ml) => CYL.y + (ml / CONC_VIEW.cylinderMl) * CYL.h;
  for (let ml = 100; ml <= CONC_VIEW.cylinderMl - 100; ml += 100) {
    const big = ml % 200 === 0;
    const tick = new THREE.Mesh(new THREE.TorusGeometry(CYL.r + 0.004, big ? 0.012 : 0.008, 3, 16, big ? Math.PI / 4 : Math.PI / 7), rimMat);
    tick.rotation.x = Math.PI / 2; tick.rotation.z = Math.PI / 2 - (big ? Math.PI / 8 : Math.PI / 14);
    tick.position.y = yOf(ml);
    group.add(tick);
    if (big) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 48;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.font = `700 30px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`${ml}`, 4, 24);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
      sp.scale.set(0.42, 0.16, 1);
      sp.position.set(0.32, yOf(ml), CYL.r + 0.05);
      group.add(sp);
    }
  }
  const unitLabel = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 48;
    const g = c.getContext('2d');
    g.fillStyle = ACC.a2.neon; g.font = `700 30px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('mL', 4, 24);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(0.42, 0.16, 1);
    sp.position.set(-0.25, CYL.y + CYL.h - 0.25, CYL.r + 0.05);
    return sp;
  })();
  group.add(unitLabel);

  const liqMat = new THREE.MeshStandardMaterial({ color: 0x9fc6ff, transparent: true, opacity: 0.34, roughness: 0.15, emissive: 0x1E50A2, emissiveIntensity: 0.3, depthWrite: false });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(CYL.r - 0.03, CYL.r - 0.03, 1, 36), liqMat);
  liquid.renderOrder = 2;
  group.add(liquid);
  // メニスカス（液面のふち）
  const meniscus = new THREE.Mesh(new THREE.TorusGeometry(CYL.r - 0.05, 0.03, 6, 36), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.6, toneMapped: false }));
  meniscus.rotation.x = Math.PI / 2;
  group.add(meniscus);

  const dotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.3 });
  const dots = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06), dotMat, CONC_VIEW.maxDots);
  dots.count = 0;
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(dots);
  const rnd = rand(5);
  const seeds = Array.from({ length: CONC_VIEW.maxDots }, () => ({ a: rnd() * Math.PI * 2, r: Math.sqrt(rnd()), y: rnd(), ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.7 }));

  const goal = { h: 1, n: 0, color: '#ffffff', tint: 0 };
  const shown = { h: 1 };
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

  function setState(st) {
    const e = st.eq;
    goal.h = Math.max(0.05, Math.min(CYL.h - 0.05, (e.volMl / CONC_VIEW.cylinderMl) * CYL.h));
    goal.n = Math.min(CONC_VIEW.maxDots, Math.round(e.n / CONC_VIEW.molPerDot));
    goal.color = CONC_SOLUTES[st.solute].color;
    goal.tint = Math.min(1, e.percent / 40);
    dotMat.color.set(goal.color);
    dotMat.emissive.set(goal.color);
  }

  return {
    group,
    setState,
    redraw() {},
    showExtras() {},
    views() {
      const ly = CYL.y + shown.h / 2;
      return {
        all: { target: [0, 2.55, 0], w: 3.0, h: 5.2, az: 0, el: 0.16 },
        liquid: { target: [0, ly, 0], w: 1.9, h: Math.max(1.4, shown.h + 0.4), az: 0.15, el: 0.25 },
      };
    },
    frame(now, dt) {
      const k = 1 - Math.exp(-6 * dt);
      shown.h += (goal.h - shown.h) * k;
      liquid.scale.y = shown.h;
      liquid.position.y = CYL.y + shown.h / 2;
      meniscus.position.y = CYL.y + shown.h;
      liqMat.color.copy(new THREE.Color(0x9fc6ff).lerp(new THREE.Color(goal.color), goal.tint * 0.5));
      dots.count = goal.n;
      for (let i = 0; i < goal.n; i++) {
        const s = seeds[i];
        const a = s.a + now * 0.2 * s.sp;
        const r = (CYL.r - 0.14) * s.r;
        const y = CYL.y + 0.06 + (shown.h - 0.12) * ((s.y + Math.sin(now * s.sp + s.ph) * 0.03 + 1) % 1);
        tmpE.set(now * s.sp, now * 0.7 + s.ph, 0);
        tmpQ.setFromEuler(tmpE);
        tmpM.compose(tmpV.set(Math.cos(a) * r, y, Math.sin(a) * r), tmpQ, tmpS);
        dots.setMatrixAt(i, tmpM);
      }
      dots.instanceMatrix.needsUpdate = true;
    },
  };
}
