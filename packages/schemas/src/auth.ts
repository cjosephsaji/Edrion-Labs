import { z } from 'zod';

/**
 * Login. Production sends `accessToken` — a Supabase access token the browser obtained from
 * Supabase Auth (after password + MFA). The API verifies its signature, maps `sub` to an
 * employee, then mints its own session cookie. `email` is honoured ONLY when AUTH_DEV_LOGIN is
 * enabled, so login + recent-auth can be exercised locally without a hosted Supabase instance.
 */
export const loginSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .refine((v) => v.accessToken || v.email, {
    message: 'Provide an accessToken (or email when dev login is enabled)',
  });
export type LoginInput = z.infer<typeof loginSchema>;

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
