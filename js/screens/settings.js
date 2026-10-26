// Settings: Apps Script URL + token (stored on this device only), store routing, sync, backup.

import * as store from '../store.js';
import { call } from '../api.js';
import { getSettings, saveSettings } from '../settings.js';
import { SECTIONS, STORES, DEFAULT_ROUTING } from '../schema.js';
import { h, field, select, toast, confirmSheet, label } from '../ui.js';

let typing = false;
export const keepOnRefresh = () => typing;
const focusTrack = { onfocus: () => { typing = true; }, onblur: () => { typing = false; } };

export function render(el) {
  const s = getSettings();
  const url = h('input', { type: 'url', value: s.url, placeholder: 'https://script.google.com/macros/s/…/exec', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', ...focusTrack });
  const token = h('input', { type: 'password', value: s.token, placeholder: 'shared secret', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', ...focusTrack });
  const result = h('div');

  const connect = async (setup) => {
    saveSettings({ url: url.value.trim(), token: token.value.trim() });
    result.replaceChildren(h('p.muted.small', setup ? 'Setting up Sheet…' : 'Testing…'));
    try {
      if (setup) {
        const r = await call('setup');
        result.replaceChildren(h('div.ok-box', r.created.length ? `Created: ${r.created.join('; ')}` : 'Sheet already up to date.'));
      } else {
        const r = await call('ping');
        result.replaceChildren(h('div.ok-box', `Connected. API v${r.version}, ${r.tables.length} tables.`));
      }
      await store.sync();
    } catch (err) {
      result.replaceChildren(h('div.err-box', err.message));
    }
  };

  const st = store.status();
  el.append(
    h('div.card',
      h('h3', 'Google Sheet connection'),
      h('p.small.muted', 'Stored only on this device. See docs/SETUP.md for how to get these.'),
      field('Apps Script web app URL', url),
      field('Secret token', token),
      h('div.row-btns',
        h('button.btn', { onclick: () => connect(true) }, 'Set up Sheet'),
        h('button.btn.primary', { onclick: () => connect(false) }, 'Save & test')),
      result),

    h('div.card',
      h('h3', 'Sync'),
      h('p.small.muted', [
        st.lastSync ? `Last synced ${new Date(st.lastSync).toLocaleString()}` : 'Never synced',
        st.pending ? ` · ${st.pending} change(s) waiting` : '',
        st.error ? ` · ${st.error}` : '',
      ].join('')),
      h('div.row-btns',
        h('button.btn', { onclick: () => store.sync().then(() => toast(store.status().error || 'Synced', { error: Boolean(store.status().error) })) }, 'Sync now'),
        h('button.btn', { onclick: backup }, 'Download backup'))),

    routingCard(),

    h('div.card',
      h('h3', 'This device'),
      h('p.small.muted', 'Clears the local copy. Data in the Sheet is not touched; it reloads on next sync. Unsynced changes are lost.'),
      h('button.btn.danger.block', {
        onclick: async () => {
          if (await confirmSheet('Clear local data?', `${store.status().pending} unsynced change(s) will be lost.`, 'Clear', { danger: true })) {
            store.clearCache();
            toast('Local data cleared');
            store.sync();
          }
        },
      }, 'Clear local data')),
    h('p.small.muted', { style: { textAlign: 'center' } }, 'Scholz Kitchen · Phase 1'));
}

function routingCard() {
  const s = getSettings();
  const rows = SECTIONS.map((sec) => field(label(sec), select(sec, STORES, s.routing[sec], {
    onchange: (e) => {
      saveSettings({ routing: { ...getSettings().routing, [sec]: e.target.value } });
      toast(`${label(sec)} → ${e.target.value}`);
    },
  })));
  return h('div.card',
    h('h3', 'Default store routing'),
    h('p.small.muted', 'New shopping items go to this store unless a sale moves them.'),
    h('div.grid2', rows),
    h('button.btn.small', {
      onclick: () => { saveSettings({ routing: { ...DEFAULT_ROUTING } }); toast('Routing reset'); location.reload(); },
    }, 'Reset to defaults'));
}

function backup() {
  const blob = new Blob([JSON.stringify(store.exportAll(), null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `scholz-kitchen-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
