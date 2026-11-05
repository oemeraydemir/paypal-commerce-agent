import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** How the order was created. */
export const OrderOrigin = {
  ValueAiAssistedDescriptionAiConfirmedByAHuman:
    '{"value":"AI_ASSISTED","description":"AI confirmed by a human"}',
  ValueAiAgentDescriptionInitiatedByAi: '{"value":"AI_AGENT","description":"Initiated by AI"}',
  ValueHumanDescriptionCreatedByAHuman: '{"value":"HUMAN","description":"Created by a human"}',
} as const;
export type OrderOrigin = (typeof OrderOrigin)[keyof typeof OrderOrigin] | (string & {});

export const orderOriginSchema: EnumSchema<OrderOrigin> = s.enumOf<OrderOrigin>(OrderOrigin);
