import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
import { OrderService } from '../orders/service';
import { policyStorage } from '../policy/storage';
import { OrderStatus, OrderOrigin } from '../orders/domain';
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

export interface EvidencePolicyEvent {
  id: string;
  timestamp: string;
  decision: string;
  violatedRules: string[];
  reason: string;
  amountMinor: number;
  currency: string;
  policySnapshot: { maxPerPurchaseMinor: number; dailySpendLimitMinor: number; confirmationThresholdMinor: number };
}

export interface EvidencePackagePayload {
  version: typeof EVIDENCE_VERSION;
  orderId: string;
  issuedAt: string;
  mandate: SignedCartMandate;
  order: EvidenceOrderSummary;
  policyEvents: EvidencePolicyEvent[];
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

  const payload: EvidencePackagePayload = {
    version: EVIDENCE_VERSION,
    orderId: order.id,
    issuedAt: new Date().toISOString(),
    mandate,
    order: summary,
    policyEvents,
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
