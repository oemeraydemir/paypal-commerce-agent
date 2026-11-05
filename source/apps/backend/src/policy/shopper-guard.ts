// Wellbeing Guard: the shopper's diet and allergen concerns, held SERVER-SIDE per user so the
// authoritative PolicyService can enforce them on every checkout path (web, Flutter, AI cart,
// Split Bill). The AI can read the outcome but can never change the guard: only the shopper's own
// session may set it (see routes/guard.ts).
//
// Honesty rules (mirrors docs/KNOWN_LIMITATIONS.md):
//  - allergen data is DECLARED BY THE BUSINESS and unverified; this is not an allergy-safety claim;
//  - a product WITHOUT a declaration is "unknown", never "allergen-free";
//  - the guard is session-scoped, in memory only, and expires; it is never written to the database.

export const GUARD_ALLERGENS = [
  'gluten',
  'dairy',
  'nuts',
  'peanuts',
  'soy',
  'egg',
  'fish',
  'shellfish',
] as const;
export type GuardAllergen = (typeof GUARD_ALLERGENS)[number];

export const GUARD_DIETS = ['vegetarian', 'vegan', 'gluten-free'] as const;
export type GuardDiet = (typeof GUARD_DIETS)[number];

import { createHash } from 'crypto';

/**
 * Version of the product data a guard decision was based on: a short hash over exactly the
 * fields the guard reads (id, diet labels, declared allergens). It changes whenever the café
 * edits a label or allergen declaration, so an audit can tell WHICH data a decision used.
 * `undefined` allergens (not declared) hash differently from an empty declaration.
 */
export function productDataVersion(
  products: Array<{ id: string; dietary: string[]; allergens?: string[] }>
): string {
  const canonical = products
    .map((p) => [p.id, [...p.dietary].sort(), Array.isArray(p.allergens) ? [...p.allergens].sort() : null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 12);
}

export interface ShopperGuard {
  /** First selected diet (kept for older clients); `diets` is the full set. */
  diet?: GuardDiet;
  /** All selected diets (a shopper can be vegetarian AND gluten-free). Every one is enforced. */
  diets: GuardDiet[];
  allergens: GuardAllergen[];
  updatedAt: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

export class ShopperGuardStore {
  private readonly entries = new Map<string, { guard: ShopperGuard; expiresAt: number }>();

  get(userId: string): ShopperGuard | undefined {
    const hit = this.entries.get(userId);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.entries.delete(userId);
      return undefined;
    }
    return hit.guard;
  }

  /** Validates and stores the guard. Unknown values are rejected, not silently dropped. */
  set(userId: string, input: { diet?: unknown; diets?: unknown; allergens?: unknown }): ShopperGuard {
    const diets: GuardDiet[] = [];
    const addDiet = (value: unknown) => {
      if (typeof value !== 'string' || !(GUARD_DIETS as readonly string[]).includes(value)) {
        throw new Error(`diet must be one of: ${GUARD_DIETS.join(', ')}`);
      }
      if (!diets.includes(value as GuardDiet)) diets.push(value as GuardDiet);
    };
    if (input.diet !== undefined && input.diet !== null && input.diet !== '') addDiet(input.diet);
    if (input.diets !== undefined && input.diets !== null) {
      if (!Array.isArray(input.diets) || input.diets.length > GUARD_DIETS.length) {
        throw new Error('diets must be an array of known diet keys');
      }
      input.diets.forEach(addDiet);
    }
    const diet = diets[0];
    const rawAllergens = input.allergens ?? [];
    if (!Array.isArray(rawAllergens) || rawAllergens.length > GUARD_ALLERGENS.length) {
      throw new Error('allergens must be an array of known allergen keys');
    }
    const allergens: GuardAllergen[] = [];
    for (const a of rawAllergens) {
      if (typeof a !== 'string' || !(GUARD_ALLERGENS as readonly string[]).includes(a)) {
        throw new Error(`unknown allergen key; allowed: ${GUARD_ALLERGENS.join(', ')}`);
      }
      if (!allergens.includes(a as GuardAllergen)) allergens.push(a as GuardAllergen);
    }
    const guard: ShopperGuard = { ...(diet ? { diet } : {}), diets, allergens, updatedAt: new Date().toISOString() };
    if (diets.length === 0 && allergens.length === 0) {
      // An empty guard carries no information. Treat an empty update as a no-op so a
      // client that has nothing to contribute (e.g. an app that syncs an empty profile
      // on startup) can never wipe a guard the shopper already has. To intentionally
      // clear a guard, call DELETE /api/guard (clear()).
      const existing = this.entries.get(userId);
      return existing ? existing.guard : guard;
    }
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(userId, { guard, expiresAt: Date.now() + TTL_MS });
    return guard;
  }

  clear(userId: string): void {
    this.entries.delete(userId);
  }

  /** Test hook. */
  reset(): void {
    this.entries.clear();
  }
}

export const shopperGuardStore = new ShopperGuardStore();
