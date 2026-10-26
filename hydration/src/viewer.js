// hydration/src/viewer.js
// 分子の模型を1つだけ大きく見せる、小さな3Dの窓（v0.4）。
// 結果の画面の解説（いちばん多かった間違いの溶質）と、図鑑で使う。
// ゆっくり回り、指でなぞると好きな向きに回せる。
// スマホの負担を減らすため、窓は1つだけ作り、使う場所に付け替える（WebGL を何個も作らない）。

import { NOTES } from './notes.js';
import { createModel } from './models.js';
import { RENDER } from './config.js';

let v = null;

function build() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0a0f25, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 5);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const state = { canvas, renderer, scene, camera, pivot, model: null, rotX: 0.3, rotY: 0, drag: null, running: false, lastTouch: 0 };

  canvas.addEventListener('pointerdown', (e) => {
    state.drag = { x: e.clientX, y: e.clientY };
    state.lastTouch = performance.now();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 何もしない */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.drag) return;
    state.rotY += (e.clientX - state.drag.x) * 0.012;
    state.rotX = Math.max(-1.4, Math.min(1.4, state.rotX + (e.clientY - state.drag.y) * 0.012));
    state.drag = { x: e.clientX, y: e.clientY };
    state.lastTouch = performance.now();
  });
  const end = () => { state.drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  return state;
}

function loop(now) {
  if (!v || !v.running) return;
  requestAnimationFrame(loop);
  if (!v.canvas.isConnected) { v.running = false; return; }
  // 触っていないときは、ゆっくり回る
  if (!v.drag && now - v.lastTouch > 1500) v.rotY += 0.01;
  v.pivot.rotation.set(v.rotX, v.rotY, 0);
  v.renderer.render(v.scene, v.camera);
}

/**
 * 模型を見せる。
 * @param {HTMLElement} host  窓を入れる要素（大きさは CSS で決める）
 * @param {string} noteId     notes.js の溶質
 * @param {string} className  窓に付ける class
 */
export function showModel(host, noteId, className = '') {
  if (typeof THREE === 'undefined' || !NOTES[noteId]) return;
  if (!v) v = build();
  v.canvas.className = className;
  v.canvas.style.width = '100%';
  v.canvas.style.height = '100%';
  v.canvas.style.display = 'block';
  host.appendChild(v.canvas);
  const w = host.clientWidth || 120, h = host.clientHeight || w;
  v.renderer.setSize(w, h, false);
  v.camera.aspect = w / h;
  v.camera.updateProjectionMatrix();
  if (v.model) v.pivot.remove(v.model);
  const def = NOTES[noteId];
  v.model = createModel(def, 1);
  // 分子の大きさに合わせて、窓いっぱいに見えるようにする
  const box = new THREE.Box3().setFromObject(v.model);
  const size = box.getSize(new THREE.Vector3()).length() || 1;
  v.model.scale.setScalar(2.4 / size);
  const c = box.getCenter(new THREE.Vector3()).multiplyScalar(2.4 / size);
  v.model.position.copy(c).negate();
  v.pivot.add(v.model);
  v.rotX = 0.3;
  if (!v.running) { v.running = true; requestAnimationFrame(loop); }
}

/** 窓を外す（画面を閉じたとき） */
export function hideModel() {
  if (!v) return;
  v.running = false;
  if (v.canvas.parentNode) v.canvas.parentNode.removeChild(v.canvas);
}
