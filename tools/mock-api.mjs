// Dev-only: runs the real apps-script/Code.gs against an in-memory fake Sheet,
// so the app can be tested end to end without Google.
// Usage: node tools/mock-api.mjs [port]   (token is "dev-token")
// Set MOCK_DB=/path/file.json to persist the fake Sheet between runs.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const PORT = Number(process.argv[2] || 8787);
const DB = process.env.MOCK_DB;

const book = new Map(DB && existsSync(DB) ? Object.entries(JSON.parse(readFileSync(DB, 'utf8'))) : []);
const save = () => { if (DB) writeFileSync(DB, JSON.stringify(Object.fromEntries(book))); };

function makeSheet(name) {
  if (!book.has(name)) book.set(name, []);
  const data = () => book.get(name);
  const width = () => Math.max(0, ...data().map((r) => r.length));
  const sheet = {
    getName: () => name,
    getLastRow: () => data().length,
    getLastColumn: () => width(),
    getMaxRows: () => Math.max(1000, data().length),
    getMaxColumns: () => Math.max(26, width()),
    setFrozenRows() {},
    deleteRow(n) { data().splice(n - 1, 1); },
    getRange(row, col, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
          const r = data()[row - 1 + i];
          return r && r[col - 1 + j] !== undefined ? r[col - 1 + j] : '';
        })),
        setValues(vals) {
          vals.forEach((rv, i) => {
            while (data().length < row + i) data().push([]);
            const r = data()[row - 1 + i];
            rv.forEach((v, j) => { r[col - 1 + j] = v; });
          });
        },
        setNumberFormat() { return this; },
        setFontWeight() { return this; },
      };
    },
  };
  return sheet;
}

const ss = {
  getSheetByName: (n) => (book.has(n) ? makeSheet(n) : null),
  insertSheet: (n) => makeSheet(n),
  getSheets: () => [...book.keys()].map(makeSheet),
  deleteSheet: (s) => book.delete(s.getName()),
};

const context = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'TOKEN' ? 'dev-token' : null) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { getUuid: () => randomUUID(), formatDate: (d) => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'America/Chicago' },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }),
  },
  console,
});
vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), context, { filename: 'Code.gs' });

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Headers': 'content-type' }); res.end(); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const out = req.method === 'POST'
      ? context.doPost({ postData: { contents: body } })
      : context.doGet({ parameter: {} });
    if (req.method === 'POST') save();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(out.text);
  });
}).listen(PORT, () => console.log(`mock Apps Script on http://localhost:${PORT}  token: dev-token`));
