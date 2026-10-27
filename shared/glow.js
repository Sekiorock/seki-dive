// shared/glow.js
// 映えの演出（v1.0）：コロイドミストの「映え」を、ほかのワールドと広場にも。
//   和風ゲーミング × そのワールドらしさ。ステージ（段階）が進むほど、景色が豪華になる。
//   段階 1〜8（数字は各ワールドの config.js の GLOW で変えられる）
//     1 浮かぶ灯籠（段階が上がるほど数が増える）  2 光の粒（ワールドごとの色・形）
//     3 ネオンの鳥居と月                          4 光の柱
//     5 足もとの光の和柄の輪                      6 舞い散るもの（桜・雪・泡）
//     7 宙に浮かぶ光の文字と金箔                  8 オーロラと大きな月
//   3D は軽いもの（影なし、点と板と少しの立体）だけ。空（オーロラ・月・星）は 3D の後ろの
//   ページ側に重ねるので、カメラがどこを向いていても見える。
//   createGlow(scene, cfg) → { setLevel(n), step(now, dt), level }

const FONT = "'M PLUS 1p', 'Noto Sans JP', sans-serif";

/** 段階のしきい値（各ワールドの config の GLOW.at で上書きできる） */
export const GLOW_AT = { lanterns: 1, sparkles: 2, torii: 3, pillars: 4, ring: 5, fall: 6, kanji: 7, aurora: 8 };
/** 段階ごとの2色（各ワールドの config の GLOW.palette で上書きできる） */
export const GLOW_PALETTE = {
  1: ['#7aa8ff', '#5CF2A8'],
  2: ['#5CF2A8', '#c8ff6a'],
  3: ['#ff5e70', '#A985FF'],
  4: ['#b07aff', '#5ce0ff'],
  5: ['#FFC83A', '#ff8a4a'],
  6: ['#ff9ac8', '#FFC83A'],
  7: ['#E6B422', '#A985FF'],
  8: ['#5CF2A8', '#ff9ac8'],
};

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}
function glowTexture(inner = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function fallTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  if (kind === 'snow') {
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = (Math.PI / 3) * i; g.beginPath(); g.moveTo(16 - Math.cos(a) * 12, 16 - Math.sin(a) * 12); g.lineTo(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12); g.stroke(); }
    g.fillStyle = '#dff6ff'; g.beginPath(); g.arc(16, 16, 3, 0, Math.PI * 2); g.fill();
  } else if (kind === 'bubble') {
    g.strokeStyle = 'rgba(190,230,255,0.95)'; g.lineWidth = 2; g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(12, 11, 3, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#ffd0e4';
    g.beginPath(); g.ellipse(16, 16, 12, 7, 0.6, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff9ac8'; g.beginPath(); g.ellipse(18, 15, 5, 3, 0.6, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
function kanjiSprite(ch, col) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.shadowColor = col; g.shadowBlur = 22;
  g.fillStyle = '#ffffff'; g.font = `800 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 68); g.fillText(ch, 64, 68);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
}
function pillarTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const g = c.getContext('2d');
  const gx = g.createLinearGradient(0, 0, 32, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 128);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.6, 'rgba(0,0,0,0.7)'); gy.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gy; g.fillRect(0, 0, 32, 128);
  return new THREE.CanvasTexture(c);
}
/** 足もとの和柄の輪（外の円・内の円・麻の葉のような星） */
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.shadowColor = '#ffffff'; g.shadowBlur = 6;
  g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(128, 128, 60, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i, b = a + Math.PI / 6 * 5;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 104, 128 + Math.sin(a) * 104); g.lineTo(128 + Math.cos(b) * 104, 128 + Math.sin(b) * 104); g.stroke();
  }
  for (let i = 0; i < 24; i++) { const a = (Math.PI / 12) * i; g.beginPath(); g.moveTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106); g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); g.stroke(); }
  return new THREE.CanvasTexture(c);
}
function makeTorii(colA) {
  const torii = new THREE.Group();
  const neonA = new THREE.MeshBasicMaterial({ color: colA, toneMapped: false });
  const neonB = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const body = new THREE.MeshStandardMaterial({ color: 0x7a1020, roughness: 0.5, emissive: 0x5a0010, emissiveIntensity: 0.8 });
  for (const x of [-2.2, 2.2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5, 10), body); p.position.set(x, 2.5, 0); torii.add(p);
    const n = new THREE.Mesh(new THREE.BoxGeometry(0.05, 5, 0.05), neonA); n.position.set(x + 0.22, 2.5, 0.2); torii.add(n);
  }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.32, 0.5), body); kasagi.position.set(0, 5.1, 0); torii.add(kasagi);
  const kLine = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.06, 0.06), neonA); kLine.position.set(0, 5.3, 0.28); torii.add(kLine);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 0.3), body); nuki.position.set(0, 4.3, 0); torii.add(nuki);
  const nLine = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.04, 0.04), neonB); nLine.position.set(0, 4.2, 0.18); torii.add(nLine);
  torii.userData.neon = neonA;
  return torii;
}

/**
 * 映えの演出を作る
 * @param scene THREE.Scene
 * @param cfg {
 *   area: { c:[x,y,z], r:[内,外], h:[低,高], arc:[始,終] }  まわりの輪の中に置く（ラジアン。0 が奥）
 *      または { box:true, x:[左,右], gap: 真ん中のあけておく半幅, z:[奥,手前], h:[低,高] }
 *   torii: [{ at:[x,y,z], s:大きさ, ry:向き, lv:出る段階 }]
 *   kanji: '文字列'、fall: 'petal' | 'snow' | 'bubble'、sparkle: '#色'
 *   size: 全体の大きさの倍率（広場のように広いところは大きく）
 *   at, palette: 段階のしきい値と色（上の GLOW_AT / GLOW_PALETTE を上書き）
 * }
 */
export function createGlow(scene, cfg = {}) {
  const AT = { ...GLOW_AT, ...(cfg.at || {}) };
  const PAL = { ...GLOW_PALETTE, ...(cfg.palette || {}) };
  const S = cfg.size || 1;
  const area = cfg.area || { c: [0, 0, 0], r: [6, 12], h: [1, 5] };
  const rnd = rand(cfg.seed || 7);
  const glowTex = glowTexture();
  const root = new THREE.Group();
  root.name = 'glow';
  scene.add(root);
  const add = (o) => { root.add(o); return o; };
  const lerp = (a, b, k) => a + (b - a) * k;
  /** まわりのどこか（[x, y, z]） */
  function spot(hk = rnd()) {
    if (area.box) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = side * lerp(area.gap || 0, side < 0 ? -area.x[0] : area.x[1], rnd());
      return [x, lerp(area.h[0], area.h[1], hk), lerp(area.z[0], area.z[1], rnd())];
    }
    const [a0, a1] = area.arc || [-Math.PI, Math.PI];
    const a = lerp(a0, a1, rnd());
    const r = lerp(area.r[0], area.r[1], rnd());
    return [area.c[0] + Math.sin(a) * r, area.c[1] + lerp(area.h[0], area.h[1], hk), area.c[2] - Math.cos(a) * r];
  }
  const center = area.box ? [0, 0, (area.z[0] + area.z[1]) / 2] : area.c;

  // ── 1 浮かぶ灯籠 ──
  const LN = 24;
  const lantGeo = new THREE.CylinderGeometry(0.11 * S, 0.13 * S, 0.26 * S, 8);
  const lanterns = [];
  for (let i = 0; i < LN; i++) {
    const m = new THREE.Mesh(lantGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.set(0.9 * S, 0.9 * S, 1);
    const g = new THREE.Group(); g.add(m, halo);
    const p = spot();
    g.userData = { x: p[0], y: p[1], z: p[2], ph: rnd() * 6 };
    g.position.set(...p);
    add(g); lanterns.push(g);
  }
  // ── 2 光の粒（ワールドの色） ──
  const FN = 70;
  const ffPos = new Float32Array(FN * 3);
  const ffSeed = [];
  for (let i = 0; i < FN; i++) { const p = spot(rnd() * 0.7); ffSeed.push([p[0], p[1] - (area.h[0] * 0.5), p[2], rnd() * 6]); }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const sparkles = add(new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: new THREE.Color(cfg.sparkle || '#d8ff6a'), size: 0.28 * S, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  // ── 3 ネオンの鳥居 ──
  const toriis = (cfg.torii || []).map((T) => {
    const t = makeTorii(new THREE.Color(PAL[3][0]));
    t.position.set(...T.at); t.scale.setScalar(T.s || 1); t.rotation.y = T.ry || 0;
    t.userData.lv = T.lv || AT.torii;
    add(t); return t;
  });
  // ── 4 光の柱 ──
  const pTex = pillarTexture();
  const pillars = Array.from({ length: 6 }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: pTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.7 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * S, 0.35 * S, 9 * S, 12, 1, true), mat);
    let p;
    if (area.box) p = [(i % 2 ? 1 : -1) * Math.max(area.gap + 1.2, Math.abs(area.x[i % 2 ? 1 : 0]) * 0.55), 0, lerp(area.z[0], area.z[1], (Math.floor(i / 2) + 0.3) / 3)];
    else { const a = (Math.PI * 2 / 6) * i + 0.5; const r = area.r[1] * 0.85; p = [area.c[0] + Math.sin(a) * r, area.c[1], area.c[2] - Math.cos(a) * r]; }
    m.position.set(p[0], p[1] + 4.5 * S, p[2]);
    m.userData.ph = i * 1.3;
    add(m); return m;
  });
  // ── 5 足もとの光の和柄の輪 ──
  const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, side: THREE.DoubleSide, fog: false });
  const ring = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat));
  // 置き場所：cfg.ring = { at:[x,y,z], size, up:true（立てて空に浮かべる） }。なければ足もとに寝かせる
  const R = cfg.ring || {};
  const ringR = R.size || (area.box ? (area.gap || 2) * 3 : area.r[0] * 2);
  ring.scale.set(ringR, ringR, 1);
  if (R.up) ring.rotation.set(0, R.ry || 0, 0);
  else ring.rotation.x = -Math.PI / 2;
  ring.position.set(...(R.at || [center[0], (cfg.groundY ?? center[1]) + 0.03, area.box ? area.z[0] * 0.55 + area.z[1] * 0.45 : center[2]]));
  const ringOp = R.op || 0.8;
  // ── 6 舞い散るもの ──
  const PN = 130;
  const H = (area.h[1] + 2) * 1.1;
  const ptPos = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) { const p = spot(); ptPos.set([p[0] * 0.9, rnd() * H, p[2]], i * 3); }
  const ptGeo = new THREE.BufferGeometry(); ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
  const fallKind = cfg.fall || 'petal';
  const fall = add(new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.24 * S, map: fallTexture(fallKind), transparent: true, depthWrite: false, alphaTest: 0.1 })));
  const fallUp = fallKind === 'bubble';
  // ── 7 光の文字と金箔 ──
  const chars = (cfg.kanji || '光粒').split('');
  const kanji = chars.map((ch, i) => {
    const sp = kanjiSprite(ch, i % 2 ? PAL[7][1] : PAL[8][0]);
    sp.scale.set(0.9 * S, 0.9 * S, 1);
    const p = spot(0.6 + rnd() * 0.4);
    sp.userData = { x: p[0], y: p[1] + 0.8 * S, z: p[2], ph: rnd() * 6 };
    add(sp); return sp;
  });
  const GN = 90;
  const gdPos = new Float32Array(GN * 3);
  for (let i = 0; i < GN; i++) { const p = spot(); gdPos.set([p[0], rnd() * H, p[2]], i * 3); }
  const gdGeo = new THREE.BufferGeometry(); gdGeo.setAttribute('position', new THREE.BufferAttribute(gdPos, 3));
  const gold = add(new THREE.Points(gdGeo, new THREE.PointsMaterial({ color: 0xffd86b, size: 0.12 * S, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));

  let level = 0;
  const on = (k) => level >= AT[k];
  function setLevel(n) {
    level = Math.max(0, Math.min(8, Math.round(n) || 0));
    const pal = PAL[Math.max(1, level)];
    lanterns.forEach((g, i) => { g.visible = on('lanterns') && i < Math.min(LN, 3 + level * 3); });
    sparkles.visible = on('sparkles');
    toriis.forEach((t) => { t.visible = level >= t.userData.lv; t.userData.neon.color.set(pal[0]); });
    pillars.forEach((m, i) => { m.visible = on('pillars') && i < 2 + (level - AT.pillars) * 2; m.material.color.set(i % 2 ? pal[1] : pal[0]); });
    ring.visible = on('ring');
    ringMat.color.set(pal[1]);
    fall.visible = on('fall');
    kanji.forEach((s) => { s.visible = on('kanji'); });
    gold.visible = on('kanji');
    mountSky(level, AT, PAL, cfg.sky);
  }
  function step(now, dt) {
    if (!level) return;
    lanterns.forEach((g) => { if (!g.visible) return; const u = g.userData; g.position.y = u.y + Math.sin(now * 0.6 + u.ph) * 0.18 * S; g.position.x = u.x + Math.sin(now * 0.2 + u.ph) * 0.15 * S; });
    if (sparkles.visible) {
      for (let i = 0; i < FN; i++) { const [x, y, z, ph] = ffSeed[i]; ffPos[i * 3] = x + Math.sin(now * 0.5 + ph) * 0.6 * S; ffPos[i * 3 + 1] = y + Math.sin(now * 0.8 + ph * 2) * 0.3 * S; ffPos[i * 3 + 2] = z + Math.cos(now * 0.4 + ph) * 0.5 * S; }
      ffGeo.attributes.position.needsUpdate = true;
      sparkles.material.opacity = 0.6 + Math.sin(now * 3) * 0.35;
    }
    pillars.forEach((m) => { if (m.visible) m.material.opacity = 0.45 + Math.sin(now * 1.4 + m.userData.ph) * 0.25; });
    if (ring.visible) { ring.rotation.z = now * 0.12; ringMat.opacity = ringOp * (0.7 + Math.sin(now * 1.7) * 0.3); }
    if (fall.visible) {
      for (let i = 0; i < PN; i++) {
        const sp = dt * (0.25 + (i % 5) * 0.05) * S;
        let y = ptPos[i * 3 + 1] + (fallUp ? sp : -sp);
        if (y < 0) y += H; if (y > H) y -= H;
        ptPos[i * 3 + 1] = y; ptPos[i * 3] += Math.sin(now * 1.2 + i) * dt * 0.3;
      }
      ptGeo.attributes.position.needsUpdate = true;
    }
    if (gold.visible) {
      for (let i = 0; i < GN; i++) { let y = gdPos[i * 3 + 1] + dt * 0.2 * S; if (y > H) y -= H; gdPos[i * 3 + 1] = y; }
      gdGeo.attributes.position.needsUpdate = true;
      gold.material.opacity = 0.7 + Math.sin(now * 4) * 0.3;
      kanji.forEach((s) => { const u = s.userData; s.position.set(u.x, u.y + Math.sin(now * 0.7 + u.ph) * 0.25 * S, u.z); s.material.opacity = 0.55 + Math.sin(now * 1.3 + u.ph) * 0.35; });
    }
  }
  return { setLevel, step, get level() { return level; }, root };
}

/**
 * 空（3D の後ろ、ページ側）：色のかすみ・星・月・遠くの灯籠・オーロラ。
 * body[data-glow] と CSS の変数 --glow-a / --glow-b / --glow-k を決める。
 */
export function mountSky(level, AT = GLOW_AT, PAL = GLOW_PALETTE, sky = {}) {
  let el = document.querySelector('.glow-sky');
  if (!el) {
    el = document.createElement('div');
    el.className = 'glow-sky';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<i class="glow-sky__haze"></i><i class="glow-sky__stars"></i><i class="glow-sky__aurora"></i><i class="glow-sky__aurora is-b"></i><i class="glow-sky__moon"></i>'
      + '<span class="glow-sky__lamps">' + Array.from({ length: 10 }, (_, i) => `<b style="--i:${i}"></b>`).join('') + '</span>';
    const cv = document.getElementById('scene');
    if (cv && cv.parentNode) cv.parentNode.insertBefore(el, cv); else document.body.prepend(el);
  }
  const n = Math.max(0, Math.min(8, level | 0));
  const pal = PAL[Math.max(1, n)];
  document.body.dataset.glow = String(n);
  const s = document.body.style;
  s.setProperty('--glow-a', pal[0]);
  s.setProperty('--glow-b', pal[1]);
  s.setProperty('--glow-k', String(n ? 0.18 + n * 0.07 : 0));
  if (sky.moonTop) s.setProperty('--glow-moon-top', sky.moonTop);
  if (sky.moonRight) s.setProperty('--glow-moon-right', sky.moonRight);
  el.classList.toggle('has-moon', n >= AT.torii);
  el.classList.toggle('has-lamps', n >= AT.ring);
  el.classList.toggle('has-aurora', n >= AT.aurora);
  el.classList.toggle('is-bigmoon', n >= AT.aurora);
  return el;
}
