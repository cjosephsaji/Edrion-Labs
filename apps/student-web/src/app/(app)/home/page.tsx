'use client';
import Link from 'next/link';
import type { HomeTileDto } from '@edrion/schemas';
import { useStudentMe, useHome } from '@/lib/hooks';
import { useT } from '@/i18n/use-t';
import { Card } from '@/components/ui/card';

function formatEyebrowDate(): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
    .format(new Date())
    .toUpperCase();
}

export default function HomePage() {
  const { data: me } = useStudentMe();
  const { data: home, isLoading } = useHome();
  const { t } = useT();

  const firstName = me?.fullName.split(' ')[0] ?? 'there';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:py-10 animate-st-block-in">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-st-faint">{formatEyebrowDate()}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-st-ink md:text-4xl">
        {t('home.greeting', { name: firstName })}
      </h1>
      <p className="mt-2 max-w-lg text-sm text-st-muted">
        {t('home.subline')}{' '}
        <strong className="font-semibold text-st-ink">{t('home.learnEmphasis')}</strong>.
      </p>

      {isLoading ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 shimmer rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {(home?.tiles ?? []).map((tile: HomeTileDto) => (
            <Link key={tile.key} href={tile.route}>
              <Card className="h-full transition hover:border-st-accent/40 hover:shadow-md">
                <p className="text-[10px] font-semibold tracking-[0.12em] text-st-faint">{tile.eyebrow}</p>
                <p className="mt-1 font-display text-lg font-semibold text-st-ink">{tile.title}</p>
                {tile.meta && <p className="mt-1 text-xs text-st-muted">{tile.meta}</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Link href="/learn" className="mt-6 block">
        <div className="rounded-2xl border border-st-accent/25 bg-gradient-to-br from-st-accentSoft to-st-card p-6 transition hover:border-st-accent/50">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-st-accent">
            {t('home.learnBannerEyebrow')}
          </p>
          <p className="mt-2 font-display text-xl font-semibold text-st-ink">
            {home?.learnBanner?.title ?? t('home.learnBannerTitle')}
          </p>
          {home?.learnBanner?.subtitle && (
            <p className="mt-1 text-sm text-st-muted">{home.learnBanner.subtitle}</p>
          )}
          <p className="mt-3 text-sm font-semibold text-st-accent">{t('home.learnBannerCta')}</p>
        </div>
      </Link>
    </div>
  );
}
