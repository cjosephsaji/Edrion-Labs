'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n/use-t';
import { PillButton } from './ui/pill-button';
import { EmptyState } from './ui/empty-state';

export function PlaceholderScreen({ title }: { title: string }) {
  const { t } = useT();

  return (
    <div className="mx-auto max-w-lg px-4 py-16 animate-st-block-in">
      <EmptyState
        eyebrow="COMING SOON"
        title={title}
        description={t('placeholder.copy')}
        action={
          <Link href="/learn">
            <PillButton>
              <Sparkles size={16} className="mr-2 inline" aria-hidden />
              {t('placeholder.cta')}
            </PillButton>
          </Link>
        }
      />
    </div>
  );
}
