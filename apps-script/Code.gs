/**
 * Scholz Kitchen API: Google Apps Script web app bound to the household Sheet.
 *
 * Setup (see docs/SETUP.md):
 *   1. Extensions > Apps Script, paste this file as Code.gs.
 *   2. Project Settings > Script properties > add TOKEN = <long random secret>.
 *   3. Run setupSheet() once from the editor (creates tabs + headers).
 *   4. Deploy > New deployment > Web app, execute as Me, access Anyone.
 *
 * SCHEMA must stay identical to js/schema.js in the app.
 */

var API_VERSION = 1;

// [column, type]  type: 's' text, 'n' number, 'j' JSON
var SCHEMA = {
  Inventory: [
    ['id', 's'], ['name', 's'], ['category', 's'], ['location', 's'], ['tracking', 's'],
    ['qty', 'n'], ['unit', 's'], ['level', 's'], ['purchased_date', 's'], ['store', 's'],
    ['opened', 's'], ['opened_date', 's'], ['expires_date', 's'], ['expires_source', 's'],
    ['status', 's'], ['notes', 's'], ['confidence', 's'], ['source', 's'], ['updated_at', 's']
  ],
  ShelfLife: [
    ['id', 's'], ['keyword', 's'], ['category', 's'], ['pantry_days', 'n'],
    ['fridge_unopened_days', 'n'], ['fridge_opened_days', 'n'], ['freezer_days', 'n'],
    ['notes', 's'], ['updated_at', 's']
  ],
  Tools: [
    ['id', 's'], ['name', 's'], ['category', 's'], ['notes', 's'],
    ['confidence', 's'], ['source', 's'], ['updated_at', 's']
  ],
  People: [
    ['id', 's'], ['person', 's'], ['item', 's'], ['type', 's'], ['notes', 's'],
    ['confidence', 's'], ['source', 's'], ['updated_at', 's']
  ],
  Recipes: [
    ['id', 's'], ['name', 's'], ['source_type', 's'], ['source_ref', 's'], ['ingredients', 'j'],
    ['tools_needed', 'j'], ['cuisine', 's'], ['effort', 's'], ['active_minutes', 'n'],
    ['leftover_friendly', 's'], ['servings', 'n'], ['tags', 'j'], ['my_notes', 's'],
    ['status', 's'], ['confidence', 's'], ['source', 's'], ['updated_at', 's']
  ],
  Ratings: [
    ['id', 's'], ['recipe_id', 's'], ['date', 's'], ['person', 's'], ['stars', 'n'],
    ['make_again', 's'], ['notes', 's'], ['updated_at', 's']
  ],
  WeekPlan: [
    ['id', 's'], ['week_start', 's'], ['date', 's'], ['who_home', 's'], ['cooking', 's'],
    ['recipe_id', 's'], ['backup_recipe_id', 's'], ['notes', 's'], ['updated_at', 's']
  ],
  Events: [
    ['id', 's'], ['date', 's'], ['headcount', 'n'], ['menu_ideas', 's'], ['guest_notes', 's'],
    ['recipe_ids', 'j'], ['updated_at', 's']
  ],
  ShoppingList: [
    ['id', 's'], ['item', 's'], ['qty', 'n'], ['unit', 's'], ['store', 's'], ['section', 's'],
    ['reason', 's'], ['on_sale', 's'], ['sale_price', 'n'], ['checked', 's'], ['notes', 's'],
    ['updated_at', 's']
  ],
  Gaps: [
    ['id', 's'], ['item', 's'], ['type', 's'], ['recipe_id', 's'], ['date', 's'],
    ['swap_used', 's'], ['updated_at', 's']
  ]
};

// ---------- entry points ----------

// GET never returns data, so the token never has to appear in a URL.
function doGet() {
  return respond_(function () {
    return { service: 'scholz-kitchen', version: API_VERSION, hint: 'POST text/plain JSON with a token' };
  });
}

function doPost(e) {
  return respond_(function () {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      throw new Error('Body is not valid JSON');
    }
    checkToken_(body.token);
    if (body.action === 'ping') {
      return { version: API_VERSION, tables: Object.keys(SCHEMA) };
    }
    if (body.action === 'read') {
      var names = body.tables && body.tables.length ? body.tables : Object.keys(SCHEMA);
      var data = {};
      names.forEach(function (name) {
        requireTable_(name);
        data[name] = readTable_(name);
      });
      return { data: data, server_time: new Date().toISOString() };
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      switch (body.action) {
        case 'setup':
          return { created: setupSheet() };
        case 'upsert':
          requireTable_(body.table);
          return upsertRows_(body.table, body.rows || []);
        case 'delete':
          requireTable_(body.table);
          return deleteRows_(body.table, body.ids || []);
        case 'batch':
          // [{action:'upsert'|'delete', table, rows|ids}, ...] applied in order
          return {
            results: (body.ops || []).map(function (op) {
              requireTable_(op.table);
              return op.action === 'delete'
                ? deleteRows_(op.table, op.ids || [])
                : upsertRows_(op.table, op.rows || []);
            })
          };
        default:
          throw new Error('Unknown POST action: ' + body.action);
      }
    } finally {
      lock.releaseLock();
    }
  });
}

// ---------- setup ----------

