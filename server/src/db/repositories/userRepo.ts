import { randomUUID } from 'node:crypto';
import { db } from '../connection.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

const insertStmt = db.prepare(
  'INSERT INTO users (id, email, password_hash) VALUES (@id, @email, @passwordHash)',
);
const byEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?');
const byIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');

export const userRepo = {
  create(email: string, passwordHash: string): UserRow {
    const id = randomUUID();
    insertStmt.run({ id, email, passwordHash });
    return byIdStmt.get(id) as UserRow;
  },

  findByEmail(email: string): UserRow | undefined {
    return byEmailStmt.get(email) as UserRow | undefined;
  },

  findById(id: string): UserRow | undefined {
    return byIdStmt.get(id) as UserRow | undefined;
  },
};
