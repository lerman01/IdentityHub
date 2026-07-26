import { describe, expect, it } from 'vitest';
import type { Session, SessionData } from 'express-session';
import { handleCallback, startOAuth } from '../src/modules/jira/jiraConnectionService.js';
import { createTestUser } from './helpers.js';

type FakeSession = Session & Partial<SessionData>;
const fakeSession = (data: Partial<SessionData> = {}): FakeSession => data as FakeSession;

// These paths return before any network call — no mocking needed.
describe('OAuth callback state verification (CSRF)', () => {
  it('refuses to start the flow when the Atlassian app is not configured', () => {
    // Test env deliberately has no ATLASSIAN_CLIENT_ID/SECRET.
    expect(() => startOAuth(fakeSession())).toThrow(/not configured/i);
  });

  it('rejects a callback whose state does not match (and consumes the state)', async () => {
    const user = createTestUser();
    const session = fakeSession({ jiraOAuthState: 'expected-state' });

    const result = await handleCallback(session, user.id, {
      code: 'auth-code',
      state: 'attacker-forged-state',
    });

    expect(result).toEqual({ kind: 'error', reason: 'state' });
    expect(session.jiraOAuthState).toBeUndefined();
  });

  it('rejects a callback with no stored state (replay)', async () => {
    const user = createTestUser();
    const result = await handleCallback(fakeSession(), user.id, {
      code: 'auth-code',
      state: 'anything',
    });
    expect(result).toEqual({ kind: 'error', reason: 'state' });
  });

  it('maps user consent denial to a friendly outcome', async () => {
    const user = createTestUser();
    const session = fakeSession({ jiraOAuthState: 's' });
    const result = await handleCallback(session, user.id, { error: 'access_denied' });
    expect(result).toEqual({ kind: 'denied' });
  });

  it('rejects a callback that has a valid state but no code', async () => {
    const user = createTestUser();
    const session = fakeSession({ jiraOAuthState: 'good' });
    const result = await handleCallback(session, user.id, { state: 'good' });
    expect(result).toEqual({ kind: 'error', reason: 'missing-code' });
  });
});
