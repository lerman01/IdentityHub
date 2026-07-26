import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, sha256 } from '../src/lib/crypto.js';

// Note: there is no password hashing to test — sign-in is Atlassian OAuth
// only, so the app never sees or stores a password (docs/DECISIONS.md #2).

describe('secret encryption (AES-256-GCM)', () => {
  it('round-trips plaintext', () => {
    const secret = 'oauth-refresh-token-xyz';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('uses a fresh IV per encryption (same input, different ciphertext)', () => {
    expect(encryptSecret('same')).not.toEqual(encryptSecret('same'));
  });

  it('detects tampering via the GCM auth tag', () => {
    const payload = encryptSecret('secret');
    const [iv, tag, data] = payload.split('.');
    const tampered = `${iv}.${tag}.${data!.slice(0, -2)}AA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decryptSecret('garbage')).toThrow('Malformed encrypted payload');
  });

  it('round-trips unicode and long values', () => {
    const secret = 'refresh·token—✓'.repeat(200);
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });
});

describe('sha256', () => {
  it('is deterministic and hex-encoded', () => {
    expect(sha256('ihk_abc')).toBe(sha256('ihk_abc'));
    expect(sha256('ihk_abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different inputs', () => {
    expect(sha256('ihk_a')).not.toBe(sha256('ihk_b'));
  });
});
