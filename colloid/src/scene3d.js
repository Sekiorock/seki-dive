// colloid/src/scene3d.js
// 霧の湖（摩周湖がモデル）の3D（全体の仕様書 10章）。
//   ・夜明け前の湖と森。霧の粒がゆっくり漂う。
//   ・謎ごとの小道具：水たまり（エリア1）、杯（エリア1・2）、霧の中の橋（1-2）、浅瀬と飛び石（エリア2）、関所の門とセロハンの袋（エリア3）。
//   ・光の鈴を使うと、横から光の筋が入る。コロイドの液の中だけ、光の通り道が輝く（チンダル現象）。
//   ・指でなぞると少し回る、2本指で寄る・引く。下の操作盤より上の「見える場所」に小道具が入るように距離を決める。
// 軽く保つため、影は使わない。

import { RENDER, LIQUIDS } from './config.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';

const ACC = ACCENTS.colloid;
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e2230, 0.03);
  const hemi = new THREE.HemisphereLight(0xc8f0e0, 0x101a28, 0.8);
  const moon = new THREE.DirectionalLight(0xe6e0ff, 0.9);
  moon.position.set(-3, 6, 4);
  const glowA = new THREE.PointLight(hexToInt(ACC.a1.neon), 0.7, 14, 1.6);
  glowA.position.set(-3, 2.5, 3);
  const glowB = new THREE.PointLight(hexToInt(ACC.a2.neon), 0.6, 14, 1.6);
  glowB.position.set(3.5, 2.2, 2);
  scene.add(hemi, moon, glowA, glowB);

  // ── 湖と岸と森 ──
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshStandardMaterial({ color: 0x0f3346, roughness: 0.15, metalness: 0.5, emissive: 0x06202c, emissiveIntensity: 0.6 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(0, -0.06, -9);
  const shore = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ color: 0x2c4450, roughness: 0.95, emissive: 0x0c1c24, emissiveIntensity: 0.5 }));
  shore.rotation.x = -Math.PI / 2; shore.scale.set(1.4, 0.75, 1); shore.position.set(0, -0.04, 1.2);
  scene.add(lake, shore);
  const rnd = rand(3);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1d4a3a, roughness: 0.9, flatShading: true });
  const treeMat2 = new THREE.MeshStandardMaterial({ color: 0x2a5a48, roughness: 0.9, flatShading: true, emissive: 0x0a2a1e, emissiveIntensity: 0.4 });
  for (let k = 0; k < 22; k++) {
    const side = k % 2 ? -1 : 1;
    const x = side * (5 + rnd() * 6), z = -2 - rnd() * 6;
    const h = 1.4 + rnd() * 1.8;
    const tr = new THREE.Mesh(new THREE.ConeGeometry(h * 0.32, h, 6), k % 3 ? treeMat : treeMat2);
    tr.position.set(x, h / 2 - 0.05, z);
    scene.add(tr);
  }
  // 外輪山（遠くの山なみ）
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x1a2c44, roughness: 1, flatShading: true });
  for (let k = 0; k < 9; k++) {
    const h = 2.5 + rnd() * 2.5;
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * 1.6, h, 5), ridgeMat);
    m.position.set(-16 + k * 4 + rnd(), h / 2 - 0.3, -18 - rnd() * 3);
    scene.add(m);
  }
  // 中島（摩周湖のカムイシュ島のような小島）
  const isle = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.2, 7), new THREE.MeshStandardMaterial({ color: 0x23463a, roughness: 0.9, flatShading: true }));
  isle.position.set(3.5, 0.5, -10);
  scene.add(isle);

  // ── 漂う霧の粒 ──
  const MN = RENDER.mist;
  const mistPos = new Float32Array(MN * 3);
  for (let i = 0; i < MN; i++) mistPos.set([(rnd() - 0.5) * 18, 0.2 + rnd() * 3.5, -6 + rnd() * 10], i * 3);
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const puff = document.createElement('canvas'); puff.width = puff.height = 64;
  { const pg = puff.getContext('2d'); const gr = pg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); pg.fillStyle = gr; pg.fillRect(0, 0, 64, 64); }
  const mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({ color: 0xdff8ef, size: 1.2, map: new THREE.CanvasTexture(puff), transparent: true, opacity: 0.13, depthWrite: false }));
  scene.add(mist);

  // ── 光の鈴（左の灯籠） ──
  const lantern = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.7 }));
  post.position.y = 0.55;
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xFFD86B, emissive: 0xFFC83A, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), bellMat);
  bell.position.y = 1.2; bell.rotation.x = Math.PI;
  lantern.add(post, bell);
  lantern.position.set(-2.95, 0, 0.6);
  scene.add(lantern);

  // ── 小道具を置く3つの場所 ──
  const SLOT_X = [-1.75, 0, 1.75];
  const beamMat = () => new THREE.MeshBasicMaterial({ color: 0xFFD86B, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const slots = SLOT_X.map((x, k) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0.6);
    // 水たまり
    const poolMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.7, roughness: 0.1, metalness: 0.2, emissive: 0x0a2a3a, emissiveIntensity: 0.4 });
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.08, 28), poolMat);
    pool.position.y = 0.02;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 28), new THREE.MeshStandardMaterial({ color: 0x3a4a56, roughness: 0.9 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.05;
    // 杯（ガラスの円柱）
    const cupG = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 1.0, 24, 1, true), glassMat);
    cup.position.y = 0.55;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 24), glassMat);
    base.position.y = 0.05;
    const liqMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, roughness: 0.15, emissive: 0x0a2a3a, emissiveIntensity: 0.3 });
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.36, 0.8, 24), liqMat);
    liq.position.y = 0.46;
    cupG.add(cup, base, liq);
    // 光の筋（液の中）と、外の光の線
    const bIn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 10), beamMat());
    bIn.rotation.z = Math.PI / 2;
    const spotA = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), beamMat());
    const spotB = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), beamMat());
    // 札
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const tex = new THREE.CanvasTexture(c);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    label.scale.set(1.5, 0.56, 1);
    label.renderOrder = 10;
    g.add(pool, rim, cupG, bIn, spotA, spotB, label);
    scene.add(g);
    return { g, pool, rim, poolMat, cupG, liqMat, bIn, spotA, spotB, label, c, tex, key: '', lit: 0, litGoal: 0, beam: false, kind: 'pool', sel: false, k };
  });
  // 鈴から小道具へ向かう光の線（空気の中では見えにくいので、細く淡く）
  const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), beamMat());
  ray.rotation.z = Math.PI / 2;
  scene.add(ray);

  // ── 1-2：霧の中の橋 ──
  const fogBank = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 2.6), new THREE.MeshBasicMaterial({ color: 0xcfe8e0, transparent: true, opacity: 0.16, depthWrite: false }));
  fogBank.position.set(0.6, 1.0, 0.2);
  const fogBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8.2, 12), beamMat());
  fogBeam.rotation.z = Math.PI / 2; fogBeam.position.set(-0.05, 1.2, 0.6);
  const bridge = new THREE.Group();
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.8, transparent: true, opacity: 0, emissive: 0x3a2a1a, emissiveIntensity: 0.3 });
  for (let q = 0; q < 12; q++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 1.0), plankMat); p.position.set(-2.6 + q * 0.5, 0.25 + Math.sin((q / 11) * Math.PI) * 0.35, 0.6); bridge.add(p); }
  const fogG = new THREE.Group();
  fogG.add(fogBank, fogBeam, bridge);
  fogG.visible = false;
  scene.add(fogG);

  // ── エリア2：浅瀬と飛び石 ──
  const shoal = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2, 24, 8), new THREE.MeshStandardMaterial({ color: 0x2a6a78, transparent: true, opacity: 0.75, roughness: 0.15, metalness: 0.3, emissive: 0x0a3040, emissiveIntensity: 0.5 }));
  shoal.rotation.x = -Math.PI / 2; shoal.position.set(0, 0.01, -1.3);
  const stones = [];
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.8, flatShading: true, emissive: 0x1a2a30, emissiveIntensity: 0.4 });
  for (let q = 0; q < 6; q++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), stoneMat); s.scale.y = 0.4; s.position.set(-2.5 + q * 1.0, -0.4, -1.3 + Math.sin(q * 1.3) * 0.5); stones.push(s); }
  const shoalG = new THREE.Group();
  shoalG.add(shoal, ...stones);
  shoalG.visible = false;
  scene.add(shoalG);

  // ── エリア3：関所の門と、たらいの中のセロハンの袋 ──
  const gateG = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a3a2a, roughness: 0.7, emissive: 0x2a0e08, emissiveIntensity: 0.4 });
  for (const x of [-1.5, 1.5]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 10), woodMat); pl.position.set(x, 1.3, -1.6); gateG.add(pl); }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 0.3), woodMat); kasagi.position.set(0, 2.65, -1.6);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.2), woodMat); nuki.position.set(0, 2.2, -1.6);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a3a52, roughness: 0.6, metalness: 0.3, emissive: hexToInt(ACC.a2.hex), emissiveIntensity: 0.25 });
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.0, 0.08), doorMat); doorL.position.set(-0.73, 1.05, -1.6);
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.0, 0.08), doorMat); doorR.position.set(0.73, 1.05, -1.6);
  // 鍵（にごった赤褐色 → 清まると若竹色に光る）
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xb4542a, emissive: 0x5a1a08, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 });
  const keyStone = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), keyMat); keyStone.position.set(0, 1.25, -1.5);
  gateG.add(kasagi, nuki, doorL, doorR, keyStone);
  // たらいと袋
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.5, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.8, side: THREE.DoubleSide }));
  tub.position.set(0, 0.25, 0.8);
  const tubWaterMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0x0a2a3a, emissiveIntensity: 0.3 });
  const tubWater = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), tubWaterMat);
  tubWater.rotation.x = -Math.PI / 2; tubWater.position.set(0, 0.42, 0.8);
  const bagMat = new THREE.MeshStandardMaterial({ color: 0xb4542a, transparent: true, opacity: 0.8, roughness: 0.25, emissive: 0x3a1004, emissiveIntensity: 0.4 });
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), bagMat);
  bag.scale.set(1, 1.3, 1);
  bag.position.set(0, 1.1, 0.8);
  gateG.add(tub, tubWater, bag);
  gateG.visible = false;
  scene.add(gateG);

  let prop = 'pool';
  let fogDone = 0, fogGoal = 0, stoneN = 0, doorOpen = 0, doorGoal = 0;
  const bagState = { inWater: 0, goal: 0, clean: 0, cloud: 0 };

  function drawLabel(s, text, sel) {
    const key = `${text}|${sel}`;
    if (key === s.key) return;
    s.key = key;
    const g = s.c.getContext('2d');
    g.clearRect(0, 0, 256, 96);
    g.fillStyle = sel ? 'rgba(92,242,168,0.92)' : 'rgba(6,14,24,0.85)';
    g.beginPath(); g.moveTo(12, 0); g.lineTo(256, 0); g.lineTo(256, 84); g.lineTo(244, 96); g.lineTo(0, 96); g.lineTo(0, 12); g.closePath(); g.fill();
    g.strokeStyle = sel ? '#ffffff' : ACC.a1.neon; g.lineWidth = 4; g.stroke();
    g.fillStyle = sel ? '#05081A' : '#ffffff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 40;
    g.font = `700 ${size}px ${FONT}`;
    while (g.measureText(text).width > 236 && size > 18) { size -= 2; g.font = `700 ${size}px ${FONT}`; }
    g.fillText(text, 128, 50);
    s.tex.needsUpdate = true;
  }

  // ── カメラ ──
  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 90);
  const port = { top: 0, bottom: 1, w: 1, h: 1 };
  const user = { az: 0, el: 0.32, zoom: 1 };
  const cur = { az: 0, el: 0.32, dist: 9 };
  const target = new THREE.Vector3(0, 0.8, 0);
  let goalDist = 9;
  function fit() {
    const tan = Math.tan(THREE.MathUtils.degToRad(RENDER.fov / 2));
    const hf = Math.max(80, port.bottom - port.top);
    const w = 5.6, h = 3.4;
    const byH = (h / 2 / tan) * (port.h / hf);
    const byW = w / 2 / (tan * (port.w / port.h));
    goalDist = Math.max(byH, byW) * user.zoom;
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
  canvas.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1; } });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) { user.az = clamp(user.az - dx * 0.006, -0.9, 0.9); user.el = clamp(user.el + dy * 0.004, 0.08, 1.2); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1; user.zoom = clamp(user.zoom * (pinch / d), 0.45, 1.6); pinch = d; fit(); }
  });
  const up = (e) => { pts.delete(e.pointerId); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); user.zoom = clamp(user.zoom * Math.exp(e.deltaY * 0.0012), 0.45, 1.6); fit(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { user.az = 0; user.el = 0.32; user.zoom = 1; fit(); });
  resize();
  cur.dist = goalDist;

  let last = 0;
  let labelsOn = true;
  return {
    setViewport(top, bottom) { port.top = top; port.bottom = bottom; resize(); },
    showLabels(v) { labelsOn = v; },
    /**
     * 小道具。kind：'pool' | 'cup' | 'fog' | 'shoal' | 'gate' | 'none'
     * items：[{ liquid, label, sel }]（pool・cup のとき3つまで）
     */
    setProp(kind, items = []) {
      prop = kind;
      fogG.visible = kind === 'fog';
      shoalG.visible = kind === 'shoal';
      gateG.visible = kind === 'gate';
      slots.forEach((s, k) => {
        const it = items[k];
        const show = !!it && (kind === 'pool' || kind === 'cup');
        s.g.visible = show;
        if (!show) return;
        s.kind = kind;
        const L = LIQUIDS[it.liquid] || LIQUIDS.water;
        const col = new THREE.Color(L.color);
        s.pool.visible = kind === 'pool'; s.rim.visible = kind === 'pool'; s.cupG.visible = kind === 'cup';
        s.poolMat.color.copy(col.clone().multiplyScalar(0.45)); s.poolMat.opacity = 0.75 + L.cloud * 0.25;
        s.liqMat.color.copy(col); s.liqMat.opacity = 0.45 + L.cloud * 0.5;
        s.beam = L.beam;
        s.sel = !!it.sel;
        s.text = it.label || '';
        const y = kind === 'pool' ? 0.09 : 0.5;
        const len = kind === 'pool' ? 1.3 : 0.74;
        s.bIn.scale.set(1, len, kind === 'pool' ? 0.6 : 1); s.bIn.position.set(0, y, 0);
        s.spotA.position.set(-len / 2, y, 0); s.spotB.position.set(len / 2, y, 0);
        s.label.position.set(0, kind === 'pool' ? 0.9 : 1.5, 0);
      });
    },
    /** 光の鈴を、k 番目の小道具に当てる（-1 で消す） */
    shine(k) {
      slots.forEach((s, i) => { s.litGoal = i === k ? 1 : 0; });
      ray.userData.k = k;
    },
    /** 1-2：霧の中の光と橋（beam：光を当てた、bridge：橋が現れた） */
    setFog(beam, bridgeOn) { fogGoal = bridgeOn ? 1 : 0; fogBeam.userData.on = beam ? 1 : 0; },
    /** エリア2：飛び石の数 */
    setStones(n) { stoneN = n; },
    /** エリア3：袋（inWater 0/1、clean 0〜1：鍵の清まり具合、cloud 0〜1：外の水の白いにごり）と門 */
    setGate(o) { bagState.goal = o.inWater ? 1 : 0; bagState.clean = o.clean || 0; bagState.cloud = o.cloud || 0; doorGoal = o.open ? 1 : 0; },
    resetView() { user.az = 0; user.el = 0.32; user.zoom = 1; fit(); },
    frame(nowMs) {
      const now = nowMs / 1000;
      const dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      const ease = (k) => 1 - Math.exp(-k * dt);
      // 霧の粒
      for (let i = 0; i < MN; i++) { let x = mistPos[i * 3] + dt * (0.08 + (i % 5) * 0.02); if (x > 9) x -= 18; mistPos[i * 3] = x; mistPos[i * 3 + 1] += Math.sin(now * 0.3 + i) * 0.0015; }
      mistGeo.attributes.position.needsUpdate = true;
      // 小道具と光
      let rayOn = 0, rayTo = 0;
      slots.forEach((s) => {
        s.lit += (s.litGoal - s.lit) * ease(6);
        const flick = 0.9 + Math.sin(now * 9 + s.k) * 0.06;
        s.bIn.material.opacity = (s.beam ? 0.85 : 0.0) * s.lit * flick;
        s.spotA.material.opacity = 0.9 * s.lit; s.spotB.material.opacity = 0.9 * s.lit;
        if (s.litGoal > 0) { rayOn = s.lit; rayTo = s.g.position.x - (s.kind === 'pool' ? 0.65 : 0.37); }
        drawLabel(s, s.text, s.sel);
        s.label.visible = labelsOn && s.g.visible;
        s.liqMat.emissiveIntensity = 0.3 + (s.beam ? s.lit * 0.5 : 0);
        s.poolMat.emissiveIntensity = 0.4 + (s.beam ? s.lit * 0.6 : 0);
      });
      if (rayOn > 0.01) {
        const x0 = lantern.position.x, y = slots[0].kind === 'pool' ? 0.09 : 0.5;
        const len = Math.max(0.1, rayTo - x0);
        ray.scale.y = len; ray.position.set(x0 + len / 2, y, 0.6); ray.material.opacity = 0.25 * rayOn;
        bellMat.emissiveIntensity = 0.4 + rayOn * 1.6;
      } else { ray.material.opacity = 0; bellMat.emissiveIntensity = 0.4; }
      // 霧と橋
      if (prop === 'fog') {
        const on = fogBeam.userData.on || 0;
        fogBeam.material.opacity += ((on ? 0.75 : 0) - fogBeam.material.opacity) * ease(4);
        fogDone += (fogGoal - fogDone) * ease(2);
        plankMat.opacity = fogDone;
        bellMat.emissiveIntensity = 0.4 + on * 1.6;
      }
      // 浅瀬：さざ波と飛び石
      if (prop === 'shoal') {
        const pa = shoal.geometry.attributes.position;
        for (let v = 0; v < pa.count; v++) pa.setZ(v, Math.sin(now * 1.6 + pa.getX(v) * 1.3 + pa.getY(v) * 2) * 0.03);
        pa.needsUpdate = true;
        stones.forEach((s, q) => { const goal = q < stoneN ? 0.14 : -0.4; s.position.y += (goal - s.position.y) * ease(3); });
      }
      // 関所
      if (prop === 'gate') {
        bagState.inWater += (bagState.goal - bagState.inWater) * ease(3);
        bag.position.y = 1.1 - bagState.inWater * 0.62 + Math.sin(now * 1.5) * 0.02;
        bagMat.color.copy(new THREE.Color(0xb4542a));
        keyMat.color.copy(new THREE.Color(0xb4542a).lerp(new THREE.Color(0x5CF2A8), bagState.clean));
        keyMat.emissive.copy(new THREE.Color(0x5a1a08).lerp(new THREE.Color(0x1a8a5a), bagState.clean));
        keyStone.rotation.y = now * 0.8;
        tubWaterMat.color.copy(new THREE.Color(0xbfe6ff).lerp(new THREE.Color(0xffffff), bagState.cloud));
        tubWaterMat.opacity = 0.55 + bagState.cloud * 0.4;
        doorOpen += (doorGoal - doorOpen) * ease(1.6);
        doorL.position.x = -0.73 - doorOpen * 1.2; doorR.position.x = 0.73 + doorOpen * 1.2;
      }
      fit();
      cur.dist += (goalDist - cur.dist) * ease(6);
      cur.az += (user.az - cur.az) * ease(6);
      cur.el += (user.el - cur.el) * ease(6);
      const ce = Math.cos(cur.el);
      camera.position.set(target.x + Math.sin(cur.az) * ce * cur.dist, target.y + Math.sin(cur.el) * cur.dist, target.z + Math.cos(cur.az) * ce * cur.dist);
      camera.lookAt(target);
      renderer.render(scene, camera);
    },
  };
}
