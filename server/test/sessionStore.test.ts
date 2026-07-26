import { describe, expect, it } from 'vitest';
import type { SessionData } from 'express-session';
import { db } from '../src/db/connection.js';
import { SqliteSessionStore } from '../src/session/sqliteStore.js';

const sessionData = (userId: string, maxAgeMs: number): SessionData =>
  ({
    cookie: { expires: new Date(Date.now() + maxAgeMs), originalMaxAge: maxAgeMs },
    userId,
  }) as unknown as SessionData;

function get(store: SqliteSessionStore, sid: string) {
  return new Promise<SessionData | null | undefined>((resolve, reject) => {
    store.get(sid, (err, session) => (err ? reject(err) : resolve(session)));
  });
}

describe('SqliteSessionStore', () => {
  const store = new SqliteSessionStore(db);

  it('round-trips session data', async () => {
    store.set('sid-1', sessionData('user-1', 60_000));
    const loaded = await get(store, 'sid-1');
    expect((loaded as { userId?: string })?.userId).toBe('user-1');
  });

  it('treats expired sessions as gone (lazy expiry)', async () => {
    store.set('sid-expired', sessionData('user-2', -1000));
    expect(await get(store, 'sid-expired')).toBeNull();
  });

  it('destroys sessions', async () => {
    store.set('sid-gone', sessionData('user-3', 60_000));
    store.destroy('sid-gone');
    expect(await get(store, 'sid-gone')).toBeNull();
  });

  it('touch extends the expiry', async () => {
    store.set('sid-touch', sessionData('user-4', 5_000));
    store.touch('sid-touch', sessionData('user-4', 120_000));
    const row = db
      .prepare('SELECT expires_at FROM sessions WHERE sid = ?')
      .get('sid-touch') as { expires_at: number };
    expect(row.expires_at).toBeGreaterThan(Date.now() + 60_000);
  });
});
