import { createFindingSchema } from '@identityhub/shared';
import { env } from '../config/env.js';
import { digestStateRepo } from '../db/repositories/digestStateRepo.js';
import { jiraConnectionRepo } from '../db/repositories/jiraConnectionRepo.js';
import { userRepo } from '../db/repositories/userRepo.js';
import { logger } from '../lib/logger.js';
import { ticketService } from '../modules/tickets/ticketService.js';
import { fetchLatestPost } from './blogScraper.js';
import { summarizePost } from './summarizer.js';

/**
 * "NHI Blog Digest" (bonus feature): fetch the newest post from
 * oasis.security/blog, summarize it, and file it as a Jira ticket.
 *
 * Design decisions (docs/DECISIONS.md):
 * - Runs as the app user named in DIGEST_USER_EMAIL and reuses that user's
 *   OAuth connection + the shared ticketService — the digest is just another
 *   ticket source ('digest'), not a parallel code path.
 * - Idempotent via digest_state: one ticket per post URL, ever. Safe on any
 *   schedule.
 * - AI summary with extractive fallback: works with or without an API key.
 */

export type DigestResult =
  | { status: 'created'; issueKey: string; url: string; postTitle: string; method: string }
  | { status: 'skipped'; reason: string; postTitle: string };

class DigestConfigError extends Error {}

function requireConfig(): { userEmail: string; projectKey: string } {
  const missing: string[] = [];
  if (!env.DIGEST_USER_EMAIL) missing.push('DIGEST_USER_EMAIL');
  if (!env.DIGEST_PROJECT_KEY) missing.push('DIGEST_PROJECT_KEY');
  if (missing.length > 0) {
    throw new DigestConfigError(
      `Missing ${missing.join(' and ')} in .env. The digest files tickets as an existing ` +
        'app user: set DIGEST_USER_EMAIL to that user and DIGEST_PROJECT_KEY to the target ' +
        'Jira project key.',
    );
  }
  return { userEmail: env.DIGEST_USER_EMAIL!, projectKey: env.DIGEST_PROJECT_KEY! };
}

export async function runBlogDigest(): Promise<DigestResult> {
  const { userEmail, projectKey } = requireConfig();

  const user = userRepo.findByEmail(userEmail.toLowerCase());
  if (!user) {
    throw new DigestConfigError(
      `No IdentityHub user with email "${userEmail}". Register that account in the app first ` +
        '(or point DIGEST_USER_EMAIL at an existing account).',
    );
  }

  if (!jiraConnectionRepo.findByUserId(user.id)) {
    throw new DigestConfigError(
      `The digest user (${userEmail}) has not connected a Jira workspace yet. ` +
        'Sign in to the app as that user and complete "Connect Jira" once.',
    );
  }

  logger.info('Digest: fetching latest blog post…');
  const post = await fetchLatestPost();

  if (digestStateRepo.hasProcessed(post.url)) {
    const last = digestStateRepo.last();
    return {
      status: 'skipped',
      reason: `Already filed as ${last?.issue_key ?? 'a ticket'} — no new post since.`,
      postTitle: post.title,
    };
  }

  logger.info('Digest: summarizing', { post: post.title });
  const summary = await summarizePost(post.title, post.text);

  const input = createFindingSchema.parse({
    projectKey,
    title: `NHI Blog Digest: ${post.title}`.slice(0, 255),
    description: `${summary.text}\n\nRead the full post: ${post.url}`.slice(0, 30_000),
    foundBy: 'nhi-blog-digest',
  });

  const created = await ticketService.createFinding(user.id, input, 'digest');
  digestStateRepo.record(post.url, created.issueKey);

  return {
    status: 'created',
    issueKey: created.issueKey,
    url: created.url,
    postTitle: post.title,
    method: summary.method,
  };
}

export { DigestConfigError };
