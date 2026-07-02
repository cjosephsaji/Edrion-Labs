import { cn } from './cn';

/**
 * Dimension-matched skeleton — prevents layout shift. Pass sizing via className. A transparent
 * light bar sweeps across the muted base (the `shimmer` animation) so essential page loads read as
 * "loading" rather than static. Falls back to a static block under prefers-reduced-motion.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('relative overflow-hidden rounded-md bg-background-secondary', className)}
      {...props}
    >
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </div>
  );
}

/** A skeleton table body matching the real row height to avoid jumps. */
export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-table-row items-center gap-4 px-4">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
