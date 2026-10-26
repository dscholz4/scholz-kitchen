// Recipes: library with search + filters, and recipe detail.

import * as store from '../store.js';
import { ENUMS } from '../schema.js';
import { h, chips, badge, sheet, select, field, toast, label } from '../ui.js';
import { fmtQty } from '../units.js';
import { preferenceHits, inStock, ownedTool } from '../match.js';
import { editRecipe, addToShopping, guessSection } from './forms.js';

const ui = { status: '', q: '', effort: '', cuisine: '', leftover: '' };
let typing = false;
export const keepOnRefresh = () => typing;

export function render(el, params) {
  if (params[0]) return renderDetail(el, params[0]);
  return renderList(el);
}

// ---------- list ----------

function avgStars(recipeId) {
  const rs = store.rows('Ratings').filter((r) => r.recipe_id === recipeId && r.stars != null);
  const by = {};
  for (const r of rs) (by[r.person] ||= []).push(r.stars);
  return Object.fromEntries(Object.entries(by).map(([p, s]) => [p, s.reduce((a, b) => a + b, 0) / s.length]));
}

function renderList(el) {
  el.append(chips(ENUMS['Recipes.status'].map((s) => [s, label(s)]), ui.status, (v) => { ui.status = v; redraw(el); }));
  const filtersOn = [ui.effort, ui.cuisine, ui.leftover].filter(Boolean).length;
  const search = h('input.search', {
    type: 'search', placeholder: 'Search recipes, ingredients, tags', value: ui.q,
    oninput: (e) => { ui.q = e.target.value; draw(); },
    onfocus: () => { typing = true; }, onblur: () => { typing = false; },
  });
  el.append(h('div', { style: { display: 'flex', gap: '8px' } },
    h('div', { style: { flex: '1' } }, search),
    h('button.btn', { style: { height: '44px' }, onclick: () => filterSheet(el) }, filtersOn ? `Filters (${filtersOn})` : 'Filters')));
  const wrap = h('div');
  el.append(wrap);
  const draw = () => wrap.replaceChildren(...listItems());
  draw();
  el.append(h('button.fab', { 'aria-label': 'Add recipe', onclick: async () => { const r = await editRecipe(); if (r && r.id) location.hash = `#/recipe/${r.id}`; } }, '+'));
}

function redraw(el) { el.replaceChildren(); renderList(el); }

function listItems() {
  const q = ui.q.toLowerCase();
  const list = store.rows('Recipes').filter((r) => {
    if (ui.status ? r.status !== ui.status : r.status === 'retired') return false;
    if (ui.effort && r.effort !== ui.effort) return false;
    if (ui.cuisine && (r.cuisine || '').toLowerCase() !== ui.cuisine.toLowerCase()) return false;
    if (ui.leftover && r.leftover_friendly !== ui.leftover) return false;
    if (!q) return true;
    const hay = [r.name, r.cuisine, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.name)].join(' ').toLowerCase();
    return hay.includes(q);
  });
  const order = { active: 0, less_often: 1, idea: 2, retired: 3 };
  list.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
  if (!list.length) return [h('div.empty', store.rows('Recipes').length ? 'No recipes match.' : 'No recipes yet. Tap + or load the seed in Import.')];
  return [
    h('p.progress', `${list.length} recipe${list.length === 1 ? '' : 's'}${ui.status ? '' : ' (retired hidden)'}`),
    h('div.list', list.map((r) => {
      const hits = preferenceHits(r);
      const hard = hits.filter((x) => x.kind === 'hard');
      const stars = avgStars(r.id);
      const meta = [r.cuisine, label(r.effort), label(r.status),
        ...Object.entries(stars).map(([p, s]) => `${p[0]} ${s.toFixed(1)}★`)].filter(Boolean).join(' · ');
      return h('a.item.tap', { href: `#/recipe/${r.id}`, style: { color: 'inherit', textDecoration: 'none' } },
        h('div.grow',
          h('div.name', r.name, badge(r.confidence)),
          h('div.sub', meta),
          hard.length ? h('div', hard.map((x) => h('span.pill.hard', `${x.person}: ${x.item}`))) : null),
        h('span.muted', '›'));
    })),
  ];
}

function filterSheet(el) {
  const cuisines = [...new Set(store.rows('Recipes').map((r) => r.cuisine).filter(Boolean))].sort();
  sheet('Filters', (close) => {
    const eff = select('effort', ['', ...ENUMS['Recipes.effort']], ui.effort);
    const cui = select('cuisine', ['', ...cuisines], ui.cuisine);
    const lo = select('leftover', [['', 'Any'], ['yes', 'Leftover friendly'], ['no', 'Not leftover friendly']], ui.leftover);
    return [
      field('Effort', eff), field('Cuisine', cui), field('Leftovers', lo),
      h('div.row-btns',
        h('button.btn', { onclick: () => { Object.assign(ui, { effort: '', cuisine: '', leftover: '' }); close(); redraw(el); } }, 'Clear'),
        h('button.btn.primary', { onclick: () => { Object.assign(ui, { effort: eff.value, cuisine: cui.value, leftover: lo.value }); close(); redraw(el); } }, 'Apply')),
    ];
  });
}

// ---------- detail ----------

const isUrl = (s) => /^https?:\/\//i.test(s || '');

