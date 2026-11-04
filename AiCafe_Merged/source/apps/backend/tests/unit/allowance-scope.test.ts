import { allowanceScopeService } from '../../src/policy/allowance-scope';
import { policyStorage } from '../../src/policy/storage';
import { OrderOrigin } from '../../src/orders/domain';

/**
 * Stage 2 (Scoped AI Allowance) service semantics. These tests exercise the
 * fail-closed and non-escalation invariants on the in-memory service; the
 * durable PostgreSQL reservation enforcement is covered by the pg-mem
 * integration suite (allowance-scope-persistence.test.ts).
 */
describe('AllowanceScopeService', () => {
  const USER = 'scope-test-user';
  const OTHER = 'scope-other-user';

  beforeEach(() => {
    allowanceScopeService.reset();
    policyStorage.reset();
  });

  test('a shopper-created scope is ACTIVE and pre-approved', async () => {
    const scope = await allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.HUMAN, {
      label: 'My lunch budget',
      currency: 'EUR',
      dailySpendLimitMinor: 2000,
    });
    expect(scope.kind).toBe('SHOPPER');
    expect(scope.status).toBe('ACTIVE');
    expect(scope.approvedBy?.id).toBe(USER);
    expect(scope.originsAllowed).toContain(OrderOrigin.HUMAN);
  });

  test('an agent-proposed scope starts PENDING and requires shopper approval', async () => {
    const scope = await allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.AI_AGENT, {
      label: 'Agent suggestion',
      currency: 'EUR',
      maxPerPurchaseMinor: 800,
    });
    expect(scope.kind).toBe('AGENT_PROPOSED');
    expect(scope.status).toBe('PENDING_APPROVAL');
    // Fail-closed: a pending scope cannot be used yet.
    const resolved = await allowanceScopeService.resolveActive({
      userId: USER, scopeId: scope.id, origin: OrderOrigin.AI_AGENT,
      merchantId: 'merchant-test', currency: 'EUR',
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.code).toBe('SCOPE_PENDING');

    const approved = await allowanceScopeService.approve(USER, scope.id);
    expect(approved.status).toBe('ACTIVE');
    expect(approved.approvedBy?.id).toBe(USER);
    expect((await allowanceScopeService.resolveActive({
      userId: USER, scopeId: scope.id, origin: OrderOrigin.AI_AGENT,
      merchantId: 'merchant-test', currency: 'EUR',
    })).ok).toBe(true);
  });

  test('revoking a scope makes it fail closed (SCOPE_REVOKED)', async () => {
    const scope = await allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.HUMAN, {
      label: 'Budget', currency: 'EUR', dailySpendLimitMinor: 1000,
    });
    await allowanceScopeService.revoke(USER, scope.id);
    const resolved = await allowanceScopeService.resolveActive({
      userId: USER, scopeId: scope.id, origin: OrderOrigin.HUMAN,
      merchantId: 'merchant-test', currency: 'EUR',
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.code).toBe('SCOPE_REVOKED');
  });

  test('non-escalation: an agent cannot propose limits above the shopper ceiling', async () => {
    await expect(allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.AI_AGENT, {
      label: 'Too big', currency: 'EUR', dailySpendLimitMinor: 999999,
    })).rejects.toMatchObject({ code: 'SCOPE_ABOVE_CEILING' });
  });

  test('scope currency must match the shopper policy currency', async () => {
    await expect(allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.HUMAN, {
      label: 'USD scope', currency: 'USD', dailySpendLimitMinor: 1000,
    })).rejects.toMatchObject({ code: 'SCOPE_CURRENCY_MISMATCH' });
  });

  test('fail-closed resolution rejects unowned, wrong-origin and wrong-merchant scopes', async () => {
    const scope = await allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.HUMAN, {
      label: 'Budget', currency: 'EUR',
      allowedMerchantIds: ['merchant-test'],
      originsAllowed: [OrderOrigin.HUMAN],
    });
    const unowned = await allowanceScopeService.resolveActive({
      userId: OTHER, scopeId: scope.id, origin: OrderOrigin.HUMAN,
      merchantId: 'merchant-test', currency: 'EUR',
    });
    expect(unowned.ok).toBe(false);
    if (!unowned.ok) expect(unowned.code).toBe('SCOPE_NOT_OWNED');

    const wrongOrigin = await allowanceScopeService.resolveActive({
      userId: USER, scopeId: scope.id, origin: OrderOrigin.AI_AGENT,
      merchantId: 'merchant-test', currency: 'EUR',
    });
    expect(wrongOrigin.ok).toBe(false);
    if (!wrongOrigin.ok) expect(wrongOrigin.code).toBe('SCOPE_ORIGIN_NOT_ALLOWED');

    const wrongMerchant = await allowanceScopeService.resolveActive({
      userId: USER, scopeId: scope.id, origin: OrderOrigin.HUMAN,
      merchantId: 'merchant-other', currency: 'EUR',
    });
    expect(wrongMerchant.ok).toBe(false);
    if (!wrongMerchant.ok) expect(wrongMerchant.code).toBe('SCOPE_MERCHANT_NOT_ALLOWED');
  });

  test('an expired scope is rejected and auto-tagged EXPIRED', async () => {
    const scope = await allowanceScopeService.create(USER, 'sess_abc', OrderOrigin.HUMAN, {
      label: 'Budget', currency: 'EUR',
      expiresAt: new Date(Date.now() - 1000),
    });
    const resolved = await allowanceScopeService.resolveActive({
      userId: USER, scopeId: scope.id, origin: OrderOrigin.HUMAN,
      merchantId: 'merchant-test', currency: 'EUR',
    });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.code).toBe('SCOPE_EXPIRED');
  });
});
