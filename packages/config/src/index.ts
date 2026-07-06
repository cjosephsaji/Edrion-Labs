import { z } from 'zod';

/**
 * Runtime environment parsing. Fail fast at boot with a clear message rather than crash on
 * first use. The API loads `apiEnvSchema`; the web app must only read NEXT_PUBLIC_* values.
 */

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .or(z.boolean());

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  /** Master switch for all Redis-backed concerns (rate limit, idempotency fast-path, queues). */
  REDIS_ENABLED: bool.default(true),

  // ── Rate limiting (Phase 10b) ──────────────────────────────────────────────
  RATE_LIMIT_ENABLED: bool.default(true),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  /** Max requests per authenticated principal per window. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Tighter cap per IP for unauthenticated routes (login etc.). */
  RATE_LIMIT_MAX_UNAUTH: z.coerce.number().int().positive().default(30),

  // ── AI usage limits (Phase 10b — closes the 9b deferral) ───────────────────
  AI_RATE_LIMIT_ENABLED: bool.default(true),
  /** Default daily AI-run ceiling per employee when a policy sets none. */
  AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY: z.coerce.number().int().positive().default(200),
  /** Default daily AI-run ceiling per policy scope when a policy sets none. */
  AI_MAX_RUNS_PER_SCOPE_PER_DAY: z.coerce.number().int().positive().default(1000),

  // ── Background queues (Phase 10b / 10e) ────────────────────────────────────
  /** Run BullMQ workers in this process. Off for web-only / migration containers. */
  QUEUE_WORKERS_ENABLED: bool.default(true),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  API_PORT: z.coerce.number().int().positive().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  API_CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005')
    .transform((s) => s.split(',').map((o) => o.trim())),
  SESSION_COOKIE_SECRET: z.string().min(16, 'SESSION_COOKIE_SECRET must be at least 16 chars'),
  /**
   * Master switch for the sensitive-action recent-auth gate. When false (default) no route ever
   * returns RECENT_AUTH_REQUIRED — sensitive actions are allowed as long as the session is valid.
   * Flip on to re-enable step-up re-authentication using RECENT_AUTH_WINDOW_SECONDS.
   */
  RECENT_AUTH_ENABLED: bool.default(false),
  RECENT_AUTH_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

  // ── Authentication (Phase 10a) ─────────────────────────────────────────────
  /** Name of the HTTP-only session cookie carrying the API-signed session JWT. */
  SESSION_COOKIE_NAME: z.string().default('edrion_session'),
  /** Session lifetime before the cookie/JWT expires and a fresh login is required. */
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28_800), // 8h
  /**
   * DEV ESCAPE HATCH. When true the legacy `x-employee-email` request header is honoured as an
   * identity, bypassing real session auth. Off in production. Kept so the existing curl smoke
   * still runs while the cookie flow is verified alongside it.
   */
  AUTH_DEV_HEADER: bool.default(false),
  /**
   * DEV ESCAPE HATCH. When true `POST /auth/login` accepts `{ email }` with no Supabase access
   * token, minting a real server session for a known employee. Lets login + recent-auth be
   * proven locally without a hosted Supabase Auth instance. Off in production.
   */
  AUTH_DEV_LOGIN: bool.default(false),
  /** Failed logins for one employee within the window before the account is locked. */
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  /** How long an account stays locked after exceeding AUTH_MAX_FAILED_LOGINS. */
  AUTH_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),

  // ── Institution-portal authentication (Phase 12) ───────────────────────────
  /** Name of the HTTP-only cookie carrying the portal session JWT (separate from the platform one). */
  PORTAL_SESSION_COOKIE_NAME: z.string().default('edrion_portal_session'),
  /**
   * DEV ESCAPE HATCH. When true the `x-institution-user-email` request header is honoured as a
   * portal identity, bypassing real session auth. Off in production. Kept so the existing portal
   * curl smokes keep working while the cookie flow is verified alongside them.
   */
  PORTAL_AUTH_DEV_HEADER: bool.default(false),
  /**
   * DEV ESCAPE HATCH. When true `POST /v1/portal/auth/login` accepts `{ email }` with no Supabase
   * access token, minting a real server session for a known institution user. Lets portal login +
   * recent-auth be proven locally without a hosted Supabase Auth instance. Off in production.
   */
  PORTAL_AUTH_DEV_LOGIN: bool.default(false),
  /** Base URL of the institution-portal web app — used to build invitation accept links. */
  PORTAL_WEB_URL: z.string().url().default('http://localhost:3002'),

  // ── Student-portal authentication (Plan 01) ────────────────────────────────
  /** Name of the HTTP-only cookie carrying the student session JWT. */
  STUDENT_SESSION_COOKIE_NAME: z.string().default('edrion_student_session'),
  /**
   * DEV ESCAPE HATCH. When true the `x-student-email` request header is honoured as a student
   * identity, bypassing real session auth. Off in production.
   */
  STUDENT_AUTH_DEV_HEADER: bool.default(false),
  /** Base URL of the student-portal web app — used to build activation/reset links. */
  STUDENT_WEB_URL: z.string().url().default('http://localhost:3005'),
  /** Storage driver for student uploads: `local` (default) or `supabase`. */
  STUDENT_STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  /** Directory for local-disk student object storage (resolved from the API process cwd). */
  STUDENT_STORAGE_DIR: z.string().default('./var/student-storage'),
  /** Max size (bytes) for a single student image upload. Default 15 MiB. */
  STUDENT_UPLOAD_MAX_BYTES_IMAGE: z.coerce.number().int().positive().default(15_728_640),
  /** Max size (bytes) for a single student document upload. Default 40 MiB. */
  STUDENT_UPLOAD_MAX_BYTES_DOC: z.coerce.number().int().positive().default(41_943_040),
  /** Base URL of the super-admin web app — used to build employee password-reset links. */
  SUPER_ADMIN_WEB_URL: z.string().url().default('http://localhost:3000'),

  // ── Outbound email (Phase 12) ──────────────────────────────────────────────
  /** SMTP connection string. When unset the EmailService logs messages (dev/offline transport). */
  SMTP_URL: z.string().optional(),
  /** From-address for transactional email (invitations, security notices). */
  EMAIL_FROM: z.string().default('Edrion <no-reply@edrion.local>'),

  // ── Institution registration funnel ────────────────────────────────────────
  /**
   * Server-side pepper mixed into the SHA-256 of every registration OTP before storage, so a DB
   * leak alone cannot brute-force codes. Falls back to SESSION_COOKIE_SECRET when unset.
   */
  REGISTRATION_OTP_PEPPER: z.string().optional(),
  /** Base URL of the public registration web app (apps/public-web) — used in registration status emails. */
  REGISTRATION_WEB_URL: z.string().url().default('http://localhost:3003'),
  /**
   * DEV ESCAPE HATCH. When true (and NODE_ENV != production) the OTP request endpoint returns the
   * code in its response so E2E/smoke can verify without reading the mailbox. Off in production.
   */
  REGISTRATION_OTP_DEV_RETURN: bool.default(false),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ── Petros (OpenAI) ─────────────────────────────────────────────────────────
  /** OpenAI API key. Petros endpoints refuse turns with a clear error when unset. */
  OPENAI_API_KEY: z.string().optional(),
  /** Interactive agent loop: chat turns, tool orchestration, everyday drafting. */
  OPENAI_MODEL: z.string().default('gpt-5.4-mini'),
  /** Cheap classifier-style calls: topicality, titles, permission suggestions, summaries. */
  OPENAI_SMALL_MODEL: z.string().default('gpt-5.4-nano'),
  /** Quality-critical generation: exam/document content, format capture, role drafting. */
  OPENAI_BIG_MODEL: z.string().default('gpt-5.4-2026-03-05'),

  BILLING_PROVIDER_SECRET: z.string().optional(),
  BILLING_WEBHOOK_SIGNING_SECRET: z.string().optional(),

  // ── Message attachments (real upload; local-disk store, swap for object store later) ───────
  /** Directory uploaded message attachments are written to (resolved from the API process cwd). */
  ATTACHMENT_STORAGE_DIR: z.string().default('./var/attachments'),
  /** Max size (bytes) for a single uploaded attachment. Default 25 MiB. */
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Parse + validate, throwing a readable aggregated error. */
export function loadApiEnv(raw: NodeJS.ProcessEnv = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid API environment:\n${issues}`);
  }
  return parsed.data;
}

export const publicWebEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
});
export type PublicWebEnv = z.infer<typeof publicWebEnvSchema>;

export { bool };
