import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { OrderService } from '../orders/service';
import { policyStorage } from '../policy/storage';
import { Order, OrderStatus, OrderOrigin } from '../orders/domain';
import {
  CANONICALIZATION,
  SignedCartMandate,
  signCartMandate,
  signPayload,
  verifyCartMandate,
  verifyPayloadSignature,
} from '../mandate/mandate-service';

// Stage 3: Dispute Evidence Package ("Evidential Passport").
//
// Assembles the independent, server-verified records for an order into one
// tamper-evident bundle: the signed Cart Mandate (what the shopper was asked to
// approve), the authoritative policy events (which rules/limits were enforced),
// the order + PayPal references, and the human-approval status. The whole bundle
// is then signed with the SAME keyring as the mandate, so a single public key
// verifies both.
//
// PII minimization: policy events keep only id/timestamp/decision/rules/reason/
// amounts/policy-snapshot (no userId/sessionId/cartId); the order summary keeps
// item productIds and quantities but not prices/names of the shopper.

export const EVIDENCE_VERSION = 'aicafe.evidence/1';

export interface EvidenceOrderSummary {
  id: string;
  status: OrderStatus;
  origin: OrderOrigin;
  totalMinor: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{ productId: string; quantity: number }>;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalStatus?: string;
}

/** Full detail of a single policy rule that fired (which rule, why, expected vs actual). */
export interface EvidenceRuleDetail {
  type: string;
  rule: string;
  expected: string | number | string[] | number[];
  actual: string | number | string[] | number[];
  message: string;
}

export interface EvidencePolicyEvent {
  id: string;
  timestamp: string;
  decision: string;
  /** Rule types only (kept for compact display / backward compatibility). */
  violatedRules: string[];
  /** Priority 1: full rule detail — which rule fired, expected vs actual, and why. */
  ruleDetails: EvidenceRuleDetail[];
  reason: string;
  amountMinor: number;
  currency: string;
  policySnapshot: { maxPerPurchaseMinor: number; dailySpendLimitMinor: number; confirmationThresholdMinor: number };
}

export type EvidenceTimelineStepKind =
  | 'ORDER_CREATED'
  | 'POLICY_EVALUATED'
  | 'HUMAN_APPROVAL'
  | 'PAYMENT_CAPTURED';

/** Priority 1: one canonical, server-built timeline the UI can visualise as-is. */
export interface EvidenceTimelineStep {
  step: EvidenceTimelineStepKind;
  at: string;
  detail?: string;
  decision?: string;
}

/** Priority 1: an auto-generated, dispute-ready defense statement (JSON + narrative). */
export interface EvidenceDisputeDefense {
  templateVersion: 'aicafe.dispute-defense/1';
  claimType: 'AUTHORIZED_CHECKOUT';
  orderReference: string;
  amountMinor: number;
  currency: string;
  keyFacts: string[];
  evidencePointers: Array<{ label: string; pointer: string }>;
  recommendedResponse: string;
  /** Human-readable multi-line text, suitable for saving as .txt or printing to PDF. */
  narrative: string;
}

export interface EvidencePackagePayload {
  version: typeof EVIDENCE_VERSION;
  orderId: string;
  issuedAt: string;
  mandate: SignedCartMandate;
  order: EvidenceOrderSummary;
  policyEvents: EvidencePolicyEvent[];
  timeline: EvidenceTimelineStep[];
  disputeDefense: EvidenceDisputeDefense;
  humanApproval: {
    authority: 'buyer_approval_at_paypal';
    state: 'awaiting_approval' | 'approved' | 'not_recorded';
    paypalCaptureId?: string;
  };
}

export interface EvidencePackage extends EvidencePackagePayload {
  integrity: {
    alg: 'EdDSA';
    kid: string;
    canonicalization: typeof CANONICALIZATION;
    digest: string;
    signature: string;
  };
}

function approvalState(status: OrderStatus): EvidencePackagePayload['humanApproval']['state'] {
  switch (status) {
    case OrderStatus.PAID:
    case OrderStatus.ORDER_CONFIRMED:
      return 'approved';
    case OrderStatus.CART_READY:
    case OrderStatus.AWAITING_CONFIRMATION:
    case OrderStatus.PAYMENT_PENDING:
      return 'awaiting_approval';
    default:
      return 'not_recorded';
  }
}

