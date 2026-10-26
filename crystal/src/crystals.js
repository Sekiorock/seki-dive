// crystal/src/crystals.js
// 結晶のかけらの形と材質。本物の結晶の見た目に寄せる（v0.2）。
//   ・KNO₃（硝酸カリウム）：斜方晶系。水溶液から冷やして出ると、細長い柱（針状〜柱状）になり、断面はほぼ六角形、先がとがる。無色透明。
//   ・KCl（塩化カリウム）：立方晶系。小さな立方体。無色〜白く、少しくもる。
//   ・NaCl（塩化ナトリウム）：立方晶系。立方体で、面の中央がくぼんだ階段状の「骸晶（ホッパー結晶）」になりやすい。無色〜白。
//   ・CuSO₄·5H₂O（硫酸銅(II)五水和物）：三斜晶系。3つの辺がどれも斜めに交わる、ゆがんだ平たい六面体。あざやかな青で透明。
// どれも、ガラスのような照り返し（周りの光を映す）をつける。

import { hexToInt } from '../../shared/theme.js';

/** 頂点の並び（三角形ごと）から、平らな面の形を作る */
function fromTriangles(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** いくつかの形を1つにまとめる（どれも平らな面にする） */
function merge(list) {
  const pos = [];
  for (const { geo, m } of list) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    if (m) g.applyMatrix4(m);
    pos.push(...g.attributes.position.array);
  }
  return fromTriangles(pos);
}

/** KNO₃：六角の柱の両はしに、とがった六角錐 */
function needleGeometry() {
  const r = 0.045, L = 0.46, tip = 0.075;
  const body = new THREE.CylinderGeometry(r, r, L, 6, 1, true);
  const top = new THREE.ConeGeometry(r, tip, 6, 1, true);
  const bot = new THREE.ConeGeometry(r, tip, 6, 1, true);
  const g = merge([
    { geo: body },
    { geo: top, m: new THREE.Matrix4().makeTranslation(0, L / 2 + tip / 2, 0) },
    { geo: bot, m: new THREE.Matrix4().makeRotationX(Math.PI).setPosition(0, -L / 2 - tip / 2, 0) },
  ]);
  // 断面を少し平たく（本物は少しつぶれた六角形）し、横向きに寝かせる
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, 0.72));
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  return g;
}

/** KCl・NaCl：立方体（角をほんの少し落とす：本物の小さな結晶も角が少し丸い） */
function cubeGeometry(s = 0.15) {
  const g = new THREE.BoxGeometry(s, s, s);
  return g;
}

/**
 * CuSO₄·5H₂O：三斜晶系の平行六面体。
 * 本物の格子の角度（α = 97.6°、β = 107.2°、γ = 77.3°）を使い、平たい板のような形にする。
 */
function triclinicGeometry() {
  const deg = Math.PI / 180;
  const al = 97.6 * deg, be = 107.2 * deg, ga = 77.3 * deg;
  const A = 0.2, B = 0.26, C = 0.1;
  const a = new THREE.Vector3(A, 0, 0);
  const b = new THREE.Vector3(B * Math.cos(ga), B * Math.sin(ga), 0);
  const cx = C * Math.cos(be);
  const cy = C * (Math.cos(al) - Math.cos(be) * Math.cos(ga)) / Math.sin(ga);
  const c = new THREE.Vector3(cx, cy, Math.sqrt(Math.max(0, C * C - cx * cx - cy * cy)));
  const o = a.clone().add(b).add(c).multiplyScalar(-0.5);
  const v = [];
  for (let i = 0; i < 8; i++) {
    v.push(o.clone().addScaledVector(a, i & 1).addScaledVector(b, (i >> 1) & 1).addScaledVector(c, (i >> 2) & 1));
  }
  // 6つの面（外向きになる順に）
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  const pos = [];
  const center = new THREE.Vector3();
  for (const f of faces) {
    let [p0, p1, p2, p3] = f.map((k) => v[k]);
    // 向きを確かめて、外向きでなければ裏返す
    const n = p1.clone().sub(p0).cross(p2.clone().sub(p0));
    const mid = p0.clone().add(p2).multiplyScalar(0.5);
    if (n.dot(mid.sub(center)) < 0) [p1, p3] = [p3, p1];
    pos.push(...p0.toArray(), ...p1.toArray(), ...p2.toArray(), ...p0.toArray(), ...p2.toArray(), ...p3.toArray());
  }
  // 平たい面を下にして置く
  const g = fromTriangles(pos);
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  return g;
}

/** NaCl の面の模様：中央へ向かって階段のようにくぼむ「骸晶」 */
function hopperTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f7ff'; g.fillRect(0, 0, S, S);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const m = (S / 2) * (i / (steps + 1));
    const shade = 244 - i * 11;
    g.fillStyle = `rgb(${shade},${shade + 3},${Math.min(255, shade + 10)})`;
    g.fillRect(m, m, S - m * 2, S - m * 2);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5;
    g.strokeRect(m + 0.5, m + 0.5, S - m * 2 - 1, S - m * 2 - 1);
  }
  const tx = new THREE.CanvasTexture(c);
  return tx;
}

/** 周りの光（照り返し用）：暗い空に、瑠璃と柑子の光の帯と白い照明 */
export function makeEnvironment(renderer) {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1a2a66'); grd.addColorStop(0.5, '#0a1236'); grd.addColorStop(1, '#03050f');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff'; g.fillRect(60, 40, 90, 26); g.fillRect(320, 30, 120, 22);
  g.fillStyle = '#4C86FF'; g.fillRect(0, 118, W, 6);
  g.fillStyle = '#FFC074'; g.fillRect(200, 90, 60, 50);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(470, 70, 30, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(tex).texture;
    pm.dispose();
    tex.dispose();
    return env;
  } catch (e) {
    return tex;
  }
}

/** 物質ごとの形と材質（InstancedMesh で使う） */
export function crystalKinds(envMap) {
  const glassy = (opt) => new THREE.MeshPhysicalMaterial({
    roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, reflectivity: 0.6,
    envMap, envMapIntensity: 1.4, transparent: true, flatShading: true, ...opt,
  });
  return {
    KNO3: { geo: needleGeometry(), mat: glassy({ color: 0xf2f7ff, opacity: 0.78, emissive: 0x1a2a55, emissiveIntensity: 0.35 }), tilt: 0.55 },
    KCl: { geo: cubeGeometry(0.14), mat: glassy({ color: 0xeef2fb, opacity: 0.88, roughness: 0.22, emissive: 0x1a2240, emissiveIntensity: 0.3 }), tilt: 0.25 },
    NaCl: { geo: cubeGeometry(0.16), mat: glassy({ color: 0xffffff, map: hopperTexture(), opacity: 0.92, roughness: 0.12, emissive: 0x141c38, emissiveIntensity: 0.3 }), tilt: 0.2 },
    CuSO4: { geo: triclinicGeometry(), mat: glassy({ color: 0x1e64ff, opacity: 0.86, emissive: hexToInt('#0d2f8f'), emissiveIntensity: 0.55, envMapIntensity: 1.8 }), tilt: 0.3 },
  };
}
