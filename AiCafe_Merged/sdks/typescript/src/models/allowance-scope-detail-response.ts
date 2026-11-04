import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { allowanceScopeSchema, type AllowanceScope } from "./allowance-scope.js";

export type AllowanceScopeDetailResponse = {
  scope?: AllowanceScope;
  /** Audit events for the scope. */
  events?: Record<string, unknown>[];
};

export const allowanceScopeDetailResponseSchema: Schema<AllowanceScopeDetailResponse> =
  s.object<AllowanceScopeDetailResponse>({
    scope: s.optional(s.lazy(() => allowanceScopeSchema)),
    events: s.optional(s.array(s.record(s.string(), s.unknown()))),
  });
