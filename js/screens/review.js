// Review: one card at a time for every row not yet confirmed.

import * as store from '../store.js';
import { REVIEWABLE, TITLE_FIELD } from '../schema.js';
import { h, chips, badge, toast, confirmSheet, label } from '../ui.js';
import { fmtQty } from '../units.js';
import { editInventory, editPerson, editRecipe, editTool } from './forms.js';

const ui = { section: '' };
const skipped = new Set(); // this session only: skipped cards go to the back
const SECTION_LABEL = { People: 'Preferences', Tools: 'Tools', Inventory: 'Pantry & spices', Recipes: 'Recipes' };
const TYPE_RANK = { hard_no: 0, soft_no: 1, favorite: 2 };

export function reviewQueue(section) {
  const out = [];
  for (const table of REVIEWABLE) {
    if (section && section !== table) continue;
    const list = store.rows(table).filter((r) => r.confidence && r.confidence !== 'confirmed'
      && (table !== 'Inventory' || (r.status || 'active') === 'active'));
    list.sort((a, b) => (table === 'People' ? (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9) : 0)
      || String(a[TITLE_FIELD[table]]).localeCompare(String(b[TITLE_FIELD[table]])));
    out.push(...list.map((row) => ({ table, row })));
  }
  return out.sort((a, b) => skipped.has(a.row.id) - skipped.has(b.row.id));
}

export function render(el) {
  const counts = Object.fromEntries(REVIEWABLE.map((t) => [t, reviewQueue(t).length]));
  el.append(chips(REVIEWABLE.map((t) => [t, `${SECTION_LABEL[t]} (${counts[t]})`]), ui.section,
    (v) => { ui.section = v; el.replaceChildren(); render(el); }));
  const queue = reviewQueue(ui.section);
  if (!queue.length) {
    el.append(h('div.empty', h('div', { style: { fontSize: '40px' } }, '✓'),
      ui.section ? `Nothing left to review in ${SECTION_LABEL[ui.section]}.` : 'All caught up. Everything is confirmed.'));
    return;
  }
  el.append(h('p.progress', `${queue.length} to review. Confirmed data always wins in planning; likely and unsure are only nudges.`));
  el.append(card(queue[0], () => { el.replaceChildren(); render(el); }));
}

function kv(pairs) {
  return h('dl.kv', pairs.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))
    .flatMap(([k, v]) => [h('dt', k), h('dd', Array.isArray(v) ? v.join(', ') : String(v))]));
}

function card({ table, row }, rerender) {
  const done = (msg) => { skipped.delete(row.id); toast(msg); };
  const confirm = (patch = {}, msg = 'Confirmed') => { store.upsert(table, { id: row.id, ...patch, confidence: 'confirmed' }); done(msg); };
  const del = async (msg = 'Deleted') => {
    if (await confirmSheet('Delete?', `Remove "${row[TITLE_FIELD[table]]}"?`, 'Delete', { danger: true })) {
      store.remove(table, row.id);
      done(msg);
    }
  };
  const skip = h('button.btn.small', { style: { alignSelf: 'center', marginTop: '10px' }, onclick: () => { skipped.add(row.id); rerender(); } }, 'Skip for now');

  let body; let actions; let question; let extra = null;
  if (table === 'People') {
    question = `Is this right for ${row.person}?`;
    body = [
      h('div', h(`span.pill.${row.type === 'hard_no' ? 'hard' : row.type === 'soft_no' ? 'soft' : 'fav'}`, label(row.type)), h('span.muted.small', ` ${row.person}`)),
      h('h2.mt', row.item, badge(row.confidence)),
      kv([['Notes', row.notes], ['Source', label(row.source)]]),
      row.type === 'hard_no' && row.confidence === 'unsure' ? h('p.small.muted', 'Until confirmed this is treated as a soft no.') : null,
    ];
    actions = [
      h('button.btn.primary', { onclick: () => confirm() }, 'Confirm'),
      h('button.btn', { onclick: () => editPerson(row).then((r) => r && r !== 'deleted' && done('Saved')) }, 'Edit'),
      h('button.btn.danger', { onclick: () => del() }, 'Delete'),
    ];
  } else if (table === 'Tools') {
    question = 'Do you own this?';
    body = [h('h2', row.name, badge(row.confidence)), kv([['Category', row.category], ['Notes', row.notes]])];
    actions = [
      h('button.btn.primary', { onclick: () => confirm({}, 'Marked owned') }, 'Own it'),
      h('button.btn', { onclick: () => editTool(row).then((r) => r && r !== 'deleted' && done('Saved')) }, 'Edit'),
      h('button.btn.danger', { onclick: () => del('Removed') }, "Don't own"),
    ];
  } else if (table === 'Inventory') {
    question = 'Do you have this right now?';
    body = [
      h('h2', row.name, badge(row.confidence)),
      kv([['Category', row.category], ['Location', row.location],
        ['Amount', row.qty != null ? fmtQty(row.qty, row.unit) : row.level || 'unknown'], ['Notes', row.notes]]),
    ];
    const lvl = (level) => confirm(row.tracking === 'exact' ? { level } : { level, tracking: 'coarse' }, `${row.name}: ${level}`);
    actions = [
      h('button.btn.primary', { onclick: () => lvl('have') }, 'Have it'),
      h('button.btn', { onclick: () => lvl('low') }, 'Low'),
      h('button.btn', { onclick: () => lvl('out') }, 'Out'),
    ];
    extra = (h('div.row-btns',
      h('button.btn', { onclick: () => editInventory(row).then((r) => r && r !== 'deleted' && done('Saved')) }, 'Edit'),
      h('button.btn.danger', { onclick: () => del('Removed') }, "Don't keep it")));
  } else {
    question = 'Keep this recipe?';
    const ings = (row.ingredients || []).map((i) => (i.qty == null ? i.name : `${i.name} ${fmtQty(i.qty, i.unit, i.qty_max)}`));
    body = [
      h('h2', row.name, badge(row.confidence)),
      kv([['Status', label(row.status)], ['Source', row.source_ref], ['Cuisine', row.cuisine], ['Ingredients', ings], ['Notes', row.my_notes]]),
      h('a.small', { href: `#/recipe/${row.id}` }, 'Open recipe'),
    ];
    actions = [
      h('button.btn.primary', { onclick: () => confirm() }, 'Confirm'),
      h('button.btn', { onclick: () => editRecipe(row).then((r) => r && r !== 'deleted' && done('Saved')) }, 'Edit'),
      h('button.btn.danger', { onclick: () => del() }, 'Delete'),
    ];
  }
  const wrap = h('div.card.review-card',
    h('div.small.muted', `${SECTION_LABEL[table]} · ${question}`),
    h('div.mt', body),
    h('div.review-actions.mt', actions));
  wrap.append(h('div', { style: { display: 'flex', flexDirection: 'column' } }, extra, skip));
  return wrap;
}
