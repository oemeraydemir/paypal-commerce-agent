import {
  PolicyEvent,
  PolicyEvaluation,
  PolicyStats,
  PurchasePolicy,
  policyBlockReason,
} from './domain';
import { defaultPolicy } from './default-policy';

export class PolicyStorage {
  private readonly policies = new Map<string, PurchasePolicy>();
  private readonly events: PolicyEvent[] = [];
  private eventSequence = 0;

  setPolicy(policy: PurchasePolicy): void {
    this.policies.set(policy.userId, policy);
  }

  getPolicy(userId: string): PurchasePolicy | undefined {
    return this.policies.get(userId);
  }

  addEvent(event: PolicyEvent): void {
    this.events.push(event);
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
    const violationTypes = params.evaluation.violations.map((v) => v.type);
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
    };
    this.events.push(event);
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
    this.eventSequence = 0;
    this.setPolicy(defaultPolicy);
  }
}

// S10: shared singleton. Auto-seeded with the demo user's default policy so the
// advisory and authoritative enforcement points share the same state.
export const policyStorage = new PolicyStorage();
policyStorage.setPolicy(defaultPolicy);