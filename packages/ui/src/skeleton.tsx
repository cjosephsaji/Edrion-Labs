import { cn } from './cn';

/** Dimension-matched skeleton — prevents layout shift. Pass sizing via className. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-background-secondary', className)}
      {...props}
    />
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
