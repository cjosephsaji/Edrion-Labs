import { z } from 'zod';

/**
 * Institution-portal login. Production sends `accessToken` — a Supabase access token the browser
 * obtained after password + MFA; the API verifies its signature, maps `sub` to an institution
 * user, then mints its own HTTP-only portal session cookie. `email` is honoured ONLY when
 * PORTAL_AUTH_DEV_LOGIN is enabled, so login + recent-auth can be exercised locally without a
 * hosted Supabase instance. The active scope still comes from the scope switcher per request.
 */
export const portalLoginSchema = z
  .object({
    accessToken: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .refine((v) => v.accessToken || v.email, {
    message: 'Provide an accessToken (or email when portal dev login is enabled)',
  });
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

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
