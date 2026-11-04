import type { ClientOptions } from "./client-options.js";
import type { AuthScheme } from "./core/api-request.js";
import { apiKeyHeaderAuth, bearerAuth } from "./core/auth/schemes.js";

export type AuthSchemes = {
  readonly sessionId: AuthScheme;
  readonly bearerAuth: AuthScheme;
  readonly opsKey: AuthScheme;
};

export function buildAuthSchemes(options: ClientOptions): AuthSchemes {
  return {
    sessionId: apiKeyHeaderAuth({ name: "X-Session-Id", token: options.sessionId }),
    bearerAuth: bearerAuth(options.bearerAuth),
    opsKey: apiKeyHeaderAuth({ name: "X-Ops-Key", token: options.opsKey }),
  };
}
