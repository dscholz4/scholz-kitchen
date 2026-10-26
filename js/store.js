// Local-first data store: cache + outbox in localStorage, synced with the API.

import { TABLES, newId } from './schema.js';
import { call, isConfigured } from './api.js';

const CACHE_KEY = 'sk.cache';
const OUTBOX_KEY = 'sk.outbox';

const state = {
  tables: Object.fromEntries(TABLES.map((t) => [t, []])),
  lastSync: null,
  syncing: false,
  error: null,
};
let outbox = [];
const listeners = new Set();

function load() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c && c.tables) {
      for (const t of TABLES) state.tables[t] = c.tables[t] || [];
      state.lastSync = c.lastSync || null;
    }
    outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch { /* storage blocked or corrupt: start empty */ }
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ tables: state.tables, lastSync: state.lastSync }));
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch { /* quota or blocked: keep running in memory */ }
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error(e); }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const status = () => ({
  lastSync: state.lastSync, syncing: state.syncing, error: state.error, pending: outbox.length,
});

export const rows = (table) => state.tables[table];
export const get = (table, id) => state.tables[table].find((r) => r.id === id);

function applyUpsert(table, row) {
  const list = state.tables[table];
  const i = list.findIndex((r) => r.id === row.id);
  if (i === -1) list.push({ ...row });
  else list[i] = { ...list[i], ...row };
}

function applyDelete(table, ids) {
  const kill = new Set(ids);
  state.tables[table] = state.tables[table].filter((r) => !kill.has(r.id));
}

function applyOp(op) {
  if (op.action === 'delete') applyDelete(op.table, op.ids);
  else op.rows.forEach((r) => applyUpsert(op.table, r));
}

/** Apply ops locally right away, queue them for the server. Returns the (id-filled) ops. */
export function commit(ops) {
  const ready = ops.map((op) => (op.action === 'delete'
    ? { action: 'delete', table: op.table, ids: [...op.ids] }
    : { action: 'upsert', table: op.table, rows: op.rows.map((r) => ({ ...r, id: r.id || newId(op.table) })) }));
  ready.forEach(applyOp);
  outbox.push(...ready);
  persist();
  emit();
  scheduleFlush();
  return ready;
}

export function upsert(table, row) {
  return commit([{ action: 'upsert', table, rows: [row] }])[0].rows[0];
}

export function remove(table, ids) {
  commit([{ action: 'delete', table, ids: Array.isArray(ids) ? ids : [ids] }]);
}

let flushTimer = null;
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flush().catch(() => {}); }, 400);
}

let flushing = null;
/** Send queued ops. Resolves when the outbox has been sent (or throws). */
export async function flush() {
  if (!isConfigured() || !outbox.length) return;
  if (flushing) return flushing;
  flushing = (async () => {
    state.syncing = true; emit();
    try {
      while (outbox.length) {
        const batch = outbox.slice(0, 25);
        const res = await call('batch', { ops: batch });
        outbox.splice(0, batch.length);
        // Take the server's version of written rows (updated_at etc.)
        res.results.forEach((r) => { if (r.rows) r.rows.forEach((row) => applyUpsert(r.table, row)); });
        state.error = null;
        persist();
      }
    } catch (err) {
      state.error = err.message;
      throw err;
    } finally {
      state.syncing = false;
      flushing = null;
      emit();
    }
  })();
  return flushing;
}

/** Push pending edits, then pull everything. */
export async function sync() {
  if (!isConfigured()) return;
  try {
    await flush();
    state.syncing = true; emit();
    const res = await call('read', {});
    for (const t of TABLES) state.tables[t] = res.data[t] || [];
    outbox.forEach(applyOp); // edits made while the read was in flight
    state.lastSync = res.server_time || new Date().toISOString();
    state.error = null;
    persist();
  } catch (err) {
    state.error = err.message;
  } finally {
    state.syncing = false;
    emit();
  }
}

export function clearCache() {
  for (const t of TABLES) state.tables[t] = [];
  state.lastSync = null;
  outbox = [];
  persist();
  emit();
}

export function exportAll() {
  return { exported_at: new Date().toISOString(), tables: state.tables, pending: outbox };
}

load();
window.addEventListener('online', () => { sync(); });
document.addEventListener('visibilitychange', () => {
  const stale = !state.lastSync || Date.now() - Date.parse(state.lastSync) > 60000;
  if (document.visibilityState === 'visible' && (stale || outbox.length)) sync();
});
