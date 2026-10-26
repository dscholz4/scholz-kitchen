// Kitchen: inventory by location (+ tools). Fast edits inline.

import * as store from '../store.js';
import { ENUMS } from '../schema.js';
import { h, chips, badge, sheet, toast, today, daysUntil } from '../ui.js';
import { fmtQty, stepFor } from '../units.js';
import { editInventory, editTool, addToShopping, guessSection } from './forms.js';

const LOCATIONS = ENUMS['Inventory.location'];
const ui = { tab: 'all', q: '' };
let typing = false;
export const keepOnRefresh = () => typing;

const LEVELS = ['have', 'low', 'out'];
const nextLevel = (l) => LEVELS[(LEVELS.indexOf(l) + 1) % LEVELS.length];

export function render(el) {
  const tabOpts = [...LOCATIONS.map((l) => [l, cap(l)]), ['tools', 'Tools']];
  el.append(chips(tabOpts, ui.tab === 'all' ? '' : ui.tab, (v) => { ui.tab = v || 'all'; rerender(el); }, { allLabel: 'All food' }));
  const search = h('input.search', {
    type: 'search', placeholder: ui.tab === 'tools' ? 'Search tools' : 'Search kitchen', value: ui.q,
    oninput: (e) => { ui.q = e.target.value; drawList(); },
    onfocus: () => { typing = true; }, onblur: () => { typing = false; },
  });
  const listWrap = h('div');
  el.append(search, listWrap);
  const drawList = () => { listWrap.replaceChildren(...(ui.tab === 'tools' ? toolsList() : foodList())); };
  drawList();
  el.append(h('button.fab', {
    'aria-label': ui.tab === 'tools' ? 'Add tool' : 'Add item',
    onclick: () => (ui.tab === 'tools' ? editTool() : editInventory({}, {
      location: LOCATIONS.includes(ui.tab) ? ui.tab : '',
      category: ui.tab === 'spice rack' ? 'spice' : '',
      purchased_date: today(),
    })),
  }, '+'));
}

function rerender(el) { el.replaceChildren(); render(el); }

const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const matchQ = (text) => !ui.q || text.toLowerCase().includes(ui.q.toLowerCase());

function foodList() {
  const items = store.rows('Inventory')
    .filter((r) => (r.status || 'active') === 'active')
    .filter((r) => ui.tab === 'all' || r.location === ui.tab)
    .filter((r) => matchQ(`${r.name} ${r.category}`));
  if (!items.length) {
    return [h('div.empty', store.rows('Inventory').length ? 'Nothing here.' : 'No inventory yet. Tap + to add, or load the seed in Import.')];
  }
  const groups = ui.tab === 'all'
    ? [...LOCATIONS, ''].map((loc) => [loc, items.filter((r) => (r.location || '') === loc)])
    : [[ui.tab, items]];
  const out = [];
  for (const [loc, list] of groups) {
    if (!list.length) continue;
    list.sort(byExpiryThenName);
    out.push(h('div.group-title', h('span', loc ? cap(loc) : 'No location yet'), h('span', String(list.length))));
    out.push(h('div.list', list.map(itemRow)));
  }
  return out;
}

function byExpiryThenName(a, b) {
  const da = a.expires_date || '9999';
  const db = b.expires_date || '9999';
  return da === db ? a.name.localeCompare(b.name) : da.localeCompare(db);
}

function expiryText(r) {
  const d = daysUntil(r.expires_date);
  if (d == null) return null;
  const est = r.expires_source === 'estimated' ? ' (est.)' : '';
  if (d < 0) return h('span', { style: { color: 'var(--danger)' } }, `expired ${-d}d ago${est}`);
  if (d <= 3) return h('span', { style: { color: 'var(--warn)' } }, `${d === 0 ? 'expires today' : `expires in ${d}d`}${est}`);
  return `exp ${r.expires_date}${est}`;
}

