// crystal/src/orderex.js
// v1.1：注文の「問題のアニメ」と「ヒントの小窓」。
//   問題のアニメ：問題文の場面を、操作バー・ビーカーの中身・グラフが連動するアニメで見せる（答えの数値は「？」）。
//   ヒントの小窓：解答中いつでも開ける。同じアニメに「読み取り方」の線と矢印を重ね、考え方の文を出す。
//                 「解き方の流れ」を押すと、答えの数値だけを「？」にした解き方が見える。
//   アニメの中身は、実験台と同じ計算（solubility.js・gas.js・conc.js）から毎コマ作るので、本物の結果と合う。

import { buildState } from './orders.js';
import { TABLE, TEMPS, solubility } from './solubility.js';
import { GASES, CONC_SOLUTES, ORDER_HINT, ORDER_EX } from './config.js';

let H = null;            // { $, t, esc, getData, setData }
let cur = null;          // { o, mode: 'ex' | 'hint', more, raf, t0, cv }

export function initOrderEx(hooks) { H = hooks; }

const lerp = (a, b, k) => a + (b - a) * k;
/** 答えが温度の問題（結晶が出はじめる温度）では、行き先の温度が答えになってしまうので、もっと先まで冷やして見せる */
const askT = (o) => o.unit === '℃';
const animTo = (o) => (askT(o) ? Math.max(0, o.anim.to - ORDER_EX.pastT) : o.anim.to);
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const fmtN = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);

/** アニメの時間：はじめで止まる → 動く → おわりで止まる（くり返す） */
function phaseOf(sec) {
  const { hold0, move, hold1 } = ORDER_EX;
  const T = hold0 + move + hold1;
  const s = sec % T;
  if (s < hold0) return { k: 0, ph: 0 };
  if (s < hold0 + move) return { k: ease((s - hold0) / move), ph: 1 };
  return { k: 1, ph: 2 };
}

// ── 変える量の表示 ──
function keyInfo(o) {
  const k = o.anim.key;
  const a = o.start[k], b = animTo(o);
  const P = (x) => fmtN(x / 1e5, 2);
  const map = {
    temp: { label: H.t('cr.temp'), fmt: (x) => `${fmtN(x, 0)}℃` },
    mass: { label: H.t('cr.mass'), fmt: (x) => `${fmtN(x, 0)} g` },
    water: { label: H.t('cr.water'), fmt: (x) => `${fmtN(x, 0)} g` },
    P: { label: H.t('cr.g.pressure'), fmt: (x) => `${P(x)}×10⁵ Pa` },
    volume: { label: H.t('cr.g.volume'), fmt: (x) => `${fmtN(x, 0)} L` },
    solute_g: { label: H.t('cr.c.solute'), fmt: (x) => `${fmtN(x, 0)} g` },
  };
  return { key: k, a, b, ...map[k] };
}

/** その瞬間の実験台の状態 */
function stateAt(o, k) {
  const ki = o.anim.key;
  let v = lerp(o.start[ki], animTo(o), k);
  if (ki === 'water') v = Math.max(0.5, v);   // 水を全部飛ばす問題でも、絵が描けるように
  return { v, st: buildState(o.bench, { ...o.start, [ki]: v }) };
}

// ───────────── 描く ─────────────
function draw(cv, o, k, mode, ph) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth, Hh = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, Hh);
  const { v, st } = stateAt(o, k);
  const st0 = stateAt(o, 0).st, st1 = stateAt(o, 1).st;
  const bx = { x: 8, y: 12, w: Math.min(110, W * 0.32), h: Hh - 88 };
  const gx = { x: bx.x + bx.w + 26, y: 10, w: W - (bx.x + bx.w + 26) - 10, h: Hh - 80 };
  drawBeaker(g, bx, o, st, st0, st1, mode, ph);
  drawGraph(g, gx, o, st, k, mode);
  drawBar(g, { x: 14, y: Hh - 28, w: W - 28 }, o, v);
}

