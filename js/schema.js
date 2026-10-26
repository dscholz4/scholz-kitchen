// Tables, columns and enums. MUST mirror SCHEMA in apps-script/Code.gs.
// [column, type]  type: 's' text, 'n' number, 'j' JSON

export const SCHEMA = {
  Inventory: [
    ['id', 's'], ['name', 's'], ['category', 's'], ['location', 's'], ['tracking', 's'],
    ['qty', 'n'], ['unit', 's'], ['level', 's'], ['purchased_date', 's'], ['store', 's'],
    ['opened', 's'], ['opened_date', 's'], ['expires_date', 's'], ['expires_source', 's'],
    ['status', 's'], ['notes', 's'], ['confidence', 's'], ['source', 's'], ['updated_at', 's'],
  ],
  ShelfLife: [
    ['id', 's'], ['keyword', 's'], ['category', 's'], ['pantry_days', 'n'],
    ['fridge_unopened_days', 'n'], ['fridge_opened_days', 'n'], ['freezer_days', 'n'],
    ['notes', 's'], ['updated_at', 's'],
  ],
  Tools: [
    ['id', 's'], ['name', 's'], ['category', 's'], ['notes', 's'],
    ['confidence', 's'], ['source', 's'], ['updated_at', 's'],
  ],
  People: [
    ['id', 's'], ['person', 's'], ['item', 's'], ['type', 's'], ['notes', 's'],
    ['confidence', 's'], ['source', 's'], ['updated_at', 's'],
  ],
  Recipes: [
    ['id', 's'], ['name', 's'], ['source_type', 's'], ['source_ref', 's'], ['ingredients', 'j'],
    ['tools_needed', 'j'], ['cuisine', 's'], ['effort', 's'], ['active_minutes', 'n'],
    ['leftover_friendly', 's'], ['servings', 'n'], ['tags', 'j'], ['my_notes', 's'],
    ['status', 's'], ['confidence', 's'], ['source', 's'], ['updated_at', 's'],
  ],
  Ratings: [
    ['id', 's'], ['recipe_id', 's'], ['date', 's'], ['person', 's'], ['stars', 'n'],
    ['make_again', 's'], ['notes', 's'], ['updated_at', 's'],
  ],
  WeekPlan: [
    ['id', 's'], ['week_start', 's'], ['date', 's'], ['who_home', 's'], ['cooking', 's'],
    ['recipe_id', 's'], ['backup_recipe_id', 's'], ['notes', 's'], ['updated_at', 's'],
  ],
  Events: [
    ['id', 's'], ['date', 's'], ['headcount', 'n'], ['menu_ideas', 's'], ['guest_notes', 's'],
    ['recipe_ids', 'j'], ['updated_at', 's'],
  ],
  ShoppingList: [
    ['id', 's'], ['item', 's'], ['qty', 'n'], ['unit', 's'], ['store', 's'], ['section', 's'],
    ['reason', 's'], ['on_sale', 's'], ['sale_price', 'n'], ['checked', 's'], ['notes', 's'],
    ['updated_at', 's'],
  ],
  Gaps: [
    ['id', 's'], ['item', 's'], ['type', 's'], ['recipe_id', 's'], ['date', 's'],
    ['swap_used', 's'], ['updated_at', 's'],
  ],
};

export const TABLES = Object.keys(SCHEMA);

export const PREFIX = {
  Inventory: 'inv', ShelfLife: 'shl', Tools: 'tool', People: 'ppl', Recipes: 'rec',
  Ratings: 'rat', WeekPlan: 'wk', Events: 'evt', ShoppingList: 'shop', Gaps: 'gap',
};

export const STORES = [
  'Aldi', "Pick 'n Save", "Karl's Country Market", "Woodman's", 'Kwik Trip',
  'Piggly Wiggly', 'Fresh Thyme', 'other',
];

export const SECTIONS = ['produce', 'meat', 'dairy', 'bakery', 'frozen', 'pantry', 'household'];

export const DEFAULT_ROUTING = {
  meat: "Karl's Country Market",
  pantry: 'Aldi', dairy: 'Aldi', bakery: 'Aldi',
  produce: "Pick 'n Save", frozen: "Pick 'n Save", household: "Pick 'n Save",
};

export const PEOPLE = ['Dan', 'Brigitte'];

// Allowed values per table.column. Blank is always allowed.
export const ENUMS = {
  'Inventory.category': ['protein', 'produce', 'dairy', 'pantry', 'spice', 'frozen', 'condiment', 'other'],
  'Inventory.location': ['fridge', 'freezer', 'pantry', 'spice rack', 'counter'],
  'Inventory.tracking': ['exact', 'coarse'],
  'Inventory.level': ['have', 'low', 'out'],
  'Inventory.opened': ['yes', 'no'],
  'Inventory.expires_source': ['printed', 'estimated', 'manual'],
  'Inventory.status': ['active', 'used', 'tossed'],
  'Inventory.store': STORES,
  'Tools.category': ['cookware', 'bakeware', 'appliance', 'utensil', 'knife', 'other'],
  'People.person': PEOPLE,
  'People.type': ['hard_no', 'soft_no', 'favorite'],
  'Recipes.source_type': ['url', 'youtube', 'book', 'ai', 'own'],
  'Recipes.effort': ['low_energy', 'normal', 'project'],
  'Recipes.leftover_friendly': ['yes', 'no'],
  'Recipes.status': ['idea', 'active', 'less_often', 'retired'],
  'Ratings.person': PEOPLE,
  'Ratings.make_again': ['yes', 'maybe', 'no'],
  'WeekPlan.who_home': ['both', 'dan', 'brigitte', 'none'],
  'WeekPlan.cooking': ['yes', 'no', 'out'],
  'ShoppingList.store': STORES,
  'ShoppingList.section': SECTIONS,
  'ShoppingList.on_sale': ['yes', 'no'],
  'ShoppingList.checked': ['yes', 'no'],
  'Gaps.type': ['tool', 'spice', 'ingredient'],
};
for (const t of ['Inventory', 'Tools', 'People', 'Recipes']) {
  ENUMS[`${t}.confidence`] = ['confirmed', 'likely', 'unsure'];
  ENUMS[`${t}.source`] = ['chatgpt_import', 'manual', 'receipt', 'chat'];
}

// Tables shown in the Review queue (rows with confidence != confirmed).
export const REVIEWABLE = ['People', 'Recipes', 'Tools', 'Inventory'];

// Field used as a row's display title.
export const TITLE_FIELD = {
  Inventory: 'name', ShelfLife: 'keyword', Tools: 'name', People: 'item', Recipes: 'name',
  Ratings: 'recipe_id', WeekPlan: 'date', Events: 'date', ShoppingList: 'item', Gaps: 'item',
};

export const columns = (table) => SCHEMA[table].map((c) => c[0]);
export const colType = (table, col) => (SCHEMA[table].find((c) => c[0] === col) || [])[1];

export function newId(table) {
  const rand = crypto.getRandomValues(new Uint8Array(6));
  return `${PREFIX[table] || 'row'}_${Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10)}`;
}
