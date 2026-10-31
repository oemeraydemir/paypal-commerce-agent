import { CatalogService } from '../catalog/service';

/**
 * Wellbeing Guard: an honest, advisory diet-label check for a cart.
 *
 * What it is NOT: an allergy-safety or dietary-compliance check. The catalog's diet
 * labels are SAMPLE DATA that the café has not verified, and the café publishes no
 * allergen data at all. So this module
 *   - never returns "safe", "suitable" or "compliant" for anything,
 *   - only reports whether an item CARRIES a label in the sample data,
 *   - always attaches the data status and a "check with the café" notice,
 *   - never receives allergens (they stay on the shopper's device by design), and
 *   - never stores or logs the shopper's preference (stateless, request-scoped).
 */

export const DIETARY_DATA_STATUS = 'SAMPLE_DATA_UNVERIFIED' as const;
export const SUPPORTED_DIETS = ['vegetarian', 'vegan', 'gluten-free'] as const;
export type SupportedDiet = (typeof SUPPORTED_DIETS)[number];

export const DIETARY_NOTICE =
  'Diet labels are sample data and have not been verified by the café. This is not an allergy-safety or dietary-compliance check. Ask the café before you order.';

export type ItemLabelStatus = 'NO_PREFERENCE' | 'CARRIES_LABEL' | 'NO_LABEL';
export type OverallLabelStatus = 'NO_PREFERENCE' | 'ALL_ITEMS_CARRY_LABEL' | 'SOME_ITEMS_LACK_LABEL';

export interface WellbeingItemResult {
  productId: string;
  name: string;
  quantity: number;
  /** Labels exactly as they appear in the sample catalog (informational only). */
  dietaryLabels: string[];
  labelStatus: ItemLabelStatus;
}

export interface WellbeingResult {
  dataStatus: typeof DIETARY_DATA_STATUS;
  notice: string;
  diet: SupportedDiet | null;
  overall: OverallLabelStatus;
  /** Always true: the guard never replaces the shopper's own check with the café. */
  confirmWithCafe: true;
  allergens: { status: 'NO_DATA'; message: string };
  items: WellbeingItemResult[];
}

// A vegan label also satisfies a vegetarian preference; nothing else is inferred.
const ACCEPTED_LABELS: Record<SupportedDiet, string[]> = {
  vegetarian: ['vegetarian', 'vegan'],
  vegan: ['vegan'],
  'gluten-free': ['gluten-free'],
};

export function parseDiet(raw: unknown): SupportedDiet | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'string' && (SUPPORTED_DIETS as readonly string[]).includes(raw)) {
    return raw as SupportedDiet;
  }
  throw new RangeError('unsupported diet');
}

export function evaluateWellbeing(
  items: Array<{ productId: string; quantity: number }>,
  diet: SupportedDiet | null,
  catalog: CatalogService
): WellbeingResult {
  const results: WellbeingItemResult[] = items.map((i) => {
    const p = catalog.getById(i.productId);
    const labels = p ? p.dietary : [];
    let status: ItemLabelStatus = 'NO_PREFERENCE';
    if (diet) status = labels.some((l) => ACCEPTED_LABELS[diet].includes(l)) ? 'CARRIES_LABEL' : 'NO_LABEL';
    return { productId: i.productId, name: p ? p.name : i.productId, quantity: i.quantity, dietaryLabels: labels, labelStatus: status };
  });
  let overall: OverallLabelStatus = 'NO_PREFERENCE';
  if (diet) overall = results.every((r) => r.labelStatus === 'CARRIES_LABEL') ? 'ALL_ITEMS_CARRY_LABEL' : 'SOME_ITEMS_LACK_LABEL';
  return {
    dataStatus: DIETARY_DATA_STATUS,
    notice: DIETARY_NOTICE,
    diet,
    overall,
    confirmWithCafe: true,
    allergens: {
      status: 'NO_DATA',
      message: 'The café publishes no allergen data, so no item can be confirmed allergen-free. Ask the café about any allergy.',
    },
    items: results,
  };
}
