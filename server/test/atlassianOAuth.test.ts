import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl } from '../src/modules/jira/atlassianOAuth.js';

/**
 * The unconfigured-server guard. Deliberately in its own file: the callback
 * tests mock this module out, so the real behaviour has to be asserted here.
 */
describe('buildAuthorizeUrl', () => {
  it('refuses to build a URL when the Atlassian app is not configured', () => {
    // Test env deliberately has no ATLASSIAN_CLIENT_ID/SECRET (see setup.ts),
    // which is what the sign-in page surfaces as "OAuth app not configured".
    expect(() => buildAuthorizeUrl('some-state')).toThrow(/not configured/i);
  });
});
