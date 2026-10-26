// crystal/src/scene3d.js
// Three.js の3D空間の土台（全体の仕様書 8章）。
//   ・実験台（六角の模様の天板）、明かり、周りの光（ガラスや結晶の照り返し用）。
//   ・3つの実験台（固体・気体・濃度）の3Dを持ち、選んでいるものだけを出す。
//   ・カメラ：1本指でなぞると回る、2本指でピンチすると寄る・引く、2本指で動かすと平行に動く、
//     ダブルタップで元の視点。視点のボタン（全体・結晶・グラフ など）で、見たいところへなめらかに移る。
//   ・下の操作盤に隠れないように、操作盤より上の「見える場所」に収まるように距離を決める。

import { RENDER, CAMERA } from './config.js';
import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { makeEnvironment } from './crystals.js';
import { createSolidBench } from './bench-solid.js';
import { createGasBench } from './bench-gas.js';
import { createConcBench } from './bench-conc.js';

const ACC = ACCENTS.crystal;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070b26, 18, 40);
  scene.add(new THREE.HemisphereLight(0xa8c0ff, 0x0a0f25, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(3, 7, 5);
  scene.add(key);
  const rimA = new THREE.PointLight(hexToInt(ACC.a1.neon), 1.0, 14, 1.5);
  rimA.position.set(-3, 3, 2);
  const rimB = new THREE.PointLight(hexToInt(ACC.a2.neon), 0.8, 14, 1.5);
  rimB.position.set(3, 2, 2);
  scene.add(rimA, rimB);
  const envMap = makeEnvironment(renderer);

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

  // ── 3つの実験台 ──
  const benches = {
    solid: createSolidBench({ envMap }),
    gas: createGasBench({ envMap }),
    conc: createConcBench({ envMap }),
  };
  for (const b of Object.values(benches)) { b.group.visible = false; scene.add(b.group); }
  let benchName = 'solid';
  benches.solid.group.visible = true;

  // ── カメラ ──
  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.05, 80);
  const port = { top: 0, bottom: 1, w: 1, h: 1 };       // 3Dが見える場所（画面の上からの位置、px）
  let viewName = 'all';
  const user = { az: 0, el: 0.2, zoom: 1, pan: new THREE.Vector3() };
  const cur = { target: new THREE.Vector3(0, 2.6, 0), az: 0, el: 0.2, dist: 12 };
  const goal = { target: new THREE.Vector3(0, 2.6, 0), dist: 12 };
  let onViewChange = () => {};

  function preset() {
    const v = benches[benchName].views();
    return v[viewName] || v.all;
  }
  /** 見せたい範囲（幅 w、高さ h）が、見える場所にちょうど入る距離 */
  function fitDist(p) {
    const tan = Math.tan(THREE.MathUtils.degToRad(RENDER.fov / 2));
    const hf = Math.max(80, port.bottom - port.top);
    const byH = (p.h / 2 / tan) * (port.h / hf);
    const byW = p.w / 2 / (tan * (port.w / port.h));
    return Math.max(byH, byW) * CAMERA.margin + p.w * 0.25;
  }
  function updateGoal() {
    const p = preset();
    goal.target.set(...p.target).add(user.pan);
    goal.dist = fitDist(p) * user.zoom;
  }
  function placeCamera() {
    const ce = Math.cos(cur.el);
    camera.position.set(cur.target.x + Math.sin(cur.az) * ce * cur.dist, cur.target.y + Math.sin(cur.el) * cur.dist, cur.target.z + Math.cos(cur.az) * ce * cur.dist);
    camera.lookAt(cur.target);
  }
  function setView(name, instant = false) {
    viewName = name;
    const p = preset();
    user.az = p.az; user.el = p.el; user.zoom = 1; user.pan.set(0, 0, 0);
    updateGoal();
    if (instant) { cur.target.copy(goal.target); cur.dist = goal.dist; cur.az = user.az; cur.el = user.el; placeCamera(); }
    onViewChange(viewName);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    port.w = w; port.h = h;
    if (port.bottom <= port.top || port.bottom > h) { port.top = 0; port.bottom = h; }
    // 見える場所のまん中に、見せたいものが来るように、絵をずらす
    const d = Math.round(h / 2 - (port.top + port.bottom) / 2);
    if (d) camera.setViewOffset(w, h, 0, d, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    updateGoal();
  }
  window.addEventListener('resize', resize);

  // ── 指の操作 ──
  const pts = new Map();
  let gesture = null;
  let lastTap = { t: 0, x: 0, y: 0 };
  const worldPerPx = () => (2 * cur.dist * Math.tan(THREE.MathUtils.degToRad(RENDER.fov / 2))) / port.h;
  function pinchInfo() {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても続ける */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    gesture = pts.size >= 2 ? { kind: 'pinch', ...pinchInfo() } : { kind: 'rotate', moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!gesture) return;
    if (gesture.kind === 'rotate' && pts.size === 1) {
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) gesture.moved = true;
      user.az -= dx * CAMERA.rotateSpeed;
      user.el = clamp(user.el + dy * CAMERA.rotateSpeed * 0.7, CAMERA.elMin, CAMERA.elMax);
      cur.az = user.az; cur.el = user.el;
    } else if (gesture.kind === 'pinch' && pts.size >= 2) {
      const now = pinchInfo();
      user.zoom = clamp(user.zoom * (gesture.d / now.d), CAMERA.zoomMin, CAMERA.zoomMax);
      // 2本指の中心が動いた分だけ、平行に動かす
      const k = worldPerPx();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      user.pan.addScaledVector(right, -(now.mx - gesture.mx) * k).addScaledVector(up, (now.my - gesture.my) * k);
      user.pan.clampLength(0, CAMERA.panMax);
      gesture = { kind: 'pinch', ...now };
      updateGoal();
      cur.dist = goal.dist; cur.target.copy(goal.target);
    }
    placeCamera();
  });
  const up = (e) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (p && gesture && gesture.kind === 'rotate' && !gesture.moved && performance.now() - p.t0 < 280) {
      // ダブルタップ：いまの視点のボタンの位置に戻す
      const now = performance.now();
      if (now - lastTap.t < CAMERA.doubleTapMs && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { setView(viewName); lastTap.t = 0; }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    if (pts.size === 1) gesture = { kind: 'rotate', moved: true };
    else if (pts.size === 0) gesture = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    user.zoom = clamp(user.zoom * Math.exp(e.deltaY * 0.0012), CAMERA.zoomMin, CAMERA.zoomMax);
    updateGoal();
  }, { passive: false });

  resize();
  setView('all', true);

  let last = 0;
  return {
    /** 実験台を切りかえる：'solid' | 'gas' | 'conc' */
    setBench(name) {
      if (!benches[name] || name === benchName) return;
      benches[benchName].group.visible = false;
      benchName = name;
      benches[name].group.visible = true;
      setView('all', true);
    },
    get bench() { return benchName; },
    get view() { return viewName; },
    /** 視点のボタンの名前の一覧 */
    viewNames() { return Object.keys(benches[benchName].views()); },
    setView,
    onView(cb) { onViewChange = cb; },
    /** 3Dが見える場所（画面の上からの位置、px）。操作盤を開け閉めしたときに呼ぶ */
    setViewport(top, bottom) { port.top = top; port.bottom = bottom; resize(); },
    setState(name, st, extra) { benches[name].setState(st, extra); },
    redraw(name, st, extra) { benches[name].redraw(st, extra); },
    showPanel(on) { benches.solid.showExtras(on); },
    sparkle() { benches.solid.sparkle(); },
    bubble(n) { benches.gas.bubble(n); },
    /** 確かめるとき用：いまのカメラ */
    get port() { return { ...port }; },
    project(v) { const p = new THREE.Vector3(...v).project(camera); return [(p.x + 1) / 2 * port.w, (1 - p.y) / 2 * port.h]; },
    get camera() { return { az: cur.az, el: cur.el, dist: cur.dist, zoom: user.zoom, target: cur.target.toArray() }; },
    frame(nowMs) {
      const now = nowMs / 1000;
      const dt = Math.min(0.1, Math.max(0, now - last));
      last = now;
      benches[benchName].frame(now, dt);
      // 視点を、新しい位置へなめらかに近づける
      const k = 1 - Math.exp(-CAMERA.ease * dt);
      updateGoal();
      cur.target.lerp(goal.target, k);
      cur.dist += (goal.dist - cur.dist) * k;
      cur.az += (user.az - cur.az) * k;
      cur.el += (user.el - cur.el) * k;
      placeCamera();
      // 霧は、カメラの距離に合わせる（遠くから見ても暗くならないように）
      scene.fog.near = cur.dist * 0.9; scene.fog.far = cur.dist * 2.6;
      renderer.render(scene, camera);
    },
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); },
  };
}
