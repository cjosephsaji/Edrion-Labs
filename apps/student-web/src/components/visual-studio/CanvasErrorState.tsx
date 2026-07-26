'use client';

import Link from 'next/link';
import { PillButton } from '@/components/ui/pill-button';

export function CanvasErrorState({
  title,
  message,
  actionHref = '/lab/visual',
  actionLabel = 'Back to Visual Studio',
  onRetry,
  retryLabel = 'Try again',
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-st-ink">{title}</h1>
      <p className="mt-2 text-sm text-st-muted">{message}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <PillButton variant="primary" onClick={onRetry}>
            {retryLabel}
          </PillButton>
        )}
        <Link href={actionHref}>
          <PillButton variant="soft">{actionLabel}</PillButton>
        </Link>
      </div>
    </div>
  );
}