// Priority 1: canonical, human-readable timeline (order -> policy -> approval -> capture).
// Kept in logical order (not re-sorted by timestamp) so it reads as a passport.
function buildTimeline(order: Order, policyEvents: EvidencePolicyEvent[]): EvidenceTimelineStep[] {
  const steps: EvidenceTimelineStep[] = [
    { step: 'ORDER_CREATED', at: order.createdAt.toISOString(), detail: order.id },
  ];
  for (const event of policyEvents) {
    steps.push({
      step: 'POLICY_EVALUATED',
      at: event.timestamp,
      decision: event.decision,
      detail: event.reason,
    });
  }
  steps.push({
    step: 'HUMAN_APPROVAL',
    at: order.updatedAt.toISOString(),
    detail: approvalState(order.status),
  });
  if (order.paypalCaptureId) {
    steps.push({
      step: 'PAYMENT_CAPTURED',
      at: order.updatedAt.toISOString(),
      detail: order.paypalCaptureId,
    });
  }
  return steps;
}

// Priority 1: an auto-generated dispute-defense template. It summarises the
// signed facts so a merchant can paste them into a chargeback response; it never
// asserts anything the evidence package does not already prove.
function buildDisputeDefense(
  order: Order,
  policyEvents: EvidencePolicyEvent[],
  timeline: EvidenceTimelineStep[]
): EvidenceDisputeDefense {
  const amount = `${(order.totalMinor / 100).toFixed(2)} ${order.currency}`;
  const approval = approvalState(order.status);
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);

  const keyFacts = [
    `Order ${order.id} was created on ${order.createdAt.toISOString()} for ${amount}.`,
    `The cart contained ${itemCount} item(s) across ${order.items.length} line(s).`,
    'Prices and totals were set by the server, never by the client or the AI agent.',
    `Policy enforcement is server-side: ${policyEvents.length} policy decision(s) recorded for this order.`,
    approval === 'approved'
      ? 'The buyer approved the payment at PayPal (buyer_approval_at_paypal).'
      : approval === 'awaiting_approval'
        ? 'The buyer has not approved the payment yet; no capture has occurred.'
        : 'No human approval is recorded for this order.',
  ];
  if (order.paypalCaptureId) {
    keyFacts.push(`PayPal capture ${order.paypalCaptureId} is recorded for the approved amount.`);
  }

  const evidencePointers = [
    { label: 'Signed Cart Mandate', pointer: 'mandate (EdDSA signature over the proposed cart)' },
    { label: 'Policy decisions', pointer: 'policyEvents[] (decision, rule, expected vs actual)' },
    { label: 'Human approval', pointer: 'humanApproval (buyer approval at PayPal)' },
    { label: 'Timeline', pointer: 'timeline[] (order -> policy -> approval -> capture)' },
    { label: 'Package integrity', pointer: 'integrity (EdDSA signature + SHA-256 digest)' },
  ];

  const recommendedResponse =
    approval === 'approved'
      ? 'This is an authorized, server-priced checkout. The signed mandate and the PayPal buyer approval together show the buyer approved the exact amount captured. Recommend representing the charge as authorized.'
      : 'Do not represent this as a completed charge: no buyer approval or capture is recorded. Provide the timeline as evidence of the current order state.';

  const narrative = [
    'DISPUTE / CHARGEBACK DEFENSE STATEMENT',
    `Order reference: ${order.id}`,
    `Amount: ${amount}`,
    `Status: ${order.status}`,
    `Buyer approval: ${approval}`,
    '',
    'Timeline:',
    ...timeline.map((s) => `- ${s.at}  ${s.step}${s.decision ? ' [' + s.decision + ']' : ''}${s.detail ? ' — ' + s.detail : ''}`),
    '',
    'Key facts:',
    ...keyFacts.map((f) => `- ${f}`),
    '',
    'Evidence pointers:',
    ...evidencePointers.map((e) => `- ${e.label}: ${e.pointer}`),
    '',
    `Recommended response: ${recommendedResponse}`,
    '',
    'Generated from a server-signed evidence package. Verify it independently via POST /api/evidence/verify.',
  ].join('\n');

  return {
    templateVersion: 'aicafe.dispute-defense/1',
    claimType: 'AUTHORIZED_CHECKOUT',
    orderReference: order.id,
    amountMinor: order.totalMinor,
    currency: order.currency,
    keyFacts,
    evidencePointers,
    recommendedResponse,
    narrative,
  };
}

