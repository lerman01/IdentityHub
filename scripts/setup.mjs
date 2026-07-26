/**
 * One-command environment setup: copies .env.example to .env and fills in
 * freshly generated secrets, so the project is secure-by-default without
 * asking the reviewer to hand-craft cryptographic material.
 *
 * Usage:  npm run setup          (no-op if .env already exists)
 *         npm run setup -- --force  (regenerate .env, overwriting)
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');
const force = process.argv.includes('--force');

if (existsSync(envPath) && !force) {
  console.log('.env already exists — leaving it untouched. (Use "npm run setup -- --force" to regenerate.)');
  process.exit(0);
}

const sessionSecret = randomBytes(48).toString('base64url');
const encryptionKey = randomBytes(32).toString('base64'); // AES-256 key, base64-encoded

const env = readFileSync(examplePath, 'utf8')
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${sessionSecret}`)
  .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${encryptionKey}`);

writeFileSync(envPath, env, 'utf8');

console.log(`Created ${envPath} with generated SESSION_SECRET and ENCRYPTION_KEY.

Next steps:
  1. Register an Atlassian OAuth app (README → "Create your Atlassian OAuth app", ~5 minutes)
     and paste ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET into .env
  2. npm run seed   — creates the demo login (demo@identityhub.local / demo-password-123)
  3. npm run dev    — server on http://localhost:3000, app on http://localhost:5173
`);
