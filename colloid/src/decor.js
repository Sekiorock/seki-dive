// colloid/src/decor.js
// 映えの演出（v0.2）：和風ゲーミング × 霧。エリアが進むほど、景色が豪華になる。
//   1 浮かぶ灯籠（数がだんだん増える） 2 蛍 3 湖に立つネオンの大鳥居（水面に映る） 4 雷（紫に光る）
//   5 灯籠流し 6 桜の花びら 7 宙に浮かぶ光の文字と金箔 8 オーロラと大きな月（湖の社）
// どれも軽い（影なし、点と板と少しの立体）。出すかどうかと色は setLevel(エリア) で決める。

import { GLOW, AMBIENCE } from './config.js';

const FONT = "'M PLUS 1p', 'Noto Sans JP', sans-serif";
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
function petalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#ffd0e4';
  g.beginPath(); g.ellipse(16, 16, 12, 7, 0.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff9ac8'; g.beginPath(); g.ellipse(18, 15, 5, 3, 0.6, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}
function kanjiSprite(ch, col) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.shadowColor = col; g.shadowBlur = 22;
  g.fillStyle = '#ffffff'; g.font = `800 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 64, 68); g.fillText(ch, 64, 68);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.scale.set(0.9, 0.9, 1);
  return sp;
}

export function createDecor(scene, lights) {
  const rnd = rand(21);
  const glowTex = glowTexture();
  const add = (o) => { scene.add(o); return o; };

  // ── 1 浮かぶ灯籠 ──
  const LN = 26;
  const lantGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.26, 8);
  const lanterns = [];
  for (let i = 0; i < LN; i++) {
    const m = new THREE.Mesh(lantGeo, new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false, fog: true }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    halo.scale.set(0.9, 0.9, 1);
    const g = new THREE.Group(); g.add(m, halo);
    const side = i % 2 ? 1 : -1;
    g.userData = { x: side * (1.6 + rnd() * 6), y: 1.6 + rnd() * 2.8, z: -1.5 - rnd() * 8, ph: rnd() * 6 };
    g.position.set(g.userData.x, g.userData.y, g.userData.z);
    add(g); lanterns.push(g);
  }
  // ── 2 蛍 ──
  const FN = 70;
  const ffPos = new Float32Array(FN * 3);
  const ffSeed = [];
  for (let i = 0; i < FN; i++) { ffSeed.push([(rnd() - 0.5) * 12, 0.3 + rnd() * 2.2, -0.5 - rnd() * 6, rnd() * 6]); }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const fireflies = add(new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: 0xd8ff6a, size: 0.28, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  // ── 3 ネオンの大鳥居（湖の中、水面に映る） ──
  const torii = new THREE.Group();
  const neonA = new THREE.MeshBasicMaterial({ color: 0xff3a5a, toneMapped: false });
  const neonB = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const body = new THREE.MeshStandardMaterial({ color: 0x7a1020, roughness: 0.5, emissive: 0x5a0010, emissiveIntensity: 0.8 });
  for (const x of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 5, 12), body); p.position.set(x, 2.5, 0); torii.add(p); const n = new THREE.Mesh(new THREE.BoxGeometry(0.05, 5, 0.05), neonA); n.position.set(x + 0.22, 2.5, 0.2); torii.add(n); }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.32, 0.5), body); kasagi.position.set(0, 5.1, 0); torii.add(kasagi);
  const kLine = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.06, 0.06), neonA); kLine.position.set(0, 5.3, 0.28); torii.add(kLine);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 0.3), body); nuki.position.set(0, 4.3, 0); torii.add(nuki);
  const nLine = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.04, 0.04), neonB); nLine.position.set(0, 4.2, 0.18); torii.add(nLine);
  torii.position.set(0, -0.06, -8.5);
  const reflection = torii.clone(); reflection.scale.y = -1; reflection.position.y = -0.12;
  reflection.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.32; } });
  add(torii); add(reflection);
  // ── 4 雷（ジグザグの線が、ときどき光る） ──
  const boltMat = new THREE.LineBasicMaterial({ color: 0xd8b0ff, transparent: true, opacity: 0, toneMapped: false });
  const boltGeo = new THREE.BufferGeometry();
  const boltPos = new Float32Array(10 * 3);
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const bolt = add(new THREE.Line(boltGeo, boltMat));
  let boltT = 0, nextBolt = 2;
  // ── 5 灯籠流し（湖の上を、ゆっくり流れる） ──
  const river = [];
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), new THREE.MeshBasicMaterial({ color: 0xffd080, toneMapped: false }));
    box.position.y = 0.12;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    halo.scale.set(0.8, 0.8, 1); halo.position.y = 0.12;
    const refl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
    refl.scale.set(0.5, 1.2, 1); refl.position.y = -0.35;
    g.add(box, halo, refl);
    g.userData = { x: -9 + rnd() * 18, z: -3.5 - rnd() * 7, sp: 0.15 + rnd() * 0.2, ph: rnd() * 6 };
    add(g); river.push(g);
  }
  // ── 6 桜の花びら ──
  const PN = 140;
  const ptPos = new Float32Array(PN * 3);
  for (let i = 0; i < PN; i++) ptPos.set([(rnd() - 0.5) * 14, rnd() * 6, -6 + rnd() * 9], i * 3);
  const ptGeo = new THREE.BufferGeometry(); ptGeo.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
  const petals = add(new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 0.22, map: petalTexture(), transparent: true, depthWrite: false, alphaTest: 0.1 })));
  // ── 7 光の文字と金箔 ──
  const kanji = '霧光粒膜電凝墨'.split('').map((ch, i) => {
    const sp = kanjiSprite(ch, i % 2 ? '#A985FF' : '#5CF2A8');
    sp.userData = { x: (i - 3) * 1.7 + (rnd() - 0.5), y: 2.8 + rnd() * 1.6, z: -3 - rnd() * 3, ph: rnd() * 6 };
    add(sp); return sp;
  });
  const GN = 90;
  const gdPos = new Float32Array(GN * 3);
  for (let i = 0; i < GN; i++) gdPos.set([(rnd() - 0.5) * 12, rnd() * 5, -5 + rnd() * 8], i * 3);
  const gdGeo = new THREE.BufferGeometry(); gdGeo.setAttribute('position', new THREE.BufferAttribute(gdPos, 3));
  const gold = add(new THREE.Points(gdGeo, new THREE.PointsMaterial({ color: 0xffd86b, size: 0.12, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  // ── 8 オーロラと大きな月 ──
  const auroraTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(169,133,255,0)'); gr.addColorStop(0.35, 'rgba(169,133,255,0.55)'); gr.addColorStop(0.7, 'rgba(92,242,168,0.75)'); gr.addColorStop(1, 'rgba(92,242,168,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  })();
  const auroras = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 5, 40, 1), new THREE.MeshBasicMaterial({ map: auroraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0.8 }));
    m.position.set(-2 + i * 3, 7.5 + i * 0.8, -20 - i * 2);
    m.rotation.x = -0.15;
    m.userData.base = m.geometry.attributes.position.array.slice();
    add(m); return m;
  });
  const moon = add(new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,250,235,1)'), color: 0xfff6e0, transparent: true, depthWrite: false, fog: false })));
  moon.scale.set(7, 7, 1); moon.position.set(-6, 9, -24);
  const moonCore = add(new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshBasicMaterial({ color: 0xfffaf0, fog: false, toneMapped: false })));
  moonCore.position.set(-6, 9, -23.9);

  let level = 1;
  const on = (k) => level >= GLOW[k];
  function setLevel(n) {
    level = n;
    lanterns.forEach((g, i) => { g.visible = on('lanterns') && i < Math.min(LN, 3 + n * 3); });
    fireflies.visible = on('fireflies');
    torii.visible = reflection.visible = on('torii');
    bolt.visible = on('lightning');
    river.forEach((g) => { g.visible = on('river'); });
    petals.visible = on('petals');
    kanji.forEach((s) => { s.visible = on('kanji'); });
    gold.visible = on('kanji');
    auroras.forEach((m) => { m.visible = on('aurora'); });
    moon.visible = moonCore.visible = n >= GLOW.torii;
    const A = AMBIENCE[Math.min(8, Math.max(1, n))];
    scene.fog.color.set(A.fog);
    lights.a.color.set(A.a); lights.b.color.set(A.b);
    lights.a.intensity = 0.6 + n * 0.03; lights.b.intensity = 0.5 + n * 0.03;
  }
  function step(now, dt) {
    lanterns.forEach((g) => { if (!g.visible) return; const u = g.userData; g.position.y = u.y + Math.sin(now * 0.6 + u.ph) * 0.18; g.position.x = u.x + Math.sin(now * 0.2 + u.ph) * 0.15; });
    if (fireflies.visible) {
      for (let i = 0; i < FN; i++) { const [x, y, z, ph] = ffSeed[i]; ffPos[i * 3] = x + Math.sin(now * 0.5 + ph) * 0.6; ffPos[i * 3 + 1] = y + Math.sin(now * 0.8 + ph * 2) * 0.3; ffPos[i * 3 + 2] = z + Math.cos(now * 0.4 + ph) * 0.5; }
      ffGeo.attributes.position.needsUpdate = true;
      fireflies.material.opacity = 0.6 + Math.sin(now * 3) * 0.35;
    }
    if (bolt.visible) {
      boltT -= dt;
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = (level === 4 ? 2.5 : 6) + Math.random() * 4;
        boltT = 0.35;
        let x = (Math.random() - 0.5) * 14, y = 9;
        for (let q = 0; q < 10; q++) { boltPos.set([x, y, -14], q * 3); x += (Math.random() - 0.5) * 1.6; y -= 1.0; }
        boltGeo.attributes.position.needsUpdate = true;
      }
      const k = boltT > 0 ? (Math.sin(boltT * 60) > -0.3 ? 1 : 0.2) : 0;
      boltMat.opacity = k;
      lights.flash(boltT > 0 ? 0.8 * k : 0);
    } else lights.flash(0);
    river.forEach((g) => { if (!g.visible) return; const u = g.userData; u.x += u.sp * dt; if (u.x > 9) u.x = -9; g.position.set(u.x, Math.sin(now + u.ph) * 0.02, u.z); });
    if (petals.visible) {
      for (let i = 0; i < PN; i++) {
        let y = ptPos[i * 3 + 1] - dt * (0.25 + (i % 5) * 0.05);
        if (y < 0) y += 6;
        ptPos[i * 3 + 1] = y; ptPos[i * 3] += Math.sin(now * 1.2 + i) * dt * 0.3;
      }
      ptGeo.attributes.position.needsUpdate = true;
    }
    if (gold.visible) {
      for (let i = 0; i < GN; i++) { let y = gdPos[i * 3 + 1] + dt * 0.2; if (y > 5) y -= 5; gdPos[i * 3 + 1] = y; }
      gdGeo.attributes.position.needsUpdate = true;
      gold.material.opacity = 0.7 + Math.sin(now * 4) * 0.3;
      kanji.forEach((s) => { const u = s.userData; s.position.set(u.x, u.y + Math.sin(now * 0.7 + u.ph) * 0.25, u.z); s.material.opacity = 0.55 + Math.sin(now * 1.3 + u.ph) * 0.35; });
    }
    if (auroras[0].visible) {
      auroras.forEach((m, j) => {
        const pa = m.geometry.attributes.position; const b = m.userData.base;
        for (let v = 0; v < pa.count; v++) pa.setZ(v, b[v * 3 + 2] + Math.sin(now * 0.5 + b[v * 3] * 0.35 + j) * 1.4);
        pa.needsUpdate = true;
        m.material.opacity = 0.55 + Math.sin(now * 0.7 + j) * 0.25;
      });
    }
  }
  return { setLevel, step };
}
