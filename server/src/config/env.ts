import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * All configuration enters the app through this module, validated once at
 * boot. Anything else importing `process.env` directly is a code smell.
 */

// This file lives at server/src/config/, so the repo root is three levels up.
export const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

loadDotenv({ path: path.join(REPO_ROOT, '.env'), quiet: true });

/** Treats empty strings from `.env` ("KEY=") as absent. */
const optional = (schema: z.ZodType<string>) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: optional(z.url()),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters — run `npm run setup` to generate it'),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message:
        'ENCRYPTION_KEY must be 32 bytes, base64-encoded — run `npm run setup` to generate it',
    }),

  ATLASSIAN_CLIENT_ID: optional(z.string()),
  ATLASSIAN_CLIENT_SECRET: optional(z.string()),
  ATLASSIAN_CALLBACK_URL: optional(z.url()),

  DATABASE_PATH: z.string().default('./data/identityhub.db'),

  GROQ_API_KEY: optional(z.string()),
  DIGEST_MODEL: z.string().default('llama-3.3-70b-versatile'),
  DIGEST_USER_EMAIL: optional(z.email()),
  DIGEST_PROJECT_KEY: optional(z.string()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('✖ Invalid environment configuration:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.') || '(env)'}: ${issue.message}`);
  }
  console.error('\nHint: `npm run setup` creates a valid .env from .env.example.\n');
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === 'production';

export const env = {
  ...raw,
  isProd,
  isTest: raw.NODE_ENV === 'test',
  /** Browser origin of the UI — Vite in dev, this server in production. */
  APP_URL: raw.APP_URL ?? (isProd ? `http://localhost:${raw.PORT}` : 'http://localhost:5173'),
  /** Origin of this API server (OAuth callbacks land here in every mode). */
  SERVER_URL: `http://localhost:${raw.PORT}`,
  ATLASSIAN_CALLBACK_URL:
    raw.ATLASSIAN_CALLBACK_URL ?? `http://localhost:${raw.PORT}/api/jira/oauth/callback`,
  DATABASE_PATH: path.resolve(REPO_ROOT, raw.DATABASE_PATH),
  /** Decoded AES-256 key for encrypting Jira tokens at rest. */
  encryptionKey: Buffer.from(raw.ENCRYPTION_KEY, 'base64'),
  /** The app boots without OAuth credentials; Jira features explain what's missing. */
  jiraOAuthConfigured: Boolean(raw.ATLASSIAN_CLIENT_ID && raw.ATLASSIAN_CLIENT_SECRET),
};

export type Env = typeof env;
