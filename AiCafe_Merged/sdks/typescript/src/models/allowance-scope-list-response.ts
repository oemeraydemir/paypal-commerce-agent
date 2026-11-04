import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { allowanceScopeSchema, type AllowanceScope } from "./allowance-scope.js";

export type AllowanceScopeListResponse = {
  /** The shopper's scopes. */
  scopes?: AllowanceScope[];
};

export const allowanceScopeListResponseSchema: Schema<AllowanceScopeListResponse> =
  s.object<AllowanceScopeListResponse>({
    scopes: s.optional(s.array(s.lazy(() => allowanceScopeSchema))),
  });
