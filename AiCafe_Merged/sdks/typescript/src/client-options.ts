import type { TokenProvider } from "./core/auth/credentials.js";
import type { CoreClientOptions } from "./core/client-options.js";
import { ServerEnvironment } from "./servers.js";

export type ClientOptions = SdkClientOptions & CoreClientOptions;

type SdkClientOptions = ServerOptions & {
  /** Server-issued opaque session id (from POST /api/sessions). */
  readonly sessionId?: TokenProvider | undefined;
  /**
   * Server-issued session token (from POST /api/sessions), sent as `Authorization: Bearer <token>`.
   */
  readonly bearerAuth?: TokenProvider | undefined;
  /** Merchant key (OPS_COPILOT_KEY, 16+ characters). */
  readonly opsKey?: TokenProvider | undefined;
};

type ServerOptions =
  | {
      readonly serverEnvironment?: typeof ServerEnvironment.Production;
      /** Hosted demo (Render) */
      readonly serverOptions?: {
        baseUrl?: string;
      };
    }
  | {
      readonly serverEnvironment: typeof ServerEnvironment.Environment2;
      /** Hosted demo (Render) */
      readonly serverOptions?: {
        baseUrl?: string;
      };
    };
