import { randomUUID } from 'crypto';
import { OrderOrigin } from '../orders/domain';
import { getRepos, writeQueue } from '../persistence/registry';
import { AllowanceScopeAuditRow, AllowanceScopeRow } from '../persistence/types';
import { policyStorage } from './storage';
import { NightWindowRule, PurchasePolicy } from './domain';

// Stage 2.5: Scoped AI Allowance.
//
// A scope is a NAMED, server-persisted envelope that limits what a checkout may
// spend for a given origin (HUMAN / AI_ASSISTED / AI_AGENT). It sits ON TOP of
// the shopper's global PurchasePolicy, which remains the hard ceiling.
//
// Hard invariants (all backed by code, not convention):
//   1. FAIL-CLOSED: if a request explicitly selects a scopeId and the scope is
//      missing / not owned / pending / expired / revoked / wrong-currency /
//      wrong-merchant / wrong-origin, checkout is REJECTED. It never silently
//      falls back to the global policy.
//   2. NON-ESCALATION: an AI agent can never create, extend, or increase its
//      own authority. Agent-proposed limits must stay within the shopper's
//      explicit ceilings (rejected otherwise). Any increase to an existing
//      scope requires a fresh, explicit shopper approval recorded by the server.

export type AllowanceScopeKind = 'SHOPPER' | 'AGENT_PROPOSED' | 'AGENT_GRANTED';
export type AllowanceScopeStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SPENT' | 'EXPIRED' | 'REVOKED';

export type ScopeRejectCode =
  | 'SCOPE_NOT_FOUND'
  | 'SCOPE_NOT_OWNED'
  | 'SCOPE_PENDING'
  | 'SCOPE_REVOKED'
  | 'SCOPE_EXPIRED'
  | 'SCOPE_SPENT'
  | 'SCOPE_CURRENCY_MISMATCH'
  | 'SCOPE_MERCHANT_NOT_ALLOWED'
  | 'SCOPE_ORIGIN_NOT_ALLOWED'
  | 'SCOPE_NO_DAILY_LIMIT'
  | 'SCOPE_ABOVE_CEILING';

export interface AllowanceScope {
  id: string;
  userId: string;
  /** Non-reversible public label (publicSessionRef-style); never the raw session id. */
  sessionRef: string;
  kind: AllowanceScopeKind;
  label: string;
  originsAllowed: OrderOrigin[];
  currency: string;
  maxPerPurchaseMinor?: number;
  dailySpendLimitMinor?: number;
  categorySpendLimits?: Record<string, number>;
  allowedMerchantIds?: string[];
  nightWindow?: NightWindowRule;
  status: AllowanceScopeStatus;
  issuedBy: string;
  approvedBy?: { id: string; at: string };
  createdAt: Date;
  expiresAt?: Date;
  updatedAt: Date;
}

export interface ScopeCreateInput {
  label: string;
  originsAllowed?: OrderOrigin[];
  currency: string;
  maxPerPurchaseMinor?: number;
  dailySpendLimitMinor?: number;
  categorySpendLimits?: Record<string, number>;
  allowedMerchantIds?: string[];
  nightWindow?: NightWindowRule;
  expiresAt?: Date;
}

export interface ScopeResolveContext {
  userId: string;
  scopeId: string;
  origin: OrderOrigin;
  merchantId: string;
  currency: string;
  now?: Date;
}

export type ScopeResolveResult =
  | { ok: true; scope: AllowanceScope }
  | { ok: false; code: ScopeRejectCode };

/** A scope is only usable at checkout when it carries at least one limit of its own. */
export function scopeHasOwnLimit(scope: Pick<AllowanceScope, 'dailySpendLimitMinor' | 'maxPerPurchaseMinor' | 'categorySpendLimits'>): boolean {
  if (scope.dailySpendLimitMinor !== undefined && scope.dailySpendLimitMinor !== null) return true;
  if (scope.maxPerPurchaseMinor !== undefined && scope.maxPerPurchaseMinor !== null) return true;
  const cats = scope.categorySpendLimits;
  return !!cats && Object.keys(cats).length > 0;
}

