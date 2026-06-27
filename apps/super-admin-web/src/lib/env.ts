/** Public web env. Only NEXT_PUBLIC_* values are exposed to the browser. */
export const webEnv = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
  // Dev convenience: impersonate the seeded owner until Supabase auth is wired end-to-end.
  devEmployeeEmail: process.env.NEXT_PUBLIC_DEV_EMPLOYEE ?? 'owner@edrion.dev',
};
