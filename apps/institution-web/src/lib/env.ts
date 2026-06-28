/** Public web env. Only NEXT_PUBLIC_* values are exposed to the browser. */
export const webEnv = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
  // Dev convenience: impersonate a seeded institution user until Supabase auth is wired
  // end-to-end. Sent as the x-institution-user-email header (honoured only when the API has
  // PORTAL_AUTH_DEV_HEADER=true). Production relies on the session cookie.
  devUserEmail: process.env.NEXT_PUBLIC_DEV_INSTITUTION_USER ?? 'owner@greenwood.edu',
};
