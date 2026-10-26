// Thin client for the Apps Script web app. Every call is a text/plain POST
// (no CORS preflight) carrying the token in the body, never in the URL.

import { getSettings } from './settings.js';

export function isConfigured() {
  const s = getSettings();
  return Boolean(s.url && s.token);
}

export async function call(action, payload = {}, { timeoutMs = 30000 } = {}) {
  const { url, token } = getSettings();
  if (!url || !token) throw new Error('Not connected. Add the Apps Script URL and token in Settings.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action, token }),
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Request timed out' : 'Network error (offline?)');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // Apps Script returns an HTML page when the deployment is wrong (e.g. access not "Anyone").
    throw new Error('Unexpected response from Apps Script. Check the deployment URL and access setting.');
  }
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json;
}
