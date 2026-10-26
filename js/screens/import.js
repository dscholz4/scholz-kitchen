// Import: paste (or load files of) Import JSON from Claude chat, validate, preview, write.

import * as store from '../store.js';
import { TABLES, TITLE_FIELD } from '../schema.js';
import { isConfigured } from '../api.js';
import { analyse, toOps, FORMAT } from '../importer.js';
import { h, toast, label } from '../ui.js';

let draft = '';
let typing = false;
let hasPreview = false; // keep the preview/result on screen while sync re-renders
export const keepOnRefresh = () => typing || hasPreview;

export function render(el) {
  hasPreview = false;
  const ta = h('textarea', {
    placeholder: `Paste the JSON block from Claude here.\n{"format":"${FORMAT}", "version":1, "tables":{...}}`,
    rows: 10, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
    oninput: (e) => { draft = e.target.value; },
    onfocus: () => { typing = true; }, onblur: () => { typing = false; },
  }, draft);
  ta.value = draft;
  const fileIn = h('input', { type: 'file', accept: '.json,application/json,text/plain', multiple: true, style: { display: 'none' }, onchange: loadFiles });
  const out = h('div');

  el.append(
    h('p.small.muted', 'Claude chat gives you a JSON block (receipt, weekly plan, setup, etc). Paste it, check it, then write it. Format is documented in CLAUDE.md.'),
    h('label.field', ta),
    h('div.row-btns', { style: { marginTop: 0 } },
      h('button.btn', { onclick: () => fileIn.click() }, 'Load file(s)'),
      h('button.btn', { onclick: async () => { try { draft = await navigator.clipboard.readText(); ta.value = draft; } catch { toast('Paste with long-press instead', { error: true }); } } }, 'Paste'),
      h('button.btn.primary', { onclick: () => check(ta.value, out) }, 'Check')),
    fileIn, out);

  async function loadFiles(e) {
    const files = [...e.target.files];
    if (!files.length) return;
    try {
      const parsed = await Promise.all(files.map(async (f) => ({ name: f.name, json: JSON.parse(await f.text()) })));
      const merged = mergeFiles(parsed.map((p) => p.json));
      merged.note = parsed.length > 1 ? `${parsed.length} files: ${parsed.map((p) => p.name).join(', ')}` : (merged.note || parsed[0].name);
      draft = JSON.stringify(merged, null, 2);
      ta.value = draft;
      check(draft, out);
    } catch (err) {
      out.replaceChildren(h('div.err-box', `Could not read file: ${err.message}`));
    }
    e.target.value = '';
  }
}

/** Combine several import files; each file's top-level source is pushed down onto its rows first. */
function mergeFiles(list) {
  const merged = { format: FORMAT, version: 1, kind: 'general', tables: {}, delete: {} };
  for (const j of list) {
    for (const [t, rows] of Object.entries(j.tables || {})) {
      merged.tables[t] = (merged.tables[t] || []).concat((rows || []).map((r) => (j.source && r && !r.source ? { ...r, source: j.source } : r)));
    }
    for (const [t, ids] of Object.entries(j.delete || {})) merged.delete[t] = (merged.delete[t] || []).concat(ids);
    if (list.length === 1) Object.assign(merged, { kind: j.kind, source: j.source, note: j.note });
    else if (list.every((x) => x.kind === list[0].kind)) merged.kind = list[0].kind || 'general';
  }
  return merged;
}

function extractJson(text) {
  const t = text.trim();
  // Accept a ```json fenced block pasted straight from chat.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1] : t);
}

function check(text, out) {
  if (!text.trim()) { out.replaceChildren(h('div.err-box', 'Paste something first.')); return; }
  let json;
  try {
    json = extractJson(text);
  } catch (err) {
    out.replaceChildren(h('div.err-box', `Not valid JSON: ${err.message}`));
    return;
  }
  const existing = Object.fromEntries(TABLES.map((t) => [t, store.rows(t)]));
  const plan = analyse(json, existing);
  out.replaceChildren(...preview(plan, out));
  hasPreview = true;
}

const title = (table, row) => row[TITLE_FIELD[table]] || row.id || '(untitled)';

