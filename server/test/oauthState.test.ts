import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SessionData } from 'express-session';

vi.mock('../src/modules/jira/atlassianOAuth.js', () => ({
  buildAuthorizeUrl: vi.fn(() => 'https://auth.atlassian.com/authorize?state=x'),
  exchangeCode: vi.fn(),
  fetchAccessibleResources: vi.fn(),
  fetchMyself: vi.fn(),
  refreshTokens: vi.fn(),
}));

const { handleCallback, startOAuth } = await import(
  '../src/modules/jira/jiraConnectionService.js'
);
const { accountRepo } = await import('../src/db/repositories/accountRepo.js');
const atlassian = await import('../src/modules/jira/atlassianOAuth.js');

type FakeSession = Session & Partial<SessionData>;
const fakeSession = (data: Partial<SessionData> = {}): FakeSession => data as FakeSession;

const SITE = { id: 'cloud-1', url: 'https://acme.atlassian.net', name: 'Acme', scopes: [] };

function mockSuccessfulExchange(sites = [SITE], accountId = 'atl-account-1') {
  vi.mocked(atlassian.exchangeCode).mockResolvedValue({
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 3_600_000,
  });
  vi.mocked(atlassian.fetchAccessibleResources).mockResolvedValue(sites);
  vi.mocked(atlassian.fetchMyself).mockResolvedValue({
    accountId,
    emailAddress: 'user@acme.test',
    displayName: 'Acme User',
  });
}

beforeEach(() => vi.clearAllMocks());

/**
 * Sign-in is the OAuth callback, so these paths are the authentication
 * boundary. Each case below returns before any network call, so no mocking
 * is needed.
 */
describe('OAuth callback state verification (CSRF)', () => {
  it('startOAuth stores a fresh single-use state on the session', () => {
    const a = fakeSession();
    const b = fakeSession();

    startOAuth(a);
    startOAuth(b);

    expect(a.jiraOAuthState).toBeTruthy();
    expect(a.jiraOAuthState).not.toBe(b.jiraOAuthState);
  });

  it('rejects a callback whose state does not match (and consumes the state)', async () => {
    const session = fakeSession({ jiraOAuthState: 'expected-state' });

    const result = await handleCallback(session, {
      code: 'auth-code',
      state: 'attacker-forged-state',
    });

    expect(result).toEqual({ kind: 'error', reason: 'state' });
    expect(session.jiraOAuthState).toBeUndefined();
    expect(session.accountId).toBeUndefined();
  });

  it('rejects a callback with no stored state (replay)', async () => {
    const result = await handleCallback(fakeSession(), { code: 'auth-code', state: 'anything' });
    expect(result).toEqual({ kind: 'error', reason: 'state' });
  });

  it('maps user consent denial to a friendly outcome', async () => {
    const result = await handleCallback(fakeSession({ jiraOAuthState: 's' }), {
      error: 'access_denied',
    });
    expect(result).toEqual({ kind: 'denied' });
  });

  it('rejects a callback that has a valid state but no code', async () => {
    const session = fakeSession({ jiraOAuthState: 'good' });
    const result = await handleCallback(session, { state: 'good' });
    expect(result).toEqual({ kind: 'error', reason: 'missing-code' });
    expect(session.accountId).toBeUndefined();
  });
});

describe('successful sign-in', () => {
  it('creates the account and auto-selects a single site', async () => {
    mockSuccessfulExchange();
    const session = fakeSession({ jiraOAuthState: 'good' });

    const result = await handleCallback(session, { code: 'c', state: 'good' });

    expect(result.kind).toBe('signed-in');
    const accountId = (result as { accountId: string }).accountId;
    const account = accountRepo.findById(accountId)!;
    expect(account.email).toBe('user@acme.test');
    expect(account.site_url).toBe('https://acme.atlassian.net');
  });

  it('leaves the site unset when the login can reach several', async () => {
    mockSuccessfulExchange([SITE, { ...SITE, id: 'cloud-2', name: 'Other' }], 'atl-multi');
    const session = fakeSession({ jiraOAuthState: 'good' });

    const result = await handleCallback(session, { code: 'c', state: 'good' });

    expect(result.kind).toBe('select-site');
    const account = accountRepo.findById((result as { accountId: string }).accountId)!;
    expect(account.cloud_id).toBeNull();
  });

  it('reuses the same account row when the same Atlassian identity signs in again', async () => {
    mockSuccessfulExchange([SITE], 'atl-returning');

    const first = await handleCallback(fakeSession({ jiraOAuthState: 'a' }), {
      code: 'c',
      state: 'a',
    });
    const second = await handleCallback(fakeSession({ jiraOAuthState: 'b' }), {
      code: 'c',
      state: 'b',
    });

    expect((second as { accountId: string }).accountId).toBe(
      (first as { accountId: string }).accountId,
    );
  });

  /**
   * The fixation guard's precondition: the service must NOT elevate the
   * session itself. The route regenerates the session id first and only then
   * writes accountId — see elevateSession in jiraRoutes.
   */
  it('returns the account id instead of writing it onto the session', async () => {
    mockSuccessfulExchange([SITE], 'atl-no-mutate');
    const session = fakeSession({ jiraOAuthState: 'good' });

    const result = await handleCallback(session, { code: 'c', state: 'good' });

    expect((result as { accountId: string }).accountId).toBeTruthy();
    expect(session.accountId).toBeUndefined();
  });
});
