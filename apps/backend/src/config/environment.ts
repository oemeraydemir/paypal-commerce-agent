import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const publicBackendUrl =
  process.env.RENDER_EXTERNAL_URL ?? 'http://10.0.2.2:3000';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  PAYPAL_ENABLED: z.enum(['true', 'false']).default('false'),
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

// AI / OpenAI is OPTIONAL (enabled when OPENAI_API_KEY is present). The AI
// agent never touches payments directly — it only prepares carts (see S3).
const aiSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
});

let aiEnv: z.infer<typeof aiSchema> | null = null;
if (process.env.OPENAI_API_KEY) {
  aiEnv = aiSchema.parse({ OPENAI_API_KEY: process.env.OPENAI_API_KEY });
}

export const env = {
  ...baseEnv,
  paypal: paypalEnv,
  ai: aiEnv,
  isPayPalEnabled: (): boolean => paypalEnv !== null,
  isAIEnabled: (): boolean => aiEnv !== null,
};

export type Env = typeof env;
