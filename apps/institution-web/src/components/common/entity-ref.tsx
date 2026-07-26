'use client';
import type { EntityDisplay } from '@/lib/types';

/** Deterministic initials for the avatar fallback (max two letters). */
function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}

/** Stable, low-saturation avatar tint derived from the entity id/label. */
function tint(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 45% 92%)`;
}

/**
 * Renders a resolved entity ({@link EntityDisplay}) as an avatar + name + optional sub-line — the
 * single component that replaces bare UUIDs across every portal list and detail panel. Falls back to
 * a muted em dash when the reference is null (e.g. a record whose student was removed).
 */
export function EntityRef({
  entity,
  avatar = true,
  sub = true,
  className,
}: {
  entity: EntityDisplay | null | undefined;
  /** Show the initials avatar (default true). */
  avatar?: boolean;
  /** Show the secondary line, e.g. admission no (default true). */
  sub?: boolean;
  className?: string;
}) {
  if (!entity) return <span className="text-text-muted">—</span>;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className ?? ''}`}>
      {avatar && (
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-text-secondary"
          style={{ backgroundColor: tint(entity.id || entity.label) }}
        >
          {initials(entity.label)}
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-medium text-text-primary">{entity.label}</span>
        {sub && entity.sub && <span className="truncate text-xs text-text-muted">{entity.sub}</span>}
      </span>
    </span>
  );
}