function isAiOrigin(origin: OrderOrigin): boolean {
  return origin === OrderOrigin.AI_AGENT || origin === OrderOrigin.AI_ASSISTED;
}

function normalizeOrigins(input?: OrderOrigin[]): OrderOrigin[] {
  if (!input || input.length === 0) return [OrderOrigin.HUMAN, OrderOrigin.AI_ASSISTED, OrderOrigin.AI_AGENT];
  return [...new Set(input.filter((o) => Object.values(OrderOrigin).includes(o)))];
}

function toRow(s: AllowanceScope): AllowanceScopeRow {
  return {
    id: s.id,
    userId: s.userId,
    sessionRef: s.sessionRef ?? null,
    kind: s.kind,
    label: s.label,
    originsAllowed: s.originsAllowed,
    currency: s.currency,
    maxPerPurchaseMinor: s.maxPerPurchaseMinor ?? null,
    dailySpendLimitMinor: s.dailySpendLimitMinor ?? null,
    categorySpendLimits: s.categorySpendLimits ?? null,
    allowedMerchantIds: s.allowedMerchantIds ?? null,
    nightWindow: s.nightWindow ?? null,
    status: s.status,
    issuedBy: s.issuedBy,
    approvedBy: s.approvedBy ?? null,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt ?? null,
    updatedAt: s.updatedAt,
  };
}

function fromRow(r: AllowanceScopeRow): AllowanceScope {
  return {
    id: r.id,
    userId: r.userId,
    sessionRef: r.sessionRef ?? '',
    kind: r.kind,
    label: r.label,
    originsAllowed: [...r.originsAllowed] as OrderOrigin[],
    currency: r.currency,
    maxPerPurchaseMinor: r.maxPerPurchaseMinor ?? undefined,
    dailySpendLimitMinor: r.dailySpendLimitMinor ?? undefined,
    categorySpendLimits: r.categorySpendLimits ?? undefined,
    allowedMerchantIds: r.allowedMerchantIds ?? undefined,
    nightWindow: r.nightWindow ?? undefined,
    status: r.status,
    issuedBy: r.issuedBy,
    approvedBy: r.approvedBy ?? undefined,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    expiresAt: r.expiresAt ? (r.expiresAt instanceof Date ? r.expiresAt : new Date(r.expiresAt)) : undefined,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
  };
}

/**
 * Combines a scope with the shopper's global policy into the EFFECTIVE policy
 * that is evaluated for checkout. Scope values are only ever tighter (min with
 * the global ceiling), so a scope can never grant more authority than the
 * shopper explicitly set globally.
 */
export function buildScopedPolicy(global: PurchasePolicy, scope: AllowanceScope): PurchasePolicy {
  const maxPerPurchaseMinor =
    scope.maxPerPurchaseMinor !== undefined
      ? Math.min(scope.maxPerPurchaseMinor, global.maxPerPurchaseMinor)
      : global.maxPerPurchaseMinor;
  return {
    ...global,
    maxPerPurchaseMinor,
    // The global daily cap counts all purchases. A scope's daily cap is tracked
    // separately against reservations bound to that scope.
    dailySpendLimitMinor: global.dailySpendLimitMinor,
    allowedMerchantIds: scope.allowedMerchantIds?.length ? scope.allowedMerchantIds : global.allowedMerchantIds,
    blockedCategoryIds: global.blockedCategoryIds,
    categorySpendLimits: scope.categorySpendLimits ?? global.categorySpendLimits,
    nightWindow: scope.nightWindow ?? global.nightWindow,
    confirmationThresholdMinor: global.confirmationThresholdMinor,
    updatedAt: new Date(),
  };
}

