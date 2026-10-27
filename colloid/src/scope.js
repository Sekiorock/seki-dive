// colloid/src/scope.js
// のぞき窓（限外の眼鏡で見たようす）。2D の canvas に、丸く切り抜いて描く。
//   none     ：何も見えない（粒が小さすぎて光を散らさない：食塩水・砂糖水）
//   brown    ：光の点が不規則に動く（コロイド粒子のブラウン運動）。molecules：まわりの水分子も描いて、ぶつかるようすを見せる
//   mud      ：大きな粒が、ゆっくり沈んでいく（懸濁液：ブラウン運動はほとんど見えない）
//   dialysis ：セロハンの膜（点線）の左が袋の中。コロイド粒子（大きい）は通れず、H⁺・Cl⁻（小さい）は膜を通って外へ出る

import { SCOPE } from './config.js';

function rand(seed) {
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export function createScope(canvas) {
  const g = canvas.getContext('2d');
  const rnd = rand(17);
  let W = 160, H = 160, dpr = 1;
  let mode = 'none';
  let opt = {};
  const dots = Array.from({ length: SCOPE.dots }, () => ({ x: rnd(), y: rnd(), vx: 0, vy: 0 }));
  const mols = Array.from({ length: SCOPE.molecules }, () => ({ x: rnd(), y: rnd(), a: rnd() * Math.PI * 2 }));
  const mud = Array.from({ length: 7 }, () => ({ x: rnd(), y: rnd(), r: 0.07 + rnd() * 0.05 }));
  // 透析：イオン（side：-1 袋の中、+1 外、0 外の水を替えて消えた）
  const ions = Array.from({ length: SCOPE.ions }, (_, i) => ({ x: rnd() * 0.4, y: rnd(), kind: i % 2 ? 'Cl' : 'H', side: -1, gone: false }));
  const colloid = Array.from({ length: SCOPE.colloid }, () => ({ x: 0.05 + rnd() * 0.3, y: 0.1 + rnd() * 0.8 }));
  const MEMB = 0.45;

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || 160; H = canvas.clientHeight || 160;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }
  size();
  window.addEventListener('resize', size);

  /** 透析：袋の中と外のイオンの量（0〜100）に合わせて、イオンの側を決める */
  function placeIons(inside, outside) {
    const n = ions.length;
    const nIn = Math.round((inside / 100) * n), nOut = Math.round((outside / 100) * n);
    ions.forEach((p, i) => {
      const want = i < nIn ? -1 : i < nIn + nOut ? 1 : 0;
      if (want === 0) { if (!p.gone) { p.gone = true; } p.side = 0; return; }
      p.gone = false;
      if (p.side !== want) p.tx = want < 0 ? 0.05 + Math.random() * (MEMB - 0.1) : MEMB + 0.05 + Math.random() * (0.9 - MEMB);
      p.side = want;
    });
  }

  let last = 0;
  return {
    /** mode と、そのときの数値（dialysis：{ inside, outside, cloud }、brown：{ molecules }） */
    set(m, o = {}) {
      if (m !== mode && m === 'dialysis') ions.forEach((p) => { p.x = rnd() * 0.4; p.side = -1; p.gone = false; });
      mode = m; opt = o;
      if (m === 'dialysis') placeIons(o.inside ?? 100, o.outside ?? 0);
      if (!canvas.width || canvas.clientWidth !== W) size();
    },
    frame(nowMs) {
      if (!canvas.offsetParent) return;
      const now = nowMs / 1000;
      const dt = Math.min(0.05, Math.max(0, now - last));
      last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#03070c'; g.fillRect(0, 0, W, H);
      // 横から入る光の帯（限外顕微鏡は、横から強い光を当てて、散らばった光を見る）
      const grd = g.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, 'rgba(255,240,180,0.10)'); grd.addColorStop(1, 'rgba(255,240,180,0.02)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      if (mode === 'brown') {
        if (opt.molecules) {
          g.fillStyle = 'rgba(90,168,255,0.75)';
          for (const m of mols) {
            m.x += Math.cos(m.a) * dt * 0.5; m.y += Math.sin(m.a) * dt * 0.5;
            if (m.x < 0 || m.x > 1) { m.a = Math.PI - m.a; m.x = Math.max(0, Math.min(1, m.x)); }
            if (m.y < 0 || m.y > 1) { m.a = -m.a; m.y = Math.max(0, Math.min(1, m.y)); }
            if (Math.random() < 0.02) m.a += (Math.random() - 0.5) * 2;
            g.beginPath(); g.arc(m.x * W, m.y * H, 1.6, 0, Math.PI * 2); g.fill();
          }
        }
        for (const d of dots) {
          // 水分子が四方からぶつかる：毎回ちがう向きに小さく押される
          d.vx = d.vx * 0.85 + (Math.random() - 0.5) * 0.9 * dt * 6;
          d.vy = d.vy * 0.85 + (Math.random() - 0.5) * 0.9 * dt * 6;
          d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.x < 0.05 || d.x > 0.95) d.vx *= -1;
          if (d.y < 0.05 || d.y > 0.95) d.vy *= -1;
          d.x = Math.max(0.04, Math.min(0.96, d.x)); d.y = Math.max(0.04, Math.min(0.96, d.y));
          const r = opt.molecules ? 4.5 : 2.6;
          if (opt.shield) { g.strokeStyle = 'rgba(255,216,107,0.9)'; g.lineWidth = 2; g.beginPath(); g.arc(d.x * W, d.y * H, r * 2.4, 0, Math.PI * 2); g.stroke(); }
          const gg = g.createRadialGradient(d.x * W, d.y * H, 0, d.x * W, d.y * H, r * 2.6);
          gg.addColorStop(0, 'rgba(255,250,220,1)'); gg.addColorStop(0.4, 'rgba(255,230,160,0.6)'); gg.addColorStop(1, 'rgba(255,230,160,0)');
          g.fillStyle = gg; g.beginPath(); g.arc(d.x * W, d.y * H, r * 2.6, 0, Math.PI * 2); g.fill();
        }
      } else if (mode === 'mud') {
        for (const p of mud) {
          p.y += dt * 0.05; if (p.y > 1.1) { p.y = -0.1; p.x = Math.random(); }
          g.fillStyle = 'rgba(160,120,80,0.9)';
          g.beginPath(); g.arc(p.x * W, p.y * H, p.r * W, 0, Math.PI * 2); g.fill();
        }
      } else if (mode === 'electro') {
        // 電気泳動：左が陰極（−）、右が陽極（＋）。正の粒は左へ、負の粒は右へ
        const leftNeg = (opt.left || '-') === '-';
        g.fillStyle = leftNeg ? 'rgba(92,224,255,0.5)' : 'rgba(255,94,112,0.5)'; g.fillRect(0, 0, W * 0.08, H);
        g.fillStyle = leftNeg ? 'rgba(255,94,112,0.5)' : 'rgba(92,224,255,0.5)'; g.fillRect(W * 0.92, 0, W * 0.08, H);
        g.fillStyle = '#fff'; g.font = `800 ${Math.round(W * 0.1)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(leftNeg ? '−' : '+', W * 0.12, H * 0.5); g.fillText(leftNeg ? '+' : '−', W * 0.88, H * 0.5);
        const toLeft = (opt.sign > 0) === leftNeg;
        for (const d of dots) {
          if (opt.on) d.x += (toLeft ? -1 : 1) * dt * 0.28;
          d.x += (Math.random() - 0.5) * dt * 0.2; d.y += (Math.random() - 0.5) * dt * 0.2;
          if (d.x < 0.14) d.x = 0.14 + Math.random() * 0.02; if (d.x > 0.86) d.x = 0.86 - Math.random() * 0.02;
          d.y = Math.max(0.08, Math.min(0.92, d.y));
          g.fillStyle = opt.sign > 0 ? '#ffb070' : '#c8b090';
          g.beginPath(); g.arc(d.x * W, d.y * H, W * 0.035, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#05081A'; g.font = `800 ${Math.round(W * 0.05)}px sans-serif`;
          g.fillText(opt.sign > 0 ? '+' : '−', d.x * W, d.y * H + 1);
        }
      } else if (mode === 'coag') {
        // 凝析：電荷が打ち消されて、粒どうしが集まり、大きくなって沈む
        dots.forEach((d, i) => {
          const cx = 0.3 + (i % 3) * 0.2, cy = 0.75 + Math.floor(i / 9) * 0.05;
          d.x += (cx - d.x) * dt * 0.6; d.y += (cy - d.y) * dt * 0.5;
          g.fillStyle = opt.sign < 0 ? '#c8b090' : '#c0602e';
          g.beginPath(); g.arc(d.x * W, d.y * H, W * 0.04, 0, Math.PI * 2); g.fill();
        });
      } else if (mode === 'dialysis') {
        // 外の水（AgNO₃ を入れたとき、Cl⁻ があれば白くにごる：AgCl）
        if (opt.cloud) { g.fillStyle = `rgba(240,245,255,${0.55 * opt.cloud})`; g.fillRect(MEMB * W, 0, W, H); }
        g.fillStyle = 'rgba(180,84,42,0.18)'; g.fillRect(0, 0, MEMB * W, H);
        g.strokeStyle = '#FFC074'; g.lineWidth = 2; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(MEMB * W, 0); g.lineTo(MEMB * W, H); g.stroke(); g.setLineDash([]);
        for (const c of colloid) {
          c.x += (Math.random() - 0.5) * dt * 0.2; c.y += (Math.random() - 0.5) * dt * 0.2;
          c.x = Math.max(0.06, Math.min(MEMB - 0.08, c.x)); c.y = Math.max(0.08, Math.min(0.92, c.y));
          g.fillStyle = '#c0602e'; g.beginPath(); g.arc(c.x * W, c.y * H, W * 0.045, 0, Math.PI * 2); g.fill();
        }
        g.font = `700 ${Math.round(W * 0.075)}px 'Chakra Petch', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (const p of ions) {
          if (p.side === 0) continue;
          if (p.tx === undefined) p.tx = p.x;
          p.tx += (Math.random() - 0.5) * dt * 0.3;
          const lo = p.side < 0 ? 0.04 : MEMB + 0.04, hi = p.side < 0 ? MEMB - 0.04 : 0.95;
          p.tx = Math.max(lo, Math.min(hi, p.tx));
          p.x += Math.max(-dt * 0.4, Math.min(dt * 0.4, p.tx - p.x));   // 膜を通って、ゆっくり移る
          p.y += (Math.random() - 0.5) * dt * 0.5; p.y = Math.max(0.05, Math.min(0.95, p.y));
          g.fillStyle = p.kind === 'H' ? '#FF8D9A' : '#5CF2A8';
          g.fillText(p.kind === 'H' ? 'H⁺' : 'Cl⁻', p.x * W, p.y * H);
        }
      }
      g.restore();
      g.strokeStyle = 'rgba(92,242,168,0.8)'; g.lineWidth = 3;
      g.beginPath(); g.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); g.stroke();
    },
  };
}
