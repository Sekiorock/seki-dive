// hydration/src/models.js
// 溶質ノーツの3Dの分子模型（ハイドレーション・ビート仕様書 3章）。
// 原子を球、結合を細い棒で表し、同じ色の部品は1つの形にまとめて軽くする。
//
// 色分け（補助輪の段階で変わる）：
//   plus  陽イオン側（δ+）：群青          minus 陰イオン側（δ−）：朱
//   O     -OH などの O（δ−）：朱           H     -OH などの H（δ+）：群青
//   C     炭素などの骨組み：うす灰          gray  無極性分子：灰
//   silver 溶けにくい結晶：銀
//   段階3（補助輪なし）では、すべて白黒になる。

import { ACCENTS, hexToInt } from '../../shared/theme.js';
import { labelTexture } from '../../shared/patterns.js';

const ACC = ACCENTS.hydration;
export const MINUS = ACC.a1;   // 朱：δ−
export const PLUS = ACC.a2;    // 群青：δ+

const COLORS = {
  plus: [PLUS.hex, PLUS.neon], minus: [MINUS.hex, MINUS.neon],
  O: [MINUS.hex, MINUS.neon], H: [PLUS.hex, PLUS.neon],
  C: ['#9aa3b8', '#3a4058'], gray: ['#7d828f', '#2a2d36'], silver: ['#c9d1de', '#4a5266'],
  bond: ['#8890a6', '#222633'], mono: ['#e6e9f2', '#3b3f4c'], monoDark: ['#a3a8b6', '#2a2d36'],
};

const matCache = new Map();
/** 色の役割と補助輪の段階から、材質を返す（同じものは使い回す） */
export function roleMaterial(role, assist) {
  let r = role;
  if (assist >= 3 && r !== 'bond') r = (r === 'gray' || r === 'C' || r === 'silver') ? 'monoDark' : 'mono';
  const key = `${r}`;
  if (!matCache.has(key)) {
    const [base, glow] = COLORS[r];
    matCache.set(key, new THREE.MeshStandardMaterial({
      color: hexToInt(base), roughness: 0.42, metalness: 0.1, emissive: hexToInt(glow), emissiveIntensity: r === 'bond' ? 0.2 : 0.5,
    }));
  }
  return matCache.get(key);
}

// ───────────── 原子の並び（単位：ゲームの中の m。あとで全体を縮める） ─────────────
const hexRing = (cx, cy, r, n = 6, start = Math.PI / 2) => Array.from({ length: n }, (_, i) => {
  const a = start + (Math.PI * 2 * i) / n;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0];
});
const TETRA = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map((v) => v.map((x) => x / Math.sqrt(3)));

/**
 * 模型の設計図：atoms（位置・半径・色の役割）、bonds（原子の番号の組）、site（水が取り付く所）
 */
