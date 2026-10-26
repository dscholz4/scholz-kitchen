// Edit/add forms shown in bottom sheets. Saving an edit by hand marks the row confirmed.

import * as store from '../store.js';
import { ENUMS, STORES, SECTIONS, PEOPLE } from '../schema.js';
import { h, sheet, field, select, formValues, confirmSheet, today, toast } from '../ui.js';
import { toMetric } from '../units.js';
import { routeStore } from '../settings.js';

const opts = (key) => ['', ...ENUMS[key]];
const REVIEWED = ['Inventory', 'Tools', 'People', 'Recipes'];

function input(f, row) {
  const v = row[f.name] ?? f.default ?? '';
  switch (f.type) {
    case 'select': return select(f.name, f.options, String(v));
    case 'textarea': return h('textarea', { name: f.name, rows: f.rows || 6, placeholder: f.placeholder }, String(v));
    case 'number': return h('input', { name: f.name, type: 'text', inputmode: 'decimal', value: v == null ? '' : String(v) });
    case 'date': return h('input', { name: f.name, type: 'date', value: v });
    default: return h('input', { name: f.name, type: 'text', value: v, placeholder: f.placeholder, autocapitalize: f.caps === false ? 'off' : 'sentences' });
  }
}

/** Generic form sheet. Resolves with saved row, 'deleted', or undefined. */
export function editSheet({ title, table, row = {}, fields, toRow, onDelete, saveLabel = 'Save' }) {
  return sheet(title, (close) => {
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); save(); } });
    let rowEl = null;
    const append = (el) => { (rowEl || form).append(el); };
    for (const f of fields) {
      if (f.pair === 'start') { rowEl = h('div.grid2'); form.append(rowEl); }
      append(field(f.label, input(f, row), f.hint));
      if (f.pair === 'end') rowEl = null;
    }
    const save = () => {
      const vals = formValues(form);
      const out = toRow(vals, row);
      if (!out) return;
      const isNew = !row.id;
      const saved = store.upsert(table, {
        ...out,
        ...(row.id ? { id: row.id } : {}),
        ...(REVIEWED.includes(table) ? { confidence: 'confirmed' } : {}),
        ...(isNew && REVIEWED.includes(table) && !out.source ? { source: 'manual' } : {}),
      });
      toast(isNew ? 'Added' : 'Saved');
      close(saved);
    };
    form.append(h('div.row-btns',
      onDelete && row.id ? h('button.btn.danger', {
        type: 'button',
        onclick: async () => {
          if (await confirmSheet('Delete?', `Delete "${row.name || row.item || 'this'}" for good?`, 'Delete', { danger: true })) {
            onDelete(row);
            close('deleted');
          }
        },
      }, 'Delete') : null,
      h('button.btn.primary', { type: 'submit' }, saveLabel)));
    return form;
  });
}

const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

// ---------- Inventory ----------

export const inventoryFields = [
  { name: 'name', label: 'Name' },
  { name: 'category', label: 'Category', type: 'select', options: opts('Inventory.category'), pair: 'start' },
  { name: 'location', label: 'Location', type: 'select', options: opts('Inventory.location'), pair: 'end' },
  { name: 'tracking', label: 'Tracking', type: 'select', options: [['exact', 'exact (amount)'], ['coarse', 'coarse (have/low/out)']] },
  { name: 'qty', label: 'Amount', type: 'number', pair: 'start' },
  { name: 'unit', label: 'Unit', type: 'select', options: ['', 'g', 'ml', 'ea', 'lb', 'oz', 'kg', 'can', 'pkg', 'bunch', 'clove'], pair: 'end', hint: 'lb/oz convert to g' },
  { name: 'level', label: 'Level (coarse)', type: 'select', options: opts('Inventory.level') },
  { name: 'store', label: 'Store', type: 'select', options: ['', ...STORES], pair: 'start' },
  { name: 'purchased_date', label: 'Bought', type: 'date', pair: 'end' },
  { name: 'opened', label: 'Opened', type: 'select', options: ['no', 'yes'], pair: 'start' },
  { name: 'opened_date', label: 'Opened on', type: 'date', pair: 'end' },
  { name: 'expires_date', label: 'Expires', type: 'date', pair: 'start' },
  { name: 'expires_source', label: 'Expiry from', type: 'select', options: opts('Inventory.expires_source'), pair: 'end' },
  { name: 'notes', label: 'Notes' },
];

const COARSE_DEFAULT = ['spice', 'pantry', 'condiment'];

export function inventoryToRow(v, old = {}) {
  if (!v.name) { toast('Name is required', { error: true }); return null; }
  const m = toMetric(num(v.qty), v.unit, v.name);
  const tracking = v.tracking || (COARSE_DEFAULT.includes(v.category) ? 'coarse' : 'exact');
  let expiresSource = v.expires_source;
  if (v.expires_date && v.expires_date !== old.expires_date && !expiresSource) expiresSource = 'manual';
  const notes = m.converted && m.note ? [v.notes, m.note].filter(Boolean).join('; ') : v.notes;
  return {
    ...v, tracking, qty: m.qty, unit: m.unit, notes, expires_source: expiresSource,
    opened_date: v.opened === 'yes' && !v.opened_date ? today() : v.opened_date,
    status: old.status || 'active',
  };
}

