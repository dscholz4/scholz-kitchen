// Fuzzy matching between free-text food names: People dislikes vs recipe
// ingredients, inventory vs recipe ingredients.

import { rows } from './store.js';

const STOP = new Set(['very', 'wet', 'food', 'other', 'plain', 'red', 'white', 'yellow', 'whole', 'fresh', 'any', 'all', 'optional', 'additional', 'large', 'small', 'thin', 'thick', 'ground', 'frozen']);
// Category words that should also catch specific members.
const ALIASES = {
  fish: ['salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'anchov', 'sardine', 'mahi', 'swordfish', 'catfish', 'pollock', 'haddock', 'bass'],
};

export const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sing = (w) => w.replace(/(oes|ies)$/, (m) => (m === 'ies' ? 'y' : 'o')).replace(/([^s])s$/, '$1');
const singAll = (s) => norm(s).split(' ').map(sing).join(' ');

/** Does free text `text` mention food `item` (e.g. a People row)? */
export function mentions(text, item) {
  const t = ` ${singAll(text)} `;
  const it = singAll(item);
  if (!it) return false;
  if (t.includes(` ${it} `)) return true;
  const head = it.split(' ')[0];
  if (head.length >= 4 && !STOP.has(head) && t.includes(` ${head} `)) return true;
  for (const a of ALIASES[head] || []) if (t.includes(` ${a}`)) return true;
  return false;
}

/** Exceptions written into a dislike, e.g. "fish other than shrimp" excludes shrimp. */
function excepted(text, item) {
  const m = norm(item).match(/(?:other than|except|but not) (.+)$/);
  return m ? mentions(text, m[1]) : false;
}

/**
 * Preference hits for a recipe. Returns [{person, kind:'hard'|'soft'|'fav', item, where, notes, confidence}]
 * Unsure hard_nos are downgraded to soft (house rule).
 */
export function preferenceHits(recipe) {
  const texts = [
    ...(recipe.ingredients || []).map((i) => ({ text: i.name, where: i.name })),
    { text: recipe.name, where: 'recipe name' },
  ];
  const out = [];
  for (const p of rows('People')) {
    for (const { text, where } of texts) {
      if (!mentions(text, p.item) || excepted(text, p.item)) continue;
      let kind = p.type === 'hard_no' ? 'hard' : p.type === 'soft_no' ? 'soft' : 'fav';
      if (kind === 'hard' && p.confidence === 'unsure') kind = 'soft';
      out.push({ person: p.person, kind, item: p.item, where, notes: p.notes, confidence: p.confidence });
      break;
    }
  }
  const rank = { hard: 0, soft: 1, fav: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/** Active inventory row that plausibly covers an ingredient name, or null. */
export function inStock(name) {
  const n = singAll(name);
  return rows('Inventory').find((r) => r.status === 'active'
    && r.level !== 'out'
    && (r.level || r.qty != null)
    && (singAll(r.name) === n || mentions(name, r.name) || mentions(r.name, name))) || null;
}

/** Tool row matching a recipe's tool name, or null. */
export function ownedTool(name) {
  return rows('Tools').find((t) => mentions(t.name, name) || mentions(name, t.name)) || null;
}