function preview(plan, out) {
  const nodes = [];
  if (plan.meta.note) nodes.push(h('p', h('strong', label(plan.meta.kind)), ` · ${plan.meta.note}`));
  plan.errors.forEach((e) => nodes.push(h('div.err-box', e)));
  plan.warnings.forEach((w) => nodes.push(h('div.warn-box', w)));

  let total = 0;
  const tableCards = Object.entries(plan.tables).map(([table, t]) => {
    total += t.inserts.length + t.updates.length;
    return h('div.card',
      h('h3', table),
      h('p.small.muted', `${t.inserts.length} new · ${t.updates.length} update${t.updates.length === 1 ? '' : 's'}${t.invalid.length ? ` · ${t.invalid.length} invalid (skipped)` : ''}`),
      t.invalid.length ? h('details', { open: true }, h('summary', `Invalid rows (${t.invalid.length})`),
        t.invalid.map((x) => h('div.err-box', `#${x.idx + 1} ${x.row ? title(table, x.row) : ''}: ${x.problems.join('; ')}`))) : null,
      t.inserts.length ? h('details', h('summary', `New (${t.inserts.length})`),
        h('div.list', t.inserts.map((x) => h('div.item', h('div.grow',
          h('div.name', title(table, x.row)),
          h('div.sub', rowSummary(table, x.row)),
          x.dupe ? h('div.sub', { style: { color: 'var(--warn)' } }, `looks like existing ${x.dupe.id}`) : null))))) : null,
      t.updates.length ? h('details', h('summary', `Updates (${t.updates.length})`),
        h('div.list', t.updates.map((x) => h('div.item', h('div.grow',
          h('div.name', title(table, { ...x.before, ...x.row })),
          h('div.sub', changed(x.before, x.row))))))) : null,
      t.conversions.length ? h('details', h('summary', `Unit conversions (${t.conversions.length})`),
        h('ul.small', t.conversions.map((c) => h('li', c)))) : null);
  });
  nodes.push(...tableCards);
  const deletes = Object.entries(plan.deletes).filter(([, ids]) => ids.length);
  deletes.forEach(([table, ids]) => { total += ids.length; nodes.push(h('div.warn-box', `Will delete ${ids.length} row(s) from ${table}.`)); });

  if (plan.errors.length) {
    nodes.push(h('p.small.muted', 'Fix the errors above (or ask Claude to re-send the block) and check again.'));
    return nodes;
  }
  if (!total) { nodes.push(h('div.warn-box', 'Nothing valid to write.')); return nodes; }
  nodes.push(h('button.btn.primary.block.mt', { onclick: (e) => write(plan, e.currentTarget, out) },
    `Write ${total} change${total === 1 ? '' : 's'}${isConfigured() ? ' to Sheet' : ' (local only)'}`));
  return nodes;
}

function rowSummary(table, r) {
  const skip = new Set(['id', TITLE_FIELD[table], 'updated_at']);
  return Object.entries(r).filter(([k, v]) => !skip.has(k) && v !== '' && v != null && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? (k === 'ingredients' ? `${v.length} items` : v.join(', ')) : v}`).join(' · ');
}

function changed(before = {}, row) {
  return Object.keys(row).filter((k) => k !== 'id' && JSON.stringify(before[k] ?? '') !== JSON.stringify(row[k] ?? ''))
    .map((k) => `${k}: ${fmt(before[k])} → ${fmt(row[k])}`).join(' · ') || 'no changes';
}
const fmt = (v) => (v == null || v === '' ? '∅' : Array.isArray(v) ? `[${v.length}]` : String(v));

async function write(plan, btn, out) {
  btn.disabled = true;
  btn.textContent = 'Writing…';
  store.commit(toOps(plan));
  if (!isConfigured()) {
    out.replaceChildren(h('div.ok-box', 'Saved on this device. Connect the Sheet in Settings and it will upload.'));
    return;
  }
  try {
    await store.flush();
    out.replaceChildren(h('div.ok-box', 'Written to the Sheet.'));
    draft = '';
    toast('Import complete');
  } catch (err) {
    out.replaceChildren(h('div.warn-box', `Saved on this device, but upload failed: ${err.message}. It will retry automatically.`));
  }
}
