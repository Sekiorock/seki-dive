// home/src/main.js
// ホームワールド「セキオロック中央広場」 v0.4
// v0.1：白い3D広場を見回す、4つの門、上の帯、日本語・英語の切り替え、QRコード表示
// v0.2：門をタップするとアバター選択の画面へ（ワールドの中身はまだ準備中）、
//       中央に立つ広報官キタローのセリフ、初めて起動したときの流れ
// v0.3：ヒヤマ（端末の中だけ）、開国交付金、銀行・呉服屋・道具屋、施設と門の一覧
// v0.4：サイバー和風のデザイン、ヒヤマを Firebase へ、国庫、政府庁舎の掲示板、お知らせ、出来事の発光
// v0.5：管理画面、和柄とゲームの演出、先生が閉じた門
// hydration v0.1 から：① の門から、ハイドレーション・ビートのページへ移る

import { VERSION, RENDER, PLAZA, CAMERA, UI, STANDEE, GATES, READY_WORLDS, GLOW, GLOW_PROGRESS } from './config.js';
import { createGlow } from '../../shared/glow.js';
import { initI18n, t, onLangChange, applyToDom, getLang, setLang } from '../../shared/i18n.js';
import { applyTheme, ACCENTS, hexToInt } from '../../shared/theme.js';
import { createTopbar } from '../../shared/topbar.js';
import { buildPlaza } from './plaza.js';
import { createQrOverlay } from './qr-overlay.js';
import { runOnboarding } from './onboarding.js';
import { getUser, initBackend, backend, setUserLang, getWorldData } from '../../shared/auth.js';
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

  // 初めて起動したときだけ、言語 → ニックネーム → キタローの説明 の流れを出す
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

