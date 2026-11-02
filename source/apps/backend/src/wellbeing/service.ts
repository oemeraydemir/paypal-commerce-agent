import { createHash } from 'crypto';
import { CatalogService, Product } from '../catalog/service';

export const WELLBEING_DIETS = ['vegetarian', 'vegan', 'gluten-free'] as const;
export const WELLBEING_ALLERGENS = ['gluten', 'dairy', 'tree-nut', 'peanut', 'soy', 'egg', 'fish', 'shellfish'] as const;
export type WellbeingPreferences = { dietary: string[]; allergens: string[] };
export type WellbeingStatus = 'CONFIRMED_CONFLICT' | 'NO_KNOWN_CONFLICT' | 'UNKNOWN';
export type WellbeingItem = { productId: string; name: string; quantity: number; status: WellbeingStatus; conflicts: Array<{ restriction: string; ingredients: string[] }>; missing: string[]; productDataVersion: string };
export type WellbeingDecision = { status: WellbeingStatus; allowed: boolean; items: WellbeingItem[]; alternatives: Array<{ productId: string; name: string; productDataVersion: string }>; productDataVersion: string; notice: string };

export const WELLBEING_NOTICE = 'Decisions are based on merchant-provided product information. This is not medical advice. This check does not assess cross-contamination.';
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
  return createHash('sha256').update(JSON.stringify({ declaredVersion: product.wellbeing?.dataVersion ?? null, wellbeing: product.wellbeing ?? null, dietary: product.dietary })).digest('hex');
}

export function evaluateWellbeing(items: Array<{ productId: string; quantity: number }>, preferences: WellbeingPreferences, catalog: CatalogService): WellbeingDecision {
  const evaluated = items.map((item): WellbeingItem => {
    const product = catalog.getById(item.productId);
    if (!product) throw new RangeError('Product unavailable');
    const conflicts: WellbeingItem['conflicts'] = [];
    const missing: string[] = [];
    for (const restriction of preferences.dietary) {
      const fact = product.wellbeing?.dietary?.[restriction];
      if (!fact || fact.status === 'UNKNOWN') missing.push(`dietary:${restriction}`);
      else if (fact.status === 'CONFLICT') conflicts.push({ restriction: `dietary:${restriction}`, ingredients: fact.ingredients ?? [] });
    }
    for (const restriction of preferences.allergens) {
      const fact = product.wellbeing?.allergens?.[restriction];
      if (!fact || fact.status === 'UNKNOWN') missing.push(`allergen:${restriction}`);
      else if (fact.status === 'CONFLICT') conflicts.push({ restriction: `allergen:${restriction}`, ingredients: fact.ingredients ?? [] });
    }
    const status: WellbeingStatus = conflicts.length ? 'CONFIRMED_CONFLICT' : missing.length ? 'UNKNOWN' : 'NO_KNOWN_CONFLICT';
    return { productId: product.id, name: product.name, quantity: item.quantity, status, conflicts, missing, productDataVersion: versionFor(product) };
  });
  const status: WellbeingStatus = evaluated.some(i => i.status === 'CONFIRMED_CONFLICT') ? 'CONFIRMED_CONFLICT' : evaluated.some(i => i.status === 'UNKNOWN') ? 'UNKNOWN' : 'NO_KNOWN_CONFLICT';
  const productDataVersion = createHash('sha256').update(evaluated.map(i => `${i.productId}:${i.productDataVersion}`).sort().join('|')).digest('hex');
  const currentIds = new Set(items.map(i => i.productId));
  const alternatives = status === 'NO_KNOWN_CONFLICT' ? [] : catalog.getAll().filter(product => {
    if (currentIds.has(product.id)) return false;
    const restrictions: Array<[string, any]> = [
      ...preferences.dietary.map(key => [`dietary:${key}`, product.wellbeing?.dietary?.[key]] as [string, any]),
      ...preferences.allergens.map(key => [`allergen:${key}`, product.wellbeing?.allergens?.[key]] as [string, any]),
    ];
    return restrictions.every(([, fact]) => fact?.status === 'NO_CONFLICT');
  }).map(product => ({ productId: product.id, name: product.name, productDataVersion: versionFor(product) }));
  return { status, allowed: status === 'NO_KNOWN_CONFLICT', items: evaluated, alternatives, productDataVersion, notice: WELLBEING_NOTICE };
}