/** Creates missing tabs and appends missing columns. Never deletes anything. */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var changes = [];
  Object.keys(SCHEMA).forEach(function (name) {
    var cols = SCHEMA[name].map(function (c) { return c[0]; });
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      changes.push('tab ' + name);
    }
    var lastCol = sheet.getLastColumn();
    var header = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    var missing = cols.filter(function (c) { return header.indexOf(c) === -1; });
    if (missing.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      changes.push(name + ': ' + missing.join(', '));
    }
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
    // Plain text everywhere so Sheets never turns "2026-10-25" into a Date.
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setNumberFormat('@');
  });
  var stray = ss.getSheetByName('Sheet1');
  if (stray && stray.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(stray);
  }
  return changes;
}

// ---------- table io ----------

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing tab "' + name + '". Run setup.');
  return sheet;
}

function header_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('Tab "' + sheet.getName() + '" has no header. Run setup.');
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
}

function types_(name) {
  var t = {};
  SCHEMA[name].forEach(function (c) { t[c[0]] = c[1]; });
  return t;
}

function readTable_(name) {
  var sheet = getSheet_(name);
  var header = header_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var types = types_(name);
  var values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  var rows = [];
  values.forEach(function (vals) {
    var row = {};
    var empty = true;
    header.forEach(function (col, i) {
      if (!types[col]) return; // ignore columns not in schema (e.g. user notes)
      var v = fromCell_(vals[i], types[col]);
      if (v !== '' && v !== null) empty = false;
      row[col] = v;
    });
    if (!empty && row.id) rows.push(row);
  });
  return rows;
}

function fromCell_(v, type) {
  if (v instanceof Date) {
    v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (v === null || v === undefined) v = '';
  if (type === 'n') {
    if (v === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  if (type === 'j') {
    if (v === '') return [];
    try { return JSON.parse(v); } catch (e) { return []; }
  }
  return String(v);
}

function toCell_(v, type) {
  if (v === null || v === undefined) return '';
  if (type === 'j') return typeof v === 'string' ? v : JSON.stringify(v);
  if (type === 'n') return v === '' ? '' : String(v);
  return String(v);
}

function upsertRows_(name, rows) {
  var sheet = getSheet_(name);
  var header = header_(sheet);
  var types = types_(name);
  var idCol = header.indexOf('id');
  var updCol = header.indexOf('updated_at');
  var lastRow = sheet.getLastRow();
  var values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, header.length).getValues() : [];
  var index = {};
  values.forEach(function (vals, i) { if (vals[idCol] !== '') index[String(vals[idCol])] = i; });

  var now = new Date().toISOString();
  var inserted = 0, updated = 0;
  var touched = {};
  rows.forEach(function (row) {
    if (!row || typeof row !== 'object') return;
    var id = row.id ? String(row.id) : newId_(name);
    var i = index[id];
    var vals;
    if (i === undefined) {
      vals = header.map(function () { return ''; });
      values.push(vals);
      i = values.length - 1;
      index[id] = i;
      inserted++;
    } else {
      vals = values[i];
      updated++;
    }
    header.forEach(function (col, c) {
      if (col === 'id') vals[c] = id;
      else if (col === 'updated_at') vals[c] = now;
      else if (types[col] && Object.prototype.hasOwnProperty.call(row, col)) {
        vals[c] = toCell_(row[col], types[col]);
      }
    });
    touched[i] = true;
  });
  if (values.length) {
    var range = sheet.getRange(2, 1, values.length, header.length);
    range.setNumberFormat('@');
    range.setValues(values.map(function (r) {
      return r.map(function (v) { return v instanceof Date ? fromCell_(v, 's') : v; });
    }));
  }
  var out = Object.keys(touched).map(function (i) {
    var row = {};
    header.forEach(function (col, c) { if (types[col]) row[col] = fromCell_(values[i][c], types[col]); });
    return row;
  });
  return { table: name, inserted: inserted, updated: updated, rows: out, updated_at: now };
}

function deleteRows_(name, ids) {
  var sheet = getSheet_(name);
  var header = header_(sheet);
  var idCol = header.indexOf('id');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !ids.length) return { table: name, deleted: 0 };
  var kill = {};
  ids.forEach(function (id) { kill[String(id)] = true; });
  var ids_ = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  var deleted = 0;
  // Bottom-up so row numbers stay valid.
  for (var i = ids_.length - 1; i >= 0; i--) {
    if (kill[String(ids_[i][0])]) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return { table: name, deleted: deleted };
}

// ---------- helpers ----------

var PREFIX = {
  Inventory: 'inv', ShelfLife: 'shl', Tools: 'tool', People: 'ppl', Recipes: 'rec',
  Ratings: 'rat', WeekPlan: 'wk', Events: 'evt', ShoppingList: 'shop', Gaps: 'gap'
};

function newId_(name) {
  return (PREFIX[name] || 'row') + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function requireTable_(name) {
  if (!SCHEMA[name]) throw new Error('Unknown table: ' + name);
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!expected) throw new Error('Server TOKEN not set. Add it in Project Settings > Script properties.');
  if (!token || String(token) !== expected) throw new Error('Bad token');
}

function respond_(fn) {
  var out;
  try {
    var result = fn();
    out = { ok: true };
    Object.keys(result || {}).forEach(function (k) { out[k] = result[k]; });
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
