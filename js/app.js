import * as store from './store.js';
import { isConfigured } from './api.js';
import { h, clear } from './ui.js';
import { reviewQueue } from './screens/review.js';

const ICONS = {
  shopping: '<path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/>',
  kitchen: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M5 10h14M8 6v1.5M8 13v3"/>',
  recipes: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/><path d="M9 7h7M9 11h5"/>',
  review: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
};

const TABS = [
  ['shopping', 'Shopping'],
  ['kitchen', 'Kitchen'],
  ['recipes', 'Recipes'],
  ['review', 'Review'],
  ['more', 'More'],
];

// route -> [module path, title, tab]
const ROUTES = {
  shopping: ['./screens/shopping.js', 'Shopping', 'shopping'],
  kitchen: ['./screens/kitchen.js', 'Kitchen', 'kitchen'],
  recipes: ['./screens/recipes.js', 'Recipes', 'recipes'],
  recipe: ['./screens/recipes.js', 'Recipe', 'recipes'],
  review: ['./screens/review.js', 'Review', 'review'],
  more: ['./screens/more.js', 'More', 'more'],
  import: ['./screens/import.js', 'Import', 'more'],
  settings: ['./screens/settings.js', 'Settings', 'more'],
};
const DEFAULT_ROUTE = 'kitchen';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let current = null; // {name, params, mod}

function parseHash() {
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name: ROUTES[name] ? name : DEFAULT_ROUTE, params };
}

function drawTabs(active) {
  clear(tabbar);
  const reviewCount = reviewQueue('').length;
  for (const [key, label] of TABS) {
    const a = h('a', { href: `#/${key}`, class: key === active ? 'on' : '', 'aria-current': key === active ? 'page' : null });
    a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
    a.append(h('span', label));
    if (key === 'review' && reviewCount) a.append(h('span.count', reviewCount > 99 ? '99+' : String(reviewCount)));
    tabbar.append(a);
  }
}

let routeSeq = 0;
let routing = false;
async function route() {
  const seq = ++routeSeq;
  const { name, params } = parseHash();
  const [path, title, tab] = ROUTES[name];
  const mod = await import(path);
  if (seq !== routeSeq) return; // a newer navigation won
  routing = true;
  const sameScreen = current && current.name === name && current.params.join('/') === params.join('/');
  current = { name, params, mod };
  document.getElementById('title').textContent = title;
  drawTabs(tab);
  const scroll = sameScreen ? window.scrollY : 0;
  clear(view);
  try {
    await mod.render(view, params);
  } finally {
    routing = false;
  }
  window.scrollTo(0, scroll);
}

/** Re-render the current screen in place (after data changes), keeping scroll. */
export function refresh() {
  // Skip while a navigation is rendering, or if the hash already points elsewhere.
  if (!current || routing || parseHash().name !== current.name) return;
  const keep = window.scrollY;
  // Don't clobber a screen the user is typing into.
  if (current.mod.keepOnRefresh && current.mod.keepOnRefresh()) { drawTabs(ROUTES[current.name][2]); return; }
  clear(view);
  Promise.resolve(current.mod.render(view, current.params)).then(() => window.scrollTo(0, keep));
  drawTabs(ROUTES[current.name][2]);
}

function drawSync() {
  const btn = document.getElementById('sync');
  const lbl = document.getElementById('sync-label');
  const s = store.status();
  btn.className = 'sync';
  if (!isConfigured()) { lbl.textContent = 'Local only'; return; }
  if (s.syncing) { btn.classList.add('busy'); lbl.textContent = 'Syncing'; return; }
  if (s.error) { btn.classList.add('error'); lbl.textContent = s.pending ? `${s.pending} waiting` : 'Offline'; btn.title = s.error; return; }
  if (s.pending) { btn.classList.add('pending'); lbl.textContent = `${s.pending} waiting`; return; }
  btn.classList.add('ok');
  lbl.textContent = 'Synced';
}

let refreshTimer;
store.subscribe(() => {
  drawSync();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 50);
});

document.getElementById('sync').addEventListener('click', () => {
  if (!isConfigured()) { location.hash = '#/settings'; return; }
  store.sync();
});

window.addEventListener('hashchange', route);
route();
drawSync();
store.sync();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
}
