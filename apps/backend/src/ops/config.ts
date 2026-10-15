import { z } from 'zod';
import { env } from '../config/environment';

// Ops Copilot configuration. Read lazily (per call) so the feature can be toggled without code
// changes and unit-tested. The copilot reads merchant data from the PayPal sandbox account, so it is
// OFF by default and can only be switched on together with a shared access key: an unauthenticated
// endpoint must never be able to read payment data or spend OpenAI credits.
const schema = z.object({
  OPS_COPILOT_ENABLED: z.enum(['true', 'false']).default('false'),
  OPS_COPILOT_KEY: z.string().min(16).optional(),
  OPS_COPILOT_PER_IP_PER_MIN: z.coerce.number().int().positive().default(6),
});

export interface OpsConfig {
  enabled: boolean;
  /** Present only when enabled. Never log or return this value. */
  key?: string;
  perIpPerMin: number;
  /** Human-readable reason when disabled (safe to expose). */
  reason?: string;
}

export function getOpsConfig(): OpsConfig {
  const parsed = schema.safeParse({
    OPS_COPILOT_ENABLED: process.env.OPS_COPILOT_ENABLED || undefined,
    OPS_COPILOT_KEY: process.env.OPS_COPILOT_KEY || undefined,
    OPS_COPILOT_PER_IP_PER_MIN: process.env.OPS_COPILOT_PER_IP_PER_MIN || undefined,
  });
  const perIpPerMin = parsed.success ? parsed.data.OPS_COPILOT_PER_IP_PER_MIN : 6;

  if (!parsed.success) {
    return { enabled: false, perIpPerMin, reason: 'Ops Copilot is misconfigured (OPS_COPILOT_KEY needs at least 16 characters).' };
  }
  const { OPS_COPILOT_ENABLED, OPS_COPILOT_KEY } = parsed.data;
  if (OPS_COPILOT_ENABLED !== 'true') return { enabled: false, perIpPerMin, reason: 'Ops Copilot is disabled on this server.' };
  if (!OPS_COPILOT_KEY) return { enabled: false, perIpPerMin, reason: 'Ops Copilot requires OPS_COPILOT_KEY.' };
  if (!env.isPayPalEnabled()) return { enabled: false, perIpPerMin, reason: 'Ops Copilot needs PayPal sandbox credentials.' };
  if (!env.isAIEnabled()) return { enabled: false, perIpPerMin, reason: 'Ops Copilot needs OPENAI_API_KEY.' };
  return { enabled: true, key: OPS_COPILOT_KEY, perIpPerMin };
}
