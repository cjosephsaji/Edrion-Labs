'use client';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n/use-t';
import { PillButton } from './ui/pill-button';

export function PlaceholderScreen({ title }: { title: string }) {
  const { t } = useT();

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center animate-st-block-in">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-st-accentSoft text-st-accent">
        <Sparkles size={28} aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{title}</h1>
      <p className="mt-2 text-sm text-st-muted">{t('placeholder.copy')}</p>
      <Link href="/learn" className="mt-6">
        <PillButton>{t('placeholder.cta')}</PillButton>
      </Link>
    </div>
  );
}
