import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, JIRA_SCOPES } from '../src/modules/jira/atlassianOAuth.js';

/**
 * The authorize URL is the whole sign-in contract with Atlassian, and it is
 * built once and never seen again by our code — so it is worth pinning down.
 *
 * In its own file because the callback tests mock this module out.
 */
describe('buildAuthorizeUrl', () => {
  const params = new URL(buildAuthorizeUrl('state-123')).searchParams;

  it('targets Atlassian with an authorization-code request', () => {
    expect(buildAuthorizeUrl('s').startsWith('https://auth.atlassian.com/authorize?')).toBe(true);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('audience')).toBe('api.atlassian.com');
  });

  it('carries the state nonce, so the callback can verify it', () => {
    expect(params.get('state')).toBe('state-123');
  });

  it('requests only the four scopes we can justify', () => {
    // Scope minimality is a documented decision (docs/DECISIONS.md #2b) —
    // this fails loudly if someone widens it, e.g. to manage:jira-project.
    expect(params.get('scope')?.split(' ').sort()).toEqual([
      'offline_access',
      'read:jira-user',
      'read:jira-work',
      'write:jira-work',
    ]);
    expect(JIRA_SCOPES).not.toContain('manage:');
  });

  it('sends the callback URL that must match the Atlassian console exactly', () => {
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/api/jira/oauth/callback');
  });
});
