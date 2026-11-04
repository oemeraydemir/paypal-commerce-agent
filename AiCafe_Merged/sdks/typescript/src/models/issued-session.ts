import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";

/** issued session. */
export type IssuedSession = {
  /** session identifier (field). */
  sessionId: string;
  /** Returned exactly once; present as Bearer token. */
  sessionToken: string;
  /** expiration timestamp (RFC 3339) (field). */
  expiresAt: Date;
};

export const issuedSessionSchema: Schema<IssuedSession> = s.object<IssuedSession>({
  sessionId: s.string(),
  sessionToken: s.string(),
  expiresAt: s.dateTime(),
});
