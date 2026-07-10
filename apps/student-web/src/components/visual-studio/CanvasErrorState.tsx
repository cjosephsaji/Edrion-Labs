'use client';

import Link from 'next/link';
import { PillButton } from '@/components/ui/pill-button';

export function CanvasErrorState({
  title,
  message,
  actionHref = '/lab/visual',
  actionLabel = 'Back to Visual Studio',
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl font-semibold text-st-ink">{title}</h1>
      <p className="mt-2 text-sm text-st-muted">{message}</p>
      <Link href={actionHref} className="mt-6">
        <PillButton variant="soft">{actionLabel}</PillButton>
      </Link>
    </div>
  );
}