export function editInventory(row = {}, defaults = {}) {
  return editSheet({
    title: row.id ? 'Edit item' : 'Add item',
    table: 'Inventory',
    row: { ...defaults, ...row },
    fields: inventoryFields,
    toRow: inventoryToRow,
    onDelete: (r) => store.remove('Inventory', r.id),
  });
}

// ---------- Tools ----------

export function editTool(row = {}) {
  return editSheet({
    title: row.id ? 'Edit tool' : 'Add tool',
    table: 'Tools',
    row,
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'category', label: 'Category', type: 'select', options: opts('Tools.category') },
      { name: 'notes', label: 'Notes' },
    ],
    toRow: (v) => (v.name ? v : (toast('Name is required', { error: true }), null)),
    onDelete: (r) => store.remove('Tools', r.id),
  });
}

// ---------- People ----------

export function editPerson(row = {}) {
  return editSheet({
    title: row.id ? 'Edit preference' : 'Add preference',
    table: 'People',
    row: { person: 'Dan', ...row },
    fields: [
      { name: 'person', label: 'Person', type: 'select', options: PEOPLE },
      { name: 'item', label: 'Food / item' },
      { name: 'type', label: 'Type', type: 'select', options: [['hard_no', 'hard no (never)'], ['soft_no', 'soft no (ok if minor)'], ['favorite', 'favorite']] },
      { name: 'notes', label: 'Notes' },
    ],
    toRow: (v) => (v.item ? v : (toast('Item is required', { error: true }), null)),
    onDelete: (r) => store.remove('People', r.id),
  });
}

// ---------- Recipes ----------

export function ingredientsToText(list = []) {
  return list.map((i) => [
    i.name,
    i.qty == null ? '' : i.qty_max != null ? `${i.qty}-${i.qty_max}` : i.qty,
    i.unit || '',
    [i.optional ? 'optional' : '', i.note || ''].filter(Boolean).join('; '),
  ].join(' | ').replace(/( \| )+$/, '')).join('\n');
}

export function textToIngredients(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, qtyRaw = '', unit = '', note = ''] = line.split('|').map((s) => s.trim());
    const range = qtyRaw.match(/^([\d.,]+)\s*(?:-|–|to)\s*([\d.,]+)$/);
    let qty = range ? num(range[1]) : num(qtyRaw);
    let qtyMax = range ? num(range[2]) : null;
    if (Number.isNaN(qty)) qty = null;
    const m = toMetric(qty, unit, name);
    const out = { name, qty: m.qty, unit: m.unit };
    if (qtyMax != null) out.qty_max = toMetric(qtyMax, unit, name).qty;
    const notes = [note.replace(/\boptional\b;?\s*/i, '').trim(), m.converted ? m.note : ''].filter(Boolean).join('; ');
    if (notes) out.note = notes;
    if (/\boptional\b/i.test(note)) out.optional = true;
    return out;
  });
}

const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export function editRecipe(row = {}) {
  return editSheet({
    title: row.id ? 'Edit recipe' : 'Add recipe',
    table: 'Recipes',
    row: {
      status: 'idea', ...row,
      ingredients: ingredientsToText(row.ingredients),
      tools_needed: (row.tools_needed || []).join(', '),
      tags: (row.tags || []).join(', '),
    },
    fields: [
      { name: 'name', label: 'Name' },
      { name: 'status', label: 'Status', type: 'select', options: ENUMS['Recipes.status'], pair: 'start' },
      { name: 'effort', label: 'Effort', type: 'select', options: opts('Recipes.effort'), pair: 'end' },
      { name: 'source_type', label: 'Source type', type: 'select', options: opts('Recipes.source_type'), pair: 'start' },
      { name: 'cuisine', label: 'Cuisine', pair: 'end' },
      { name: 'source_ref', label: 'Source', hint: 'Link, or "ATK cookbook p. 142"', caps: false },
      { name: 'active_minutes', label: 'Active min', type: 'number', pair: 'start' },
      { name: 'servings', label: 'Serves', type: 'number', pair: 'end' },
      { name: 'leftover_friendly', label: 'Leftover friendly', type: 'select', options: opts('Recipes.leftover_friendly') },
      { name: 'ingredients', label: 'Ingredients', type: 'textarea', rows: 8, placeholder: 'shrimp | 300 | g\nbaby potatoes | 400-500 | g\nflour | 1 | cup   (converts to g)\ngarlic', hint: 'One per line: name | amount | unit | note. Leave amount blank if unknown.' },
      { name: 'tools_needed', label: 'Tools needed', hint: 'Comma separated' },
      { name: 'tags', label: 'Tags', hint: 'Comma separated, include the main protein' },
      { name: 'my_notes', label: 'My notes', type: 'textarea', rows: 4 },
    ],
    toRow: (v) => {
      if (!v.name) { toast('Name is required', { error: true }); return null; }
      return {
        ...v,
        active_minutes: num(v.active_minutes),
        servings: num(v.servings),
        ingredients: textToIngredients(v.ingredients),
        tools_needed: splitList(v.tools_needed),
        tags: splitList(v.tags),
      };
    },
    onDelete: (r) => store.remove('Recipes', r.id),
  });
}

