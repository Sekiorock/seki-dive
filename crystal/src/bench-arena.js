// crystal/src/bench-arena.js
// 対戦「析出ニアピン」の3D（全体の仕様書 8章）：全員のビーカーを横一列（7人以上は2列）に並べ、
// 一斉に冷やして、結晶が育つ様子を見せる。ビーカーの上に、名前と析出量と、目標との差を出す。

import { crystalKinds } from './crystals.js';
import { glassMaterial, makeHotPlate } from './bench-solid.js';

const R = 0.55, H = 1.4, Y = 0.3;      // 1つのビーカーの大きさ
const GAP = 1.55;                      // ビーカーの間かく
const MAX = 12;
const PIECES = 14;                     // 1つのビーカーの結晶のかけらの数の上限
const FONT = "'Chakra Petch', 'M PLUS 1p', 'Noto Sans JP', sans-serif";

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createArenaBench({ envMap }) {
  const group = new THREE.Group();
  const kinds = crystalKinds(envMap);
  const pools = {};
  for (const [id, k] of Object.entries(kinds)) {
    const mesh = new THREE.InstancedMesh(k.geo, k.mat, MAX * PIECES);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    pools[id] = mesh;
  }
  const glassMat = glassMaterial(envMap, 0.18);
  const glassGeo = new THREE.CylinderGeometry(R, R, H, 28, 1, true);
  const waterGeo = new THREE.CylinderGeometry(R - 0.02, R - 0.02, 1, 28);
  const rimGeo = new THREE.TorusGeometry(R, 0.018, 6, 32);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.7, toneMapped: false });
  const rnd = rand(3);
  const SPOTS = Array.from({ length: PIECES }, (_, i) => {
    const layer = Math.floor(i / 7);
    const rr = (R - 0.16) * Math.sqrt(rnd()) * (1 - layer * 0.25);
    const a = rnd() * Math.PI * 2;
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: Y + 0.05 + layer * 0.06, ry: rnd() * Math.PI * 2, rx: rnd() - 0.5, rz: rnd() - 0.5, s: 0.55 + rnd() * 0.3 };
  });

  const slots = [];
  for (let i = 0; i < MAX; i++) {
    const g = new THREE.Group();
    const hot = makeHotPlate(0.7);
    hot.group.scale.set(1, 0.6, 1);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = Y + H / 2;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = Y + H;
    const wm = new THREE.MeshStandardMaterial({ color: 0x9fc6ff, transparent: true, opacity: 0.28, roughness: 0.15, emissive: 0x1E50A2, emissiveIntensity: 0.25, depthWrite: false });
    const water = new THREE.Mesh(waterGeo, wm);
    water.renderOrder = 2;
    const c = document.createElement('canvas'); c.width = 320; c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    label.scale.set(1.5, 0.75, 1);
    label.position.y = Y + H + 0.55;
    label.renderOrder = 10;
    g.add(hot.group, glass, rim, water, label);
    g.visible = false;
    group.add(g);
    slots.push({ g, hot, water, wm, label, c, tex, key: '' });
  }

  let list = [];          // [{ name, me, water, crystal, temp, solute, text, err, rank }]
  let layout = { cols: 1, rows: 1 };

  function place() {
    const n = Math.max(1, list.length);
    const rows = n > 6 ? 2 : 1;
    const cols = Math.ceil(n / rows);
    layout = { cols, rows };
    slots.forEach((s, i) => {
      s.g.visible = i < list.length;
      if (i >= list.length) return;
      const row = Math.floor(i / cols), col = i % cols;
      const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
      s.g.position.set((col - (inRow - 1) / 2) * GAP, 0, row * -2.4);
    });
  }

  function drawLabel(s, p) {
    const key = JSON.stringify([p.name, p.me, p.text, p.sub, p.rank]);
    if (key === s.key) return;
    s.key = key;
    const g = s.c.getContext('2d');
    g.clearRect(0, 0, 320, 160);
    g.fillStyle = p.me ? 'rgba(76,134,255,0.85)' : 'rgba(6,10,28,0.82)';
    g.beginPath(); g.moveTo(14, 0); g.lineTo(320, 0); g.lineTo(320, 146); g.lineTo(306, 160); g.lineTo(0, 160); g.lineTo(0, 14); g.closePath(); g.fill();
    g.strokeStyle = p.rank === 1 ? '#E6B422' : p.me ? '#ffffff' : '#4C86FF'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 34px ${FONT}`;
    g.fillText(String(p.name).slice(0, 10), 160, 34);
    g.font = `700 46px ${FONT}`;
    g.fillStyle = p.rank === 1 ? '#FFD86B' : '#FFC074';
    g.fillText(p.text || '', 160, 88);
    g.font = `500 26px ${FONT}`;
    g.fillStyle = 'rgba(220,230,255,0.9)';
    g.fillText(p.sub || '', 160, 134);
    s.tex.needsUpdate = true;
  }

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
  function update(now) {
    const counts = {};
    for (const id of Object.keys(pools)) counts[id] = 0;
    list.forEach((p, i) => {
      const s = slots[i];
      const h = Math.max(0.05, Math.min(H - 0.08, (p.water / 400) * H));
      s.water.scale.y = h;
      s.water.position.y = Y + h / 2;
      const blue = p.solute === 'CuSO4H' ? Math.min(1, (p.blue || 0)) : 0;
      s.wm.color.copy(new THREE.Color(0x9fc6ff).lerp(new THREE.Color(0x1f6bff), blue));
      s.hot.set(Math.max(0, Math.min(1, p.temp / 80)), now);
      drawLabel(s, p);
      // 結晶
      const id = p.solute === 'CuSO4H' ? 'CuSO4' : p.solute;
      const pool = pools[id];
      if (!pool || !(p.crystal > 0.05)) return;
      const per = Math.max(2.5, p.crystal / PIECES);
      const n = Math.min(PIECES, Math.max(1, Math.round(p.crystal / per)));
      const scale = Math.cbrt(p.crystal / (n * 3)) * 0.9;
      for (let k = 0; k < n; k++) {
        const sp = SPOTS[k];
        tmpE.set(sp.rx * kinds[id].tilt, sp.ry, sp.rz * kinds[id].tilt);
        tmpQ.setFromEuler(tmpE);
        const sc = sp.s * Math.min(1.6, scale);
        tmpM.compose(tmpV.set(s.g.position.x + sp.x, sp.y, s.g.position.z + sp.z), tmpQ, tmpS.set(sc, sc, sc));
        pool.setMatrixAt(counts[id]++, tmpM);
      }
    });
    for (const [id, mesh] of Object.entries(pools)) { mesh.count = counts[id]; mesh.instanceMatrix.needsUpdate = true; }
  }

  return {
    group,
    /** st：{ players: [{ name, me, water, crystal, temp, solute, text, sub, rank, blue }] } */
    setState(st) {
      const n0 = list.length;
      list = (st && st.players) || [];
      if (list.length !== n0) place();
    },
    redraw() { slots.forEach((s) => { s.key = ''; }); },
    showExtras() {},
    views() {
      const w = layout.cols * GAP + 0.6;
      const h = layout.rows === 2 ? 4.2 : 2.9;
      const meI = list.findIndex((p) => p.me);
      const me = meI >= 0 ? slots[meI].g.position : new THREE.Vector3();
      return {
        all: { target: [0, 1.2, layout.rows === 2 ? -1.2 : 0], w, h, az: 0, el: layout.rows === 2 ? 0.42 : 0.22 },
        me: { target: [me.x, 0.9, me.z], w: 2.2, h: 2.4, az: 0, el: 0.3 },
      };
    },
    frame(now) { update(now); },
  };
}
