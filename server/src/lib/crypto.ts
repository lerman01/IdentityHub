import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Secret encryption and hashing, built on Node's own crypto module — no
 * dependencies, so there is no supply chain to audit for the code that
 * handles credentials (see docs/DECISIONS.md).
 *
 * There is no password hashing here: sign-in is Atlassian OAuth only, so the
 * app never sees or stores a password.
 */

// AES-256-GCM for secrets at rest (Jira OAuth tokens). Fresh random IV per
// encryption; the GCM auth tag makes tampering with stored ciphertext detectable.
const IV_BYTES = 12;

/** Encrypts UTF-8 text to a compact base64url string: iv.tag.ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', env.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/** Reverses encryptSecret. Throws on tampered or wrongly-keyed input. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', env.encryptionKey, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** SHA-256 hex digest — used for API key storage (keys are high-entropy, no salt needed). */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
