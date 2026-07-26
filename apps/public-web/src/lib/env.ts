/** Public web env. Only NEXT_PUBLIC_* values are exposed to the browser. */
export const webEnv = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
};