// ---------- Shopping ----------

export function editShopping(row = {}) {
  return editSheet({
    title: row.id ? 'Edit item' : 'Add to list',
    table: 'ShoppingList',
    row: { section: 'produce', ...row },
    fields: [
      { name: 'item', label: 'Item' },
      { name: 'qty', label: 'Amount', type: 'number', pair: 'start' },
      { name: 'unit', label: 'Unit', type: 'select', options: ['', 'g', 'ml', 'ea', 'lb', 'oz', 'kg', 'can', 'pkg', 'bunch'], pair: 'end' },
      { name: 'section', label: 'Section', type: 'select', options: SECTIONS, pair: 'start' },
      { name: 'store', label: 'Store', type: 'select', options: [['', 'Auto (routing)'], ...STORES.map((s) => [s, s])], pair: 'end' },
      { name: 'on_sale', label: 'On sale', type: 'select', options: ['no', 'yes'], pair: 'start' },
      { name: 'sale_price', label: 'Sale price', type: 'number', pair: 'end' },
      { name: 'reason', label: 'Reason', hint: 'restock, a recipe, or an event' },
      { name: 'notes', label: 'Notes' },
    ],
    toRow: (v, old) => {
      if (!v.item) { toast('Item is required', { error: true }); return null; }
      const m = toMetric(num(v.qty), v.unit, v.item);
      return {
        ...v,
        qty: m.qty, unit: m.unit,
        notes: m.converted && m.note ? [v.notes, m.note].filter(Boolean).join('; ') : v.notes,
        store: v.store || routeStore(v.section),
        sale_price: num(v.sale_price),
        checked: old.checked || 'no',
      };
    },
    onDelete: (r) => store.remove('ShoppingList', r.id),
  });
}

/** Add rows to the shopping list, merging with unchecked rows of the same item/unit. */
export function addToShopping(items) {
  const existing = store.rows('ShoppingList').filter((r) => r.checked !== 'yes');
  const rows = [];
  for (const it of items) {
    const same = existing.find((r) => r.item.toLowerCase() === it.item.toLowerCase() && (r.unit || '') === (it.unit || ''));
    if (same) {
      rows.push({
        id: same.id,
        qty: same.qty != null && it.qty != null ? Math.round((same.qty + it.qty) * 10) / 10 : same.qty ?? it.qty ?? null,
        reason: [same.reason, it.reason].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', '),
      });
    } else {
      const section = it.section || guessSection(it.item);
      rows.push({ checked: 'no', on_sale: 'no', ...it, section, store: it.store || routeStore(section) });
    }
  }
  if (rows.length) store.commit([{ action: 'upsert', table: 'ShoppingList', rows }]);
  return rows.length;
}

const SECTION_WORDS = {
  meat: ['beef', 'steak', 'sirloin', 'ribeye', 'chicken', 'turkey', 'pork', 'bacon', 'sausage', 'shrimp', 'salmon', 'fish', 'lamb', 'meatball', 'ground', 'chop', 'thigh', 'brisket', 'ham'],
  dairy: ['milk', 'butter', 'cheese', 'parmesan', 'yogurt', 'cream', 'egg'],
  bakery: ['bun', 'bread', 'bagel', 'tortilla', 'wrap', 'roll', 'pita', 'naan', 'dough', 'crust'],
  frozen: ['frozen', 'ice cream'],
  produce: ['onion', 'garlic', 'potato', 'lemon', 'lime', 'pepper', 'jalape', 'habanero', 'cilantro', 'parsley', 'basil', 'zucchini', 'asparagus', 'broccoli', 'spinach', 'bean', 'corn', 'carrot', 'celery', 'lettuce', 'apple', 'banana', 'berr', 'fruit', 'ginger', 'herb', 'mushroom', 'cabbage', 'squash', 'avocado', 'scallion'],
};
const SECTION_ORDER = ['frozen', 'meat', 'dairy', 'bakery', 'produce'];
const CATEGORY_SECTION = { protein: 'meat', produce: 'produce', dairy: 'dairy', frozen: 'frozen', pantry: 'pantry', spice: 'pantry', condiment: 'pantry' };

/** Best-guess store section for an item name (or inventory category). */
export function guessSection(name, category) {
  if (category && CATEGORY_SECTION[category]) return CATEGORY_SECTION[category];
  const n = String(name || '').toLowerCase();
  if (/powder|dried|seasoning|sauce|oil|vinegar|flake|black pepper|salt|sugar|flour|panko|rice|pasta|linguine|farfalle|noodle/.test(n)) return 'pantry';
  return SECTION_ORDER.find((sec) => SECTION_WORDS[sec].some((w) => n.includes(w))) || 'pantry';
}

export { STORES, SECTIONS };
