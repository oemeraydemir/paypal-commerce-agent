import { resetSessionRateLimiters } from '../../src/middleware/rate-limit';
import request from 'supertest';
import type { Express } from 'express';
import { sessionStore, userIdForSessionId } from '../../src/session';
import { resetAiRouteState } from '../../src/routes/ai';

// Test helper for the server-issued session model: sessions are minted through
// the real POST /api/sessions endpoint, never fabricated.
export interface TestSession {
  sessionId: string;
  userId: string;
  token: string;
  /** Headers proving ownership of this session. */
  headers: { 'X-Session-Id': string; Authorization: string };
}

export async function newSession(app: Express): Promise<TestSession> {
  const res = await request(app).post('/api/sessions');
  if (res.status !== 201) {
    throw new Error(`session creation failed in test: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const { sessionId, sessionToken } = res.body;
  const session = {
    sessionId,
    userId: userIdForSessionId(sessionId),
    token: sessionToken,
    headers: { 'X-Session-Id': sessionId, Authorization: `Bearer ${sessionToken}` },
  };
  const profile = await request(app).put('/api/wellbeing/preferences').set(session.headers).send({ preferences: { dietary: [], allergens: [] } });
  if (profile.status !== 200) throw new Error(`test wellbeing profile initialization failed: ${profile.status}`);
  return session;
}

/** Clears sessions, session-creation counters, AI history and AI rate limits. */
export function resetSessionState(): void {
  sessionStore.reset();
  resetAiRouteState();
  resetSessionRateLimiters();
}
