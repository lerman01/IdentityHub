import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  sha256,
  verifyPassword,
} from '../src/lib/crypto.js';

describe('password hashing (scrypt)', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt:16384:8:1:/);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right-password');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces a unique salt per hash', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toEqual(b);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt:whatever')).resolves.toBe(false);
  });
});

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
});

describe('sha256', () => {
  it('is deterministic and hex-encoded', () => {
    expect(sha256('ihk_abc')).toBe(sha256('ihk_abc'));
    expect(sha256('ihk_abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
