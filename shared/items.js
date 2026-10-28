// shared/items.js
// v1.2：ロック物販の品の一覧と、ワールドの中で使うための部品。
//   ・ヒント券：ワールドごとに3段階（弱・中・強）。強いほど高い。使わないと見られないヒントが見られる
//   ・通行手形：各ワールドのステージ4から先に挑むのに必要（1度買えばずっと使える）
//   ・レバレッジ券：クリアすると報酬が ×倍率、できなかったら（倍率−1）× 基本の報酬 の罰金
//   ・そのほかの道具：ワールドやホームで役に立つ（ゲージお守り・目盛り拡大鏡・予算追加券・霧よけのお札・報酬上限アップ券・幸運のお守り）
//   品の名前と説明は shared/i18n の item.{id}.name / item.{id}.desc。

import { itemCount, useItem, getUser } from './auth.js';
import { bonusReward, fine, formatHiyama, isTaxFree } from './economy.js';

export const WORLD_SHORT = { hydration: 'hb', crystal: 'cr', freeze: 'fz', colloid: 'cl' };

/** 品の一覧。kind：'use'（使うとなくなる）| 'perm'（ずっと使える。1つだけ持てる） */
export const ITEMS = [
  // ── ホーム ──
  { id: 'capUp', world: 'home', kind: 'use', price: 200 },     // 使った日の報酬の上限 +1,000
  { id: 'charm', world: 'home', kind: 'use', price: 150 },     // 次にもらうクリア報酬 +30%（自動で使う）
  // ── レバレッジ券（どのワールドでも） ──
  ...[[12, 30], [15, 60], [20, 100], [25, 150], [30, 200], [50, 400], [100, 1000]].map(([m, price]) => ({ id: `lev${m}`, world: 'lever', kind: 'use', price, mult: m / 10 })),
  // ── ① セキオ溶解ロック ──
  { id: 'hint.hb.1', world: 'hydration', kind: 'use', price: 40, tier: 1 },
  { id: 'hint.hb.2', world: 'hydration', kind: 'use', price: 80, tier: 2 },
  { id: 'hint.hb.3', world: 'hydration', kind: 'use', price: 150, tier: 3 },
  { id: 'key.hb', world: 'hydration', kind: 'perm', price: 500 },
  { id: 'guard.hb', world: 'hydration', kind: 'use', price: 80 },
  { id: 'practice', world: 'hydration', kind: 'use', price: 100 },
  { id: 'zukan', world: 'hydration', kind: 'use', price: 150 },
  // ── ② セキオクリスタロック ──
  { id: 'hint.cr.1', world: 'crystal', kind: 'use', price: 40, tier: 1 },
  { id: 'hint.cr.2', world: 'crystal', kind: 'use', price: 80, tier: 2 },
  { id: 'hint.cr.3', world: 'crystal', kind: 'use', price: 150, tier: 3 },
  { id: 'key.cr', world: 'crystal', kind: 'perm', price: 500 },
  { id: 'loupe.cr', world: 'crystal', kind: 'use', price: 80 },
  // ── ③ 凝固点コーカーロック ──
  { id: 'hint.fz.1', world: 'freeze', kind: 'use', price: 40, tier: 1 },
  { id: 'hint.fz.2', world: 'freeze', kind: 'use', price: 80, tier: 2 },
  { id: 'hint.fz.3', world: 'freeze', kind: 'use', price: 150, tier: 3 },
  { id: 'key.fz', world: 'freeze', kind: 'perm', price: 500 },
  { id: 'budget.fz', world: 'freeze', kind: 'use', price: 80 },
  // ── ④ セキオロッコロイド ──
  { id: 'hint.cl.1', world: 'colloid', kind: 'use', price: 40, tier: 1 },
  { id: 'hint.cl.2', world: 'colloid', kind: 'use', price: 80, tier: 2 },
  { id: 'hint.cl.3', world: 'colloid', kind: 'use', price: 150, tier: 3 },
  { id: 'key.cl', world: 'colloid', kind: 'perm', price: 500 },
  { id: 'amulet.cl', world: 'colloid', kind: 'use', price: 80 },
];
export const SHOP_GROUPS = ['home', 'lever', 'hydration', 'crystal', 'freeze', 'colloid'];
export const LEVERS = ITEMS.filter((x) => x.world === 'lever');
/** ステージ4から先に必要な通行手形。stageFrom：何番目のステージ（1から）から必要か */
export const KEYS = { hydration: 'key.hb', crystal: 'key.cr', freeze: 'key.fz', colloid: 'key.cl' };
export const KEY_FROM = 4;

export function itemDef(id) { return ITEMS.find((x) => x.id === id); }
export const has = (id) => itemCount(id) > 0;
export function hasKey(world) { return has(KEYS[world]); }
export function hintId(world, tier) { return `hint.${WORLD_SHORT[world]}.${tier}`; }

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * ワールドの「持ち物」の欄（HTML）。レバレッジ券と、そのワールドの道具を、使う／使わないで選ぶ。
 * @param t      i18n の t
 * @param armed  { lev: 'lev20' | null, boost: { 'guard.hb': true } }（呼ぶ側が持っている状態）
 * @param opt    { boosts: ['guard.hb'], lever: true, act: 'tray' }  クリックは data-act="{act}" data-item="…"
 */
