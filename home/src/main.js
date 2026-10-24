// home/src/main.js
// ホームワールド「セキオロック中央広場」 v0.2
// v0.1：白い3D広場を見回す、4つの門、上の帯、日本語・英語の切り替え、QRコード表示
// v0.2：門をタップするとアバター選択の画面へ（ワールドの中身はまだ準備中）、
//       中央に立つ広報官ツカサのセリフ、初めて起動したときの流れ
// v0.3：ヒヤマ（端末の中だけ）、開国交付金、銀行・呉服屋・道具屋、施設と門の一覧

import { VERSION, RENDER, PLAZA, CAMERA, UI, STANDEE } from './config.js';
import { initI18n, t, onLangChange, applyToDom } from '../../shared/i18n.js';
import { applyTheme, BASE, hexToInt } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { buildPlaza } from './plaza.js';
import { createQrOverlay } from './qr-overlay.js';
import { runOnboarding } from './onboarding.js';
import { getUser } from '../../shared/auth.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { nameKey, lineKey } from '../../shared/characters.js';
import { grantFounding, foundingGranted, SETTINGS, formatHiyama } from '../../shared/economy.js';
import { openShop, setShopToast } from './shops.js';
import { createNav } from './nav.js';

const SHARED_PATH = 'shared/';   // index.html から見た shared フォルダの場所

function showFatal(message) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.textContent = message;
  document.body.append(d);
}

let toastTimer = 0;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), UI.toastMs);
}

async function start() {
  applyTheme('home');
  document.getElementById('version').textContent = VERSION;

  try {
    await initI18n(SHARED_PATH);
  } catch (e) {
    console.error(e);
    // 文字の辞書が読めないときだけは、ここで両方の言語を直接出す
    showFatal('文字のファイルを読み込めませんでした。/ Could not load the text files.');
    return;
  }

  const qr = createQrOverlay();
  createTopbar({ mount: document.getElementById('topbar'), showQR: true, onQR: qr.open, onBalance: () => openShop('bank') });
  setShopToast(toast);
  applyToDom();

  if (typeof window.THREE === 'undefined') {
    showFatal(t('error.three'));
    return;
  }

  // Google Fonts の読み込みを少しだけ待ってから、3Dの名札の文字を描く
  if (document.fonts && document.fonts.ready) {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  }

  startScene();

  // 初めて起動したときだけ、言語 → ニックネーム → ツカサの説明 の流れを出す
  if (!getUser().onboarded) await runOnboarding();

  // v0.2 までに初回の流れを終えた人には、開国交付金をここで支給する
  if (!foundingGranted()) {
    grantFounding();
    toast(t('talk', {
      name: t(nameKey('tsukasa')),
      line: t(lineKey('tsukasa', 'lateGrant'), { amount: formatHiyama(SETTINGS.foundingGrant) }),
    }));
  }
  document.body.classList.add('is-home');
}

function startScene() {
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch (e) {
    console.error(e);
    showFatal(t('error.webgl'));
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.shadowMap.enabled = false;   // 影は使わない
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(hexToInt(BASE.white));
  scene.fog = new THREE.Fog(hexToInt(BASE.white), 1, 2);   // 距離は placeCamera で決める

  // つや消しの白に見せる、やわらかい光（影はなし）
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e6e6, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.35);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  let needsRender = true;
  const requestRender = () => { needsRender = true; };

  const camera = new THREE.PerspectiveCamera(RENDER.fov, 1, 0.1, 200);
  const plaza = buildPlaza(scene, { onTextureLoad: () => requestRender() });

  // ── カメラ：広場の中心のまわりを回る ──
  const view = {
    azimuth: THREE.MathUtils.degToRad(CAMERA.startAzimuthDeg),
    pitch: THREE.MathUtils.degToRad(CAMERA.pitchDeg),
    distance: CAMERA.distance,
  };
  const target = new THREE.Vector3(0, 2.0, 0);

  function placeCamera() {
    const d = view.distance;
    camera.position.set(
      target.x + Math.sin(view.azimuth) * Math.cos(view.pitch) * d,
      target.y + Math.sin(view.pitch) * d,
      target.z + Math.cos(view.azimuth) * Math.cos(view.pitch) * d);
    camera.lookAt(target);
    // 奥は白い霧に溶ける（近くの門ははっきり、向こう側はうっすら）
    scene.fog.near = d + PLAZA.fogNearOffset;
    scene.fog.far = d + PLAZA.fogFarOffset;
    plaza.faceCamera(camera);
  }

  // 画面の幅に合わせて、広場がほぼ収まる距離にする
  function fitDistance() {
    const aspect = camera.aspect;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const need = CAMERA.fitRadius / Math.tan(hfov / 2);
    view.distance = THREE.MathUtils.clamp(need, CAMERA.minDistance, CAMERA.maxDistance);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 上の帯と題名の分だけ、広場を少し下に描く
    camera.setViewOffset(w, h, 0, -h * CAMERA.screenShiftY, w, h);
    camera.updateProjectionMatrix();
    fitDistance();
    placeCamera();
    requestRender();
  }
  window.addEventListener('resize', resize);
  resize();

  // ── 指でなぞる・タップ ──
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;

  canvas.addEventListener('pointerdown', (e) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CAMERA.tapMovePx) drag.moved = true;
    if (!drag.moved) return;
    view.azimuth -= dx * CAMERA.dragSpeed;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * CAMERA.dragSpeed,
      THREE.MathUtils.degToRad(CAMERA.minPitchDeg), THREE.MathUtils.degToRad(CAMERA.maxPitchDeg));
    placeCamera();
    requestRender();
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasTap = !drag.moved && e.type === 'pointerup';
    drag = null;
    if (wasTap) handleTap(e.clientX, e.clientY);
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // パソコンで確かめるとき用：ホイールで近づく・離れる
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.distance = THREE.MathUtils.clamp(view.distance + e.deltaY * 0.02, CAMERA.minDistance, CAMERA.maxDistance);
    placeCamera();
    requestRender();
  }, { passive: false });

  function handleTap(x, y) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(plaza.hitTargets, false);
    if (!hits.length) return;
    const data = hits[0].object.userData;
    if (data.talkId) {
      // ツカサのセリフを順番に
      talkCount = (talkCount % STANDEE.plazaLines) + 1;
      toast(t('talk', { name: t(nameKey(data.talkId)), line: t(lineKey(data.talkId, `plaza${talkCount}`)) }));
    } else if (data.gateId) {
      enterGate(data.gateId);
    } else if (data.facilityId) {
      openShop(data.facilityId);
    }
  }
  let talkCount = 0;

  // 門に入る：アバター選択の画面 → （ワールドの中身はまだ準備中なので広場に戻る）
  async function enterGate(world) {
    document.getElementById('toast').classList.remove('is-shown');
    const chosen = await openAvatarSelect(world);
    if (chosen) toast(t('world.notReady', { world: t(`world.${world}`) }));
  }

  createNav({ onGate: enterGate, onFacility: openShop });

  // 言語を切り替えたら、3Dの名札と額の文字を描き直す
  onLangChange(() => {
    plaza.redrawLabels();
    applyToDom();
    document.getElementById('toast').classList.remove('is-shown');
    requestRender();
  });

  // 必要なときだけ描き直す（電池を長持ちさせるため）
  function loop() {
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    requestAnimationFrame(loop);
  }
  loop();
  document.body.classList.add('is-ready');
}

start();