function itemRow(r) {
  const unknown = !r.level && r.qty == null;
  const sub = [
    r.opened === 'yes' ? 'opened' : null,
    expiryText(r),
    unknown && r.confidence !== 'confirmed' ? 'stock unknown' : null,
  ].filter(Boolean);
  const subEl = h('div.sub');
  sub.forEach((s, i) => { if (i) subEl.append(' · '); subEl.append(s); });

  let control;
  if (r.tracking === 'exact') {
    const step = stepFor(r.unit, r.qty || 0);
    control = h('div.stepper',
      h('button', { 'aria-label': `Less ${r.name}`, onclick: (e) => { e.stopPropagation(); bump(r, -step); } }, '−'),
      h('span.val', r.qty == null ? '?' : fmtQty(r.qty, r.unit)),
      h('button', { 'aria-label': `More ${r.name}`, onclick: (e) => { e.stopPropagation(); bump(r, step); } }, '+'));
  } else {
    const lvl = r.level || 'unknown';
    control = h(`button.level.${lvl}`, {
      'aria-label': `${r.name}: ${r.level || 'unknown'}. Tap to change`,
      onclick: (e) => { e.stopPropagation(); cycle(r); },
    }, r.level || '?');
  }
  return h('div.item.tap', { onclick: () => actions(r) },
    h('div.grow', h('div.name', r.name, badge(r.confidence)), sub.length ? subEl : null),
    control);
}

function bump(r, delta) {
  const qty = Math.max(0, Math.round(((r.qty || 0) + delta) * 10) / 10);
  store.upsert('Inventory', { id: r.id, qty, confidence: 'confirmed' });
  if (qty === 0) toast(`${r.name} at 0. Tap it to mark used.`);
}

function cycle(r) {
  const level = nextLevel(r.level);
  store.upsert('Inventory', { id: r.id, level, confidence: 'confirmed' });
  if (level === 'out' || level === 'low') {
    toast(`${r.name}: ${level}`);
  }
}

function actions(r) {
  sheet(r.name, (close) => {
    const act = (patch, msg) => { store.upsert('Inventory', { id: r.id, ...patch }); toast(msg); close(); };
    const onList = store.rows('ShoppingList').some((s) => s.checked !== 'yes' && s.item.toLowerCase() === r.name.toLowerCase());
    return [
      h('p.muted.small', [r.category, r.location, r.store, r.purchased_date ? `bought ${r.purchased_date}` : '', r.notes].filter(Boolean).join(' · ')),
      h('div.list',
        r.opened !== 'yes' ? h('div.item.tap', { onclick: () => act({ opened: 'yes', opened_date: today() }, 'Marked opened') }, h('div.grow.name', 'Mark opened')) : null,
        h('div.item.tap', { onclick: () => act({ status: 'used', ...(r.tracking === 'exact' ? { qty: 0 } : { level: 'out' }) }, 'Marked used') }, h('div.grow.name', 'Used it up')),
        h('div.item.tap', { onclick: () => act({ status: 'tossed' }, 'Marked tossed') }, h('div.grow.name', 'Tossed')),
        h('div.item.tap', {
          onclick: () => {
            if (onList) { toast('Already on the list'); return; }
            addToShopping([{ item: r.name, section: guessSection(r.name, r.category), reason: 'restock' }]);
            toast('Added to shopping list');
            close();
          },
        }, h('div.grow.name', onList ? 'On the shopping list' : 'Add to shopping list')),
        h('div.item.tap', { onclick: () => { close(); editInventory(r); } }, h('div.grow.name', 'Edit details'))),
    ];
  });
}

function toolsList() {
  const tools = store.rows('Tools').filter((t) => matchQ(`${t.name} ${t.category}`));
  if (!tools.length) return [h('div.empty', 'No tools yet. Tap + to add.')];
  const out = [];
  for (const cat of [...ENUMS['Tools.category'], '']) {
    const list = tools.filter((t) => (t.category || '') === cat).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    out.push(h('div.group-title', h('span', cat ? cap(cat) : 'Uncategorised'), h('span', String(list.length))));
    out.push(h('div.list', list.map((t) => h('div.item.tap', { onclick: () => editTool(t) },
      h('div.grow', h('div.name', t.name, badge(t.confidence)), t.notes ? h('div.sub', t.notes) : null),
      h('span.muted', '›')))));
  }
  return out;
}
