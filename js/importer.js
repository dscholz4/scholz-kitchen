// Import JSON validation + normalisation. Format is defined in CLAUDE.md.
// analyse(json, existing) -> a plan the Import screen previews and then commits.

import { TABLES, ENUMS, TITLE_FIELD, columns, colType } from './schema.js';
import { toMetric } from './units.js';
import { routeStore } from './settings.js';

export const FORMAT = 'scholz-kitchen-import';
const REVIEWED = ['Inventory', 'Tools', 'People', 'Recipes'];
const REQUIRED = {
  Inventory: ['name'], ShelfLife: ['keyword'], Tools: ['name'], People: ['person', 'item', 'type'],
  Recipes: ['name'], Ratings: ['recipe_id', 'person', 'stars'], WeekPlan: ['date'], Events: ['date'],
  ShoppingList: ['item'], Gaps: ['item'],
};
const DEFAULT_CONFIDENCE = { receipt: 'confirmed', manual: 'confirmed', chat: 'likely', chatgpt_import: 'unsure' };
const COARSE_DEFAULT = ['spice', 'pantry', 'condiment'];

const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function normEnum(table, col, v) {
  const allowed = ENUMS[`${table}.${col}`];
  if (!allowed || v === '' || v == null) return { v: v ?? '' };
  const hit = allowed.find((a) => key(a) === key(v));
  if (hit) return { v: hit };
  // Common aliases
  if (col === 'store' && /pick.*save/i.test(v)) return { v: "Pick 'n Save" };
  if (col === 'store' && /karl/i.test(v)) return { v: "Karl's Country Market" };
  if (col === 'store' && /woodman/i.test(v)) return { v: "Woodman's" };
  if (/^(y|true)$/i.test(v) && allowed.includes('yes')) return { v: 'yes' };
  if (/^(n|false)$/i.test(v) && allowed.includes('no')) return { v: 'no' };
  return { v, error: `${col} "${v}" is not one of: ${allowed.join(', ')}` };
}

function normJson(v) {
  if (Array.isArray(v) || (v && typeof v === 'object')) return { v };
  if (v == null || v === '') return { v: [] };
  if (typeof v === 'string') {
    try { return { v: JSON.parse(v) }; } catch { return { v: v.split(',').map((s) => s.trim()).filter(Boolean) }; }
  }
  return { v: [], error: 'expected a JSON list' };
}

function normNumber(v) {
  if (v == null || v === '') return { v: null };
  const n = Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? { v: null, error: `"${v}" is not a number` } : { v: n };
}

function normIngredients(list, notes) {
  if (!Array.isArray(list)) return { v: [], error: 'ingredients must be a list' };
  const out = list.map((raw) => {
    const i = typeof raw === 'string' ? { name: raw, qty: null, unit: '' } : { ...raw };
    i.name = String(i.name || '').trim();
    i.qty = i.qty === '' || i.qty == null ? null : Number(i.qty);
    if (Number.isNaN(i.qty)) i.qty = null;
    const m = toMetric(i.qty, i.unit, i.name);
    if (m.converted) {
      if (i.qty_max != null) i.qty_max = toMetric(Number(i.qty_max), i.unit, i.name).qty;
      notes.push(`${i.name}: ${m.note} -> ${m.qty} ${m.unit}`);
      i.note = [i.note, m.note].filter(Boolean).join('; ');
    }
    i.qty = m.qty;
    i.unit = m.unit;
    return i;
  });
  const bad = out.filter((i) => !i.name).length;
  return { v: out.filter((i) => i.name), error: bad ? `${bad} ingredient(s) without a name dropped` : null, soft: true };
}

/**
 * @param json parsed import object
 * @param existing {Table: rows[]} current local data
 * @returns {errors[], warnings[], meta, tables: {T: {inserts[], updates[], invalid[], conversions[]}}, deletes: {T: ids[]}}
 */
