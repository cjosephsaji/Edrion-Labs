import { z } from 'zod';
import { SupportAccessSessionStatus } from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';

export const supportAccessSessionStatusSchema = zEnumFromConst(SupportAccessSessionStatus);

/**
 * Scope of access an employee operates under inside an institution portal. A subset of what
 * the employee could otherwise do — the session is the audit boundary, not a privilege grant.
 */
export const ACCESS_LEVELS = ['read_only', 'support', 'onboarding', 'troubleshooting'] as const;
export const accessLevelSchema = z.enum(ACCESS_LEVELS);
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Min/max session length. Hard-capped — support access is always time-boxed. */
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 480;
export const MAX_EXTEND_MINUTES = 240;

/** Start a support-access session (request → approve → start, collapsed for self-service). */
export const startSupportSessionSchema = z.object({
  institutionId: z.string().uuid(),
  accessLevel: accessLevelSchema.default('support'),
  reason: reasonSchema,
  /** Optional support-case / ticket reference, linked into every audit event. */
  caseRef: z.string().trim().max(64).optional(),
  /** Optional single-campus scoping inside the institution. */
  campusId: z.string().uuid().optional(),
  durationMinutes: z
    .number()
    .int()
    .min(MIN_DURATION_MINUTES)
    .max(MAX_DURATION_MINUTES)
    .default(60),
});
export type StartSupportSessionInput = z.infer<typeof startSupportSessionSchema>;

export const extendSupportSessionSchema = z.object({
  addMinutes: z.number().int().min(MIN_DURATION_MINUTES).max(MAX_EXTEND_MINUTES),
  reason: reasonSchema,
});
export type ExtendSupportSessionInput = z.infer<typeof extendSupportSessionSchema>;

export const endSupportSessionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type EndSupportSessionInput = z.infer<typeof endSupportSessionSchema>;

export const listSupportSessionsQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  institutionId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: supportAccessSessionStatusSchema.optional(),
  /** Convenience filter for the banner / "who is in a portal right now" view. */
  activeOnly: z.coerce.boolean().optional(),
});
export type ListSupportSessionsQuery = z.infer<typeof listSupportSessionsQuerySchema>;

/**
 * Pure session-time helpers — shared by the API (authoritative) and the client countdown so
 * both agree on when a session lapses. No dependencies, fully testable.
 */

/** Hard expiry for a session started at `startedAt` running `durationMinutes`. */
export function computeExpiry(startedAt: Date, durationMinutes: number): Date {
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

/**
 * Extend an active session: never shorten, never anchor to the past. The new expiry is
 * `addMinutes` past whichever is later — the current expiry or now.
 */
export function computeExtendedExpiry(
  currentExpiresAt: Date,
  addMinutes: number,
  now: Date = new Date(),
): Date {
  const anchor = Math.max(currentExpiresAt.getTime(), now.getTime());
  return new Date(anchor + addMinutes * 60_000);
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Whole seconds left before expiry (0 once lapsed). Drives the banner countdown. */
export function secondsUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}
