import { newDb } from 'pg-mem';
import { createPgRepositories } from '../../src/persistence/pg-repositories';
import { migrate } from '../../src/persistence/migrations';
import type { AllowanceScopeRow } from '../../src/persistence/types';
import type { PurchasePolicy } from '../../src/policy/domain';

/**
 * Stage 2 (Scoped AI Allowance) durable enforcement on the pg-mem emulator.
 * The scope row is locked and re-validated INSIDE the same transaction as the
 * reservation, so a scope revoked between the pre-check and the reservation can
 * never be honoured. Scoped limits are enforced in addition to the global
 * mandate, so a scope can only ever make the envelope tighter.
 */
function newPool() {
  const { Pool } = newDb().adapters.createPg();
  return new Pool() as any;
}

const basePolicy = (userId: string): PurchasePolicy => {
  const now = new Date();
  return {
    id: `policy-${userId}`, userId, currency: 'EUR', maxPerPurchaseMinor: 1000,
    dailySpendLimitMinor: 1500, allowedMerchantIds: ['merchant-test'], blockedCategoryIds: [],
    requiredDietaryAttributes: [], blockedDietaryAttributes: [], confirmationThresholdMinor: 1000,
    enabled: true, createdAt: now, updatedAt: now,
  };
};

function scopeRow(overrides: Partial<AllowanceScopeRow>): AllowanceScopeRow {
  const now = new Date();
  return {
    id: overrides.id ?? 'scp_test1',
    userId: overrides.userId ?? 'scope-user',
    sessionRef: overrides.sessionRef ?? 'sess_abc',
    kind: overrides.kind ?? 'SHOPPER',
    label: overrides.label ?? 'Test scope',
    originsAllowed: overrides.originsAllowed ?? ['HUMAN', 'AI_AGENT', 'AI_ASSISTED'],
    currency: overrides.currency ?? 'EUR',
    maxPerPurchaseMinor: overrides.maxPerPurchaseMinor ?? 1000,
    dailySpendLimitMinor: overrides.dailySpendLimitMinor ?? 500,
    categorySpendLimits: overrides.categorySpendLimits ?? null,
    allowedMerchantIds: overrides.allowedMerchantIds ?? ['merchant-test'],
    nightWindow: overrides.nightWindow ?? null,
    status: overrides.status ?? 'ACTIVE',
    issuedBy: overrides.issuedBy ?? 'shopper',
    approvedBy: overrides.approvedBy ?? { id: 'scope-user', at: now.toISOString() },
    createdAt: overrides.createdAt ?? now,
    expiresAt: overrides.expiresAt ?? null,
    updatedAt: overrides.updatedAt ?? now,
  };
}

let pool: any;
let repos: ReturnType<typeof createPgRepositories>;

beforeEach(async () => {
  pool = newPool();
  await migrate(pool, { advisoryLock: false });
  repos = createPgRepositories(pool, async () => undefined);
});

afterEach(async () => {
  await pool.end();
});

describe('scoped allowance reservation enforcement (pg-mem)', () => {
  test('a scope with a pending reservation is honoured and persists scope_id', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    await repos.scopes.save(scopeRow({ id: 'scp_ok' }));

    const result = await repos.reservations.reserveWithinMandate({
      id: 'res-a', userId, amountMinor: 300, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_ok', createdAt: new Date(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.scopeId).toBe('scp_ok');

    const loaded = await repos.reservations.loadActive(1000);
    expect(loaded.find((r) => r.id === 'res-a')?.scopeId).toBe('scp_ok');
  });

  test('a scope daily limit is enforced within the transaction (SCOPE_SPENT)', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    await repos.scopes.save(scopeRow({ id: 'scp_limit', dailySpendLimitMinor: 400 }));

    const first = await repos.reservations.reserveWithinMandate({
      id: 'res-1', userId, amountMinor: 300, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_limit', createdAt: new Date(),
    });
    expect(first.ok).toBe(true);
    const second = await repos.reservations.reserveWithinMandate({
      id: 'res-2', userId, amountMinor: 300, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_limit', createdAt: new Date(),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('SCOPE_SPENT');
  });

  test('missing scope fails closed (SCOPE_NOT_FOUND)', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    const result = await repos.reservations.reserveWithinMandate({
      id: 'res-x', userId, amountMinor: 100, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_missing', createdAt: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SCOPE_NOT_FOUND');
  });

  test('a revoked scope fails closed (SCOPE_REVOKED)', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    await repos.scopes.save(scopeRow({ id: 'scp_revoked', status: 'REVOKED' }));
    const result = await repos.reservations.reserveWithinMandate({
      id: 'res-r', userId, amountMinor: 100, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_revoked', createdAt: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SCOPE_REVOKED');
  });

  test('a wrong-currency scope fails closed (SCOPE_CURRENCY_MISMATCH)', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    await repos.scopes.save(scopeRow({ id: 'scp_usd', currency: 'USD' }));
    const result = await repos.reservations.reserveWithinMandate({
      id: 'res-c', userId, amountMinor: 100, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_usd', createdAt: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SCOPE_CURRENCY_MISMATCH');
  });

  test('a wrong-merchant scope fails closed (SCOPE_MERCHANT_NOT_ALLOWED)', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    await repos.scopes.save(scopeRow({ id: 'scp_merchant', allowedMerchantIds: ['merchant-other'] }));
    const result = await repos.reservations.reserveWithinMandate({
      id: 'res-m', userId, amountMinor: 100, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_merchant', createdAt: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('SCOPE_MERCHANT_NOT_ALLOWED');
  });

  test('a scope per-purchase cap is enforced (MAX_PURCHASE_EXCEEDED)', async () => {
    const userId = 'scope-user';
    const stored = await repos.mandates.getOrCreate(basePolicy(userId));
    await repos.scopes.save(scopeRow({ id: 'scp_cap', maxPerPurchaseMinor: 200 }));
    const result = await repos.reservations.reserveWithinMandate({
      id: 'res-p', userId, amountMinor: 300, currency: 'EUR',
      merchantId: 'merchant-test', mandateRevision: stored.revision,
      scopeId: 'scp_cap', createdAt: new Date(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('MAX_PURCHASE_EXCEEDED');
  });
});
