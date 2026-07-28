import { StudentClientError } from '../student-client';

type LearnRouter = { push: (href: string) => void };

/**
 * Legacy 409 SESSION_ACTIVE handler. Create now resumes the same lesson or
 * closes a different one into history, so this should rarely fire. When it
 * does, only open the active id if the caller already intended that resume
 * path (fallback) — never silently bounce a new-lesson start into an old topic.
 */
export function redirectIfSessionActive(
  err: unknown,
  router: LearnRouter,
  fallbackSessionPath?: string,
): boolean {
  if (!(err instanceof StudentClientError) || err.code !== 'SESSION_ACTIVE') return false;
  // Prefer an explicit resume tile/route over activeSessionId so a stale conflict
  // cannot send the student into the wrong topic after they asked for a new lesson.
  if (fallbackSessionPath) {
    router.push(fallbackSessionPath);
    return true;
  }
  return false;
}
