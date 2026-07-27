import { createFindingSchema } from '@identityhub/shared';
import { env } from '../../config/env.js';
import { accountRepo } from '../../db/repositories/accountRepo.js';
import { logger } from '../../utils/logger.js';
import { ticketService } from '../tickets/service.js';
import { fetchLatestPost } from './blogScraper.js';
import { summarizePost } from './summarizer.js';

/**
 * "NHI Blog Digest" (bonus feature): fetch the newest post from
 * oasis.security/blog, summarize it, and file it as a Jira ticket.
 *
 * Standalone by design — the assignment notes this is external to the UI, so
 * it has its own entry point (`npm run digest` → runDigest.ts) and the server
 * never imports it.
 *
 * Design decisions (docs/DECISIONS.md):
 * - Runs as the app user named in DIGEST_USER_EMAIL and reuses that user's
 *   OAuth connection + the shared ticketService — the digest is just another
 *   ticket source ('digest'), not a parallel code path.
 * - GROQ_API_KEY is required: the digest refuses to run without it rather than
 *   filing a ticket whose "summary" is a raw excerpt. The extractive summary
 *   survives only as the fallback for a Groq call that fails mid-run.
 */

interface DigestResult {
  issueKey: string;
  url: string;
  postTitle: string;
  method: string;
}

class DigestConfigError extends Error {}

function requireConfig(): { userEmail: string; projectKey: string } {
  const missing: string[] = [];
  if (!env.GROQ_API_KEY) missing.push('GROQ_API_KEY');
  if (!env.DIGEST_USER_EMAIL) missing.push('DIGEST_USER_EMAIL');
  if (!env.DIGEST_PROJECT_KEY) missing.push('DIGEST_PROJECT_KEY');
  if (missing.length > 0) {
    throw new DigestConfigError(
      `Missing ${missing.join(', ')} in .env. The digest summarizes with Groq ` +
        '(free key at console.groq.com) and files tickets as an existing app user: set ' +
        'DIGEST_USER_EMAIL to that user and DIGEST_PROJECT_KEY to the target Jira project key.',
    );
  }
  return { userEmail: env.DIGEST_USER_EMAIL!, projectKey: env.DIGEST_PROJECT_KEY! };
}

export async function runBlogDigest(): Promise<DigestResult> {
  const { userEmail, projectKey } = requireConfig();

  const account = accountRepo.findByEmail(userEmail);
  if (!account) {
    throw new DigestConfigError(
      `No IdentityHub account with email "${userEmail}". Sign in to the app with that ` +
        'Atlassian account once, then run the digest again.',
    );
  }

  if (!account.cloud_id) {
    throw new DigestConfigError(
      `The digest account (${userEmail}) has not chosen a Jira site yet. ` +
        'Sign in to the app as that account and pick one.',
    );
  }

  logger.info('Digest: fetching latest blog post…');
  const post = await fetchLatestPost();

  logger.info({ post: post.title }, 'Digest: summarizing');
  const summary = await summarizePost(post.title, post.text);

  const input = createFindingSchema.parse({
    projectKey,
    title: `NHI Blog Digest: ${post.title}`.slice(0, 255),
    description: `${summary.text}\n\nRead the full post: ${post.url}`.slice(0, 30_000),
    foundBy: 'nhi-blog-digest',
  });

  const created = await ticketService.createFinding(account.id, input, 'digest');

  return {
    issueKey: created.issueKey,
    url: created.url,
    postTitle: post.title,
    method: summary.method,
  };
}

export { DigestConfigError };