function blueprint(def) {
  const side = def.group === 'cation' ? 'plus' : 'minus';
  switch (def.model) {
    case 'ion':
      return { atoms: [{ p: [0, 0, 0], r: def.r, role: side }], bonds: [], site: [0, 0, 0], sign: def.charge };
    case 'hydroxide':
      return { atoms: [{ p: [-0.1, 0, 0], r: 0.34, role: 'minus' }, { p: [0.33, 0.14, 0], r: 0.2, role: 'minus' }], bonds: [[0, 1]], site: [0, 0, 0], sign: '−' };
    case 'sulfate': {
      const atoms = [{ p: [0, 0, 0], r: 0.24, role: 'minus' }, ...TETRA.map((v) => ({ p: v.map((x) => x * 0.44), r: 0.2, role: 'minus' }))];
      return { atoms, bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], site: [0, 0, 0], sign: '2−' };
    }
    case 'ethanol':
      return {
        atoms: [
          { p: [-0.72, -0.06, 0], r: 0.22, role: 'C' }, { p: [-0.3, 0.18, 0], r: 0.22, role: 'C' },
          { p: [0.14, -0.06, 0], r: 0.2, role: 'O' }, { p: [0.44, 0.14, 0], r: 0.12, role: 'H' },
        ],
        bonds: [[0, 1], [1, 2], [2, 3]], site: [0.25, 0.02, 0],
      };
    case 'glucose': case 'sucrose': {
      const rings = def.model === 'glucose' ? [[-0.2, 0]] : [[-0.62, 0], [0.38, 0]];
      const atoms = [], bonds = [];
      rings.forEach(([cx, cy]) => {
        const base = atoms.length;
        hexRing(cx, cy, 0.34).forEach((p, i) => atoms.push({ p, r: 0.13, role: i === 0 ? 'O' : 'C' }));
        for (let i = 0; i < 6; i++) bonds.push([base + i, base + ((i + 1) % 6)]);
        // 輪のまわりの -OH（小さく）
        [1, 2, 4].forEach((k) => {
          const a = atoms[base + k].p;
          const dir = [a[0] - cx, a[1] - cy];
          const o = atoms.length;
          atoms.push({ p: [cx + dir[0] * 1.55, cy + dir[1] * 1.55, 0], r: 0.1, role: 'O' });
          atoms.push({ p: [cx + dir[0] * 1.95, cy + dir[1] * 1.95 + 0.05, 0], r: 0.07, role: 'H' });
          bonds.push([base + k, o], [o, o + 1]);
        });
      });
      if (rings.length === 2) bonds.push([3, 6 + 6 + 0]);
      // 手前に突き出た -OH（いま水と結びつくところ）
      const o = atoms.length;
      atoms.push({ p: [0.45, -0.1, 0.25], r: 0.17, role: 'O' }, { p: [0.68, 0.06, 0.3], r: 0.1, role: 'H' });
      bonds.push([o, o + 1], [2, o]);
      return { atoms, bonds, site: [0.55, 0, 0.27] };
    }
    case 'ohBead':
      return { atoms: [{ p: [-0.1, 0, 0], r: 0.19, role: 'O' }, { p: [0.17, 0.14, 0], r: 0.11, role: 'H' }, { p: [-0.42, -0.04, 0], r: 0.1, role: 'C' }], bonds: [[0, 1], [0, 2]], site: [0, 0, 0] };
    case 'ammonia':
      return {
        atoms: [{ p: [0, 0.08, 0], r: 0.26, role: 'O' }, ...[0, 1, 2].map((i) => {
          const a = (Math.PI * 2 * i) / 3;
          return { p: [Math.cos(a) * 0.36, -0.2, Math.sin(a) * 0.36], r: 0.13, role: 'H' };
        })],
        bonds: [[0, 1], [0, 2], [0, 3]], site: [0, 0, 0],
      };
    case 'acetic':
      return {
        atoms: [
          { p: [-0.62, -0.05, 0], r: 0.2, role: 'C' }, { p: [-0.16, 0.06, 0], r: 0.2, role: 'C' },
          { p: [0.04, 0.44, 0], r: 0.18, role: 'O' }, { p: [0.18, -0.22, 0], r: 0.18, role: 'O' }, { p: [0.5, -0.1, 0], r: 0.1, role: 'H' },
        ],
        bonds: [[0, 1], [1, 2], [1, 3], [3, 4]], site: [0.3, -0.15, 0],
      };
    case 'hcl':
      // H を手前（水の側）に向けて飛んでくる。H は δ+、Cl は δ−
      return { atoms: [{ p: [0, 0, 0.36], r: 0.18, role: 'H' }, { p: [0, 0, -0.12], r: 0.4, role: 'minus' }], bonds: [[0, 1]], site: [0, 0, 0.36] };
    case 'hexane': {
      const atoms = Array.from({ length: 6 }, (_, i) => ({ p: [-0.85 + i * 0.34, (i % 2 ? 0.14 : -0.14), 0], r: 0.16, role: 'gray' }));
      return { atoms, bonds: [0, 1, 2, 3, 4].map((i) => [i, i + 1]), site: [0, 0, 0] };
    }
    case 'benzene': {
      const atoms = hexRing(0, 0, 0.4).map((p) => ({ p, r: 0.15, role: 'gray' }));
      return { atoms, bonds: [0, 1, 2, 3, 4, 5].map((i) => [i, (i + 1) % 6]), site: [0, 0, 0] };
    }
    case 'ccl4': {
      const atoms = [{ p: [0, 0, 0], r: 0.18, role: 'gray' }, ...TETRA.map((v) => ({ p: v.map((x) => x * 0.46), r: 0.25, role: 'gray' }))];
      return { atoms, bonds: [[0, 1], [0, 2], [0, 3], [0, 4]], site: [0, 0, 0] };
    }
    case 'iodine':
      return { atoms: [{ p: [-0.3, 0, 0], r: 0.33, role: 'gray' }, { p: [0.3, 0, 0], r: 0.33, role: 'gray' }], bonds: [[0, 1]], site: [0, 0, 0] };
    case 'naphthalene': {
      const left = hexRing(-0.3, 0, 0.35, 6, 0);
      const right = hexRing(0.3, 0, 0.35, 6, 0);
      // 2つの輪は辺を共有する（左の 0 と 5、右の 3 と 2 が同じ位置）
      const atoms = [...left, right[0], right[1], right[4], right[5]].map((p) => ({ p, r: 0.13, role: 'gray' }));
      const bonds = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 6], [6, 7], [7, 1], [5, 9], [9, 8], [8, 0]];
      return { atoms, bonds: bonds.filter(([a, b]) => a !== b), site: [0, 0, 0] };
    }
    case 'crystal': {
      const atoms = [];
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
        atoms.push({ p: [(x - 0.5) * 0.42, (y - 0.5) * 0.42, (z - 0.5) * 0.42], r: (x + y + z) % 2 ? 0.17 : 0.23, role: (x + y + z) % 2 ? 'gray' : 'silver' });
      }
      return { atoms, bonds: [], site: [0, 0, 0], box: true };
    }
    default:
      return { atoms: [{ p: [0, 0, 0], r: 0.4, role: 'C' }], bonds: [], site: [0, 0, 0] };
  }
}

