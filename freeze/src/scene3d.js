// freeze/src/scene3d.js
// 冬の峠道の3D（全体の仕様書 9章）。
//   ・雪の山のあいだを、6つの区間に分かれた峠道がうねって通る。区間ごとに番号と予報の札。
//   ・夜は雪が降り、気温が下がる。区間の気温が凝固点を下回ると、その区間の路面が白く凍りつく。
//   ・指でなぞると回る、2本指で寄る・引く。下の操作盤より上の「見える場所」に、峠道全体が入るように距離を決める。
// 軽く保つため、影は使わない。物体は60個まで。

import { RENDER, SPREAD, GLOW } from './config.js';
import { createGlow } from '../../shared/glow.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';

const ACC = ACCENTS.freeze;
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 峠道の中心線（xz平面）。u：0〜1
function roadPoint(u) {
  const x = (u - 0.5) * 11;
  const z = Math.sin(u * Math.PI * 2.2) * 1.8 - 0.4;
  return new THREE.Vector3(x, 0.02 + Math.sin(u * Math.PI) * 0.6, z);
}

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060a1e, 14, 34);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x0a0f25, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  moon.position.set(-4, 8, 3);
  scene.add(moon);
  const lampA = new THREE.PointLight(hexToInt(ACC.a1.neon), 0.9, 16, 1.4);
  lampA.position.set(-3, 3, 3);
  const lampB = new THREE.PointLight(hexToInt(ACC.a2.neon), 0.5, 16, 1.4);
  lampB.position.set(4, 2.5, 2);
  scene.add(lampA, lampB);
  // v1.0：映えの演出（ステージが進むほど豪華に）
  const glow = createGlow(scene, GLOW);

  // ── 雪の地面と山 ──
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 6), new THREE.MeshStandardMaterial({ color: 0x4a5a86, roughness: 0.95, emissive: 0x0e1638, emissiveIntensity: 0.5 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a3456, roughness: 0.9, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef4ff, roughness: 0.7, flatShading: true, emissive: 0x2a3a66, emissiveIntensity: 0.4 });
  const rnd = rand(5);
  const MOUNTS = [[-6, -6, 3.4], [-2, -7.5, 4.2], [3, -6.8, 3.8], [7, -5.5, 3.0], [-8.5, -2.5, 2.4], [8.8, -1.5, 2.6], [0.5, -9.5, 5]];
  for (const [x, z, h] of MOUNTS) {
    const r = h * 0.75;
    const body = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6 + Math.floor(rnd() * 3)), rockMat);
    body.position.set(x, h / 2 - 0.05, z);
    body.rotation.y = rnd() * 3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, h * 0.42, body.geometry.parameters.radialSegments), snowMat);
    cap.position.set(x, h - h * 0.21 - 0.05, z);
    cap.rotation.y = body.rotation.y;
    scene.add(body, cap);
  }
  // 木（雪をかぶった針葉樹）
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d3b45, roughness: 0.9, flatShading: true });
  for (let k = 0; k < 10; k++) {
    const u = rnd();
    const p = roadPoint(u);
    const side = rnd() < 0.5 ? -1 : 1;
    const tr = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), k % 3 ? treeMat : snowMat);
    tr.position.set(p.x + (rnd() - 0.5) * 0.8, 0.45, p.z + side * (1.3 + rnd() * 1.2));
    scene.add(tr);
  }

  // ── 峠道（6区間） ──
  const N = 3;          // 区間の数（v0.3 から3つ）
  const sections = [];
  const posts = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    const steps = 10;
    const pos = [];
    const idx = [];
    const W = 0.55;
    for (let j = 0; j <= steps; j++) {
      const u = (k + j / steps) / N;
      const p = roadPoint(u);
      tmpA.copy(roadPoint(Math.min(1, u + 0.002))).sub(roadPoint(Math.max(0, u - 0.002))).normalize();
      tmpB.set(-tmpA.z, 0, tmpA.x);
      pos.push(p.x + tmpB.x * W, p.y + 0.03, p.z + tmpB.z * W, p.x - tmpB.x * W, p.y + 0.03, p.z - tmpB.z * W);
      if (j < steps) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b2442, roughness: 0.35, metalness: 0.2, emissive: 0x0c1430, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    scene.add(mesh);
    // 区間の境目の光る線
    const mid = roadPoint((k + 0.5) / N);
    const edge = roadPoint(k / N);
    if (k > 0) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), new THREE.MeshBasicMaterial({ color: hexToInt(ACC.a2.neon), toneMapped: false }));
      post.position.set(edge.x, edge.y + 0.25, edge.z + 0.75);
      scene.add(post);
      posts.push(post);
    }
    // 札（番号・予報・いまの気温）
    const c = document.createElement('canvas'); c.width = 256; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    label.scale.set(2.4, 1.5, 1);
    label.position.set(mid.x, mid.y + 1.55, mid.z);
    label.renderOrder = 10;
    scene.add(label);
    // ステージ4：物干しの竿と布
    const clothG = new THREE.Group();
    clothG.position.set(mid.x, mid.y, mid.z);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6b7590, roughness: 0.6 });
    for (const dx of [-0.45, 0.45]) { const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), postMat); pst.position.set(dx, 0.47, 0); clothG.add(pst); }
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.015, 0.015), postMat); rope.position.y = 0.92; clothG.add(rope);
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x0c1430, emissiveIntensity: 0.4 });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.55, 6, 4), clothMat);
    cloth.position.y = 0.64;
    clothG.add(cloth);
    clothG.visible = false;
    scene.add(clothG);
    // ステージ5：湯の釜と湯気
    const potG = new THREE.Group();
    potG.position.set(mid.x, mid.y, mid.z);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.42, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
    pot.position.y = 0.32;
    const hotMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x1E4060, emissiveIntensity: 0.4, roughness: 0.2 });
    const hotWater = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), hotMat);
    hotWater.rotation.x = -Math.PI / 2; hotWater.position.y = 0.48;
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.25, 6), new THREE.MeshBasicMaterial({ color: 0xff7a3a, toneMapped: false, transparent: true, opacity: 0.85 }));
    fire.position.y = 0.06;
    const stG = new THREE.BufferGeometry();
    const stPos = new Float32Array(24 * 3);
    stG.setAttribute('position', new THREE.BufferAttribute(stPos, 3));
    const steam = new THREE.Points(stG, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0, depthWrite: false }));
    potG.add(pot, hotWater, fire, steam);
    potG.visible = false;
    scene.add(potG);
    // ステージ6：逆浸透の水槽（左：海水、まん中：半透膜、右：真水）
    const tankG = new THREE.Group();
    tankG.position.set(mid.x, mid.y, mid.z);
    const glassM = new THREE.MeshStandardMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const tank = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.45), glassM);
    tank.position.y = 0.42;
    const memb = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.8), new THREE.MeshBasicMaterial({ color: 0xFFC074, transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false }));
    memb.rotation.y = Math.PI / 2; memb.position.y = 0.42;
    const seaW = new THREE.Mesh(new THREE.BoxGeometry(0.47, 1, 0.42), new THREE.MeshStandardMaterial({ color: 0x2a6bd8, transparent: true, opacity: 0.7, emissive: 0x0a2a6a, emissiveIntensity: 0.4 }));
    seaW.position.x = -0.25;
    const freshM = new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.6, emissive: 0x2a5a7a, emissiveIntensity: 0.3 });
    const freshW = new THREE.Mesh(new THREE.BoxGeometry(0.47, 1, 0.42), freshM);
    freshW.position.x = 0.25;
    const piston = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.42), new THREE.MeshStandardMaterial({ color: 0x9aa6c4, metalness: 0.8, roughness: 0.3 }));
    piston.position.x = -0.25;
    tankG.add(tank, memb, seaW, freshW, piston);
    tankG.visible = false;
    scene.add(tankG);
    // ステージ7：鑑定のフラスコ
    const flaskG = new THREE.Group();
    flaskG.position.set(mid.x, mid.y, mid.z);
    const flaskMat = new THREE.MeshStandardMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.55, 20, 1, true), flaskMat); body.position.y = 0.3;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12, 1, true), flaskMat); neck.position.y = 0.72;
    const liqMat = new THREE.MeshStandardMaterial({ color: 0x8FF3FA, emissive: 0x2a6a7a, emissiveIntensity: 0.6, transparent: true, opacity: 0.8 });
    const liq = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 20), liqMat); liq.position.y = 0.17;
    flaskG.add(body, neck, liq);
    flaskG.visible = false;
    scene.add(flaskG);
    sections.push({ mesh, mat, label, c, tex, mid, frost: 0, goalFrost: 0, key: '', info: null, clothG, clothMat, cloth, potG, hotMat, fire, steam, stPos, stG, tankG, seaW, freshW, piston, freshM, flaskG, liqMat });
  }

  // ── 撒く粒（v0.4）：区間ごとに点の集まり。粒が空から落ちて路面（釜・布）に着き、電解質は i 個の粒に分かれる ──
  const SPM = SPREAD.maxDots;
  const ION_COL = { cat: new THREE.Color(0xFFC074), an: new THREE.Color(0x8FF3FA) };
  for (const sc of sections) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(SPM * 3).fill(-50);
    const col = new Float32Array(SPM * 3).fill(1);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    pts.frustumCulled = false;
    pts.renderOrder = 5;
    scene.add(pts);
    sc.sp = { geo, pos, col, pts, dots: [] };
  }
  let spreadT0 = -1;
  function clearSpreadAll() {
    spreadT0 = -1;
    for (const sc of sections) { sc.sp.dots = []; sc.sp.pos.fill(-50); sc.sp.geo.attributes.position.needsUpdate = true; }
  }
  /** list：[{ dots, split, color, ions } | { drops }] */
  function startSpread(list) {
    const rr = rand(11);
    sections.forEach((sc, k) => {
      const it = list[k] || {};
      const dots = [];
      const mid = sc.mid;
      if (it.drops) {
        for (let q = 0; q < it.drops; q++) {
          const lx = mid.x + (rr() - 0.5) * 0.7, ly = mid.y + 0.42 + rr() * 0.42, lz = mid.z + (rr() - 0.5) * 0.06;
          dots.push({ sx: lx + (rr() - 0.5) * 0.3, sy: mid.y + 2.4 + rr() * 0.8, sz: lz, lx, ly, lz, ox: 0, oz: 0, d: rr() * 0.55, c: new THREE.Color(0x7fc4ff), c0: new THREE.Color(0x7fc4ff), vanish: true });
        }
      } else {
        const split = Math.max(1, it.split || 1);
        const grains = Math.ceil((it.dots || 0) / split);
        const base = new THREE.Color(it.color || '#ffffff');
        for (let gi = 0; gi < grains; gi++) {
          let lx, ly, lz;
          if (theme === 'boil') { const a = rr() * Math.PI * 2, r = Math.sqrt(rr()) * 0.32; lx = mid.x + Math.cos(a) * r; lz = mid.z + Math.sin(a) * r; ly = mid.y + 0.47; }
          else {
            const u = (k + 0.08 + rr() * 0.84) / N;
            const p = roadPoint(u);
            lx = p.x; lz = p.z + (rr() - 0.5) * 0.85; ly = p.y + 0.07;
          }
          const sx = lx + (rr() - 0.5) * 0.6, sy = mid.y + 2.6 + rr() * 1.2, sz = lz + (rr() - 0.5) * 0.6;
          const d = rr() * 0.5;
          for (let j = 0; j < split && dots.length < SPM; j++) {
            const a = (j / split) * Math.PI * 2 + rr();
            const ion = it.ions ? (j === 0 ? 'cat' : 'an') : null;
            dots.push({ sx, sy, sz, lx, ly, lz, ox: split > 1 ? Math.cos(a) * 0.09 : 0, oz: split > 1 ? Math.sin(a) * 0.09 : 0, d, c0: base, c: ion ? ION_COL[ion] : base });
          }
        }
      }
      sc.sp.dots = dots;
    });
    spreadT0 = -2;   // 次の frame で、その時刻から始める
  }
  function stepSpread(now) {
    if (spreadT0 === -1) return;
    if (spreadT0 === -2) spreadT0 = now;
    const p = (now - spreadT0) / SPREAD.sec;
    for (const sc of sections) {
      const { pos, col, dots, geo } = sc.sp;
      dots.forEach((o, i) => {
        const f = Math.max(0, Math.min(1, (p - o.d) / 0.32));
        let x, y, z, c = o.c0;
        if (f < 1) { x = o.sx + (o.lx - o.sx) * f; y = o.sy + (o.ly - o.sy) * f * f; z = o.sz + (o.lz - o.sz) * f; }
        else if (o.vanish) { x = 0; y = -50; z = 0; }
        else {
          const q = Math.max(0, Math.min(1, (p - o.d - 0.32) / 0.14));
          x = o.lx + o.ox * q; y = o.ly; z = o.lz + o.oz * q; c = q > 0.2 ? o.c : o.c0;
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      });
      for (let i = dots.length; i < SPM; i++) pos[i * 3 + 1] = -50;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
    if (p > 1.2) spreadT0 = -3;   // 止める（粒はそのまま残す）
  }

  // ── 浸透圧の綱引き（v0.4）：半透膜で仕切ったU字管。左がチームA（白群）、右がチームB（臙脂） ──
  const tugG = new THREE.Group();
  tugG.position.set(0, -0.3, 1.2);
  tugG.scale.setScalar(1.75);
  const TUBE_R = 0.5, BASE = 1.5, CM = 0.075;     // 液面の高さ（ふだん）、1 cm あたりの高さ
  const tubeGlass = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const tubeCol = {};
  const liquid = {};
  for (const [tm, x, col] of [['A', -1.4, ACC.a1.neon], ['B', 1.4, ACC.a2.neon]]) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R + 0.06, TUBE_R + 0.06, 3.2, 24, 1, true), tubeGlass);
    g.position.set(x, 1.75, 0);
    const lm = new THREE.MeshStandardMaterial({ color: hexToInt(col), transparent: true, opacity: 0.55, emissive: hexToInt(col), emissiveIntensity: 0.35, roughness: 0.2 });
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R, TUBE_R, 1, 24), lm);
    liq.position.set(x, 0.15 + BASE / 2, 0);
    liq.scale.y = BASE;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TUBE_R + 0.08, 0.025, 6, 32), new THREE.MeshBasicMaterial({ color: 0xFFD86B, toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    tugG.add(g, liq, ring);
    liquid[tm] = { liq, ring, x, lm };
    tubeCol[tm] = col;
  }
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(2.8 + TUBE_R * 2, 0.32, TUBE_R * 1.6), new THREE.MeshStandardMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.45, emissive: 0x1a3a7a, emissiveIntensity: 0.4 }));
  bottom.position.set(0, 0.16, 0);
  const memb = new THREE.Mesh(new THREE.PlaneGeometry(TUBE_R * 1.7, 0.5), new THREE.MeshBasicMaterial({ color: 0xFFC074, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }));
  memb.rotation.y = Math.PI / 2; memb.position.set(0, 0.2, 0);
  tugG.add(bottom, memb);
  // 膜をこえて動く水の分子
  const FLN = 40;
  const flPos = new Float32Array(FLN * 3);
  const flG = new THREE.BufferGeometry();
  flG.setAttribute('position', new THREE.BufferAttribute(flPos, 3));
  const flow = new THREE.Points(flG, new THREE.PointsMaterial({ color: 0xcfefff, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  tugG.add(flow);
  // 札（チーム名）
  function teamLabel(text, col) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,10,28,0.85)'; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
    g.fillStyle = '#fff'; g.font = `700 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, toneMapped: false }));
    sp.scale.set(1.3, 0.49, 1);
    sp.renderOrder = 10;
    return sp;
  }
  const labA = teamLabel('A', ACC.a1.neon); labA.position.set(-1.4, 3.7, 0);
  const labB = teamLabel('B', ACC.a2.neon); labB.position.set(1.4, 3.7, 0);
  tugG.add(labA, labB);
  tugG.visible = false;
  scene.add(tugG);
  const tug = { h: 0, shown: 0, goal: 10, flow: 0 };
  function stepTug(now, dt) {
    tug.shown += (tug.h - tug.shown) * (1 - Math.exp(-3 * dt));
    for (const tm of ['A', 'B']) {
      const L = liquid[tm];
      const hh = Math.max(0.3, BASE + (tm === 'A' ? 1 : -1) * tug.shown * CM);
      L.liq.scale.y = hh; L.liq.position.y = 0.15 + hh / 2;
      L.ring.position.set(L.x, 0.15 + BASE + tug.goal * CM, 0);
    }
    const dir = tug.flow;
    for (let q = 0; q < FLN; q++) {
      const ph = ((now * 0.5 + q / FLN) % 1);
      const x = dir ? (dir > 0 ? 1.4 - ph * 2.8 : -1.4 + ph * 2.8) : (q / FLN - 0.5) * 2.6 + Math.sin(now * 2 + q) * 0.05;
      flPos[q * 3] = x; flPos[q * 3 + 1] = 0.12 + ((q * 37) % 10) / 40; flPos[q * 3 + 2] = (((q * 53) % 10) / 10 - 0.5) * 0.6;
    }
    flow.material.opacity = dir ? 0.95 : 0.35;
    flG.attributes.position.needsUpdate = true;
  }

  // ── 海（ステージ4：港） ──
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(34, 7), new THREE.MeshStandardMaterial({ color: 0x0e2a5a, roughness: 0.25, metalness: 0.3, emissive: 0x061a3a, emissiveIntensity: 0.5 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.0, 5.2);
  sea.visible = false;
  scene.add(sea);
  let theme = 'freeze';
  let labelsOn = true;

  // ── 雪 ──
  const SN = RENDER.snow;
  const snowPos = new Float32Array(SN * 3);
  const snowSpd = new Float32Array(SN);
  for (let i = 0; i < SN; i++) {
    snowPos.set([(rnd() - 0.5) * 16, rnd() * 7, (rnd() - 0.5) * 12], i * 3);
    snowSpd[i] = 0.3 + rnd() * 0.6;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
  scene.add(snowPts);
  let snowRate = 0.4;

  function drawLabel(s) {
    const inf = s.info;
    if (!inf) return;
    const key = JSON.stringify(inf);
    if (key === s.key) return;
    s.key = key;
    const g = s.c.getContext('2d');
    g.clearRect(0, 0, 256, 160);
    const col = inf.frozen ? '#ffffff' : inf.bad ? ACC.a2.neon : inf.ok ? '#E6B422' : inf.safe === false ? ACC.a2.neon : ACC.a1.neon;
    g.fillStyle = inf.frozen ? 'rgba(180,220,255,0.9)' : inf.bad ? 'rgba(60,10,20,0.88)' : 'rgba(6,10,28,0.85)';
    g.beginPath(); g.moveTo(14, 0); g.lineTo(256, 0); g.lineTo(256, 132); g.lineTo(242, 146); g.lineTo(140, 146); g.lineTo(128, 160); g.lineTo(116, 146); g.lineTo(0, 146); g.lineTo(0, 14); g.closePath(); g.fill();
    g.strokeStyle = col; g.lineWidth = 5; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = inf.frozen ? '#05081A' : '#ffffff';
    g.font = `700 34px ${FONT}`;
    g.fillText(inf.title, 128, 32);
    g.font = `700 40px ${FONT}`;
    g.fillStyle = inf.frozen ? '#05081A' : col;
    g.fillText(inf.big, 128, 80);
    g.font = `500 24px ${FONT}`;
    g.fillStyle = inf.frozen ? '#1E2A50' : 'rgba(220,230,255,0.9)';
    g.fillText(inf.small, 128, 120);
    s.tex.needsUpdate = true;
  }

  // ── カメラ ──
  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 80);
  const port = { top: 0, bottom: 1, w: 1, h: 1 };
  const user = { az: 0, el: 0.62, zoom: 1 };
  const cur = { az: 0, el: 0.62, dist: 14 };
  const target = new THREE.Vector3(0, 0.4, -0.6);
  let goalDist = 14;
  function fit() {
    const tan = Math.tan(THREE.MathUtils.degToRad(RENDER.fov / 2));
    const hf = Math.max(80, port.bottom - port.top);
    const w = 12.5, h = 5.5;
    const byH = (h / 2 / tan) * (port.h / hf);
    const byW = w / 2 / (tan * (port.w / port.h));
    goalDist = Math.max(byH, byW) * 1.02 * user.zoom;
  }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    port.w = w; port.h = h;
    if (port.bottom <= port.top || port.bottom > h) { port.top = 0; port.bottom = h; }
    const d = Math.round(h / 2 - (port.top + port.bottom) / 2);
    if (d) camera.setViewOffset(w, h, 0, d, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    fit();
  }
  window.addEventListener('resize', resize);
  const pts = new Map();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1; }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      user.az = clamp(user.az - dx * 0.006, -1.2, 1.2);
      user.el = clamp(user.el + dy * 0.004, 0.15, 1.35);
      cur.az = user.az; cur.el = user.el;
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      user.zoom = clamp(user.zoom * (pinch / d), 0.35, 1.8);
      pinch = d;
      fit();
      cur.dist = goalDist;
    }
  });
  const up = (e) => { pts.delete(e.pointerId); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); user.zoom = clamp(user.zoom * Math.exp(e.deltaY * 0.0012), 0.35, 1.8); fit(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { user.az = 0; user.el = 0.62; user.zoom = 1; fit(); });
  resize();
  cur.dist = goalDist;

  let last = 0;
  return {
    /** v1.0：映えの段階（0〜8） */
    setGlow(n) { if (glow.level !== n) glow.setLevel(n); },
    setViewport(top, bottom) { port.top = top; port.bottom = bottom; resize(); },
    /**
     * 区間の見た目。list：[{ title, big, small, frozen, safe }]、frost：0〜1（凍り方）
     */
    /** ステージの見た目：'freeze' | 'curve'（峠道）、'vapor'（港の物干し）、'boil'（温泉宿の釜） */
    setTheme(kind) {
      theme = kind;
      clearSpreadAll();
      sea.visible = kind === 'vapor';
      const isTug = kind === 'tug';
      tugG.visible = isTug;
      for (const s of sections) { s.mesh.visible = !isTug; s.label.visible = !isTug && labelsOn; }
      for (const pst of posts) pst.visible = !isTug;
      for (const s of sections) { s.clothG.visible = kind === 'vapor'; s.potG.visible = kind === 'boil'; s.tankG.visible = kind === 'osmo'; s.flaskG.visible = kind === 'mm'; s.goalFrost = 0; s.frost = 0; s.key = ''; }
    },
    setSections(list) {
      list.forEach((inf, k) => {
        const s = sections[k];
        if (!s) return;
        s.info = inf;
        s.goalFrost = inf.frozen ? 1 : 0;
      });
    },
    /** 夜の深さ：0（夕方）〜1（真夜中）。雪の降り方と空の暗さ */
    /** 朝日：0（夜）〜1（朝）。明かりを暖かくする */
    setDawn(k) {
      const c = new THREE.Color(0xbfd8ff).lerp(new THREE.Color(0xffd2a8), k * 0.8);
      hemi.color.copy(c);
      moon.color.copy(new THREE.Color(0xdfe8ff).lerp(new THREE.Color(0xffb07a), k));
      moon.intensity = 0.45 + k * 0.6;
    },
    setNight(depth) {
      snowRate = 0.3 + depth * 0.9;
      hemi.intensity = 0.6 - depth * 0.25;
      moon.intensity = 0.7 - depth * 0.25;
    },
    spread(list) { startSpread(list); },
    /** 区間の札を見せるか（タイトル・対戦の入口では隠す） */
    showLabels(v) { labelsOn = v; for (const sc of sections) sc.label.visible = v && theme !== 'tug'; labA.visible = v; labB.visible = v; },
    /** 綱引き：h（cm、Aが高いと正）、goal（cm）、flow（水の動く向き：+ は A の側へ） */
    setTug(o) {
      if (theme !== 'tug') this.setTheme('tug');
      tug.h = o.h; tug.goal = o.goal; tug.flow = o.flow || 0;
    },
    clearSpread() { clearSpreadAll(); },
    resetView() { user.az = 0; user.el = 0.62; user.zoom = 1; fit(); },
    frame(nowMs) {
      const now = nowMs / 1000;
      const dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      glow.step(now, dt);
      for (const s of sections) {
        s.frost += (s.goalFrost - s.frost) * (1 - Math.exp(-2.5 * dt));
        const c = new THREE.Color(0x1b2442).lerp(new THREE.Color(0xeaf6ff), s.frost);
        s.mat.color.copy(c);
        s.mat.emissive.copy(new THREE.Color(0x0c1430).lerp(new THREE.Color(0x5fd6ff), s.frost));
        s.mat.emissiveIntensity = 0.6 + s.frost * 0.5 + (s.frost > 0.5 ? Math.sin(now * 4 + s.mid.x) * 0.1 : 0);
        s.mat.roughness = 0.35 - s.frost * 0.25;
        drawLabel(s);
        const inf = s.info || {};
        if (theme === 'vapor') {
          const p = inf.progress || 0;
          s.clothMat.color.copy(new THREE.Color(0x2a3a5c).lerp(new THREE.Color(0xf4f8ff), p));
          s.clothMat.emissiveIntensity = 0.4 + p * 0.3;
          const pa = s.cloth.geometry.attributes.position;
          for (let v = 0; v < pa.count; v++) { const x = pa.getX(v), y = pa.getY(v); pa.setZ(v, Math.sin(now * 2.2 + x * 5 + s.mid.x) * 0.05 * (0.6 - y)); }
          pa.needsUpdate = true;
        } else if (theme === 'osmo') {
          const p = inf.progress || 0;
          const f = inf.fail ? Math.max(0.05, 0.3 - p * 0.25) : 0.3 + p * 0.35;
          const sw = inf.fail ? 0.5 + p * 0.15 : 0.5 - p * 0.18;
          s.freshW.scale.y = f; s.freshW.position.y = 0.03 + f / 2;
          s.seaW.scale.y = sw; s.seaW.position.y = 0.03 + sw / 2;
          s.piston.position.y = 0.03 + sw + 0.03;
          s.freshM.emissive.copy(new THREE.Color(0x2a5a7a).lerp(new THREE.Color(inf.bad ? 0x7a2030 : 0x5fd6ff), p));
        } else if (theme === 'mm') {
          const p = inf.progress || 0;
          s.liqMat.emissive.copy(new THREE.Color(0x2a6a7a).lerp(new THREE.Color(inf.bad ? 0xff3050 : inf.ok ? 0xffd86b : 0x8FF3FA), p >= 1 ? 1 : 0.3 + Math.sin(now * 6 + s.mid.x) * 0.2));
        } else if (theme === 'boil') {
          const p = inf.progress || 0;
          s.fire.scale.setScalar(0.6 + p * 0.5 + Math.sin(now * 12 + s.mid.x) * 0.08);
          s.hotMat.emissive.copy(new THREE.Color(0x1E4060).lerp(new THREE.Color(inf.bad ? 0x602020 : 0x5fd6ff), p));
          const on = inf.boiling ? 1 : p * 0.3;
          s.steam.material.opacity = 0.65 * on;
          for (let q = 0; q < 24; q++) {
            const ph = (now * 0.6 + q / 24) % 1;
            s.stPos[q * 3] = Math.sin(q * 2.3 + now) * 0.2 * (1 + ph);
            s.stPos[q * 3 + 1] = 0.5 + ph * 1.1;
            s.stPos[q * 3 + 2] = Math.cos(q * 1.7) * 0.2 * (1 + ph);
          }
          s.stG.attributes.position.needsUpdate = true;
        }
      }
      if (spreadT0 !== -1 && spreadT0 !== -3) stepSpread(now);
      if (theme === 'tug') stepTug(now, dt);
      for (let i = 0; i < SN; i++) {
        let y = snowPos[i * 3 + 1] - snowSpd[i] * snowRate * dt;
        if (y < 0) y += 7;
        snowPos[i * 3 + 1] = y;
        snowPos[i * 3] += Math.sin(now + i) * 0.002;
      }
      snowGeo.attributes.position.needsUpdate = true;
      fit();
      cur.dist += (goalDist - cur.dist) * (1 - Math.exp(-6 * dt));
      cur.az += (user.az - cur.az) * (1 - Math.exp(-6 * dt));
      cur.el += (user.el - cur.el) * (1 - Math.exp(-6 * dt));
      const ce = Math.cos(cur.el);
      camera.position.set(target.x + Math.sin(cur.az) * ce * cur.dist, target.y + Math.sin(cur.el) * cur.dist, target.z + Math.cos(cur.az) * ce * cur.dist);
      camera.lookAt(target);
      scene.fog.near = cur.dist * 0.8; scene.fog.far = cur.dist * 2.4;
      renderer.render(scene, camera);
    },
  };
}
