// More: secondary screens + People preferences.

import * as store from '../store.js';
import { PEOPLE } from '../schema.js';
import { h, badge, label } from '../ui.js';
import { editPerson } from './forms.js';

export function render(el) {
  el.append(h('div.list',
    link('#/import', 'Import', 'Paste JSON from Claude chat'),
    link('#/settings', 'Settings', 'Sheet connection, store routing, backup')),
  h('p.small.muted', 'Tonight, Week, Rate, and Events arrive in Phase 2.'));

  for (const person of PEOPLE) {
    const prefs = store.rows('People').filter((p) => p.person === person);
    el.append(h('div.group-title', h('span', `${person}'s preferences`), h('span', String(prefs.length))));
    if (!prefs.length) { el.append(h('div.list', h('div.item.muted', 'None yet'))); continue; }
    for (const type of ['hard_no', 'soft_no', 'favorite']) {
      const list = prefs.filter((p) => p.type === type).sort((a, b) => a.item.localeCompare(b.item));
      if (!list.length) continue;
      el.append(h('div.list', list.map((p) => h('div.item.tap', { onclick: () => editPerson(p) },
        h(`span.pill.${type === 'hard_no' ? 'hard' : type === 'soft_no' ? 'soft' : 'fav'}`, label(type)),
        h('div.grow', h('div.name', p.item, badge(p.confidence)), p.notes ? h('div.sub', p.notes) : null)))));
    }
  }
  el.append(h('button.btn.block.mt', { onclick: () => editPerson() }, '+ Add preference'));
}

function link(href, title, sub) {
  return h('a.item.tap', { href, style: { color: 'inherit', textDecoration: 'none' } },
    h('div.grow', h('div.name', title), h('div.sub', sub)), h('span.muted', '›'));
}
