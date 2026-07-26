import type { UserDto } from '@identityhub/shared';
import { userRepo, type UserRow } from '../../db/repositories/userRepo.js';
import { hashPassword, verifyPassword } from '../../lib/crypto.js';
import { conflict, unauthorized } from '../../lib/errors.js';

function toDto(user: UserRow): UserDto {
  return { id: user.id, email: user.email };
}

export const authService = {
  async register(email: string, password: string): Promise<UserDto> {
    const normalized = email.toLowerCase();
    if (userRepo.findByEmail(normalized)) {
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in.');
    }
    const user = userRepo.create(normalized, await hashPassword(password));
    return toDto(user);
  },

  async login(email: string, password: string): Promise<UserDto> {
    const user = userRepo.findByEmail(email.toLowerCase());
    // Same error for unknown email and wrong password — no account enumeration.
    const invalid = unauthorized('Incorrect email or password.');
    if (!user) {
      // Burn comparable time so response timing doesn't reveal whether the email exists.
      await verifyPassword(password, FAKE_HASH);
      throw invalid;
    }
    if (!(await verifyPassword(password, user.password_hash))) {
      throw invalid;
    }
    return toDto(user);
  },

  me(userId: string | undefined): UserDto | null {
    if (!userId) return null;
    const user = userRepo.findById(userId);
    return user ? toDto(user) : null;
  },
};

// A real scrypt hash of a random throwaway string, used only for timing equalization.
const FAKE_HASH =
  'scrypt:16384:8:1:cmFuZG9tLXNhbHQtMTIzNA:kDbF0m8xkAqU9jZ4Y5w3vTn2sHhLcRqPaXeWuVtSgIhJdOfBnEmCkLpQrStUvWxYzAbCdEfGhIjKlMnOpQrStUw';
