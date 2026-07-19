import { cn } from './cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface-elevated shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-standard',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-md font-semibold tracking-[0.01em] text-text-primary', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-text-secondary', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

/** Compact metric card used across dashboards + directory summaries. */
export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'group relative min-w-[9.5rem] overflow-hidden p-4 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md',
        className,
      )}
    >
      <span
        className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full bg-primary/30 transition-colors group-hover:bg-primary"
        aria-hidden
      />
      <div className="pr-4 text-xs font-semibold uppercase leading-snug tracking-wide text-balance text-text-muted hyphens-none">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
      {hint ? <div className="mt-1 text-xs text-text-muted">{hint}</div> : null}
    </Card>
  );
}
