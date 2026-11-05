import { createHash } from 'crypto';
import { CatalogService, Product } from '../catalog/service';

export const WELLBEING_DIETS = ['vegetarian', 'vegan', 'gluten-free'] as const;
export const WELLBEING_ALLERGENS = ['gluten', 'dairy', 'tree-nut', 'peanut', 'soy', 'egg', 'fish', 'shellfish'] as const;
export type WellbeingPreferences = { dietary: string[]; allergens: string[] };
export type WellbeingStatus = 'CONFIRMED_CONFLICT' | 'NO_KNOWN_CONFLICT' | 'UNKNOWN';
type FactStatus = 'CONFLICT' | 'NO_CONFLICT' | 'UNKNOWN';
/** Where a single ingredient/diet fact came from. `null` means the merchant
 *  supplied no information at all for that restriction. */
type FactSource = 'merchant-declared' | 'merchant-label' | 'merchant-ingredients' | null;
type ProductFact = { status: FactStatus; ingredients?: string[]; source: FactSource };

/** One restriction evaluated against one product. Kept separate from the
 *  roll-up status so the UI never collapses ingredient facts and cross-contact
 *  into a single misleading "suitable" verdict. */
export type WellbeingFact = {
  restriction: string; // e.g. 'allergen:gluten'
  kind: 'dietary' | 'allergen';
  key: string;         // e.g. 'gluten'
  status: FactStatus;
  ingredients: string[];
  source: FactSource;
};
export type WellbeingItem = { productId: string; name: string; quantity: number; status: WellbeingStatus; conflicts: Array<{ restriction: string; ingredients: string[] }>; missing: string[]; facts: WellbeingFact[]; productDataVersion: string };
export type WellbeingDecision = {
  status: WellbeingStatus;
  allowed: boolean;
  items: WellbeingItem[];
  alternatives: Array<{ productId: string; name: string; productDataVersion: string }>;
  productDataVersion: string;
  notice: string;
  /** Exactly the sensitivities the shopper selected, never inferred. */
  checked: Array<{ restriction: string; kind: 'dietary' | 'allergen'; key: string }>;
  /** Provenance of the information, deliberately marked unverified. */
  source: { type: 'merchant-menu'; verified: false; dataVersion: string };
  /** FDA-aligned separation: ingredient facts and cross-contact are distinct.
   *  No merchant cross-contact data is published for this demo menu. */
  crossContact: { assessed: false; merchantData: false };
};

export const WELLBEING_NOTICE = 'Decisions are based on merchant-provided product information. This is not medical advice. Cross-contact and preparation information was not provided and has not been assessed.';
export const DIETARY_DATA_STATUS = 'MERCHANT_DATA_REQUIRED' as const;
export const DIETARY_NOTICE = 'Dietary and allergen decisions require verified merchant-provided product information. Unknown information is not treated as safe.';

export function parseWellbeingPreferences(raw: any): WellbeingPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.dietary) || !Array.isArray(raw.allergens)) throw new RangeError('dietary and allergens arrays are required');
  const clean = (values: unknown[], allowed: readonly string[], name: string) => {
    if (values.length > allowed.length || values.some(v => typeof v !== 'string' || !allowed.includes(v))) throw new RangeError(`unsupported ${name} preference`);
    return [...new Set(values as string[])].sort();
  };
  return { dietary: clean(raw.dietary, WELLBEING_DIETS, 'dietary'), allergens: clean(raw.allergens, WELLBEING_ALLERGENS, 'allergen') };
}

function versionFor(product: Product): string {
  return createHash('sha256').update(JSON.stringify({ declaredVersion: product.wellbeing?.dataVersion ?? null, wellbeing: product.wellbeing ?? null, dietary: product.dietary, description: product.description })).digest('hex');
}

// Merchant-provided ingredient keyword lists (kept conservative: a hit only flags a
// confirmed conflict when the merchant text names that ingredient; silence stays UNKNOWN).
const GLUTEN_WORDS = ['bread', 'toast', 'flour', 'wheat', 'granola', 'pasta', 'sandwich', 'bun', 'croissant', 'pastry', 'pastries', 'cake', 'cakes', 'brownie', 'brownies', 'biscuit', 'biscuits', 'biscotti', 'bagel', 'bagels', 'muffin', 'muffins', 'waffle', 'waffles', 'pancake', 'pancakes', 'couscous', 'barley', 'beer', 'pretzel', 'pretzels', 'tortilla', 'tortillas', 'pizza', 'noodle', 'noodles', 'crouton', 'croutons', 'cracker', 'crackers', 'ciabatta', 'panini', 'panino', 'focaccia', 'sourdough', 'baguette'];
const DAIRY_WORDS = ['milk', 'cheese', 'cheesecake', 'butter', 'cream', 'yogurt', 'yoghurt', 'latte', 'mozzarella', 'cheddar', 'feta', 'mascarpone', 'ice cream', 'whey', 'parmesan', 'ricotta'];
const EGG_WORDS = ['egg', 'eggs', 'mayo', 'mayonnaise', 'aioli', 'meringue', 'custard', 'omelette', 'omelet'];
const TREE_NUT_WORDS = ['almond', 'almonds', 'walnut', 'hazelnut', 'pecan', 'pistachio', 'cashew', 'macadamia', 'nut', 'nuts'];
const PEANUT_WORDS = ['peanut', 'peanuts', 'groundnut'];
const SOY_WORDS = ['soy', 'soya', 'tofu', 'edamame', 'tamari', 'miso'];
const FISH_WORDS = ['fish', 'salmon', 'tuna', 'anchovy', 'sardine', 'trout', 'cod', 'halibut'];
const SHELLFISH_WORDS = ['shrimp', 'prawn', 'crab', 'lobster', 'mussel', 'mussels', 'clam', 'oyster', 'squid', 'calamari', 'scallop'];

