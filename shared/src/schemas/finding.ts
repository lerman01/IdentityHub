import { z } from 'zod';
import { IDENTITY_TYPES, SEVERITIES } from '../constants.js';

/**
 * A single schema validates finding tickets everywhere they can be created:
 * the web form, the public REST API, and the blog-digest job.
 *
 * Scope decisions (see docs/DECISIONS.md):
 * - Only `projectKey`, `title` and `description` are required — matching the
 *   assignment's minimal field set.
 * - `severity` / `identityType` are optional and map to Jira *labels*, so they
 *   work on any Jira workspace without admin-configured custom fields.
 * - `projectKey` is validated loosely (shape only) — Jira remains the source of
 *   truth for which keys exist, and its errors are surfaced clearly instead.
 */
export const createFindingSchema = z.object({
  projectKey: z
    .string('Project key is required')
    .trim()
    .min(1, 'Project key is required')
    .max(50, 'Project key is too long')
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Must look like a Jira project key, e.g. "SEC"')
    .transform((v) => v.toUpperCase()),
  title: z
    .string('Title is required')
    .trim()
    .min(1, 'Title is required')
    .max(255, 'Jira limits summaries to 255 characters'),
  description: z
    .string('Description is required')
    .trim()
    .min(1, 'Description is required')
    .max(30_000, 'Description is too long (30,000 character limit)'),
  severity: z.enum(SEVERITIES).optional(),
  identityType: z.enum(IDENTITY_TYPES).optional(),
  /** Free-text attribution for API callers, e.g. "aws-scanner-prod". */
  foundBy: z.string().trim().min(1).max(100).optional(),
});

/** Parsed (output) shape — what services receive. */
export type CreateFindingInput = z.output<typeof createFindingSchema>;
/** Raw (input) shape — what forms produce before parsing. */
export type CreateFindingFormValues = z.input<typeof createFindingSchema>;