export function trayHtml(t, armed, { boosts = [], lever = true, act = 'tray', note = '' } = {}) {
  const levs = LEVERS.filter((x) => has(x.id));
  const bs = boosts.filter((id) => has(id));
  if (!levs.length && !bs.length) return '';
  let html = `<div class="itray"><p class="itray__head">🎒 ${esc(t('itray.head'))}</p>`;
  if (lever && levs.length) {
    html += `<div class="itray__row"><span class="itray__label">${esc(t('itray.lever'))}</span>`
      + `<button type="button" class="itray__chip${!armed.lev ? ' is-on' : ''}" data-act="${act}" data-item="lev-none">${esc(t('itray.none'))}</button>`
      + levs.map((x) => `<button type="button" class="itray__chip is-lev${armed.lev === x.id ? ' is-on' : ''}" data-act="${act}" data-item="${x.id}">×${x.mult}<small>${itemCount(x.id)}</small></button>`).join('')
      + '</div>';
    if (armed.lev) {
      const m = itemDef(armed.lev).mult;
      html += `<p class="itray__warn">${esc(t(isTaxFree() ? 'itray.leverNoteFree' : 'itray.leverNote', { m, f: Math.round((m - 1) * 100) / 100 }))}</p>`;
    }
  }
  if (bs.length) {
    html += `<div class="itray__row"><span class="itray__label">${esc(t('itray.boost'))}</span>`
      + bs.map((id) => `<button type="button" class="itray__chip${armed.boost && armed.boost[id] ? ' is-on' : ''}" data-act="${act}" data-item="${id}" title="${esc(t(`item.${id}.desc`))}">${esc(t(`item.${id}.name`))}<small>${itemCount(id)}</small></button>`).join('')
      + '</div>';
  }
  if (note) html += `<p class="itray__note">${esc(note)}</p>`;
  return `${html}</div>`;
}
/** 持ち物の欄が押されたとき。状態を書きかえる */
export function trayClick(armed, item) {
  if (item === 'lev-none') armed.lev = null;
  else if (item.startsWith('lev')) armed.lev = armed.lev === item ? null : item;
  else { armed.boost = armed.boost || {}; armed.boost[item] = !armed.boost[item]; }
}
/** 挑戦を始めるときに、選んだ券を使う（持っていなければ外す）。使えたものを返す { lev, mult, boost } */
export function consumeArmed(armed) {
  const out = { lev: null, mult: 1, boost: {} };
  if (armed.lev && useItem(armed.lev)) { out.lev = armed.lev; out.mult = itemDef(armed.lev).mult; }
  for (const [id, on] of Object.entries(armed.boost || {})) if (on && useItem(id)) out.boost[id] = true;
  armed.lev = null; armed.boost = {};
  return out;
}

/**
 * レバレッジの精算。clear なら「基本の報酬 ×（倍率−1）」の上乗せ、だめなら同じ額の罰金。
 * @returns 結果の文（通帳への記録のあと）
 */
export async function settleLever(t, { mult, base, clear, label }) {
  if (!mult || mult <= 1) return '';
  const extra = Math.round(base * (mult - 1));
  if (extra <= 0) return '';
  if (clear) {
    const e = await bonusReward({ itemKey: 'ledger.item.leverWin', itemVars: { m: mult, what: label }, gross: extra });
    return e ? t('lever.win', { m: mult, gross: formatHiyama(e.gross), net: formatHiyama(e.amount) }) : '';
  }
  const e = await fine({ itemKey: 'ledger.item.leverLose', itemVars: { m: mult, what: label }, amount: extra });
  return e && e.waived ? t('lever.waived', { m: mult, amount: formatHiyama(extra) }) : t('lever.lose', { m: mult, amount: formatHiyama(extra) });
}

/** 通行手形がないときの文 */
export function keyNeedText(t, world) { return t('key.need', { item: t(`item.${KEYS[world]}.name`), n: KEY_FROM }); }

/** ヒント券の3つのボタン（HTML）。shown：もう見た段階（0〜3）。act：data-act の名前 */
export function hintButtons(t, world, shown, { act = 'hint-use', disabled = false } = {}) {
  return `<div class="ihint">${[1, 2, 3].map((tier) => {
    const id = hintId(world, tier);
    const n = itemCount(id);
    const done = shown >= tier;
    return `<button type="button" class="ihint__b is-t${tier}${done ? ' is-done' : ''}" data-act="${act}" data-tier="${tier}" ${done || disabled || (!n && !done) ? 'disabled' : ''}>`
      + `<b>${esc(t(`ihint.tier${tier}`))}</b><small>${done ? esc(t('ihint.shown')) : esc(t('ihint.have', { n }))}</small></button>`;
  }).join('')}</div>`;
}
/** ヒント券を1枚使う（なければ false） */
export function useHint(world, tier) { return useItem(hintId(world, tier)); }

export { getUser };
