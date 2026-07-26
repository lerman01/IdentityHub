import { db } from '../connection.js';

const hasStmt = db.prepare('SELECT 1 FROM digest_state WHERE post_url = ?');
const insertStmt = db.prepare('INSERT INTO digest_state (post_url, issue_key) VALUES (?, ?)');
const lastStmt = db.prepare(
  'SELECT post_url, issue_key FROM digest_state ORDER BY created_at DESC, rowid DESC LIMIT 1',
);

/** Idempotency ledger: one Jira ticket per blog post, no matter how often the digest runs. */
export const digestStateRepo = {
  hasProcessed(postUrl: string): boolean {
    return hasStmt.get(postUrl) !== undefined;
  },

  record(postUrl: string, issueKey: string): void {
    insertStmt.run(postUrl, issueKey);
  },

  last(): { post_url: string; issue_key: string } | undefined {
    return lastStmt.get() as { post_url: string; issue_key: string } | undefined;
  },
};
