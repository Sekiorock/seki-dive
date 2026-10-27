// shared/calc.js  小窓の電卓（②クリスタル・ラボ、③フリーズ・ガードで使う。ほかのワールドでも使える）
//   ・data-act="calc" のボタンで開け閉めする（各ワールドの main.js から toggle() を呼ぶ）。
//   ・数字、小数点、+ − × ÷、かっこ、E（×10の何乗）、Ans（前の答え）、C（全部消す）、⌫（1文字消す）。
//   ・「入力欄へ」：最後にタップした数の入力欄に、答えを入れる。
//   ・小窓の上の帯をなぞると、好きな位置に動かせる。
//   ・式は自分で読む（eval は使わない）。

const KEYS = [
  ['C', 'clear'], ['⌫', 'back'], ['(', '('], [')', ')'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['−', '-'],
  ['0', '0'], ['.', '.'], ['E', 'E'], ['+', '+'],
  ['Ans', 'ans'], ['=', 'eq'],
];
const SHOW = { '/': '÷', '*': '×', '-': '−', E: '×10^' };

/** 式を計算する。だめなときは NaN */
export function evaluate(src, ans = 0) {
  let i = 0;
  const s = src.replace(/\s+/g, '');
  const peek = () => s[i];
  function number() {
    const m = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(s.slice(i));
    if (!m) return NaN;
    i += m[0].length;
    return Number(m[0].replace('E', 'e'));
  }
  function factor() {
    const c = peek();
    if (c === '-') { i++; return -factor(); }
    if (c === '+') { i++; return factor(); }
    if (c === '(') {
      i++;
      const v = expr();
      if (peek() === ')') i++;      // 閉じかっこが足りなくても、最後まで計算する
      return v;
    }
    if (s.startsWith('Ans', i)) { i += 3; return ans; }
    return number();
  }
  function term() {
    let v = factor();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; v *= factor(); }
      else if (c === '/') { i++; v /= factor(); }
      else if (c === '(' || (c && s.startsWith('Ans', i))) v *= factor();   // 2(3+4) のような書き方
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      const c = peek();
      if (c === '+') { i++; v += term(); }
      else if (c === '-') { i++; v -= term(); }
      else return v;
    }
  }
  if (!s) return NaN;
  const v = expr();
  return i === s.length && Number.isFinite(v) ? v : NaN;
}

/** 見やすい数に（大きすぎ・小さすぎるときは ×10ⁿ の形） */
export function formatNum(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e9 || a < 1e-4)) {
    const [m, e] = v.toExponential(5).split('e');
    return `${Number(m)}×10^${Number(e)}`;
  }
  return String(Number(v.toPrecision(10)));
}

export function createCalc({ t, toast = () => {} }) {
  let expr = '';
  let ans = 0;
  let shown = '';
  let lastField = null;
  const box = document.createElement('div');
  box.className = 'calc';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  document.body.appendChild(box);

  function render() {
    box.innerHTML = `<div class="calc__bar"><b>${t('calc.title')}</b>
        <button type="button" class="calc__ins" data-calc="insert">${t('calc.insert')}</button>
        <button type="button" class="calc__x" data-calc="close" aria-label="${t('calc.close')}">×</button></div>
      <div class="calc__disp"><span class="calc__expr">${expr.split('').map((c) => SHOW[c] || c).join('') || '&nbsp;'}</span><b class="calc__val">${shown || '0'}</b></div>
      <div class="calc__keys">${KEYS.map(([label, k]) => `<button type="button" class="calc__k calc__k--${k === 'eq' ? 'eq' : /[0-9.]/.test(k) ? 'num' : 'op'}" data-calc="${k}">${label}</button>`).join('')}</div>`;
  }

  function press(k) {
    if (k === 'clear') { expr = ''; shown = ''; }
    else if (k === 'back') { expr = expr.endsWith('Ans') ? expr.slice(0, -3) : expr.slice(0, -1); }
    else if (k === 'ans') expr += 'Ans';
    else if (k === 'eq') {
      const v = evaluate(expr, ans);
      if (Number.isNaN(v)) { shown = t('calc.err'); }
      else { ans = v; shown = formatNum(v); expr = ''; }
    } else {
      // 答えが出たあとに演算子を押したら、答えから続ける
      if (!expr && shown && /[+\-*/]/.test(k) && !Number.isNaN(Number(ans))) expr = 'Ans';
      expr += k;
    }
    if (k !== 'eq' && k !== 'clear') {
      const v = evaluate(expr, ans);
      if (!Number.isNaN(v)) shown = formatNum(v);
    }
    render();
  }

  function insert() {
    const el = lastField && document.body.contains(lastField) && !lastField.disabled ? lastField
      : (lastField && lastField.id && document.getElementById(lastField.id)) || null;
    if (!el) { toast(t('calc.noField')); return; }
    const v = Number(ans.toPrecision(6));
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-calc]');
    if (!b) return;
    const k = b.dataset.calc;
    if (k === 'close') close();
    else if (k === 'insert') insert();
    else press(k);
  });
  // 数の入力欄を覚えておく（電卓の中のボタンを押しても、忘れないように）
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="number"], input[inputmode="decimal"]') && !box.contains(el)) lastField = el;
  });
  // 上の帯をなぞって動かす
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.calc__bar') || e.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* 何もしない */ }
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.max(0, Math.min(window.innerWidth - box.offsetWidth, e.clientX - drag.dx));
    const y = Math.max(0, Math.min(window.innerHeight - box.offsetHeight, e.clientY - drag.dy));
    box.style.left = `${x}px`; box.style.top = `${y}px`; box.style.right = 'auto';
  });
  const end = () => { drag = null; };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  function open() { render(); box.hidden = false; }
  function close() { box.hidden = true; }
  return {
    open, close,
    toggle() { if (box.hidden) open(); else close(); },
    get isOpen() { return !box.hidden; },
    redraw() { if (!box.hidden) render(); },
    /** 確かめるとき用 */
    press, get value() { return ans; },
  };
}