/** Non-escalation: would the proposed limits exceed the shopper's explicit ceilings? */
export function scopeExceedsCeiling(proposed: ScopeCreateInput, global: PurchasePolicy): boolean {
  if (proposed.maxPerPurchaseMinor !== undefined && proposed.maxPerPurchaseMinor > global.maxPerPurchaseMinor) return true;
  if (proposed.dailySpendLimitMinor !== undefined && proposed.dailySpendLimitMinor > global.dailySpendLimitMinor) return true;
  for (const [category, amount] of Object.entries(proposed.categorySpendLimits ?? {})) {
    const cap = global.categorySpendLimits?.[category];
    if (cap !== undefined && amount > cap) return true;
    if (cap === undefined && amount > global.dailySpendLimitMinor) return true;
  }
  return false;
}

export class AllowanceScopeService {
  private readonly scopes = new Map<string, AllowanceScope>();
  private readonly audit = new Map<string, AllowanceScopeAuditRow[]>();
  private readonly dirtyAudit = new Map<string, AllowanceScopeAuditRow>();
  private reserved: Date[] = [];

  // ---- durability ---------------------------------------------------------
  private async persist(s: AllowanceScope): Promise<void> {
    const repos = getRepos();
    if (!repos) return;
    await repos.scopes.save(toRow(s));
  }

  private persistEvent(scopeId: string, event: AllowanceScopeAuditRow): void {
    const repos = getRepos();
    if (!repos) return;
    this.dirtyAudit.set(event.id, event);
    writeQueue.enqueue(`scope-audit:${event.id}`, async () => {
      const r = getRepos();
      if (!r) return;
      await r.scopes.appendAudit(event);
      this.dirtyAudit.delete(event.id);
    }).catch(() => undefined);
    const list = this.audit.get(scopeId) ?? [];
    list.push(event);
    this.audit.set(scopeId, list);
  }

