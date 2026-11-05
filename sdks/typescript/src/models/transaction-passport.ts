import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { basisSchema, type Basis } from "./basis.js";
import { controlSchema, type Control } from "./control.js";
import { lineSchema, type Line } from "./line.js";
import { mandateSchema, type Mandate } from "./mandate.js";
import { noticeSchema, type Notice } from "./notice.js";
import { policyCheckSchema, type PolicyCheck } from "./policy-check.js";
import { stepSchema, type Step } from "./step.js";

/**
 * Read-only, server-derived explanation of one prepared cart. Not a payment record, never stored or
 * signed; payment authority is always the shopper.
 */
export type TransactionPassport = {
  /**
   * kind (field).
   *
   * @default '{\n "value": "transaction-passport",\n "description": "Enum value
   * transaction-passport."\n}'
   */
  kind?: '{\n  "value": "transaction-passport",\n  "description": "Enum value transaction-passport."\n}';
  /** is payment record (field). @default "False" */
  isPaymentRecord?: "False";
  /** total in minor currency units (field). */
  totalMinor: number;
  /** ISO 4217 currency code (e.g. EUR) (field). */
  currency: string;
  /** lines (field). */
  lines: Line[];
  /** basis. */
  basis?: Basis;
  /** mandate. */
  mandate: Mandate;
  /** control. */
  control: Control;
  /** checks (field). */
  checks?: PolicyCheck[];
  /** steps (field). */
  steps: Step[];
  /** notices (field). */
  notices: Notice[];
};

export const transactionPassportSchema: Schema<TransactionPassport> = s.object<TransactionPassport>({
  kind: s.defaulted(
    s.literal(
      '{\n  "value": "transaction-passport",\n  "description": "Enum value transaction-passport."\n}',
    ),
    '{\n  "value": "transaction-passport",\n  "description": "Enum value transaction-passport."\n}',
  ),
  isPaymentRecord: s.defaulted(s.literal("False"), "False"),
  totalMinor: s.int(),
  currency: s.string(),
  lines: s.array(s.lazy(() => lineSchema)),
  basis: s.optional(s.lazy(() => basisSchema)),
  mandate: mandateSchema,
  control: controlSchema,
  checks: s.optional(s.array(s.lazy(() => policyCheckSchema))),
  steps: s.array(s.lazy(() => stepSchema)),
  notices: s.array(s.lazy(() => noticeSchema)),
});
