import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-xs',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-background-secondary text-text-secondary',
        success: 'border-success/15 bg-success-soft text-success',
        warning: 'border-warning/15 bg-warning-soft text-warning',
        danger: 'border-danger/15 bg-danger-soft text-danger',
        info: 'border-info/15 bg-info-soft text-info',
        primary: 'border-primary/15 bg-primary-soft text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badge>['tone']>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {
  /** A non-colour indicator (dot) so status isn't conveyed by colour alone. */
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Maps an institution/subscription status to a tone + readable label. */
const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  published: 'success',
  draft: 'warning',
  trial: 'info',
  onboarding: 'primary',
  lead: 'neutral',
  past_due: 'warning',
  restricted: 'warning',
  grace: 'warning',
  paused: 'warning',
  suspended: 'danger',
  cancelled: 'danger',
  expired: 'danger',
  archived: 'neutral',
  // Institution registration request statuses.
  submitted: 'info',
  under_review: 'primary',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
  info_requested: 'warning',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge tone={tone} dot className={className}>
      {label}
    </Badge>
  );
}
