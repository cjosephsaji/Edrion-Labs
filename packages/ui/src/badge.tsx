import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border',
  {
    variants: {
      tone: {
        neutral: 'bg-background-secondary text-text-secondary border-border',
        success: 'bg-success-soft text-success border-transparent',
        warning: 'bg-warning-soft text-warning border-transparent',
        danger: 'bg-danger-soft text-danger border-transparent',
        info: 'bg-info-soft text-info border-transparent',
        primary: 'bg-primary-soft text-primary border-transparent',
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
