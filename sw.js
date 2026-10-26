// Service worker: cache the app shell so the app (and the shopping list) opens offline.
// Bump CACHE_VERSION whenever a shell file changes.
const CACHE_VERSION = 'sk-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/api.js',
  'js/importer.js',
  'js/schema.js',
  'js/settings.js',
  'js/store.js',
  'js/ui.js',
  'js/units.js',
  'js/match.js',
  'js/screens/kitchen.js',
  'js/screens/recipes.js',
  'js/screens/shopping.js',
  'js/screens/import.js',
  'js/screens/review.js',
  'js/screens/settings.js',
  'js/screens/more.js',
  'js/screens/forms.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only same-origin GETs. The Apps Script API is cross-origin POST and never cached.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        }
        return res;
      });
      // Cache first (instant + offline), refresh in the background.
      return hit ? (net.catch(() => hit), hit) : net.catch(() => caches.match('index.html'));
    }),
  );
});
