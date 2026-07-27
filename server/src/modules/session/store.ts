import { Store, type SessionData } from 'express-session';
import type { Database } from 'better-sqlite3';
import { sessionSql } from '../../db/sql.js';

/**
 * express-session store over better-sqlite3 (~60 lines instead of a
 * connect-sqlite3 dependency, and it shares the app's single DB connection).
 * Sessions live server-side; the cookie only ever holds the signed session id.
 */
export class SqliteSessionStore extends Store {
  private readonly getStmt;
  private readonly setStmt;
  private readonly destroyStmt;
  private readonly touchStmt;
  private readonly cleanupStmt;

  constructor(
    db: Database,
    /** Fallback lifetime for sessions without an explicit cookie expiry. */
    private readonly defaultTtlMs = 8 * 60 * 60 * 1000,
  ) {
    super();
    this.getStmt = db.prepare(sessionSql.get);
    this.setStmt = db.prepare(sessionSql.set);
    this.destroyStmt = db.prepare(sessionSql.destroy);
    this.touchStmt = db.prepare(sessionSql.touch);
    this.cleanupStmt = db.prepare(sessionSql.cleanup);

    // Lazy expiry (queries filter on expires_at) plus periodic garbage collection.
    setInterval(() => this.cleanupStmt.run(Date.now()), 10 * 60 * 1000).unref();
  }

  private expiryOf(session: SessionData): number {
    const expires = session.cookie?.expires;
    return expires ? new Date(expires).getTime() : Date.now() + this.defaultTtlMs;
  }

  override get(sid: string, cb: (err?: unknown, session?: SessionData | null) => void): void {
    try {
      const row = this.getStmt.get(sid, Date.now()) as { data: string } | undefined;
      cb(null, row ? (JSON.parse(row.data) as SessionData) : null);
    } catch (err) {
      cb(err);
    }
  }

  override set(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    try {
      this.setStmt.run(sid, JSON.stringify(session), this.expiryOf(session));
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  override destroy(sid: string, cb?: (err?: unknown) => void): void {
    try {
      this.destroyStmt.run(sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }

  override touch(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    try {
      this.touchStmt.run(this.expiryOf(session), sid);
      cb?.(null);
    } catch (err) {
      cb?.(err);
    }
  }
}