/** v1.0：映えの段階。4つのワールドの「すんだ割合」の平均で決める */
function glowLevel() {
  const W = (id) => getWorldData(id);
  const h = W('hydration').clears || {};
  const done = {
    hydration: Object.values(h).filter((c) => Object.values(c || {}).some((r) => r && r.clear)).length,
    crystal: Object.keys(W('crystal').orders || {}).length,
    freeze: Object.values(W('freeze').nights || {}).filter((r) => r && r.cleared).length,
    colloid: Object.keys(W('colloid').areas || {}).length,
  };
  const ids = Object.keys(GLOW_PROGRESS);
  const frac = ids.reduce((a, id) => a + Math.min(1, done[id] / GLOW_PROGRESS[id]), 0) / ids.length;
  return Math.min(8, 1 + Math.floor(frac * 7));
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
  // v1.0：映えの演出（4つのワールドを進めるほど豪華に）
  const glow = createGlow(scene, GLOW);
  glow.setLevel(glowLevel());
  if (new URLSearchParams(location.search).has('debug')) window.__home = { glow: (n) => { glow.setLevel(n); requestRender(); }, level: glowLevel };

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

  // ── 指の操作（v0.5.4）──
  //   1本の指でなぞる：回る・見下ろす角度を変える（離すと少し滑ってから止まる）
  //   2本の指を広げる・つまむ：近づく・離れる。2本の指をそろえて動かす：見る場所をずらす
  //   何もない所を2回すばやくタップ：はじめの視点に戻る
  //   しばらく触らないと、広場のまわりをゆっくり回り続ける（動きを減らす設定の端末では回らない）
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointers = new Map();          // 画面に触れている指 { x, y }
  let drag = null;                     // 1本の指のとき { id, sx, sy, moved }
  let pinch = null;                    // 2本の指のとき { dist, cx, cy, distance }
  let spin = { az: 0, pitch: 0 };      // 指を離したあとの勢い
  let lastInput = performance.now();
  let idleStart = -1;
  let lastTapAt = 0;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deg = THREE.MathUtils.degToRad;
  const homeView = () => ({ azimuth: deg(CAMERA.startAzimuthDeg), pitch: deg(CAMERA.pitchDeg) });
  let reset = null;                    // はじめの視点へ戻る動き { from, to, start }

  function touched() { lastInput = performance.now(); idleStart = -1; reset = null; requestRender(); }
  function clampView() {
    view.pitch = THREE.MathUtils.clamp(view.pitch, deg(CAMERA.minPitchDeg), deg(CAMERA.maxPitchDeg));
    view.distance = THREE.MathUtils.clamp(view.distance, CAMERA.minDistance, CAMERA.maxDistance);
    const r = Math.hypot(target.x, target.z);
    if (r > CAMERA.panLimit) { target.x *= CAMERA.panLimit / r; target.z *= CAMERA.panLimit / r; }
  }
  function twoFinger() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 取れない端末でも動くように */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    spin = { az: 0, pitch: 0 };
    touched();
    if (pointers.size === 1) {
      drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
    } else if (pointers.size === 2) {
      drag = null;                     // 2本目の指が来たら、タップや回転ではなく、ズームとずらし
      pinch = { ...twoFinger(), distance: view.distance };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const now2 = twoFinger();
      // 広げる・つまむ：はじめの指の間かくとの比で、距離を変える
      view.distance = pinch.distance * (pinch.dist / Math.max(20, now2.dist));
      // そろえて動かす：画面の上での動きを、地面の上の動きに直す（カメラの向きに合わせる）
      const mx = now2.cx - pinch.cx, my = now2.cy - pinch.cy;
      pinch.cx = now2.cx; pinch.cy = now2.cy;
      const k = (view.distance / window.innerHeight) * CAMERA.panSpeed;
      const sa = Math.sin(view.azimuth), ca = Math.cos(view.azimuth);
      target.x += (-mx * ca - my * sa) * k;
      target.z += (mx * sa - my * ca) * k;
      clampView();
      placeCamera();
      touched();
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > CAMERA.tapMovePx) drag.moved = true;
    if (!drag.moved) return;
    view.azimuth -= dx * CAMERA.dragSpeed;
    view.pitch += dy * CAMERA.dragSpeed;
    // 離したときに滑らせるため、直前の動きを覚えておく
    spin = { az: -dx * CAMERA.dragSpeed, pitch: dy * CAMERA.dragSpeed };
    clampView();
    placeCamera();
    touched();
  });
  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    touched();
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      // 2本から1本に戻ったら、残った指で続けて回せるように（ただしタップにはしない）
      const [id, p] = [...pointers.entries()][0];
      drag = { id, sx: p.x, sy: p.y, moved: true };
      spin = { az: 0, pitch: 0 };
      return;
    }
    if (!drag || drag.id !== e.pointerId) { drag = null; return; }
    const wasTap = !drag.moved && e.type === 'pointerup';
    drag = null;
    if (!wasTap) return;
    const nowMs = performance.now();
    if (nowMs - lastTapAt < CAMERA.doubleTapMs) {
      lastTapAt = 0;
      // 2回タップ：はじめの視点に、なめらかに戻る
      reset = { from: { ...view, tx: target.x, tz: target.z }, to: { ...homeView(), distance: fittedDistance() }, start: nowMs };
      requestRender();
      return;
    }
    // 何もない所をタップしたときだけ、2回目のタップを待つ（門や建物は1回で開く）
    lastTapAt = handleTap(e.clientX, e.clientY) ? 0 : nowMs;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // パソコンで確かめるとき用：ホイールで近づく・離れる
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.distance += e.deltaY * 0.02;
    clampView();
    placeCamera();
    touched();
  }, { passive: false });

  /** 毎回の描き直しの前：慣性・はじめの視点に戻る動き・何もしていないときの回転。動いていれば true */
  function updateCamera(now, dt) {
    let moving = false;
    if (reset) {
      const k = Math.min(1, (now - reset.start) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      // 回る向きは、近いほうへ
      let da = reset.to.azimuth - reset.from.azimuth;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      view.azimuth = reset.from.azimuth + da * e;
      view.pitch = reset.from.pitch + (reset.to.pitch - reset.from.pitch) * e;
      view.distance = reset.from.distance + (reset.to.distance - reset.from.distance) * e;
      target.x = reset.from.tx * (1 - e);
      target.z = reset.from.tz * (1 - e);
      if (k >= 1) { reset = null; lastInput = now; }
      placeCamera();
      return true;
    }
    if (pointers.size === 0 && (Math.abs(spin.az) > 1e-4 || Math.abs(spin.pitch) > 1e-4)) {
      const f = Math.pow(CAMERA.inertia, dt / 16.7);
      view.azimuth += spin.az * (dt / 16.7);
      view.pitch += spin.pitch * (dt / 16.7);
      spin.az *= f; spin.pitch *= f;
      clampView();
      placeCamera();
      moving = true;
      lastInput = now;
    }
    // しばらく触らなければ、ゆっくり回る（エモい演出）
    if (!reduceMotion && pointers.size === 0 && !document.hidden && now - lastInput > CAMERA.idleDelaySec * 1000) {
      if (idleStart < 0) idleStart = now;
      const ease = Math.min(1, (now - idleStart) / (CAMERA.idleEaseSec * 1000));
      const sec = (now - idleStart) / 1000;
      view.azimuth += deg(CAMERA.idleSpinDegPerSec) * (dt / 1000) * ease * ease;
      // 見下ろす角度と距離が、呼吸のようにゆっくり揺れる
      const b = CAMERA.idleBreath * ease;
      view.pitch += Math.sin(sec * 0.25) * b * 0.002 * dt / 16.7;
      view.distance *= 1 + Math.sin(sec * 0.18 + 1) * b * 0.0015 * dt / 16.7;
      clampView();
      placeCamera();
      moving = true;
    }
    return moving;
  }
  function fittedDistance() {
    const keep = view.distance;
    fitDistance();
    const d = view.distance;
    view.distance = keep;
    return d;
  }

  function handleTap(x, y) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(plaza.hitTargets, false);
    if (!hits.length) return false;
    const data = hits[0].object.userData;
    if (data.talkId) {
      // キタローのセリフを順番に
      talkCount = (talkCount % STANDEE.plazaLines) + 1;
      toast(t('talk', { name: t(nameKey(data.talkId)), line: t(lineKey(data.talkId, `plaza${talkCount}`)) }));
    } else if (data.gateId) {
      enterGate(data.gateId);
    } else if (data.facilityId) {
      openShop(data.facilityId);
    } else {
      return false;
    }
    return true;
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
  let lastLoop = performance.now();
  function loop(now) {
    const dt = Math.min(100, now - lastLoop);
    lastLoop = now;
    if (updateCamera(now, dt)) needsRender = true;
    if (needsRender || now - last >= idleGap) {
      plaza.animate(now);
      glow.step(now / 1000, Math.min(0.1, (now - last) / 1000));
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
