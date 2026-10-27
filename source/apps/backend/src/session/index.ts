import { env } from '../config/environment';
import { policyStorage } from '../policy/storage';
import { SessionStore } from './session-store';

// Shared singleton. When a session expires its per-session policy is freed;
// orders, reservations and policy events are kept (the payment reconciler and
// the dashboard still need them).
export const sessionStore = new SessionStore({
  idleTtlMs: env.SESSION_IDLE_TTL_MS,
  maxAgeMs: env.SESSION_MAX_AGE_MS,
  maxActive: env.SESSION_MAX_ACTIVE,
  createPerIpPerHour: env.SESSION_CREATE_PER_IP_PER_HOUR,
});

sessionStore.setExpiryListener((record) => {
  policyStorage.deletePolicy(record.userId);
});

const sweepTimer = setInterval(() => sessionStore.sweep(), 5 * 60 * 1000);
sweepTimer.unref();

export * from './session-store';
