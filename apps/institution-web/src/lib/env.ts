/** Public web env. Only NEXT_PUBLIC_* values are exposed to the browser. */
export const webEnv = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3007',
  // Dev convenience: impersonate a seeded institution user when explicitly configured. Sent as the
  // x-institution-user-email header (honoured only when the API has PORTAL_AUTH_DEV_HEADER=true).
  // Must not default to a seeded user — unauthenticated loads would otherwise cache Olivia Owner and
  // keep showing her after a real sign-in until a hard refresh.
  devUserEmail: process.env.NEXT_PUBLIC_DEV_INSTITUTION_USER || undefined,
};