function drawBeaker(g, b, o, st, st0, st1, mode, ph) {
  // ビーカーの形
  g.save();
  g.strokeStyle = 'rgba(200,230,255,0.9)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + 4, b.y + b.h); g.lineTo(b.x + b.w - 4, b.y + b.h); g.lineTo(b.x + b.w, b.y); g.stroke();
  const inner = { x: b.x + 6, y: b.y + 6, w: b.w - 12, h: b.h - 8 };
  let level = 0.7, dots = 0, crystal = 0, dotCol = '#ffffff', crystCol = '#ffffff', bubbles = 0;
  const rnd = (i) => ((Math.sin(i * 127.1) * 43758.5453) % 1 + 1) % 1;
  if (o.bench === 'solid') {
    const wMax = Math.max(st0.water, st1.water, 1);
    level = 0.25 + 0.6 * (st.eq.water + st.eq.dissolved * 0.3) / (wMax * 1.15);
    const mMax = Math.max(st0.mass, st1.mass, 1) * 1.0;
    dots = Math.round((st.eq.dissolved / mMax) * 70);
    crystal = Math.round((st.eq.crystal / mMax) * 70);
    const cu = st.solute.startsWith('CuSO4') || st.solute === 'MIX';
    dotCol = cu ? '#5ab4ff' : '#e8f4ff';
    crystCol = st.solute.startsWith('CuSO4') ? '#3a8cff' : '#ffffff';
    // 液の色（硫酸銅は青）
    const blue = st.solute.startsWith('CuSO4') ? Math.min(0.55, st.eq.dissolved / Math.max(1, st.eq.water) * 1.2) : 0;
    g.fillStyle = `rgba(${Math.round(80 - blue * 60)},${Math.round(160 + blue * 20)},255,${0.22 + blue * 0.4})`;
  } else if (o.bench === 'gas') {
    const vMax = Math.max(st0.volume, st1.volume, 1);
    level = 0.25 + 0.45 * (st.volume / vMax);
    const nMax = Math.max(st0.eq.n, st1.eq.n, 1e-9);
    dots = Math.round((st.eq.n / nMax) * 40);
    bubbles = Math.round(6 + st.pressure * 6);
    dotCol = GASES[st.gas] ? GASES[st.gas].color : '#ffffff';
    g.fillStyle = 'rgba(80,160,255,0.22)';
  } else {
    const wMax = Math.max(st0.solvent, st1.solvent, 1);
    level = 0.3 + 0.5 * Math.min(1, (st.solvent + st.solute_g / st.density * 0.6) / (wMax * 1.2 + 1));
    const gMax = Math.max(st0.solute_g, st1.solute_g, 1);
    dots = Math.round((st.solute_g / gMax) * 60);
    dotCol = (CONC_SOLUTES[st.solute] || {}).color || '#ffffff';
    g.fillStyle = 'rgba(80,160,255,0.22)';
  }
  level = Math.max(0.12, Math.min(0.95, level));
  const top = inner.y + inner.h * (1 - level);
  g.fillRect(inner.x, top, inner.w, inner.y + inner.h - top);
  g.strokeStyle = 'rgba(160,220,255,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(inner.x, top); g.lineTo(inner.x + inner.w, top); g.stroke();
  // 溶けている粒（液の中で揺れる）
  const now = performance.now() / 1000;
  g.fillStyle = dotCol;
  for (let i = 0; i < dots; i++) {
    const x = inner.x + 4 + rnd(i) * (inner.w - 8) + Math.sin(now * 2 + i) * 2;
    const y = top + 4 + rnd(i + 99) * (inner.y + inner.h - top - 14) + Math.cos(now * 1.7 + i) * 2;
    g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill();
  }
  // 結晶（底にたまる）
  g.fillStyle = crystCol;
  for (let i = 0; i < crystal; i++) {
    const col = i % 12, row = Math.floor(i / 12);
    const x = inner.x + 3 + col * ((inner.w - 6) / 12) + (row % 2) * 2;
    const y = inner.y + inner.h - 5 - row * 5;
    g.save(); g.translate(x + 2, y); g.rotate(0.6 + (i % 3) * 0.4); g.fillRect(-2.2, -2.2, 4.4, 4.4); g.restore();
  }
  // 気体：水の上の粒（圧力が高いほど多い）
  if (bubbles) {
    g.fillStyle = dotCol;
    for (let i = 0; i < bubbles; i++) {
      const x = inner.x + 4 + rnd(i + 7) * (inner.w - 8) + Math.sin(now * 3 + i) * 3;
      const y = inner.y + 2 + rnd(i + 51) * Math.max(4, top - inner.y - 8);
      g.globalAlpha = 0.8; g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    // ピストン
    g.fillStyle = 'rgba(200,210,230,0.9)'; g.fillRect(inner.x - 2, inner.y - 6, inner.w + 4, 5);
  }
  // 結晶の量の札（答えは「？」）
  if (o.bench === 'solid' && st.eq.crystal > 0.05) {
    g.fillStyle = '#FFC83A'; g.font = '800 11px "M PLUS 1p", sans-serif'; g.textAlign = 'center';
    g.fillText(ph === 2 && o.unit === 'g' ? H.t('cr.ex.crystalQ') : H.t('cr.ex.crystal'), b.x + b.w / 2, b.y + b.h + 14);
  }
  g.restore();
}

function graphSpec(o, st, mode) {
  if (o.bench === 'solid') {
    const ids = st.solute === 'MIX' ? ['KNO3', 'CuSO4'] : [st.point.id];
    const yMax = Math.max(...ids.map((id) => Math.max(...TABLE[id]))) * 1.08;
    return {
      xMin: 0, xMax: 80, yMin: 0, yMax: Math.max(40, yMax), xLab: '℃', yLab: H.t('cr.ex.yS'),
      curves: ids.map((id, i) => ({ col: i ? '#5ab4ff' : '#FFC83A', pts: TEMPS.map((T) => [T, TABLE[id][TEMPS.indexOf(T)]]) })),
      point: [st.temp, st.point.y], S: solubility(st.point.id, st.temp),
    };
  }
  if (o.bench === 'gas') {
    const key = o.anim.key;
    const rng = key === 'P' ? [0, 3.5e5] : key === 'volume' ? [0, 11] : [0, 60];
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const x = lerp(rng[0], rng[1], i / 24);
      const p = { gas: st.gas, P: key === 'P' ? x : st.pressure * 1e5, temp: key === 'temp' ? x : st.temp, volume: key === 'volume' ? Math.max(0.01, x) : st.volume };
      pts.push([x, buildState('gas', p).eq.n * 1000]);
    }
    const xNow = key === 'P' ? st.pressure * 1e5 : key === 'volume' ? st.volume : st.temp;
    const yMax = Math.max(...pts.map((q) => q[1])) * 1.1 || 1;
    return {
      xMin: rng[0], xMax: rng[1], yMin: 0, yMax, xLab: key === 'P' ? '×10⁵ Pa' : key === 'volume' ? 'L' : '℃', yLab: H.t('cr.ex.yN'), xScale: key === 'P' ? 1e-5 : 1,
      curves: [{ col: GASES[st.gas].color === '#ffffff' ? '#8FF3FA' : GASES[st.gas].color, pts }], point: [xNow, st.eq.n * 1000],
    };
  }
  const q = o.unit === '%' ? 'percent' : o.unit === 'mol/kg' ? 'molality' : 'molarity';
  const xMax = Math.max(animTo(o), o.start.solute_g) * 1.15 || 1;
  const pts = [];
  for (let i = 0; i <= 24; i++) { const x = (xMax * i) / 24; pts.push([x, buildState('conc', { ...o.start, solute_g: x }).eq[q]]); }
  const yMax = Math.max(...pts.map((p) => p[1])) * 1.1 || 1;
  return { xMin: 0, xMax, yMin: 0, yMax, xLab: 'g', yLab: o.unit, curves: [{ col: '#8FF3FA', pts }], point: [st.solute_g, st.eq[q]] };
}

