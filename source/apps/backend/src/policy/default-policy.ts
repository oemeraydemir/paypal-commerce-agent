import { PurchasePolicy } from './domain';
import { currentBusiness } from '../config/business-config';
import { loadConfiguredProfile } from '../config/business-profile';

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
// The built-in AI Café keeps its demo limits (EUR 20 per purchase, EUR 10 approval threshold).
// A custom merchant profile (BUSINESS_PROFILE_PATH) is authoritative: its maxOrderValueMinor IS the
// per-purchase limit, so a EUR 60 bakery really accepts a EUR 60 cart.
const customMerchant = loadConfiguredProfile() !== null;
const maxPerPurchaseMinor = customMerchant
  ? currentBusiness.maxOrderValueMinor
  : Math.min(2000, currentBusiness.maxOrderValueMinor);
const confirmationThresholdMinor = Math.min(
  currentBusiness.confirmationThresholdMinor ?? 1000,
  maxPerPurchaseMinor
);
const dailySpendLimitMinor = customMerchant
  ? currentBusiness.dailySpendLimitMinor ?? Math.max(10000, maxPerPurchaseMinor * 5)
  : 10000;

export const defaultPolicy: PurchasePolicy = {
  id: 'default-policy',
  userId: DEFAULT_DEMO_USER_ID,
  currency: currentBusiness.currency,

  maxPerPurchaseMinor,
  dailySpendLimitMinor,

  allowedMerchantIds: [currentBusiness.businessId],

  blockedCategoryIds: [],

  requiredDietaryAttributes: [],

  blockedDietaryAttributes: ['alcohol'],

  confirmationThresholdMinor,

  enabled: true,

  createdAt: new Date(),
  updatedAt: new Date(),
};

// S10 (R19): a disabled policy must not block purchases. The deterministic
// PolicyService already returns AUTO_ALLOW when policy.enabled === false, so a
// disabled policy is equivalent to "no restrictions" (still subject to the
// existing human PayPal approval boundary).
