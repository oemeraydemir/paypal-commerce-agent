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
}

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

export function getBusiness(): BusinessConfig {
  return currentBusiness;
}