const ALLERGEN_WORDS: Record<string, string[]> = {
  dairy: DAIRY_WORDS,
  egg: EGG_WORDS,
  'tree-nut': TREE_NUT_WORDS,
  peanut: PEANUT_WORDS,
  soy: SOY_WORDS,
  fish: FISH_WORDS,
  shellfish: SHELLFISH_WORDS,
};

function menuText(product: Product): string {
  return (product.name + ' ' + product.description).toLocaleLowerCase();
}

// Resolve one dietary/allergen restriction using ONLY merchant-provided data:
// declared facts first, then dietary labels, then a keyword scan of the merchant-written
// ingredient description. An absent signal stays undefined -> reported as UNKNOWN,
// never guessed as safe (matches FDA guidance: no "suitable"/"safe" without verified facts).
function factFor(product: Product, kind: 'dietary' | 'allergens', restriction: string): ProductFact | undefined {
  const declared = product.wellbeing?.[kind]?.[restriction];
  if (declared && declared.status !== 'UNKNOWN') return { ...declared, source: 'merchant-declared' };
  if (kind === 'dietary') {
    if (product.dietary.includes(restriction)) return { status: 'NO_CONFLICT', source: 'merchant-label' };
    return undefined;
  }
  const text = menuText(product);
  if (restriction === 'gluten') {
    if (product.dietary.includes('gluten-free')) return { status: 'NO_CONFLICT', source: 'merchant-label' };
    const hits = GLUTEN_WORDS.filter((w) => text.includes(w));
    return hits.length ? { status: 'CONFLICT', ingredients: hits.slice(0, 3), source: 'merchant-ingredients' } : undefined;
  }
  const words = ALLERGEN_WORDS[restriction];
  if (!words) return undefined;
  const ingredients = words.filter((w) => text.includes(w));
  // "coconut milk" is not a dairy marker.
  if (restriction === 'dairy' && ingredients.includes('milk') && text.includes('coconut milk')) {
    ingredients.splice(ingredients.indexOf('milk'), 1);
  }
  return ingredients.length ? { status: 'CONFLICT', ingredients: ingredients.slice(0, 3), source: 'merchant-ingredients' } : undefined;
}

export function evaluateWellbeing(items: Array<{ productId: string; quantity: number }>, preferences: WellbeingPreferences, catalog: CatalogService): WellbeingDecision {
  const checked: WellbeingDecision['checked'] = [
    ...preferences.dietary.map(key => ({ restriction: `dietary:${key}`, kind: 'dietary' as const, key })),
    ...preferences.allergens.map(key => ({ restriction: `allergen:${key}`, kind: 'allergen' as const, key })),
  ];
  const evaluated = items.map((item): WellbeingItem => {
    const product = catalog.getById(item.productId);
    if (!product) throw new RangeError('Product unavailable');
    const conflicts: WellbeingItem['conflicts'] = [];
    const missing: string[] = [];
    const facts: WellbeingFact[] = [];
    const record = (kind: 'dietary' | 'allergen', factKind: 'dietary' | 'allergens', key: string) => {
      const restriction = `${kind}:${key}`;
      const fact = factFor(product, factKind, key);
      const factStatus: FactStatus = !fact || fact.status === 'UNKNOWN' ? 'UNKNOWN' : fact.status;
      facts.push({
        restriction, kind, key, status: factStatus,
        ingredients: fact?.ingredients ?? [],
        source: fact?.source ?? null,
      });
      if (factStatus === 'UNKNOWN') missing.push(restriction);
      else if (factStatus === 'CONFLICT') conflicts.push({ restriction, ingredients: fact?.ingredients ?? [] });
    };
    for (const key of preferences.dietary) record('dietary', 'dietary', key);
    for (const key of preferences.allergens) record('allergen', 'allergens', key);
    const status: WellbeingStatus = conflicts.length ? 'CONFIRMED_CONFLICT' : missing.length ? 'UNKNOWN' : 'NO_KNOWN_CONFLICT';
    return { productId: product.id, name: product.name, quantity: item.quantity, status, conflicts, missing, facts, productDataVersion: versionFor(product) };
  });
  const status: WellbeingStatus = evaluated.some(i => i.status === 'CONFIRMED_CONFLICT') ? 'CONFIRMED_CONFLICT' : evaluated.some(i => i.status === 'UNKNOWN') ? 'UNKNOWN' : 'NO_KNOWN_CONFLICT';
  const productDataVersion = createHash('sha256').update(evaluated.map(i => `${i.productId}:${i.productDataVersion}`).sort().join('|')).digest('hex');
  const currentIds = new Set(items.map(i => i.productId));
  const alternatives = status === 'NO_KNOWN_CONFLICT' ? [] : catalog.getAll().filter(product => {
    if (currentIds.has(product.id)) return false;
    const restrictions: Array<[string, any]> = [
      ...preferences.dietary.map(key => [`dietary:${key}`, factFor(product, 'dietary', key)] as [string, any]),
      ...preferences.allergens.map(key => [`allergen:${key}`, factFor(product, 'allergens', key)] as [string, any]),
    ];
    return restrictions.every(([, fact]) => fact?.status === 'NO_CONFLICT');
  }).map(product => ({ productId: product.id, name: product.name, productDataVersion: versionFor(product) }));
  return {
    status, allowed: status === 'NO_KNOWN_CONFLICT', items: evaluated, alternatives,
    productDataVersion, notice: WELLBEING_NOTICE, checked,
    source: { type: 'merchant-menu', verified: false, dataVersion: productDataVersion },
    crossContact: { assessed: false, merchantData: false },
  };
}
