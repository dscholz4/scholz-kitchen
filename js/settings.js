// Per-device settings in localStorage. Never committed, never sent anywhere but the API.

import { DEFAULT_ROUTING } from './schema.js';

const KEY = 'sk.settings';

export function getSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage blocked */ }
  return { url: '', token: '', ...s, routing: { ...DEFAULT_ROUTING, ...(s.routing || {}) } };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

export function routeStore(section) {
  return getSettings().routing[section] || "Pick 'n Save";
}
