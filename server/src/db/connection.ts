import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Single shared SQLite connection (better-sqlite3 is synchronous, so one
 * connection per process is the intended usage). Tests point DATABASE_PATH
 * at ":memory:" for isolation.
 */

const isMemory = env.DATABASE_PATH.endsWith(':memory:');
if (!isMemory) {
  fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });
}

export const db = new Database(isMemory ? ':memory:' : env.DATABASE_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
db.exec(schema);

if (!isMemory) {
  logger.debug(`SQLite ready at ${env.DATABASE_PATH}`);
}
