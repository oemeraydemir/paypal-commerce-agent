import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// A "business profile" is the data that makes this deployment a specific merchant:
// its name, currency, limits and catalog. The default profile is AI Café (data.json).
// Point BUSINESS_PROFILE_PATH at a JSON file to run any other merchant WITHOUT code changes:
//
//   { "business": { "businessId": "corner-bakery", "name": "Corner Bakery", "currency": "EUR", ... },
//     "products": [ { "id": "croissant", "name": "Croissant", "priceMinor": 280, "category": "pastry" }, ... ] }
//
// One deployment serves ONE merchant (its own PayPal credentials, its own database).

const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'id must be lowercase letters, digits, _ or -'),
  name: z.string().min(1).max(120),
  description: z.string().max(500).default(''),
  priceMinor: z.number().int().positive().max(1_000_000),
  category: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'category must be lowercase letters, digits, _ or -'),
  tags: z.array(z.string().max(40)).default([]),
  dietary: z.array(z.string().max(40)).default([]),
  occasion: z.array(z.string().max(40)).default([]),
  available: z.boolean().default(true),
});

const businessSchema = z.object({
  businessId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, 'businessId: lowercase letters, digits, -'),
  name: z.string().min(1).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be an ISO 4217 code such as EUR'),
  locale: z.string().min(2).max(20).default('en-DE'),
  timezone: z.string().min(1).max(60).default('Europe/Berlin'),
  maxOrderValueMinor: z.number().int().positive().default(10000),
  minOrderValueMinor: z.number().int().positive().default(100),
  aiPurchaseRequiresConfirmation: z.boolean().default(true),
  allowAutonomousPurchase: z.boolean().default(false),
  // Optional shopper-policy overrides. When omitted: the per-purchase limit equals maxOrderValueMinor,
  // the approval threshold is min(1000, limit) and the daily budget is max(10000, 5 x limit).
  confirmationThresholdMinor: z.number().int().positive().optional(),
  dailySpendLimitMinor: z.number().int().positive().optional(),
});

export const profileSchema = z
  .object({
    business: businessSchema,
    products: z.array(productSchema).min(1).max(500),
  })
  .superRefine((profile, ctx) => {
    const seen = new Set<string>();
    profile.products.forEach((p, i) => {
      if (seen.has(p.id)) ctx.addIssue({ code: 'custom', path: ['products', i, 'id'], message: `duplicate product id "${p.id}"` });
      seen.add(p.id);
    });
    if (profile.business.minOrderValueMinor > profile.business.maxOrderValueMinor) {
      ctx.addIssue({ code: 'custom', path: ['business'], message: 'minOrderValueMinor must not exceed maxOrderValueMinor' });
    }
    const b = profile.business;
    if (b.confirmationThresholdMinor !== undefined && b.confirmationThresholdMinor > b.maxOrderValueMinor) {
      ctx.addIssue({ code: 'custom', path: ['business', 'confirmationThresholdMinor'], message: 'must not exceed maxOrderValueMinor' });
    }
    if (b.dailySpendLimitMinor !== undefined && b.dailySpendLimitMinor < b.maxOrderValueMinor) {
      ctx.addIssue({ code: 'custom', path: ['business', 'dailySpendLimitMinor'], message: 'must be at least maxOrderValueMinor' });
    }
  });

export type BusinessProfile = z.infer<typeof profileSchema>;

/** Parses and validates a profile; throws ONE readable error listing every problem. */
export function parseBusinessProfile(raw: unknown, source = 'business profile'): BusinessProfile {
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid ${source}:\n${problems}`);
  }
  return result.data;
}

let cached: { key: string; profile: BusinessProfile | null } | undefined;

/** The custom profile configured via BUSINESS_PROFILE_PATH, or null for the built-in AI Café. */
export function loadConfiguredProfile(): BusinessProfile | null {
  const file = process.env.BUSINESS_PROFILE_PATH?.trim();
  const key = file ?? '';
  if (cached && cached.key === key) return cached.profile;
  let profile: BusinessProfile | null = null;
  if (file) {
    const resolved = path.resolve(process.cwd(), file);
    let text: string;
    try {
      text = fs.readFileSync(resolved, 'utf8');
    } catch (err: any) {
      throw new Error(`BUSINESS_PROFILE_PATH is set but "${resolved}" cannot be read: ${err?.message ?? err}`);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err: any) {
      throw new Error(`BUSINESS_PROFILE_PATH "${resolved}" is not valid JSON: ${err?.message ?? err}`);
    }
    profile = parseBusinessProfile(json, `business profile ${resolved}`);
  }
  cached = { key, profile };
  return profile;
}
