import session from 'express-session';
import { db } from '../db/connection.js';
import { env } from '../config/env.js';
import { SqliteSessionStore } from './sqliteStore.js';

export const SESSION_COOKIE_NAME = 'identityhub.sid';

/**
 * Session middleware. Security posture:
 * - httpOnly: the session id is invisible to page JavaScript (XSS containment)
 * - sameSite=lax: browsers won't attach the cookie to cross-site POSTs (CSRF
 *   baseline; an Origin-check middleware adds defense in depth)
 * - server-side store: the cookie carries only a signed id, never data
 * - rolling: activity extends the session, idle sessions expire in 8h
 * - secure is intentionally off because this POC is demoed over
 *   http://localhost; behind TLS it must be enabled (docs/DECISIONS.md)
 */
export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  store: new SqliteSessionStore(db),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 8 * 60 * 60 * 1000,
  },
});