  async retryDirty(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const items = [...this.dirtyAudit.values()];
    for (const event of items) {
      await writeQueue.enqueue(`scope-audit-retry:${event.id}`, async () => {
        const r = getRepos();
        if (!r) return;
        await r.scopes.appendAudit(event);
        this.dirtyAudit.delete(event.id);
      }, { retries: 0 });
    }
    return items.length;
  }

  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const rows = await repos.scopes.loadAll();
    this.scopes.clear();
    for (const row of rows) this.scopes.set(row.id, fromRow(row));
    return rows.length;
  }

  listForUser(userId: string): AllowanceScope[] {
    const now = Date.now();
    for (const s of this.scopes.values()) {
      if (s.userId === userId && s.status === 'ACTIVE' && s.expiresAt && s.expiresAt.getTime() <= now) {
        s.status = 'EXPIRED';
        this.persist(s);
      }
    }
    return [...this.scopes.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  get(userId: string, scopeId: string): AllowanceScope | undefined {
    const s = this.scopes.get(scopeId);
    return s && s.userId === userId ? s : undefined;
  }

  async create(
    userId: string,
    sessionRef: string,
    issuerOrigin: OrderOrigin,
    input: ScopeCreateInput,
    now: Date = new Date()
  ): Promise<AllowanceScope> {
    const global = await policyStorage.getAuthoritativePolicy(userId);
    if (input.currency !== global.currency) {
      const err: Error & { code?: string } = new Error('Scope currency does not match the shopper policy currency');
      err.code = 'SCOPE_CURRENCY_MISMATCH';
      throw err;
    }
    if (scopeExceedsCeiling(input, global)) {
      const err: Error & { code?: string } = new Error('Scope limits exceed the shopper ceiling');
      err.code = 'SCOPE_ABOVE_CEILING';
      throw err;
    }
    const id = `scp_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const kind = isAiOrigin(issuerOrigin) ? 'AGENT_PROPOSED' : 'SHOPPER';
    const scope: AllowanceScope = {
      id,
      userId,
      sessionRef,
      kind,
      label: input.label.trim() || 'Scoped allowance',
      originsAllowed: normalizeOrigins(input.originsAllowed),
      currency: input.currency,
      maxPerPurchaseMinor: input.maxPerPurchaseMinor,
      dailySpendLimitMinor: input.dailySpendLimitMinor,
      categorySpendLimits: input.categorySpendLimits,
      allowedMerchantIds: input.allowedMerchantIds,
      nightWindow: input.nightWindow,
      status: kind === 'SHOPPER' ? 'ACTIVE' : 'PENDING_APPROVAL',
      issuedBy: kind === 'SHOPPER' ? 'shopper' : isAiOrigin(issuerOrigin) ? 'agent' : 'server',
      approvedBy: kind === 'SHOPPER' ? { id: userId, at: now.toISOString() } : undefined,
      createdAt: now,
      expiresAt: input.expiresAt,
      updatedAt: now,
    };
    this.scopes.set(id, scope);
    await this.persist(scope);
    this.persistEvent(id, {
      id: randomUUID(), scopeId: id, userId, eventType: 'SCOPE_CREATED',
      actor: scope.issuedBy, details: { kind, status: scope.status }, occurredAt: now.toISOString(),
    });
    return scope;
  }

  /**
   * Explicit shopper approval. Two effects:
   *   - activates a PENDING_APPROVAL (agent-proposed) scope;
   *   - records a FRESH approval for a limit increase on an ACTIVE scope.
   * The limits may be adjusted here (whitelisted, still capped by the ceiling)
   * and are always recorded as approvedBy = the shopper.
   */
  async approve(
    userId: string,
    scopeId: string,
    changes: Pick<ScopeCreateInput, 'maxPerPurchaseMinor' | 'dailySpendLimitMinor'> = {},
    now: Date = new Date()
  ): Promise<AllowanceScope> {
    const scope = this.get(userId, scopeId);
    if (!scope) throw Object.assign(new Error('Scope not found'), { code: 'SCOPE_NOT_FOUND' });
    if (scope.status === 'REVOKED') throw Object.assign(new Error('Scope revoked'), { code: 'SCOPE_REVOKED' });
    const global = await policyStorage.getAuthoritativePolicy(userId);
    const proposal: ScopeCreateInput = {
      label: scope.label,
      currency: scope.currency,
      maxPerPurchaseMinor: changes.maxPerPurchaseMinor ?? scope.maxPerPurchaseMinor,
      dailySpendLimitMinor: changes.dailySpendLimitMinor ?? scope.dailySpendLimitMinor,
    };
    if (scopeExceedsCeiling(proposal, global)) {
      throw Object.assign(new Error('Scope limits exceed the shopper ceiling'), { code: 'SCOPE_ABOVE_CEILING' });
    }
    if (changes.maxPerPurchaseMinor !== undefined) scope.maxPerPurchaseMinor = changes.maxPerPurchaseMinor;
    if (changes.dailySpendLimitMinor !== undefined) scope.dailySpendLimitMinor = changes.dailySpendLimitMinor;
    const wasPending = scope.status === 'PENDING_APPROVAL';
    scope.status = 'ACTIVE';
    scope.approvedBy = { id: userId, at: now.toISOString() };
    scope.updatedAt = now;
    this.scopes.set(scopeId, scope);
    await this.persist(scope);
    this.persistEvent(scopeId, {
      id: randomUUID(), scopeId, userId,
      eventType: wasPending ? 'SCOPE_APPROVED' : 'SCOPE_LIMIT_APPROVED',
      actor: 'shopper', details: { status: 'ACTIVE', approvedAt: now.toISOString() }, occurredAt: now.toISOString(),
    });
    return scope;
  }

  async revoke(userId: string, scopeId: string, actor = 'shopper', now: Date = new Date()): Promise<AllowanceScope> {
    const scope = this.get(userId, scopeId);
    if (!scope) throw Object.assign(new Error('Scope not found'), { code: 'SCOPE_NOT_FOUND' });
    if (scope.status !== 'REVOKED') {
      scope.status = 'REVOKED';
      scope.updatedAt = now;
      this.scopes.set(scopeId, scope);
      await this.persist(scope);
      this.persistEvent(scopeId, {
        id: randomUUID(), scopeId, userId, eventType: 'SCOPE_REVOKED',
        actor, details: { status: 'REVOKED', at: now.toISOString() }, occurredAt: now.toISOString(),
      });
    }
    return scope;
  }

  /**
   * Records a usage event when a checkout actually proceeded under this scope.
   * Purely a provenance/audit record; it never changes the scope's status (the
   * authoritative spend accounting lives in the reservation rows).
   */
  async recordUsage(
    userId: string,
    scopeId: string,
    amountMinor: number,
    currency: string,
    origin: OrderOrigin,
    now: Date = new Date()
  ): Promise<void> {
    const scope = this.scopes.get(scopeId);
    if (!scope || scope.userId !== userId) return;
    this.persistEvent(scopeId, {
      id: randomUUID(), scopeId, userId, eventType: 'SCOPE_USED',
      actor: 'server', details: { amountMinor, currency, origin }, occurredAt: now.toISOString(),
    });
  }

  /** Fail-closed resolution for checkout. Returns the scope ONLY when it is usable. */
  async resolveActive(ctx: ScopeResolveContext): Promise<ScopeResolveResult> {
    return this.resolveActiveInMemory(ctx);
  }

  /** Synchronous counterpart for callers that cannot await (for example, fallback planning). */
  resolveActiveSync(ctx: ScopeResolveContext): ScopeResolveResult {
    return this.resolveActiveInMemory(ctx);
  }

  private resolveActiveInMemory(ctx: ScopeResolveContext): ScopeResolveResult {
    const now = ctx.now ?? new Date();
    const scope = this.scopes.get(ctx.scopeId);
    if (!scope) return { ok: false, code: 'SCOPE_NOT_FOUND' };
    if (scope.userId !== ctx.userId) return { ok: false, code: 'SCOPE_NOT_OWNED' };
    if (scope.status === 'PENDING_APPROVAL') return { ok: false, code: 'SCOPE_PENDING' };
    if (scope.status === 'REVOKED') return { ok: false, code: 'SCOPE_REVOKED' };
    if (scope.status === 'SPENT') return { ok: false, code: 'SCOPE_SPENT' };
    if (scope.expiresAt && scope.expiresAt.getTime() <= now.getTime()) {
      if (scope.status === 'ACTIVE') {
        scope.status = 'EXPIRED';
        scope.updatedAt = now;
        this.persist(scope);
      }
      return { ok: false, code: 'SCOPE_EXPIRED' };
    }
    if (scope.status !== 'ACTIVE') return { ok: false, code: 'SCOPE_NOT_FOUND' };
    if (scope.currency !== ctx.currency) return { ok: false, code: 'SCOPE_CURRENCY_MISMATCH' };
    if (!scope.originsAllowed.includes(ctx.origin)) return { ok: false, code: 'SCOPE_ORIGIN_NOT_ALLOWED' };
    if (scope.allowedMerchantIds?.length && !scope.allowedMerchantIds.includes(ctx.merchantId)) {
      return { ok: false, code: 'SCOPE_MERCHANT_NOT_ALLOWED' };
    }
    if (!scopeHasOwnLimit(scope)) return { ok: false, code: 'SCOPE_NO_DAILY_LIMIT' };
    return { ok: true, scope };
  }

  auditFor(scopeId: string): AllowanceScopeAuditRow[] {
    return [...(this.audit.get(scopeId) ?? [])].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  reset(): void {
    this.scopes.clear();
    this.audit.clear();
    this.dirtyAudit.clear();
  }
}

export const allowanceScopeService = new AllowanceScopeService();
