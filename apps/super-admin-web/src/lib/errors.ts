import { ApiClientError } from '@edrion/api-client';

/** The API error code, or null for a non-API error. */
export function errorCode(e: unknown): string | null {
  return e instanceof ApiClientError ? e.code : null;
}

/**
 * Actionable, human messages for the API's well-known error codes — keeps mutation feedback
 * consistent across pages, dialogs and toasts. Falls back to the server message, then a generic.
 */
const FRIENDLY: Record<string, string> = {
  RECENT_AUTH_REQUIRED: 'This action needs recent authentication. Re-authenticate and try again.',
  VERSION_CONFLICT: 'This record changed since you loaded it. Reload and try again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  UNAUTHENTICATED: 'Your session has expired. Sign in again.',
  PAYLOAD_TOO_LARGE: 'That request was too large. Reduce the size and try again.',
  IDEMPOTENCY_IN_PROGRESS: 'This action is already being processed — please wait.',
  RUN_EXPIRED: 'This confirmation has expired. Start a new Copilot run.',
  SECOND_APPROVER_REQUIRED: 'A second approver must sign off before this can run.',
};

export function errorMessage(e: unknown, fallback = 'Action failed.'): string {
  if (e instanceof ApiClientError) return FRIENDLY[e.code] ?? e.message ?? fallback;
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Sensitive action blocked for want of recent auth — callers surface a re-auth affordance. */
export function isRecentAuthError(e: unknown): boolean {
  return errorCode(e) === 'RECENT_AUTH_REQUIRED';
}

/** Optimistic-concurrency clash — callers surface a "reload" affordance. */
export function isVersionConflict(e: unknown): boolean {
  return errorCode(e) === 'VERSION_CONFLICT';
}
