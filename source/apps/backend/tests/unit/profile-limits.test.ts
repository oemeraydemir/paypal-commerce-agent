import path from 'path';

// Regression for the hard-coded EUR 20 cap: a custom merchant profile's maxOrderValueMinor must be
// the real per-purchase limit (EUR 20 / 24 / 60 scenarios), while the built-in AI Café keeps EUR 20.
const bakery = path.resolve(__dirname, '../../examples/business-profiles/corner-bakery.json');

function loadPolicyWith(profilePath: string | undefined) {
  const prev = process.env.BUSINESS_PROFILE_PATH;
  if (profilePath === undefined) delete process.env.BUSINESS_PROFILE_PATH;
  else process.env.BUSINESS_PROFILE_PATH = profilePath;
  let result: any;
  jest.isolateModules(() => {
    const { defaultPolicy } = require('../../src/policy/default-policy');
    const { PolicyService } = require('../../src/policy/service');
    result = { defaultPolicy, PolicyService };
  });
  if (prev === undefined) delete process.env.BUSINESS_PROFILE_PATH;
  else process.env.BUSINESS_PROFILE_PATH = prev;
  return result;
}

describe('per-purchase limit follows the merchant profile', () => {
  it('built-in AI Café keeps the EUR 20 demo limit', () => {
    const { defaultPolicy } = loadPolicyWith(undefined);
    expect(defaultPolicy.maxPerPurchaseMinor).toBe(2000);
    expect(defaultPolicy.confirmationThresholdMinor).toBe(1000);
  });

  it('corner-bakery (maxOrderValueMinor 6000) really allows up to EUR 60', () => {
    const { defaultPolicy } = loadPolicyWith(bakery);
    expect(defaultPolicy.maxPerPurchaseMinor).toBe(6000);
    expect(defaultPolicy.dailySpendLimitMinor).toBeGreaterThanOrEqual(6000);
    expect(defaultPolicy.confirmationThresholdMinor).toBeLessThanOrEqual(6000);
  });

  it('daily limit is never below the per-purchase limit', () => {
    for (const p of [undefined, bakery]) {
      const { defaultPolicy } = loadPolicyWith(p);
      expect(defaultPolicy.dailySpendLimitMinor).toBeGreaterThanOrEqual(defaultPolicy.maxPerPurchaseMinor);
    }
  });
});
