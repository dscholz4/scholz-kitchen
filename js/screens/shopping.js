// Shopping: grouped by store, then section. Big tap targets. Works offline
// (edits queue in the outbox and sync when back online).

import * as store from '../store.js';
import { STORES, SECTIONS } from '../schema.js';
import { h, chips, confirmSheet, toast, label } from '../ui.js';
import { fmtQty } from '../units.js';
import { editShopping } from './forms.js';

const ui = { store: '' };
const storeOf = (r) => (STORES.includes(r.store) ? r.store : 'other');

export function render(el) {
  const all = store.rows('ShoppingList');
  const open = all.filter((r) => r.checked !== 'yes');
  const done = all.filter((r) => r.checked === 'yes');
  const present = STORES.filter((s) => all.some((r) => storeOf(r) === s));

  if (present.length > 1) {
    el.append(chips(present.map((s) => [s, `${s} (${open.filter((r) => storeOf(r) === s).length})`]), ui.store, (v) => { ui.store = v; el.replaceChildren(); render(el); }));
  }
  if (!all.length) {
    el.append(h('div.empty', 'List is empty. Tap + to add, or add a recipe\'s ingredients from Recipes.'));
  } else {
    el.append(h('p.progress', `${open.length} to get${done.length ? ` · ${done.length} in cart` : ''}${navigator.onLine ? '' : ' · offline, changes will sync later'}`));
  }

  const stores = (ui.store ? [ui.store] : present);
  for (const s of stores) {
    const items = all.filter((r) => storeOf(r) === s);
    if (!items.length) continue;
    const left = items.filter((r) => r.checked !== 'yes').length;
    el.append(h('div.store-title', h('span', s), h('small', left ? `${left} left` : 'done')));
    for (const sec of [...SECTIONS, '']) {
      const list = items.filter((r) => (SECTIONS.includes(r.section) ? r.section : '') === sec)
        .sort((a, b) => (a.checked === 'yes') - (b.checked === 'yes') || a.item.localeCompare(b.item));
      if (!list.length) continue;
      el.append(h('div.group-title', h('span', sec ? label(sec) : 'other')));
      el.append(h('div.list', list.map(row)));
    }
  }

  if (done.length) {
    el.append(h('button.btn.block.mt', {
      onclick: async () => {
        if (await confirmSheet('Clear checked items?', `Remove ${done.length} checked item${done.length === 1 ? '' : 's'} from the list.`, 'Clear')) {
          store.remove('ShoppingList', done.map((r) => r.id));
          toast('Cleared');
        }
      },
    }, `Clear ${done.length} checked`));
  }
  el.append(h('button.fab', { 'aria-label': 'Add item', onclick: () => editShopping(ui.store ? { store: ui.store } : {}) }, '+'));
}

function row(r) {
  const done = r.checked === 'yes';
  const sub = [
    r.qty != null ? fmtQty(r.qty, r.unit) : '',
    r.on_sale === 'yes' ? h('span.sale', `SALE${r.sale_price != null ? ` $${Number(r.sale_price).toFixed(2)}` : ''}`) : '',
    reasonText(r.reason),
    r.notes,
  ].filter(Boolean);
  const subEl = h('div.sub');
  sub.forEach((s, i) => { if (i) subEl.append(' · '); subEl.append(s); });
  return h(`div.item.shop-item${done ? '.done' : ''}`, {
    role: 'checkbox', 'aria-checked': done ? 'true' : 'false', tabindex: '0',
    onclick: () => toggle(r),
    onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(r); } },
  },
  h('span.box', done ? '✓' : ''),
  h('div.grow', h('div.name', r.item), sub.length ? subEl : null),
  h('button.icon-btn', { 'aria-label': `Edit ${r.item}`, onclick: (e) => { e.stopPropagation(); editShopping(r); } }, '⋯'));
}

function toggle(r) {
  store.upsert('ShoppingList', { id: r.id, checked: r.checked === 'yes' ? 'no' : 'yes' });
}

function reasonText(reason) {
  if (!reason) return '';
  return reason.split(',').map((x) => x.trim()).map((x) => {
    if (x === 'restock') return 'restock';
    if (x.startsWith('event:')) return 'event';
    const rec = store.get('Recipes', x);
    return rec ? rec.name : x;
  }).join(', ');
}
