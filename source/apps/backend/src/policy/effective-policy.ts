import { OrderOrigin } from '../orders/domain';
import { AllowanceScope, buildScopedPolicy, ScopeRejectCode } from './allowance-scope';
import { allowanceScopeService } from './allowance-scope';
import { PurchasePolicy } from './domain';
import { policyStorage } from './storage';

/**
 * Resolves the EFFECTIVE policy that governs a request.
 *
 * Contract (matches the Scoped AI Allowance invariants):
 *   - scopeId === undefined  -> sh global policy (legacy behaviour), unchanged.
 *   - scopeId === a string   -> the scope is resolved fail-closed. If it is
 *     missing / not owned / pending / revoked / expired / spent / wrong-currency
 *     / wrong-origin / wrong-merchant, `ok` is false and the caller MUST reject
 *     the request (never silently fall back to the global policy). When it is
 *     valid, the returned policy is the min of the scope and the global ceiling
 *     (non-escalation), so a scope can never grant more authority than the
 *     shopper explicitly set globally.
 *
 * Callers must validate `scopeId`'s type/length BEFORE calling (a malformed id
 * is a 400 client error, not a scope-resolution failure).
 */
export interface EffectivePolicyInput {
  userId: string;
  origin: OrderOrigin;
  merchantId: string;
  currency: string;
  /** Already-validated scope id, or undefined when no scope was explicitly selected. */
  scopeId: string | undefined;
}

export type EffectivePolicyResult =
  | { ok: true; policy: PurchasePolicy; appliedScopeId: string | undefined; scope: AllowanceScope | undefined }
  | { ok: false; code: ScopeRejectCode };

export async function resolveEffectivePolicy(input: EffectivePolicyInput): Promise<EffectivePolicyResult> {
  const global = await policyStorage.getAuthoritativePolicy(input.userId);
  if (input.scopeId === undefined) {
    return { ok: true, policy: global, appliedScopeId: undefined, scope: undefined };
  }
  const resolved = await allowanceScopeService.resolveActive({
    userId: input.userId,
    scopeId: input.scopeId,
    origin: input.origin,
    merchantId: input.merchantId,
    currency: input.currency,
  });
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    policy: buildScopedPolicy(global, resolved.scope),
    appliedScopeId: resolved.scope.id,
    scope: resolved.scope,
  };
}

/**
 * Synchronous twin used by the rule-based fallback planner (itself synchronous).
 * Uses the same fail-closed resolver as {@link resolveEffectivePolicy}; the
 * global policy source is the synchronous {@link policyStorage.getOrCreatePolicy}.
 */
export function resolveEffectivePolicySync(input: EffectivePolicyInput): EffectivePolicyResult {
  const global = policyStorage.getOrCreatePolicy(input.userId);
  if (input.scopeId === undefined) {
    return { ok: true, policy: global, appliedScopeId: undefined, scope: undefined };
  }
  const resolved = allowanceScopeService.resolveActiveSync({
    userId: input.userId,
    scopeId: input.scopeId,
    origin: input.origin,
    merchantId: input.merchantId,
    currency: input.currency,
  });
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    policy: buildScopedPolicy(global, resolved.scope),
    appliedScopeId: resolved.scope.id,
    scope: resolved.scope,
  };
}
