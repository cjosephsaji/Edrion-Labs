import { z } from 'zod';

/** Shared native-password rule (login set-password, activation, reset). */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'Password is too long');

/**
 * Login. Three mutually-exclusive credentials:
 * - `accessToken` — a Supabase access token (production), verified then mapped to an employee.
 * - `email` + `password` — native bcrypt login.
 * - `email` alone — dev-only shortcut, honoured ONLY when AUTH_DEV_LOGIN is enabled.
 * The API mints its own HTTP-only session cookie on success.
 */
export const loginSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1).optional(),
  })
  .refine((v) => v.accessToken || v.email, {
    message: 'Provide an accessToken, or an email (with a password, or alone when dev login is enabled)',
  });
export type LoginInput = z.infer<typeof loginSchema>;

/** Request a password-reset link. Always answered 200 (no account enumeration). */
export const forgotPasswordSchema = z.object({ email: z.string().email() });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Complete a password reset with the single-use token from the email link. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Re-authentication for the recent-auth gate. The browser obtains a fresh `aal2` access token
 * (Supabase reauthenticate) and posts it; the API stamps the current session's `lastAuthAt`,
 * which is what the sensitive-action recent-auth window reads.
 */
export const reauthSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    confirm: z.literal(true).optional(),
  })
  .refine((v) => v.accessToken || v.confirm, {
    message: 'Provide an accessToken (or confirm:true when dev login is enabled)',
  });
export type ReauthInput = z.infer<typeof reauthSchema>;
