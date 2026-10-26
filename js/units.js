// Metric conversion. Weights -> g, volumes -> ml, counts stay counts.
// Volume-to-weight uses ingredient-specific densities (grams per US cup),
// never one generic number. Unknown ingredient + volume unit -> ml.

const WEIGHT = { g: 1, gram: 1, grams: 1, kg: 1000, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592, oz: 28.3495, ounce: 28.3495, ounces: 28.3495 };
const VOLUME = {
  ml: 1, l: 1000, liter: 1000, litre: 1000,
  tsp: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  tbsp: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  cup: 236.588, cups: 236.588, 'fl oz': 29.5735, floz: 29.5735,
  pint: 473.176, quart: 946.353, gallon: 3785.41,
};
const COUNT = { ea: 'ea', each: 'ea', whole: 'ea', count: 'ea', ct: 'ea', pc: 'ea', pcs: 'ea', piece: 'ea', pieces: 'ea', x: 'ea' };

// grams per US cup (King Arthur / USDA figures). Longest matching key wins.
const G_PER_CUP = {
  'all-purpose flour': 120, 'flour': 120, 'bread flour': 120, 'whole wheat flour': 113,
  'granulated sugar': 200, 'white sugar': 200, 'sugar': 200, 'brown sugar': 213,
  'powdered sugar': 120, 'butter': 227, 'honey': 340, 'maple syrup': 322,
  'rice': 185, 'basmati rice': 185, 'oats': 90, 'rolled oats': 90, 'panko': 60,
  'breadcrumbs': 112, 'parmesan': 100, 'shredded cheese': 113, 'cheddar': 113,
  'cocoa': 84, 'cornstarch': 128, 'peanut butter': 270, 'chocolate chips': 170,
  'cream cheese': 232, 'greek yogurt': 245, 'yogurt': 245, 'sour cream': 230,
  'mayonnaise': 220, 'blueberries': 148, 'spinach': 30, 'shredded chicken': 140,
  'cooked rice': 158, 'quinoa': 170, 'pasta': 100, 'frozen peas': 134, 'corn': 154,
};
// Liquids measured by volume stay in ml (that is the house rule).
const LIQUID = ['water', 'milk', 'buttermilk', 'almond milk', 'broth', 'stock', 'oil', 'vinegar', 'juice', 'soy sauce', 'aminos', 'worcestershire', 'wine', 'cream', 'heavy cream', 'sauce'];

const r1 = (n) => Math.round(n * 10) / 10;
const pretty = (n) => (n >= 20 ? Math.round(n) : r1(n));

const longestMatch = (n, keys) => keys.reduce((best, k) => (n.includes(k) && k.length > best.length ? k : best), '');

// The more specific match wins: "cream cheese" is a solid, "heavy cream" a liquid.
function densityFor(name = '') {
  const n = name.toLowerCase();
  const solid = longestMatch(n, Object.keys(G_PER_CUP));
  const liquid = longestMatch(n, LIQUID);
  return solid && solid.length > liquid.length ? G_PER_CUP[solid] : null;
}

/**
 * toMetric(1.5, 'lb', 'ground beef') -> {qty: 680, unit: 'g', note: 'orig: 1.5 lb', converted: true}
 * qty may be null (unknown) and passes through.
 */
export function toMetric(qty, unit, name = '') {
  const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
  if (!u) return { qty, unit: '', converted: false };
  if (COUNT[u]) return { qty, unit: 'ea', converted: false };
  if (u === 'g' || u === 'ml') return { qty, unit: u, converted: false };
  const orig = qty == null ? null : `orig: ${qty} ${unit}`;
  if (WEIGHT[u]) {
    return { qty: qty == null ? null : pretty(qty * WEIGHT[u]), unit: 'g', note: orig, converted: true };
  }
  if (VOLUME[u]) {
    const ml = qty == null ? null : qty * VOLUME[u];
    const gpc = ['ml', 'l', 'liter', 'litre'].includes(u) ? null : densityFor(name);
    if (gpc) {
      return { qty: ml == null ? null : pretty((ml / 236.588) * gpc), unit: 'g', note: orig, converted: true };
    }
    return { qty: ml == null ? null : pretty(ml), unit: 'ml', note: orig, converted: true };
  }
  if (u === 'stick' || u === 'sticks') {
    if (/butter/i.test(name)) return { qty: qty == null ? null : pretty(qty * 113), unit: 'g', note: orig, converted: true };
  }
  return { qty, unit: u, converted: false }; // clove, can, pkg, bunch ... stay as counts
}

export function fmtQty(qty, unit, qtyMax) {
  if (qty == null || qty === '') return '';
  const q = qtyMax != null && qtyMax !== '' && qtyMax !== qty ? `${qty}–${qtyMax}` : `${qty}`;
  if (!unit || unit === 'ea') return q;
  if (unit === 'g' && qty >= 1000 && !qtyMax) return `${r1(qty / 1000)} kg`;
  return `${q} ${unit}`;
}

// +/- step for exact-tracked items.
export function stepFor(unit, qty) {
  if (unit === 'g' || unit === 'ml') return qty > 500 ? 100 : qty > 100 ? 50 : 10;
  return 1;
}
