import {
  PolicyEvent,
  PolicyEvaluation,
  PolicyViolation,
  PolicyStats,
  PurchasePolicy,
  policyBlockReason,
} from './domain';
import { defaultPolicy } from './default-policy';
import { getRepos, writeQueue } from '../persistence/registry';
import { SpendingMandateEvent } from '../persistence/types';

const POLICY_EVENT_HISTORY_LIMIT = 2000;

export class PolicyStorage {
  private readonly policies = new Map<string, PurchasePolicy>();
  private readonly revisions = new Map<string, number>();
  private readonly memoryMandateEvents = new Map<string, SpendingMandateEvent>();
  private readonly events: PolicyEvent[] = [];
  private eventSequence = 0;
  private readonly dirtyEvents = new Map<string, PolicyEvent>();

  // ---- durability: the dashboard's history and AI-share stats survive a restart ----
  private persistEvent(event: PolicyEvent): void {
    const repos = getRepos();
    if (!repos) return;
    this.dirtyEvents.set(event.id, event);
    writeQueue
      .enqueue(`policy-event:${event.id}`, async () => {
        await repos.policyEvents.save(event);
        this.dirtyEvents.delete(event.id);
      })
      .catch(() => undefined);
  }

  async retryDirty(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const pending = [...this.dirtyEvents.values()];
    for (const event of pending) {
      await writeQueue.enqueue(
        `policy-event-retry:${event.id}`,
        async () => {
          await repos.policyEvents.save(event);
          this.dirtyEvents.delete(event.id);
        },
        { retries: 0 }
      );
    }
    return pending.length;
  }

  /** Loads the most recent events and moves the id sequence past them (no id collisions). */
  async hydrate(): Promise<number> {
    const repos = getRepos();
    if (!repos) return 0;
    const mandates = await repos.mandates.loadAll();
    for (const mandate of mandates) this.setPolicy(mandate.policy, mandate.revision);
    const loaded: PolicyEvent[] = await repos.policyEvents.loadRecent(POLICY_EVENT_HISTORY_LIMIT);
    this.events.length = 0;
    for (const event of loaded) {
      this.events.push(event);
      const suffix = Number(event.id.slice(event.id.lastIndexOf('-') + 1));
      if (Number.isInteger(suffix) && suffix >= this.eventSequence) this.eventSequence = suffix + 1;
    }
    return loaded.length;
  }

  setPolicy(policy: PurchasePolicy, revision?: number): void {
    this.policies.set(policy.userId, policy);
    this.revisions.set(policy.userId, revision ?? ((this.revisions.get(policy.userId) ?? 0) + 1));
  }

  getRevision(userId: string): number {
    return this.revisions.get(userId) ?? 1;
  }

  async getAuthoritativePolicy(userId: string): Promise<PurchasePolicy> {
    const current = this.getOrCreatePolicy(userId);
    const repos = getRepos();
    if (!repos) return current;
    const stored = await repos.mandates.getOrCreate(current);
    this.setPolicy(stored.policy, stored.revision);
    return stored.policy;
  }