function drawGraph(g, r, o, st, k, mode) {
  const s = graphSpec(o, st, mode);
  const X = (x) => r.x + ((x - s.xMin) / (s.xMax - s.xMin)) * r.w;
  const Y = (y) => r.y + r.h - ((Math.min(y, s.yMax * 1.02) - s.yMin) / (s.yMax - s.yMin)) * r.h;
  g.save();
  g.fillStyle = 'rgba(8,14,40,0.75)'; g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = 'rgba(160,190,255,0.25)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const yy = r.y + (r.h * i) / 4; g.beginPath(); g.moveTo(r.x, yy); g.lineTo(r.x + r.w, yy); g.stroke(); }
  g.strokeStyle = 'rgba(200,220,255,0.8)'; g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x, r.y + r.h); g.lineTo(r.x + r.w, r.y + r.h); g.stroke();
  g.font = '700 9px "M PLUS 1p", sans-serif'; g.fillStyle = 'rgba(220,235,255,0.85)';
  g.textAlign = 'right'; g.fillText(s.xLab, r.x + r.w, r.y + r.h + 11);
  g.textAlign = 'left'; g.fillText(s.yLab, r.x + 3, r.y + 9);
  g.textAlign = 'left'; g.fillText(String(Math.round(s.xMin * (s.xScale || 1))), r.x - 2, r.y + r.h + 11);
  g.textAlign = 'center'; g.fillText(String(Math.round(s.xMax * (s.xScale || 1) * 10) / 10), r.x + r.w - 14, r.y + r.h + 11);
  // 曲線
  for (const c of s.curves) {
    g.strokeStyle = c.col; g.lineWidth = 2; g.beginPath();
    c.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.stroke();
  }
  const [px, py] = s.point;
  // ヒント：読み取りの線
  if (mode === 'hint') {
    g.setLineDash([4, 3]); g.lineWidth = 1.2;
    if (o.bench === 'solid' && askT(o)) {
      // 温度を聞く問題：横の線（水100 gあたりの量）が曲線とぶつかるところを探す
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(r.x, Y(py)); g.lineTo(r.x + r.w, Y(py)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#FFC83A'; g.textAlign = 'left'; g.font = '800 10px "M PLUS 1p", sans-serif';
      g.fillText(H.t('cr.ex.yLine', { y: fmtN(py, 0) }), r.x + 4, Y(py) - 4);
    } else if (o.bench === 'solid') {
      const sy = s.S;
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(X(px), r.y + r.h); g.lineTo(X(px), Y(Math.max(sy, py))); g.stroke();
      g.beginPath(); g.moveTo(r.x, Y(sy)); g.lineTo(X(px), Y(sy)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#FFC83A'; g.textAlign = 'left'; g.font = '800 10px "M PLUS 1p", sans-serif';
      g.fillText(H.t('cr.ex.sAt', { t: fmtN(px, 0), s: fmtN(sy, sy < 50 ? 1 : 0) }), r.x + 4, Y(sy) - 4);
      if (py > sy + 0.3) {
        // 曲線より上の分が、溶けきれずに結晶になる
        g.strokeStyle = '#ff5e70'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(X(px) + 6, Y(sy)); g.lineTo(X(px) + 6, Y(py)); g.stroke();
        g.fillStyle = '#ff8a95'; g.textAlign = 'right';
        g.fillText(H.t('cr.ex.over'), Math.min(r.x + r.w - 2, X(px) + 2), Math.max(r.y + 20, Y(py) - 8));
      } else if (py < sy - 0.3) {
        g.strokeStyle = '#5CF2A8'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(X(px) + 6, Y(py)); g.lineTo(X(px) + 6, Y(sy)); g.stroke();
        g.fillStyle = '#5CF2A8'; g.textAlign = 'right';
        g.fillText(H.t('cr.ex.room'), Math.min(r.x + r.w - 2, X(px) + 2), Math.min(r.y + r.h - 4, Y(py) + 14));
      }
    } else {
      g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(X(px), r.y + r.h); g.lineTo(X(px), Y(py)); g.lineTo(r.x, Y(py)); g.stroke();
      g.setLineDash([]);
    }
    g.setLineDash([]);
  }
  // 今の点（光る）
  const pulse = 3.5 + Math.sin(performance.now() / 180) * 1.2;
  g.fillStyle = '#ffffff'; g.shadowColor = '#8FF3FA'; g.shadowBlur = 10;
  g.beginPath(); g.arc(X(px), Y(py), pulse, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawBar(g, r, o, v) {
  const ki = keyInfo(o);
  const lo = Math.min(ki.a, ki.b), hi = Math.max(ki.a, ki.b);
  const pad = (hi - lo) * 0.12 || 1;
  const X = (x) => r.x + ((x - (lo - pad)) / ((hi + pad) - (lo - pad))) * r.w;
  g.save();
  g.fillStyle = 'rgba(220,235,255,0.9)'; g.font = '800 10px "M PLUS 1p", sans-serif'; g.textAlign = 'left';
  g.fillText(ki.label, r.x, r.y - 10);
  g.textAlign = 'right'; g.fillStyle = '#FFC83A'; g.fillText(ki.fmt(v), r.x + r.w, r.y - 10);
  g.fillStyle = 'rgba(120,150,220,0.35)'; g.fillRect(r.x, r.y - 2, r.w, 4);
  const grd = g.createLinearGradient(X(ki.a), 0, X(v), 0);
  grd.addColorStop(0, '#36A9FF'); grd.addColorStop(1, '#FFC83A');
  g.fillStyle = grd; g.fillRect(Math.min(X(ki.a), X(v)), r.y - 2, Math.abs(X(v) - X(ki.a)), 4);
  // はじめと行き先の目盛り
  g.fillStyle = 'rgba(220,235,255,0.75)'; g.font = '700 9px "M PLUS 1p", sans-serif'; g.textAlign = 'center';
  for (const x of [ki.a, ki.b]) { g.fillRect(X(x) - 0.5, r.y - 6, 1, 12); g.fillText(ki.fmt(x), X(x), r.y + 16); }
  // つまみ（六角形）
  g.fillStyle = '#ffffff'; g.shadowColor = '#36A9FF'; g.shadowBlur = 8;
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (Math.PI / 3) * i; g[i ? 'lineTo' : 'moveTo'](X(v) + Math.cos(a) * 7, r.y + Math.sin(a) * 7); }
  g.closePath(); g.fill();
  g.restore();
}

// ───────────── 小窓 ─────────────
function startDesc(o) {
  const s = o.start, t = H.t;
  if (o.bench === 'solid') return t('cr.ex.startSolid', { T: fmtN(s.temp, 0), w: fmtN(s.water, 0), m: fmtN(s.mass, 0), name: t(`cr.s.${s.solute}`) });
  if (o.bench === 'gas') return t('cr.ex.startGas', { g: GASES[s.gas].formula, P: fmtN(s.P / 1e5, 2), T: fmtN(s.temp, 0), V: fmtN(s.volume, 0) });
  return t('cr.ex.startConc', { name: CONC_SOLUTES[s.solute].formula, w: fmtN(s.solvent, 0) });
}

function render() {
  const { o, mode, more } = cur;
  const t = H.t, esc = H.esc;
  const ki = keyInfo(o);
  const cat = ORDER_HINT[o.id] || 'max';
  const head = `<div class="cr-ox__bar"><b>${esc(t(mode === 'hint' ? 'cr.ex.hintTitle' : 'cr.ex.title'))}</b>`
    + `<button type="button" class="cr-fold" data-act="ox-close" aria-label="${esc(t('calc.close'))}">×</button></div>`;
  const steps = `<ol class="cr-ox__steps" id="ox-steps">`
    + `<li data-ph="0"><b>${esc(t('cr.ex.s1'))}</b>${esc(startDesc(o))}</li>`
    + `<li data-ph="1"><b>${esc(t('cr.ex.s2'))}</b>${esc(t('cr.ex.change', { what: ki.label, a: ki.fmt(ki.a), b: ki.fmt(ki.b) }))}</li>`
    + `<li data-ph="2"><b>${esc(t('cr.ex.s3'))}</b>${esc(t('cr.ex.ask', { u: o.unit }))}</li></ol>`;
  let body = '';
  if (mode === 'hint') {
    const how = t(`cr.o.${o.id}.how`, { ...o.how(0), r: '？' });
    body = `<p class="cr-ox__hint">💡 ${esc(t(`cr.hint.${cat}`))}</p>`
      + (more ? `<p class="cr-ox__how">${esc(how)}</p>`
        : `<button type="button" class="btn btn--small" data-act="ox-more">${esc(t('cr.ex.more'))}</button>`);
  } else {
    body = `<p class="cr-ox__tip">${esc(t(`cr.ex.tip.${o.bench}`))}</p>`;
  }
  H.$('ox').innerHTML = `<div class="cr-ox__card">${head}<canvas class="cr-ox__cv" id="ox-cv"></canvas>${steps}${body}`
    + `<div class="cr-ox__foot"><button type="button" class="btn btn--small" data-act="ox-replay">${esc(t('cr.ex.replay'))}</button>`
    + `<button type="button" class="btn btn--small btn--primary" data-act="ox-close">${esc(t(mode === 'hint' ? 'cr.ex.back' : 'cr.ex.go'))}</button></div></div>`;
  H.$('ox').hidden = false;
  cur.cv = H.$('ox-cv');
}

function loop() {
  if (!cur) return;
  const sec = (performance.now() - cur.t0) / 1000;
  const { k, ph } = phaseOf(sec);
  draw(cur.cv, cur.o, k, cur.mode, ph);
  if (cur.ph !== ph) {
    cur.ph = ph;
    document.querySelectorAll('#ox-steps li').forEach((li) => li.classList.toggle('is-on', Number(li.dataset.ph) === ph));
  }
  cur.raf = requestAnimationFrame(loop);
}

/** 開く（mode：'ex' 問題のアニメ、'hint' ヒント） */
export function openEx(o, mode = 'ex') {
  closeEx();
  cur = { o, mode, more: false, t0: performance.now(), ph: -1 };
  render();
  cur.raf = requestAnimationFrame(loop);
}
export function closeEx() {
  if (cur && cur.raf) cancelAnimationFrame(cur.raf);
  cur = null;
  const m = H && H.$('ox');
  if (m) { m.hidden = true; m.innerHTML = ''; }
}
export function isOpen() { return !!cur; }

export function onClick(act) {
  if (!act.startsWith('ox-')) return false;
  if (act === 'ox-close') closeEx();
  else if (act === 'ox-replay' && cur) { cur.t0 = performance.now(); cur.ph = -1; }
  else if (act === 'ox-more' && cur) { cur.more = true; const keep = cur.t0; render(); cur.t0 = keep; cur.ph = -1; }
  return true;
}
