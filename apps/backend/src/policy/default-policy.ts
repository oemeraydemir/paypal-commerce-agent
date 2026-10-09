import { PurchasePolicy } from './domain';

// S10 (R3): single source of truth for the demo user identity. Production
// authentication is explicitly OUT OF SCOPE; the demo user is the only actor.
// Do NOT scatter 'demo-user-001' literals across route/service files.
export const DEFAULT_DEMO_USER_ID = 'demo-user-001';

export function getDemoUserId(): string {
  return DEFAULT_DEMO_USER_ID;
}

// S10 (R18): default policy seeded for the demo user. All amounts are in EUR
// minor units (1 EUR = 100 minor). The default policy is advisory during AI
// discovery and authoritative at /orders/create.
export const defaultPolicy: PurchasePolicy = {
  id: 'default-policy',
  userId: DEFAULT_DEMO_USER_ID,
  currency: 'EUR',

  maxPerPurchaseMinor: 2000,
  dailySpendLimitMinor: 10000,

  allowedMerchantIds: ['ai-cafe'],

  blockedCategoryIds: [],

  requiredDietaryAttributes: [],

  blockedDietaryAttributes: ['alcohol'],

  confirmationThresholdMinor: 1000,

  enabled: true,

  createdAt: new Date(),
  updatedAt: new Date(),
};

// S10 (R19): a disabled policy must not block purchases. The deterministic
// PolicyService already returns AUTO_ALLOW when policy.enabled === false, so a
// disabled policy is equivalent to "no restrictions" (still subject to the
// existing human PayPal approval boundary).
