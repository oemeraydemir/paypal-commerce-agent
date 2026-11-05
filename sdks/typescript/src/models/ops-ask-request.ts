import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** ops ask request. */
export type OpsAskRequest = {
  /** question (field). */
  question: string;
};

export const opsAskRequestSchema: Schema<OpsAskRequest> = s.object<OpsAskRequest>({
  question: s.string(),
});
