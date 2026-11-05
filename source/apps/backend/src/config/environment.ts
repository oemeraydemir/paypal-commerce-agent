import dotenv from 'dotenv';
import { z } from 'zod';
import { resolveAIProviders, type AIProviderSettings } from '../ai/providers';
import { disableLangSmithTracing } from './disable-tracing';

dotenv.config();
// Must run after dotenv (a .env file could set these) and before any LangChain/LangSmith import.
disableLangSmithTracing();

const publicBackendUrl =
  process.env.RENDER_EXTERNAL_URL ?? 'http://10.0.2.2:3000';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PAYPAL_ENABLED: z.enum(['true', 'false']).default('false'),
  // Reservation lifecycle (see src/orders/payment-lifecycle.ts).
  RESERVATION_TTL_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
  RESERVATION_MAX_AGE_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
  RESERVATION_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 1000),
  // Server-issued anonymous sessions + abuse limits (P0 isolation).
  SESSION_IDLE_TTL_MS: z.coerce.number().int().positive().default(2 * 60 * 60 * 1000),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(24 * 60 * 60 * 1000),
  SESSION_MAX_ACTIVE: z.coerce.number().int().positive().default(1000),
  SESSION_CREATE_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(30),
  AI_CHAT_PER_SESSION_PER_MIN: z.coerce.number().int().positive().default(10),
  AI_CHAT_PER_IP_PER_MIN: z.coerce.number().int().positive().default(30),
  AI_CHAT_GLOBAL_PER_MIN: z.coerce.number().int().positive().default(120),
  // Number of reverse-proxy hops to trust for req.ip (Render = 1). 0 = none.
  // Durable storage (PostgreSQL). Optional: unset = in-memory only (tests / catalog-only
  // local runs). On Render the filesystem is ephemeral, so only a managed database counts.
  DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined)),
  // Path to a business profile JSON (name, currency, limits, catalog) for a merchant other than
  // the built-in AI Café. Read and validated at boot by config/business-profile.ts.
  BUSINESS_PROFILE_PATH: z.string().optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).default('true'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  // When 'true', refuse to start without DATABASE_URL — in ANY environment
  // (a silent in-memory fallback would lose orders on restart).
  REQUIRE_PERSISTENCE: z.enum(['true', 'false']).default(process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  TRUST_PROXY_HOPS: z.coerce
    .number()
    .int()
    .min(0)
    .default(process.env.NODE_ENV === 'production' ? 1 : 0),
});

const paypalSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  // Hackathon builds are sandbox-only; never allow a live-money configuration.
  PAYPAL_ENV: z.literal('sandbox').default('sandbox'),
  PAYPAL_RETURN_URL: z.string().url().default(
    `${publicBackendUrl.replace(/\/$/, '')}/api/checkout/return`
  ),
  PAYPAL_CANCEL_URL: z.string().url().default(
    `${publicBackendUrl.replace(/\/$/, '')}/api/checkout/cancel`
  ),
  // S5: webhook ID — optional even when PayPal is enabled (used only for
  // webhook signature verification and registration script).
  PAYPAL_WEBHOOK_ID: z.string().optional(),
});

const baseEnv = baseSchema.parse(process.env);

// Keep catalog-only local development available without payment credentials.
// Production builds require credentials; the PayPal client remains sandbox-only.
let paypalEnv: z.infer<typeof paypalSchema> | null = null;
if (baseEnv.NODE_ENV === 'production' || baseEnv.PAYPAL_ENABLED === 'true') {
  paypalEnv = paypalSchema.parse(process.env);
}

// AI providers are OPTIONAL (the agent is enabled when at least one provider
// key is present). The AI agent never touches payments directly — it only
// prepares carts (see S3). The registry + parsing live in src/ai/providers.ts
// (pure, testable, secret-free); here we only snapshot the ACTIVE providers,
// in AI_PROVIDER_ORDER, for this process. An OPENAI_API_KEY-only setup yields
// exactly one provider (openai) and behaves exactly as before.
const aiProviders = resolveAIProviders(process.env);
const aiEnv: { providers: AIProviderSettings[] } | null =
  aiProviders.length > 0 ? { providers: aiProviders } : null;

export const env = {
  ...baseEnv,
  paypal: paypalEnv,
  ai: aiEnv,
  isPayPalEnabled: (): boolean => paypalEnv !== null,
  isPersistenceConfigured: (): boolean => baseEnv.DATABASE_URL !== undefined,
  isAIEnabled: (): boolean => aiEnv !== null,
};

export type Env = typeof env;