/** 部品をまとめて1つの形にする */
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const up = new THREE.Vector3(0, 1, 0);
/** 設計図から3Dの形を作る。色の役割ごとに1つの形 */
function buildGeometries(bp) {
  const byRole = {};
  for (const a of bp.atoms) {
    const g = new THREE.SphereGeometry(a.r, 18, 12);
    g.translate(...a.p);
    (byRole[a.role] = byRole[a.role] || []).push(g);
  }
  const bonds = [];
  for (const [i, j] of bp.bonds) {
    const a = new THREE.Vector3(...bp.atoms[i].p), b = new THREE.Vector3(...bp.atoms[j].p);
    const len = a.distanceTo(b);
    if (len < 0.01) continue;
    const g = new THREE.CylinderGeometry(0.045, 0.045, len, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    bonds.push(g);
  }
  if (bonds.length) byRole.bond = bonds;
  const out = {};
  for (const [role, list] of Object.entries(byRole)) out[role] = mergeGeos(list);
  return out;
}

const geoCache = new Map();
const bpCache = new Map();
export function getBlueprint(def) {
  if (!bpCache.has(def.id)) bpCache.set(def.id, blueprint(def));
  return bpCache.get(def.id);
}

/** 記号（+、−、2+ など）の札 */
const signCache = new Map();
export function signTexture(text, hex) {
  const key = `${text}|${hex}`;
  if (!signCache.has(key)) {
    signCache.set(key, labelTexture((g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.shadowColor = hex; g.shadowBlur = 10;
      g.font = `700 ${text.length > 1 ? h * 0.62 : h * 0.9}px 'Chakra Petch', 'Noto Sans', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + h * 0.04);
    }, 128, 128));
  }
  return signCache.get(key);
}

/**
 * 模型を1つ作る。返すのは THREE.Group（userData に site：水が取り付く所）。
 * 補助輪の段階を変えるときは setAssist で材質を付け替える。
 */
export function createModel(def, assist) {
  if (!geoCache.has(def.id)) geoCache.set(def.id, buildGeometries(getBlueprint(def)));
  const geos = geoCache.get(def.id);
  const bp = getBlueprint(def);
  const g = new THREE.Group();
  const meshes = [];
  for (const [role, geo] of Object.entries(geos)) {
    const m = new THREE.Mesh(geo, roleMaterial(role, assist));
    m.userData.role = role;
    g.add(m);
    meshes.push(m);
  }
  // 電荷の記号（段階1・2だけ。色を見分けにくい人のため）
  let sign = null;
  if (bp.sign) {
    const hex = def.group === 'cation' ? PLUS.neon : MINUS.neon;
    sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(bp.sign, hex), transparent: true, depthTest: false, toneMapped: false }));
    const s = Math.max(0.42, (bp.atoms[0].r || 0.4) * 1.05);
    sign.scale.set(s, s, 1);
    sign.position.set(0, 0, (bp.atoms[0].r || 0.4) + 0.05);
    sign.renderOrder = 5;
    g.add(sign);
  }
  g.userData = { site: new THREE.Vector3(...bp.site), meshes, sign, noteId: def.id };
  g.userData.setAssist = (a) => {
    meshes.forEach((m) => { m.material = roleMaterial(m.userData.role, a); });
    if (sign) sign.visible = a < 3;
  };
  g.userData.setAssist(assist);
  return g;
}

/** 札の枠の色（溶質の種類） */
export function frameColor(def, assist) {
  if (assist >= 3) return '#e6e9f2';
  switch (def.group) {
    case 'cation': return PLUS.neon;
    case 'anion': case 'hclCl': return MINUS.neon;
    case 'nonpolar': return '#9aa0ae';
    case 'insoluble': return '#c9d1de';
    default: return '#ffffff';   // -OH をもつ分子・極性分子・HCl：両方の色を使う
  }
}
