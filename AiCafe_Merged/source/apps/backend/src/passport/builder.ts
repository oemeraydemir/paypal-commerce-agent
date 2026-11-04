// AI Transaction Passport.
//
// A transparent, human-readable explanation of ONE prepared cart: which server-verified prices were
// used, which of the shopper's own rules were checked, and who holds payment authority. It is derived
// entirely from data the server already computed (validated items + the policy evaluation). It is NOT a
// new system of record, never stored, never signed, and never a claim about what the AI "thought":
// the signed record of a real order is the Cart Mandate (src/mandate).
//
// Design rules (kept deliberately conservative):
//   - `paymentAuthority` is ALWAYS 'shopper'. There is no code path that can produce anything else.
//   - Allergen / dietary labels are café-declared sample data. The passport says so; it never says "safe".
//   - Pure function: same input, same output. No I/O, no clock, so it is trivially testable.

export type PassportStepState = 'done' | 'pending' | 'blocked';

export interface PassportLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface PassportCheckInput {
  rule: string;
  label: string;
  status: 'pass' | 'confirm' | 'fail';
  detail: string;
}

export interface PassportInput {
  items: PassportLine[];
  totalMinor: number;
  currency: string;
  decision: 'AUTO_ALLOW' | 'REQUIRE_CONFIRMATION' | 'BLOCK';
  maxPerPurchaseMinor: number;
  confirmationThresholdMinor: number;
  dailyRemainingMinor: number;
  checks: PassportCheckInput[];
  /** Whether the shopper has stated a diet/allergen concern for this session. */
  hasWellbeingGuard: boolean;
}

export interface PassportStep {
  key: 'prepared' | 'prices' | 'limit' | 'approval' | 'paypal' | 'verify';
  state: PassportStepState;
  actor: 'ai' | 'server' | 'shopper' | 'paypal';
}

export interface TransactionPassport {
  kind: 'transaction-passport';
  /** The passport describes a cart that is being prepared, not a completed payment. */
  isPaymentRecord: false;
  totalMinor: number;
  currency: string;
  lines: PassportLine[];
  basis: {
    pricesSource: 'server-catalog';
    clientPricesIgnored: true;
    limitSetBy: 'shopper-policy';
  };
  mandate: {
    maxPerPurchaseMinor: number;
    approvalThresholdMinor: number;
    cartMinor: number;
    remainingMinor: number;
    usedPercent: number; // 0..100, cart as a share of the per-purchase limit
    /** 0..100 position of the approval threshold on the same bar (server-computed so clients only draw it). */
    thresholdPercent: number;
    dailyRemainingMinor: number;
    aiCanChangeLimit: false;
  };
  control: {
    decision: PassportInput['decision'];
    withinLimit: boolean;
    requiresShopperApproval: boolean;
    paymentAuthority: 'shopper';
    agentCanPay: false;
  };
  checks: PassportCheckInput[];
  steps: PassportStep[];
  notices: Array<'sample-menu-data' | 'allergen-unverified' | 'sandbox-only'>;
}

export function buildTransactionPassport(input: PassportInput): TransactionPassport {
  const withinLimit = input.totalMinor <= input.maxPerPurchaseMinor && input.decision !== 'BLOCK';
  const blocked = input.decision === 'BLOCK';
  const limit = Math.max(1, input.maxPerPurchaseMinor);
  const usedPercent = Math.max(0, Math.min(100, Math.round((input.totalMinor / limit) * 100)));
  const thresholdPercent = Math.max(0, Math.min(100, Math.round((input.confirmationThresholdMinor / limit) * 100)));

  // The flow is the same for every cart: the AI only prepares; the shopper approves on PayPal.
  // When the policy blocks the cart, nothing after the limit check can happen.
  const after: PassportStepState = blocked ? 'blocked' : 'pending';
  const steps: PassportStep[] = [
    { key: 'prepared', state: 'done', actor: 'ai' },
    { key: 'prices', state: 'done', actor: 'server' },
    { key: 'limit', state: blocked ? 'blocked' : 'done', actor: 'server' },
    { key: 'approval', state: after, actor: 'shopper' },
    { key: 'paypal', state: after, actor: 'paypal' },
    { key: 'verify', state: after, actor: 'server' },
  ];

  const notices: TransactionPassport['notices'] = ['sample-menu-data', 'sandbox-only'];
  if (input.hasWellbeingGuard) notices.push('allergen-unverified');

  return {
    kind: 'transaction-passport',
    isPaymentRecord: false,
    totalMinor: input.totalMinor,
    currency: input.currency,
    lines: input.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      lineTotalMinor: i.lineTotalMinor,
    })),
    basis: { pricesSource: 'server-catalog', clientPricesIgnored: true, limitSetBy: 'shopper-policy' },
    mandate: {
      maxPerPurchaseMinor: input.maxPerPurchaseMinor,
      approvalThresholdMinor: input.confirmationThresholdMinor,
      cartMinor: input.totalMinor,
      remainingMinor: input.maxPerPurchaseMinor - input.totalMinor,
      usedPercent,
      thresholdPercent,
      dailyRemainingMinor: input.dailyRemainingMinor,
      aiCanChangeLimit: false,
    },
    control: {
      decision: input.decision,
      withinLimit,
      requiresShopperApproval: !blocked,
      paymentAuthority: 'shopper',
      agentCanPay: false,
    },
    checks: input.checks,
    steps,
    notices,
  };
}