export function analyse(json, existing) {
  const plan = { errors: [], warnings: [], meta: {}, tables: {}, deletes: {} };
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    plan.errors.push('Top level must be a JSON object.');
    return plan;
  }
  if (json.format !== FORMAT) plan.warnings.push(`"format" should be "${FORMAT}" (got ${JSON.stringify(json.format)}). Continuing anyway.`);
  if (json.version != null && Number(json.version) !== 1) plan.warnings.push(`Unknown version ${json.version}; expected 1.`);
  plan.meta = { kind: json.kind || 'general', source: json.source || '', note: json.note || '' };
  const tables = json.tables || {};
  if (typeof tables !== 'object' || Array.isArray(tables)) { plan.errors.push('"tables" must be an object of table: [rows].'); return plan; }

  for (const [tname, rows] of Object.entries(tables)) {
    const table = TABLES.find((t) => key(t) === key(tname));
    if (!table) { plan.errors.push(`Unknown table "${tname}". Allowed: ${TABLES.join(', ')}`); continue; }
    if (!Array.isArray(rows)) { plan.errors.push(`${table} must be a list of rows.`); continue; }
    const cols = columns(table);
    const byId = new Map((existing[table] || []).map((r) => [r.id, r]));
    const t = (plan.tables[table] = { inserts: [], updates: [], invalid: [], conversions: [], dropped: new Set() });
    const titleField = TITLE_FIELD[table];
    const seenIds = new Set();

    rows.forEach((raw, idx) => {
      if (!raw || typeof raw !== 'object') { t.invalid.push({ idx, row: raw, problems: ['not an object'] }); return; }
      const row = {};
      const problems = [];
      for (const [k, v] of Object.entries(raw)) {
        const col = cols.find((c) => c === k) || cols.find((c) => key(c) === key(k));
        if (!col) { t.dropped.add(k); continue; }
        if (col === 'updated_at') continue;
        row[col] = v;
      }
      if (table === 'WeekPlan' && !row.id && row.date) row.id = row.date;
      const isUpdate = row.id && byId.has(String(row.id));
      if (row.id) {
        row.id = String(row.id);
        if (seenIds.has(row.id)) problems.push(`duplicate id ${row.id} in this file`);
        seenIds.add(row.id);
      }

      for (const col of Object.keys(row)) {
        const type = colType(table, col);
        let res;
        if (col === 'ingredients') res = normIngredients(normJson(row[col]).v, t.conversions);
        else if (type === 'j') res = normJson(row[col]);
        else if (type === 'n') res = normNumber(row[col]);
        else if (col === 'id') res = { v: row[col] };
        else res = normEnum(table, col, row[col] == null ? '' : String(row[col]).trim());
        row[col] = res.v;
        if (res.error) (res.soft ? plan.warnings : problems).push(res.soft ? `${table} "${row[titleField] || idx}": ${res.error}` : res.error);
      }

      // Convert imperial quantities on stock-ish rows.
      if ((table === 'Inventory' || table === 'ShoppingList') && row.unit) {
        const m = toMetric(row.qty ?? null, row.unit, row.name || row.item);
        if (m.converted) {
          t.conversions.push(`${row.name || row.item}: ${m.note} -> ${m.qty} ${m.unit}`);
          row.notes = [row.notes, m.note].filter(Boolean).join('; ');
        }
        row.qty = m.qty;
        row.unit = m.unit;
      }

      if (!isUpdate) {
        for (const req of REQUIRED[table] || []) {
          if (row[req] == null || row[req] === '') problems.push(`missing ${req}`);
        }
        applyDefaults(table, row, plan.meta.source);
      }

      if (problems.length) { t.invalid.push({ idx, row, problems }); return; }

      if (isUpdate) {
        t.updates.push({ row, before: byId.get(row.id) });
      } else {
        const dupe = findDuplicate(table, row, existing[table] || []);
        t.inserts.push({ row, dupe });
      }
    });
    t.dropped = [...t.dropped];
    if (t.dropped.length) plan.warnings.push(`${table}: ignored unknown column(s) ${t.dropped.join(', ')}`);
    const dupes = t.inserts.filter((x) => x.dupe).length;
    if (dupes) plan.warnings.push(`${table}: ${dupes} new row(s) look like existing ones (same name). They will be added as new rows unless you give them the existing id.`);
  }

  for (const [tname, ids] of Object.entries(json.delete || {})) {
    const table = TABLES.find((t) => key(t) === key(tname));
    if (!table) { plan.errors.push(`delete: unknown table "${tname}"`); continue; }
    if (!Array.isArray(ids)) { plan.errors.push(`delete.${table} must be a list of ids`); continue; }
    const known = new Set((existing[table] || []).map((r) => r.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length) plan.warnings.push(`delete.${table}: ${missing.length} id(s) not found locally (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`);
    plan.deletes[table] = ids.map(String);
  }

  if (!Object.keys(plan.tables).length && !Object.keys(plan.deletes).length && !plan.errors.length) {
    plan.errors.push('Nothing to import: "tables" is empty.');
  }
  return plan;
}

function applyDefaults(table, row, source) {
  if (REVIEWED.includes(table)) {
    if (!row.source && source && ENUMS[`${table}.source`].includes(source)) row.source = source;
    if (!row.confidence) row.confidence = DEFAULT_CONFIDENCE[row.source] || 'likely';
  }
  if (table === 'Inventory') {
    if (!row.status) row.status = 'active';
    if (!row.tracking) row.tracking = COARSE_DEFAULT.includes(row.category) ? 'coarse' : 'exact';
    if (row.expires_date && !row.expires_source) row.expires_source = 'printed';
  }
  if (table === 'Recipes' && !row.status) row.status = 'idea';
  if (table === 'ShoppingList') {
    if (!row.checked) row.checked = 'no';
    if (!row.on_sale) row.on_sale = 'no';
    if (!row.section) row.section = 'pantry';
    if (!row.store) row.store = routeStore(row.section);
  }
}

function findDuplicate(table, row, list) {
  const f = TITLE_FIELD[table];
  if (!row[f] || ['Ratings', 'WeekPlan', 'Events'].includes(table)) return null;
  const k = key(row[f]);
  return list.find((r) => key(r[f]) === k
    && (table !== 'People' || r.person === row.person)
    && (table !== 'Inventory' || r.status === 'active')) || null;
}

/** Turn an analysed plan into store ops. */
export function toOps(plan) {
  const ops = [];
  for (const [table, t] of Object.entries(plan.tables)) {
    const rows = [...t.inserts.map((x) => x.row), ...t.updates.map((x) => x.row)];
    for (let i = 0; i < rows.length; i += 100) ops.push({ action: 'upsert', table, rows: rows.slice(i, i + 100) });
  }
  for (const [table, ids] of Object.entries(plan.deletes)) {
    if (ids.length) ops.push({ action: 'delete', table, ids });
  }
  return ops;
}

export function summary(plan) {
  return Object.entries(plan.tables).map(([table, t]) => ({
    table, inserts: t.inserts.length, updates: t.updates.length, invalid: t.invalid.length,
  }));
}

