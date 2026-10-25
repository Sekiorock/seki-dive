// home/src/main.js
// ホームワールド「セキオロック中央広場」 v0.4
// v0.1：白い3D広場を見回す、4つの門、上の帯、日本語・英語の切り替え、QRコード表示
// v0.2：門をタップするとアバター選択の画面へ（ワールドの中身はまだ準備中）、
//       中央に立つ広報官ツカサのセリフ、初めて起動したときの流れ
// v0.3：ヒヤマ（端末の中だけ）、開国交付金、銀行・呉服屋・道具屋、施設と門の一覧
// v0.4：サイバー和風のデザイン、ヒヤマを Firebase へ、国庫、政府庁舎の掲示板、お知らせ、出来事の発光
// v0.5：管理画面、和柄とゲームの演出、先生が閉じた門
// hydration v0.1 から：① の門から、ハイドレーション・ビートのページへ移る

import { VERSION, RENDER, PLAZA, CAMERA, UI, STANDEE, GATES, READY_WORLDS } from './config.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, ACCENTS, hexToInt } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { buildPlaza } from './plaza.js';
import { createQrOverlay } from './qr-overlay.js';
import { runOnboarding } from './onboarding.js';
import { getUser, initBackend, backend, setUserLang } from '../../shared/auth.js';
import { openAvatarSelect } from '../../shared/avatar.js';
import { nameKey, lineKey } from '../../shared/characters.js';
import { initEconomy, grantFounding, foundingGranted, onTreasuryChange, onSettingsChange, isWorldOpen, SETTINGS, formatHiyama } from '../../shared/economy.js';
import { initNotices } from '../../shared/notices.js';
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

  // Firebase につなぐ（設定がない・つながらないときは、この端末だけで動く）
  const loading = document.getElementById('loading');
  loading.textContent = t('net.connecting');
  loading.hidden = false;
  await initBackend();
  await initEconomy();
  loading.hidden = true;
  // 言語は本人の設定として保存し、ほかの端末やワールドでも引き継ぐ
  const savedLang = getUser().lang;
  if (savedLang && savedLang !== getLang()) setLang(savedLang);
  else if (!savedLang && getUser().onboarded) setUserLang(getLang());
  onLangChange((lang) => setUserLang(lang));

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

  // 初回の流れを終えているのに開国交付金をまだ受け取っていない人（v0.3 までの人、Firebase に移った人）
  if (!foundingGranted()) {
    const got = await grantFounding();
    if (got) {
      toast(t('talk', {
        name: t(nameKey('tsukasa')),
        line: t(lineKey('tsukasa', 'lateGrant'), { amount: formatHiyama(SETTINGS.foundingGrant) }),
      }));
    }
  }
  if (backend.mode === 'local' && backend.reason === 'offline') setTimeout(() => toast(t('net.offlineToast')), 400);

  // 政府からのお知らせを見張る（まだ見ていない重大発表は、画面を暗くして中央に出す）
  initNotices(toast);
  document.body.classList.add('is-home');
}

function startScene() {
  const canvas = document.getElementById('scene');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    console.error(e);
    showFatal(t('error.webgl'));
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio));
  renderer.shadowMap.enabled = false;   // 影は使わない
  renderer.setClearColor(0x000000, 0);   // 空は透明にして、ページの夜空のグラデーションを見せる
  // 色は書いたとおりの値で出す（sRGB の変換をしない。暗い藍が明るく持ち上がらないように）

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(hexToInt(PLAZA.fogColor), 1, 2);   // 距離は placeCamera で決める

  // 夜の光：空の青と地面の暗さ、月の光、藍と山吹の色の光（つやのある面に光が映る）
  const home = ACCENTS.home;
  scene.add(new THREE.HemisphereLight(0x8aa4ff, 0x0a0f25, 0.62 * RENDER.exposure));
  const moon = new THREE.DirectionalLight(0xdfe8ff, 0.7 * RENDER.exposure);
  moon.position.set(-6, 16, -10);   // 奥から当てて、手前の床に白い照り返しが出ないように
  scene.add(moon);
  const lightA = new THREE.PointLight(hexToInt(home.a1.neon), 1.6, 34, 1.4);
  lightA.position.set(0, 7, 0);
  scene.add(lightA);
  const lightB = new THREE.PointLight(hexToInt(home.a2.neon), 0.9, 30, 1.6);
  lightB.position.set(-9, 4, 9);
  scene.add(lightB);

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
    if (!isWorldOpen(world)) { toast(t('gate.closedToast', { world: t(`world.${world}`) })); return; }
    const chosen = await openAvatarSelect(world);
    if (!chosen) return;
    // できあがっているワールドは、そのページへ移る（アバターはここで選んだので、向こうでは聞かない）
    if (READY_WORLDS.includes(world)) location.href = `${world}/?from=home`;
    else toast(t('world.notReady', { world: t(`world.${world}`) }));
  }

  createNav({ onGate: enterGate, onFacility: openShop });

  // 言語を切り替えたら、3Dの名札と額の文字を描き直す
  onLangChange(() => {
    plaza.redrawLabels();
    applyToDom();
    document.getElementById('toast').classList.remove('is-shown');
    requestRender();
  });

  // 国庫の残高を、政府庁舎の上に浮かぶ掲示板に出す
  onTreasuryChange((n) => { plaza.setTreasury(n); requestRender(); });
  // 先生が閉じたワールドの門は、灰色にして入れなくする
  onSettingsChange(() => { GATES.forEach((gt) => plaza.setGateOpen(gt.id, isWorldOpen(gt.id))); requestRender(); });

  // 描き直し：触っているときは毎回、何もしていないときは少なめに（電池のため）
  let last = 0;
  const idleGap = 1000 / RENDER.idleFps;
  function loop(now) {
    if (needsRender || now - last >= idleGap) {
      plaza.animate(now);
      renderer.render(scene, camera);
      needsRender = false;
      last = now;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.body.classList.add('is-ready');
}

start();
