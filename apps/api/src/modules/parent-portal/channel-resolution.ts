/**
 * Pure notification channel-resolution logic (no I/O), extracted so it can be unit-tested. Given a
 * guardian's base channel prefs, per-category overrides and quiet hours, plus the event category and
 * criticality, returns the channel keys to dispatch on. Critical events (medical incident, emergency
 * broadcast) always go on all enabled channels and ignore quiet hours.
 */
export const CRITICAL_TYPES = new Set(['medical_incident', 'emergency_broadcast']);

export function inQuietHours(qh: Record<string, string>, now: Date = new Date()): boolean {
  if (!qh.start || !qh.end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = qh.start.split(':').map(Number);
  const [eh, em] = qh.end.split(':').map(Number);
  const start = (sh ?? 0) * 60 + (sm ?? 0);
  const end = (eh ?? 0) * 60 + (em ?? 0);
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end; // overnight windows
}

export function resolveChannels(
  base: Record<string, boolean> | null,
  overrides: Record<string, Record<string, boolean>>,
  quietHours: Record<string, string>,
  category: string,
  critical: boolean,
  now: Date = new Date(),
): string[] {
  const effectiveBase = base ?? { email: true, push: true, sms: false, whatsapp: false };
  const merged = { ...effectiveBase, ...(overrides[category] ?? {}) };
  const enabled = Object.keys(merged).filter((k) => merged[k]);
  if (critical || CRITICAL_TYPES.has(category)) {
    return [...new Set([...enabled, 'email', 'push'])];
  }
  if (inQuietHours(quietHours, now)) return [];
  return enabled;
}
