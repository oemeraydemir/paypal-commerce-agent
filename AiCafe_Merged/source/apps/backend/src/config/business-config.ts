// Business configuration with AI-agent safety policy fields.
// CRITICAL FIX #5: policy fields added (maxOrderValueMinor, minOrderValueMinor,
// aiPurchaseRequiresConfirmation, allowAutonomousPurchase).

export interface BusinessConfig {
  businessId: string;
  name: string;
  currency: string;
  locale: string;
  timezone: string;

  // Policy fields for AI agent safety
  maxOrderValueMinor: number;
  minOrderValueMinor: number;
  aiPurchaseRequiresConfirmation: boolean;
  allowAutonomousPurchase: boolean;

  // Optional shopper-policy overrides (custom merchant profiles only).
  confirmationThresholdMinor?: number;
  dailySpendLimitMinor?: number;
}

import { loadConfiguredProfile } from './business-profile';

export const currentBusiness: BusinessConfig = {
  businessId: 'ai-cafe',
  name: 'AI Café',
  currency: 'EUR',
  locale: 'en-DE',
  timezone: 'Europe/Berlin',
  maxOrderValueMinor: 10000, // 100 EUR
  minOrderValueMinor: 100, // 1 EUR
  aiPurchaseRequiresConfirmation: true,
  allowAutonomousPurchase: false,
};

// A custom merchant (BUSINESS_PROFILE_PATH) overrides the AI Café defaults in place, so every
// module that imports `currentBusiness` sees the configured business. Invalid files stop the boot.
const configured = loadConfiguredProfile();
if (configured) {
  Object.assign(currentBusiness, configured.business);
}

export function getBusiness(): BusinessConfig {
  return currentBusiness;
}
