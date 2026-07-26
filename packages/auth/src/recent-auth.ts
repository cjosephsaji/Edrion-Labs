/**
 * Recent-auth gate. Sensitive actions require the employee to have authenticated within a
 * window, even if they hold the permission. Pure + testable.
 */
export function isRecentAuth(
  lastAuthAt: Date | null | undefined,
  windowSeconds: number,
  now: Date = new Date(),
): boolean {
  if (!lastAuthAt) return false;
  const elapsed = (now.getTime() - lastAuthAt.getTime()) / 1000;
  return elapsed >= 0 && elapsed <= windowSeconds;
}

/** Seconds until recent-auth lapses (0 if already lapsed). For UI countdowns. */
export function recentAuthRemaining(
  lastAuthAt: Date | null | undefined,
  windowSeconds: number,
  now: Date = new Date(),
): number {
  if (!lastAuthAt) return 0;
  const elapsed = (now.getTime() - lastAuthAt.getTime()) / 1000;
  return Math.max(0, Math.floor(windowSeconds - elapsed));
}
