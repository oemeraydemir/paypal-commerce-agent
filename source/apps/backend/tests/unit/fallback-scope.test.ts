import { runFallbackAssistant } from '../../src/ai/fallback-planner';
import { allowanceScopeService } from '../../src/policy/allowance-scope';
import { policyStorage } from '../../src/policy/storage';
import { OrderOrigin } from '../../src/orders/domain';
import { resetAiRouteState } from '../../src/routes/ai';

const USER = 'u-fallback-scope';
const SESSION = 'sess-fallback-scope';

const ctx = (scopeId?: string) => ({ sessionId: SESSION, userId: USER, scopeId });

beforeEach(() => {
  policyStorage.reset();
  allowanceScopeService.reset();
  resetAiRouteState();
});

describe('runFallbackAssistant — rule-based planner cannot bypass a scoped allowance', () => {
  test('with an active €5 scope, a €7.80 cart the planner builds is blocked (never prepared)', async () => {
    await allowanceScopeService.create(USER, 'ref-fb-1', OrderOrigin.HUMAN, {
      label: '€5', currency: 'EUR', maxPerPurchaseMinor: 500,
    });
    // The rule-based planner finds "lentil soup" (€7.80) — within the global €20
    // but over the scoped €5. It must be blocked and produce NO preparedCart.
    const scopes = await allowanceScopeService.listForUser(USER);
    const real = runFallbackAssistant('lentil soup', { dietary: [] }, ctx(scopes[0].id));
    expect(real.preparedCart).toBeNull();
    expect(real.checkoutReady).toBe(false);
    expect(real.suggestion).toBeNull();
    // The planner must HONESTLY reference the scoped €5 cap (not the global €20
    // ceiling) — proving it enforced the scope, not silently the global policy.
    expect(real.response).toMatch(/€5\.00|over your budget/);
    expect(real.response).not.toMatch(/€20/);
  });

  test('an explicit invalid scope id fails closed: BLOCK-style reply, no cart, no suggestion', () => {
    const r = runFallbackAssistant('lentil soup', { dietary: [] }, ctx('scp_nope'));
    expect(r.preparedCart).toBeNull();
    expect(r.checkoutReady).toBe(false);
    expect(r.suggestion).toBeNull();
    expect(r.response).toMatch(/could not prepare|scoped allowance/i);
  });

  test('without a scopeId the legacy global-policy planning is unchanged', async () => {
    const r = runFallbackAssistant('coffee', { dietary: [] }, ctx());
    expect(r.preparedCart).not.toBeNull();
    expect(r.checkoutReady).toBe(true);
  });
});