export function buildEvidencePackage(orderId: string): EvidencePackage | null {
  const order = OrderService.getInstance().getById(orderId);
  if (!order) return null;

  const mandate = signCartMandate(order);

  const policyEvents: EvidencePolicyEvent[] = policyStorage
    .getEvents()
    .filter((e) => e.orderId === order.id)
    .map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      decision: e.decision,
      violatedRules: e.violatedRules.map((v) => v.type),
      // Priority 1: keep the full rule detail so a dispute reviewer can see
      // exactly which rule fired and the expected vs actual values.
      ruleDetails: e.violatedRules.map((v) => ({
        type: v.type,
        rule: v.rule,
        expected: v.expected,
        actual: v.actual,
        message: v.message,
      })),
      reason: e.reason,
      amountMinor: e.amountMinor,
      currency: e.currency,
      policySnapshot: e.policySnapshot,
    }));

  const summary: EvidenceOrderSummary = {
    id: order.id,
    status: order.status,
    origin: order.origin,
    totalMinor: order.totalMinor,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: [...order.items].map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
  if (order.paypalOrderId) summary.paypalOrderId = order.paypalOrderId;
  if (order.paypalCaptureId) summary.paypalCaptureId = order.paypalCaptureId;
  if (order.paypalStatus) summary.paypalStatus = order.paypalStatus;

  const timeline = buildTimeline(order, policyEvents);
  const disputeDefense = buildDisputeDefense(order, policyEvents, timeline);

  const payload: EvidencePackagePayload = {
    version: EVIDENCE_VERSION,
    orderId: order.id,
    issuedAt: new Date().toISOString(),
    mandate,
    order: summary,
    policyEvents,
    timeline,
    disputeDefense,
    humanApproval: {
      authority: 'buyer_approval_at_paypal',
      state: approvalState(order.status),
      ...(order.paypalCaptureId ? { paypalCaptureId: order.paypalCaptureId } : {}),
    },
  };

  const canonical = Buffer.from(stringify(payload));
  const digest = crypto.createHash('sha256').update(canonical).digest('hex');
  const { signature, kid } = signPayload(payload);

  return {
    ...payload,
    integrity: { alg: 'EdDSA', kid, canonicalization: CANONICALIZATION, digest, signature },
  };
}

export interface EvidenceVerification {
  valid: boolean;
  checks: {
    present: boolean;
    signature: boolean;
    digest: boolean;
    mandateValid: boolean;
    matchesOrder: boolean;
    notExpired: boolean;
  };
  reason?: string;
}

const noChecks: EvidenceVerification['checks'] = {
  present: false,
  signature: false,
  digest: false,
  mandateValid: false,
  matchesOrder: false,
  notExpired: false,
};

export function verifyEvidencePackage(input: unknown): EvidenceVerification {
  const pkg = input as Partial<EvidencePackage> | undefined;
  const checks: EvidenceVerification['checks'] = { ...noChecks };

  if (!pkg || typeof pkg !== 'object') {
    return { valid: false, checks, reason: 'Expected an evidence package.' };
  }
  if (pkg.version !== EVIDENCE_VERSION) {
    return { valid: false, checks, reason: `Unsupported evidence version; expected ${EVIDENCE_VERSION}.` };
  }
  checks.present = true;

  const { integrity, ...payload } = pkg as EvidencePackage;
  if (!integrity || typeof integrity.signature !== 'string' || typeof integrity.kid !== 'string') {
    return { valid: false, checks, reason: 'Evidence package is missing its integrity block.' };
  }

  const canonical = Buffer.from(stringify(payload));
  const digest = crypto.createHash('sha256').update(canonical).digest('hex');
  checks.digest = digest === integrity.digest;
  checks.signature = verifyPayloadSignature(integrity.signature, integrity.kid, payload);

  if (payload.mandate && typeof payload.mandate === 'object') {
    const mv = verifyCartMandate(payload.mandate as unknown as SignedCartMandate, (id) =>
      OrderService.getInstance().getById(id)
    );
    checks.mandateValid = mv.valid;
    checks.notExpired = mv.checks.notExpired;
  }

  const living = OrderService.getInstance().getById(payload.orderId);
  checks.matchesOrder =
    !!living &&
    living.id === payload.orderId &&
    living.status === payload.order?.status &&
    living.totalMinor === payload.order?.totalMinor &&
    living.currency === payload.order?.currency;

  const valid = checks.signature && checks.digest && checks.mandateValid && checks.matchesOrder;
  return {
    valid,
    checks,
    reason: valid
      ? undefined
      : 'Evidence integrity, mandate or order-match check failed.',
  };
}
