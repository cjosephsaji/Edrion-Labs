import { z } from 'zod';
import { passwordSchema } from './auth';

/**
 * Institution-portal login. Three mutually-exclusive credentials:
 * - `accessToken` — a Supabase access token (production), verified then mapped to an institution user.
 * - `email` + `password` — native bcrypt login.
 * - `email` alone — dev-only shortcut, honoured ONLY when PORTAL_AUTH_DEV_LOGIN is enabled.
 * The API mints its own HTTP-only portal session cookie; the active scope still comes from the
 * scope switcher per request.
 */
export const portalLoginSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1).optional(),
  })
  .refine((v) => v.accessToken || v.email, {
    message: 'Provide an accessToken, or an email (with a password, or alone when dev login is enabled)',
  });
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

/** Complete account activation: set the first password using the token from the invitation email. */
export const portalActivateSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type PortalActivateInput = z.infer<typeof portalActivateSchema>;

/** Request a portal password-reset link. Always answered 200 (no account enumeration). */
export const portalForgotPasswordSchema = z.object({ email: z.string().email() });
export type PortalForgotPasswordInput = z.infer<typeof portalForgotPasswordSchema>;

/** Complete a portal password reset with the single-use token from the email link. */
export const portalResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type PortalResetPasswordInput = z.infer<typeof portalResetPasswordSchema>;

/**
 * Re-authentication for the sensitive-action recent-auth gate. The browser obtains a fresh `aal2`
 * access token and posts it; the API stamps the current portal session's `lastAuthAt`, which is
 * what the recent-auth window reads when a sensitive permission is exercised.
 */
export const portalReauthSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    confirm: z.literal(true).optional(),
  })
  .refine((v) => v.accessToken || v.confirm, {
    message: 'Provide an accessToken (or confirm:true when portal dev login is enabled)',
  });
export type PortalReauthInput = z.infer<typeof portalReauthSchema>;
