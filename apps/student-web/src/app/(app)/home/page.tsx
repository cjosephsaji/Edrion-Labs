'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { HomeTileDto } from '@edrion/schemas';
import { useStudentMe, useHome } from '@/lib/hooks';
import { useT } from '@/i18n/use-t';
import { Card } from '@/components/ui/card';
import { Eyebrow, PageTitle } from '@/components/ui/primitives';

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
  const router = useRouter();
  const { data: me } = useStudentMe();
  const { data: home, isLoading } = useHome();
  const { t } = useT();

  useEffect(() => {
    if (me?.kind === 'independent') {
      router.replace('/learn');
    }
  }, [me?.kind, router]);

  if (me?.kind === 'independent') {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <div className="h-10 w-48 shimmer rounded-xl" />
      </div>
    );
  }

  const firstName = me?.fullName.split(' ')[0] ?? 'there';

  return (
    <div className="mx-auto max-w-[1130px] px-5 py-8 pb-24 animate-st-block-in md:px-10 md:py-[34px]">
      <Eyebrow>{formatEyebrowDate()}</Eyebrow>
      <PageTitle className="mt-2">{t('home.greeting', { name: firstName })}</PageTitle>
      <p className="mt-2 max-w-lg text-sm text-st-muted">
        {t('home.subline')}{' '}
        <strong className="font-semibold text-st-ink">{t('home.learnEmphasis')}</strong>.
      </p>

      {isLoading ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 shimmer rounded-[15px]" />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(home?.tiles ?? []).map((tile: HomeTileDto) => (
            <Link key={tile.key} href={tile.route}>
              <Card className="h-full transition hover:border-st-accent/40 hover:shadow-md" noPadding>
                <div className="p-5">
                  <Eyebrow>{tile.eyebrow}</Eyebrow>
                  <p className="mt-1 font-display text-lg font-semibold text-st-ink">{tile.title}</p>
                  {tile.meta && <p className="mt-1 text-xs text-st-muted">{tile.meta}</p>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Link href="/learn" className="mt-6 block">
        <div className="rounded-[18px] border border-st-accentBd bg-gradient-to-br from-st-accentSoft to-st-card p-6 transition hover:border-st-accent">
          <Eyebrow color="accent">{t('home.learnBannerEyebrow')}</Eyebrow>
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
