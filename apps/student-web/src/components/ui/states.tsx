'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox, LogIn } from 'lucide-react';
import {
  ActionLink,
  Card,
  CardSkeleton,
  EmptyState as DesignEmptyState,
  ErrorState as DesignErrorState,
  OfflineState,
  PageHeader as DesignPageHeader,
} from '@/components/design-system';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return <DesignPageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="animate-block-in mx-auto w-full max-w-[1120px]" role="status" aria-live="polite">
      <CardSkeleton label={label} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
  actionHref = '/home',
  actionLabel = 'Back to portal',
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <DesignEmptyState
      icon={icon}
      title={title}
      description={description ?? 'This section will update when your institution publishes something new.'}
      action={action ?? <ActionLink href={actionHref} variant="secondary">{actionLabel}</ActionLink>}
    />
  );
}

export function ErrorState({
  title = 'Couldn’t load this page',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const retry = onRetry ?? (() => window.location.reload());
  const offline = typeof navigator !== 'undefined' && (!navigator.onLine || description?.toLowerCase().includes('failed to fetch'));
  if (offline) return <OfflineState onRetry={retry} />;
  return <DesignErrorState onRetry={retry} title={title} description={description} />;
}

export function UnauthorizedState({
  title = 'Sign in required',
  description = 'Your session expired or you are not signed in.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <DesignEmptyState
      icon={LogIn}
      title={title}
      description={description}
      action={<ActionLink href="/login">Go to login</ActionLink>}
    />
  );
}

export function SurfaceCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Card as="section" className={className}>{children}</Card>;
}
