import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email('Enter a valid email address').max(254, 'Email is too long'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email('Enter a valid email address').max(254, 'Email is too long'),
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});
export type LoginInput = z.infer<typeof loginSchema>;
