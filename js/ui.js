// Tiny DOM helpers. h('div.card', {onclick}, 'text', child) builds elements.

export function h(sel, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs);
    attrs = {};
  }
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

let toastTimer;
export function toast(msg, { error = false } = {}) {
  let el = document.getElementById('toast');
  el.textContent = msg;
  el.className = error ? 'show error' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, error ? 4000 : 2200);
}

/** Bottom sheet. content(close) returns nodes. Resolves when closed. */
export function sheet(title, content) {
  return new Promise((resolve) => {
    const back = h('div.sheet-back');
    const close = (value) => {
      back.classList.remove('open');
      setTimeout(() => back.remove(), 200);
      resolve(value);
    };
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    const panel = h('div.sheet', { role: 'dialog', 'aria-label': title },
      h('div.sheet-head', h('h2', title), h('button.icon-btn', { onclick: () => close(), 'aria-label': 'Close' }, '✕')),
      h('div.sheet-body', content(close)));
    back.append(panel);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('open'));
  });
}

export function confirmSheet(title, message, okLabel = 'OK', { danger = false } = {}) {
  return sheet(title, (close) => [
    h('p', message),
    h('div.row-btns',
      h('button.btn', { onclick: () => close(false) }, 'Cancel'),
      h(`button.btn.${danger ? 'danger' : 'primary'}`, { onclick: () => close(true) }, okLabel)),
  ]);
}

export function select(name, options, value, attrs = {}) {
  return h('select', { name, ...attrs },
    options.map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, o === '' ? '—' : o];
      return h('option', { value: v, selected: v === (value ?? '') }, label);
    }));
}

export function field(label, control, hint) {
  return h('label.field', h('span.field-label', label), control, hint ? h('small.hint', hint) : null);
}

export function chips(options, current, onPick, { allLabel = 'All' } = {}) {
  return h('div.chips',
    [['', allLabel], ...options.map((o) => (Array.isArray(o) ? o : [o, o]))].map(([v, label]) =>
      h('button.chip', { class: v === current ? 'on' : '', onclick: () => onPick(v) }, label)));
}

export function badge(confidence) {
  if (!confidence || confidence === 'confirmed') return null;
  return h(`span.badge.${confidence}`, confidence);
}

export const today = () => toISODate(new Date());

export function toISODate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - base) / 86400000);
}

export const label = (s) => String(s || '').replace(/_/g, ' ');

export function formValues(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? (el.checked ? 'yes' : 'no') : el.value.trim();
  }
  return out;
}
