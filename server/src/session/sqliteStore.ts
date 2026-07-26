import { Store, type SessionData } from 'express-session';
import type { Database } from 'better-sqlite3';

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
    this.getStmt = db.prepare('SELECT data FROM sessions WHERE sid = ? AND expires_at > ?');
    this.setStmt = db.prepare(
      'INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT (sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at',
    );
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?');
    this.cleanupStmt = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');

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