  async updateMandate(policy: PurchasePolicy, sessionId: string): Promise<PurchasePolicy | undefined> {
    const expectedRevision = this.getRevision(policy.userId);
    const eventId = `${policy.userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const repos = getRepos();
    if (repos) {
      const stored = await repos.mandates.update({
        policy, expectedRevision, sessionId, eventId, eventType: 'UPDATED',
      });
      if (!stored) return undefined;
      this.setPolicy(stored.policy, stored.revision);
      return stored.policy;
    }
    const nextRevision = expectedRevision + 1;
    const next = { ...policy, updatedAt: new Date() };
    this.setPolicy(next, nextRevision);
    this.memoryMandateEvents.set(policy.userId, {
      id: eventId, userId: policy.userId, sessionId, eventType: 'UPDATED',
      revision: nextRevision, beforeSnapshot: undefined,
      afterSnapshot: { maxPerPurchaseMinor: next.maxPerPurchaseMinor, dailySpendLimitMinor: next.dailySpendLimitMinor,
        currency: next.currency, allowedMerchantIds: [...next.allowedMerchantIds],
        validUntil: next.validUntil?.toISOString() ?? null },
      occurredAt: next.updatedAt,
    });
    return next;
  }

  async getLastMandateEvent(userId: string): Promise<SpendingMandateEvent | undefined> {
    const repos = getRepos();
    return repos ? repos.mandates.getLastEvent(userId) : this.memoryMandateEvents.get(userId);
  }

  getPolicy(userId: string): PurchasePolicy | undefined {
    return this.policies.get(userId);
  }

  // Per-user policy: every user (session) gets its OWN copy of the default policy
  // the first time it is needed, so limits and rules are never shared.
  getOrCreatePolicy(userId: string): PurchasePolicy {
    const existing = this.policies.get(userId);
    if (existing) return existing;
    const now = new Date();
    const created: PurchasePolicy = {
      ...defaultPolicy,
      id: `policy-${userId}`,
      userId,
      allowedMerchantIds: [...defaultPolicy.allowedMerchantIds],
      blockedCategoryIds: [...defaultPolicy.blockedCategoryIds],
      requiredDietaryAttributes: [...defaultPolicy.requiredDietaryAttributes],
      blockedDietaryAttributes: [...defaultPolicy.blockedDietaryAttributes],
      createdAt: now,
      updatedAt: now,
    };
    this.setPolicy(created, 1);
    return created;
  }

  deletePolicy(userId: string): void {
    this.policies.delete(userId);
  }

  /**
   * Read-only aggregate over the per-session policies that actually exist right now.
   * It never creates a policy (unlike getOrCreatePolicy), so looking at the dashboard
   * cannot fabricate state. `customized` = policies whose limits differ from the template.
   */
  sessionPolicyStats(): { active: number; customized: number } {
    let customized = 0;
    for (const p of this.policies.values()) {
      if (
        p.maxPerPurchaseMinor !== defaultPolicy.maxPerPurchaseMinor ||
        p.dailySpendLimitMinor !== defaultPolicy.dailySpendLimitMinor ||
        p.confirmationThresholdMinor !== defaultPolicy.confirmationThresholdMinor ||
        p.enabled !== defaultPolicy.enabled
      ) {
        customized++;
      }
    }
    return { active: this.policies.size, customized };
  }

  addEvent(event: PolicyEvent): void {
    this.events.push(event);
    this.persistEvent(event);
  }

  // S10 (R6): builds and stores a PolicyEvent in one step so advisory and
  // authoritative call-sites cannot disagree on the event shape.
  recordEvent(params: {
    userId: string;
    sessionId?: string;
    cartId: string;
    orderId?: string;
    agent: string;
    amountMinor: number;
    currency: string;
    evaluation: PolicyEvaluation;
    policy: PurchasePolicy;
  }): PolicyEvent {
    const violationTypes = params.evaluation.violations.map((v: PolicyViolation) => v.type);
    const guardDataVersion = params.evaluation.guardDataVersion;
    const event: PolicyEvent = {
      id: `${params.userId}-${params.cartId}-${this.eventSequence++}`,
      timestamp: new Date().toISOString(),
      userId: params.userId,
      sessionId: params.sessionId,
      cartId: params.cartId,
      orderId: params.orderId,
      agent: params.agent,
      amountMinor: params.amountMinor,
      currency: params.currency,
      decision: params.evaluation.decision,
      violatedRules: params.evaluation.violations,
      reason: policyBlockReason(violationTypes, params.evaluation.decision),
      policySnapshot: {
        maxPerPurchaseMinor: params.policy.maxPerPurchaseMinor,
        dailySpendLimitMinor: params.policy.dailySpendLimitMinor,
        confirmationThresholdMinor: params.policy.confirmationThresholdMinor,
      },
      guardDataVersion,
      wellbeingDecision: params.evaluation.wellbeingDecision,
    };
    this.events.push(event);
    this.persistEvent(event);
    return event;
  }

  getEvents(userId?: string): PolicyEvent[] {
    return userId === undefined
      ? [...this.events]
      : this.events.filter((event) => event.userId === userId);
  }

  getEvent(id: string): PolicyEvent | undefined {
    return this.events.find((event) => event.id === id);
  }

  getStats(userId?: string): PolicyStats {
    const events = this.getEvents(userId);

    return {
      totalRequests: events.length,
      blocked: events.filter((event) => event.decision === 'BLOCK').length,
      allowed: events.filter((event) => event.decision !== 'BLOCK').length,
      correlatedWithOrder: events.filter(
        (event) => event.orderId !== undefined
      ).length,
    };
  }

  // S10 (test isolation): clears event history and re-seeds the default policy.
  reset(): void {
    this.policies.clear();
    this.events.length = 0;
    this.revisions.clear();
    this.memoryMandateEvents.clear();
    this.eventSequence = 0;
    this.dirtyEvents.clear();
    this.setPolicy(defaultPolicy);
  }
}

// S10: shared singleton. Auto-seeded with the demo user's default policy so the
// advisory and authoritative enforcement points share the same state.
export const policyStorage = new PolicyStorage();
policyStorage.setPolicy(defaultPolicy);
