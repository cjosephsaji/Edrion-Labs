import { StudentClientError } from '../student-client';

type LearnRouter = { push: (href: string) => void };

/** When the API returns 409 SESSION_ACTIVE, open the in-progress lesson instead of failing. */
export function redirectIfSessionActive(
  err: unknown,
  router: LearnRouter,
  fallbackSessionPath?: string,
): boolean {
  if (!(err instanceof StudentClientError) || err.code !== 'SESSION_ACTIVE') return false;
  const activeId =
    typeof err.meta?.activeSessionId === 'string' ? err.meta.activeSessionId : undefined;
  if (activeId) {
    router.push(`/learn/session/${activeId}`);
    return true;
  }
  if (fallbackSessionPath) {
    router.push(fallbackSessionPath);
    return true;
  }
  return false;
}
