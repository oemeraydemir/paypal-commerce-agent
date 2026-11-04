import { buildTransactionPassport, PassportInput } from '../../src/passport/builder';

const base: PassportInput = {
  items: [{ productId: 'coffee', name: 'Coffee', quantity: 2, unitPriceMinor: 425, lineTotalMinor: 850 }],
  totalMinor: 850,
  currency: 'EUR',
  decision: 'REQUIRE_CONFIRMATION',
  maxPerPurchaseMinor: 2000,
  confirmationThresholdMinor: 500,
  dailyRemainingMinor: 5000,
  checks: [{ rule: 'maxPerPurchase', label: 'Per-purchase limit', status: 'pass', detail: 'ok' }],
  hasWellbeingGuard: false,
};

describe('buildTransactionPassport', () => {
  test('server computes where the approval threshold sits on the limit bar (clients only draw it)', () => {
    expect(buildTransactionPassport(base).mandate.thresholdPercent).toBe(25); // 500 / 2000
    expect(buildTransactionPassport({ ...base, confirmationThresholdMinor: 9999 }).mandate.thresholdPercent).toBe(100);
    expect(buildTransactionPassport({ ...base, confirmationThresholdMinor: 0 }).mandate.thresholdPercent).toBe(0);
  });

  test('payment authority always stays with the shopper and the agent can never pay', () => {
    for (const decision of ['AUTO_ALLOW', 'REQUIRE_CONFIRMATION', 'BLOCK'] as const) {
      const p = buildTransactionPassport({ ...base, decision });
      expect(p.control.paymentAuthority).toBe('shopper');
      expect(p.control.agentCanPay).toBe(false);
      expect(p.mandate.aiCanChangeLimit).toBe(false);
      expect(p.isPaymentRecord).toBe(false);
    }
  });

  test('computes remaining allowance and usage from the server numbers', () => {
    const p = buildTransactionPassport(base);
    expect(p.mandate.remainingMinor).toBe(1150);
    expect(p.mandate.usedPercent).toBe(43);
    expect(p.control.withinLimit).toBe(true);
    expect(p.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'pending', 'pending', 'pending']);
  });

  test('a blocked cart stops the flow at the limit step and is not within limit', () => {
    const p = buildTransactionPassport({ ...base, totalMinor: 2500, decision: 'BLOCK' });
    expect(p.control.withinLimit).toBe(false);
    expect(p.control.requiresShopperApproval).toBe(false);
    expect(p.mandate.usedPercent).toBe(100);
    expect(p.mandate.remainingMinor).toBe(-500);
    expect(p.steps.find((s) => s.key === 'limit')!.state).toBe('blocked');
    expect(p.steps.find((s) => s.key === 'paypal')!.state).toBe('blocked');
  });

  test('allergen notice appears only when a wellbeing concern was stated, never a safety claim', () => {
    expect(buildTransactionPassport(base).notices).not.toContain('allergen-unverified');
    const g = buildTransactionPassport({ ...base, hasWellbeingGuard: true });
    expect(g.notices).toContain('allergen-unverified');
    expect(JSON.stringify(g)).not.toMatch(/allergen[- ]?free|safe to eat/i);
  });

  test('is pure: same input, same output', () => {
    expect(buildTransactionPassport(base)).toEqual(buildTransactionPassport(base));
  });
});
