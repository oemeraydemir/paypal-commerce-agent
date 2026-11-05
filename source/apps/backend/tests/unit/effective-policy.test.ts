import { allowanceScopeService } from '../../src/policy/allowance-scope';
import { policyStorage } from '../../src/policy/storage';
import { resolveEffectivePolicySync } from '../../src/policy/effective-policy';
import { buildScopedPolicy } from '../../src/policy/allowance-scope';
import { OrderOrigin } from '../../src/orders/domain';
import { resetAiRouteState } from '../../src/routes/ai';

const USER = 'u-effective-policy';
const MERCHANT = 'aicafe';

function ctx(scopeId: string | undefined) {
  return { userId: USER, origin: OrderOrigin.HUMAN, merchantId: MERCHANT, currency: 'EUR', scopeId };
}

beforeEach(() => {
  policyStorage.reset();
  allowanceScopeService.reset();
  resetAiRouteState();
});

describe('resolveEffectivePolicySync — scoped enforcement shared by preview/checkout/tools', () => {
  test('no scopeId returns the global policy (legacy path untouched)', async () => {
    const r = await resolveEffectivePolicySync(ctx(undefined));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.appliedScopeId).toBeUndefined();
    expect(r.policy.maxPerPurchaseMinor).toBe(policyStorage.getOrCreatePolicy(USER).maxPerPurchaseMinor);
  });

  test('an active scope tightens the policy and never exceeds the global ceiling (non-escalation)', async () => {
    const global = policyStorage.getOrCreatePolicy(USER);
    // Global per-purchase is €20; create a strict SHOPPER scope of €5.
    const scope = await allowanceScopeService.create(USER, 'ref-1', OrderOrigin.HUMAN, {
      label: '€5', currency: 'EUR', maxPerPurchaseMinor: 500,
    });
    const r = await resolveEffectivePolicySync(ctx(scope.id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.appliedScopeId).toBe(scope.id);
    expect(r.policy.maxPerPurchaseMinor).toBe(500);
    expect(r.policy.maxPerPurchaseMinor).toBeLessThanOrEqual(global.maxPerPurchaseMinor);
    // Daily limit stays at the global ceiling (scope did not restrict it).
    expect(r.policy.dailySpendLimitMinor).toBe(global.dailySpendLimitMinor);
  });

  test('buildScopedPolicy never lets a scope exceed the global ceiling (non-escalation)', () => {
    const global = policyStorage.getOrCreatePolicy(USER);
    // A scope with an absurdly high per-purchase cap must be clamped down to the
    // global ceiling, never widened past it.
    const scope = {
      id: 'scp_huge',
      userId: USER,
      kind: 'SHOPPER' as const,
      originsAllowed: [OrderOrigin.HUMAN],
      maxPerPurchaseMinor: 999999,
      dailySpendLimitMinor: undefined,
      status: 'ACTIVE' as const,
      currency: 'EUR',
    } as any;
    const effective = buildScopedPolicy(global, scope);
    expect(effective.maxPerPurchaseMinor).toBe(global.maxPerPurchaseMinor);
  });

  test.each([
    ['unknown', 'scp_nope', 'SCOPE_NOT_FOUND'],
  ])('fail-closed: %s scope is rejected', async (_label, scopeId, expectedCode) => {
    const r = await resolveEffectivePolicySync(ctx(scopeId));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe(expectedCode);
  });

  test('fail-closed: a revoked scope is rejected', async () => {
    const scope = await allowanceScopeService.create(USER, 'ref-3', OrderOrigin.HUMAN, {
      label: 'Revoke me', currency: 'EUR', maxPerPurchaseMinor: 500,
    });
    await allowanceScopeService.revoke(USER, scope.id);
    const r = await resolveEffectivePolicySync(ctx(scope.id));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('SCOPE_REVOKED');
  });
});
