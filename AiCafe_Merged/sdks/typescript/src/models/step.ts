import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { actorSchema, type Actor } from "./actor.js";
import { keySchema, type Key } from "./key.js";
import { stateSchema, type State } from "./state.js";

/** steps. */
export type Step = {
  /** key (field). */
  key: Key;
  /** state (field). */
  state: State;
  /** actor (field). */
  actor: Actor;
};

export const stepSchema: Schema<Step> = s.object<Step>({
  key: keySchema,
  state: stateSchema,
  actor: actorSchema,
});