function renderDetail(el, id) {
  const r = store.get('Recipes', id);
  if (!r) { el.append(h('div.empty', 'Recipe not found.'), h('a.btn', { href: '#/recipes' }, 'Back to recipes')); return; }
  document.getElementById('title').textContent = 'Recipe';

  const hits = preferenceHits(r);
  const statusSel = select('status', ENUMS['Recipes.status'], r.status || 'idea', {
    onchange: (e) => { store.upsert('Recipes', { id: r.id, status: e.target.value }); toast(`Status: ${label(e.target.value)}`); },
    style: { height: '36px', borderRadius: '10px', border: '1px solid var(--line)', background: 'var(--surface)', padding: '0 8px' },
  });

  el.append(h('a.muted.small', { href: '#/recipes', style: { textDecoration: 'none' } }, '‹ Recipes'));
  el.append(h('div.card.mt',
    h('h2', r.name, badge(r.confidence)),
    h('div.sub.muted.mt', [r.cuisine, label(r.effort), r.active_minutes ? `${r.active_minutes} min active` : '',
      r.servings ? `serves ${r.servings}` : '', r.leftover_friendly === 'yes' ? 'leftover friendly' : r.leftover_friendly === 'no' ? 'no leftovers' : ''].filter(Boolean).join(' · ')),
    h('div.mt', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('span.small.muted', 'Status'), statusSel),
    r.source_ref ? h('p.small', h('span.muted', `Source (${r.source_type || '?'}): `),
      isUrl(r.source_ref) ? h('a', { href: r.source_ref, target: '_blank', rel: 'noopener' }, r.source_ref) : r.source_ref) : null,
    (r.tags || []).length ? h('div', r.tags.map((t) => h('span.pill', t))) : null));

  if (hits.length) {
    el.append(h('div.card',
      h('h3', 'Preferences'),
      h('div.mt', hits.map((x) => h('div.small', { style: { margin: '6px 0' } },
        h(`span.pill.${x.kind === 'fav' ? 'fav' : x.kind}`, x.kind === 'hard' ? 'HARD NO' : x.kind === 'soft' ? 'soft no' : 'favorite'),
        ` ${x.person}: ${x.item}`, x.where !== 'recipe name' && x.where.toLowerCase() !== x.item.toLowerCase() ? ` (in “${x.where}”)` : '',
        x.confidence && x.confidence !== 'confirmed' ? h('span.muted', ` · ${x.confidence}`) : null,
        x.notes ? h('div.muted', x.notes) : null)))));
  }

  const ings = r.ingredients || [];
  el.append(h('div.card',
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('h3', 'Ingredients'),
      ings.length ? h('button.btn.small', { onclick: () => shopSheet(r) }, '+ Shopping') : null),
    ings.length ? h('div.mt', ings.map((i) => {
      const stock = inStock(i.name);
      return h('div.ing',
        h('div',
          h('div', i.name, i.optional ? h('span.muted', ' (optional)') : null),
          i.note ? h('div.small.muted', i.note) : null,
          stock ? h('div.small', { style: { color: 'var(--accent)' } }, `have: ${stock.name}${stock.level ? ` (${stock.level})` : ''}`) : null),
        h('div.q', i.qty == null ? '?' : fmtQty(i.qty, i.unit, i.qty_max)));
    })) : h('p.muted', 'No ingredients recorded.')));

  const tools = r.tools_needed || [];
  if (tools.length) {
    el.append(h('div.card', h('h3', 'Tools needed'), h('div.mt', tools.map((t) => {
      const own = ownedTool(t);
      return h('div.ing', h('div', t),
        h('div.q', own ? (own.confidence === 'confirmed' ? 'owned' : `${own.confidence}: ${own.name}`) : h('span', { style: { color: 'var(--warn)' } }, 'not in Tools')));
    }))));
  }

  if (r.my_notes) el.append(h('div.card', h('h3', 'Notes'), h('p', { style: { whiteSpace: 'pre-wrap' } }, r.my_notes)));

  const ratings = store.rows('Ratings').filter((x) => x.recipe_id === r.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const avg = avgStars(r.id);
  el.append(h('div.card', h('h3', 'Ratings'),
    ratings.length ? [
      h('p.small.muted', Object.entries(avg).map(([p, s]) => `${p}: ${s.toFixed(1)}★`).join(' · ')),
      ratings.map((x) => h('div.ing', h('div', `${x.date} · ${x.person}`, x.notes ? h('div.small.muted', x.notes) : null),
        h('div.q', `${'★'.repeat(x.stars || 0)}${x.make_again ? ` · again: ${x.make_again}` : ''}`))),
    ] : h('p.muted', 'Not rated yet. Rating arrives in Phase 2 (day after a planned meal).')));

  el.append(h('button.btn.block.mt', { onclick: () => editRecipe(r) }, 'Edit recipe'));
}

function shopSheet(r) {
  sheet('Add to shopping list', (close) => {
    const rows = (r.ingredients || []).map((i) => {
      const stock = inStock(i.name);
      const cb = h('input', { type: 'checkbox', checked: !stock && !i.optional && !/\bwater\b/i.test(i.name) });
      return { i, cb, el: h('label.item.check', cb, h('div.grow', h('div.name', i.name), h('div.sub', [i.qty == null ? 'amount unknown' : fmtQty(i.qty_max ?? i.qty, i.unit), stock ? `have ${stock.name}` : '', i.optional ? 'optional' : ''].filter(Boolean).join(' · ')))) };
    });
    return [
      h('p.small.muted', 'Items you already have are unchecked.'),
      h('div.list', rows.map((x) => x.el)),
      h('button.btn.primary.block', {
        onclick: () => {
          const picked = rows.filter((x) => x.cb.checked).map(({ i }) => ({
            item: i.name, qty: i.qty_max ?? i.qty ?? null, unit: i.qty == null ? '' : i.unit, section: guessSection(i.name), reason: r.id,
          }));
          const n = addToShopping(picked);
          toast(`${n} item${n === 1 ? '' : 's'} added`);
          close();
        },
      }, 'Add checked items'),
    ];
  });
}
