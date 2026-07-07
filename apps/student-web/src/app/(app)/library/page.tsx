'use client';
import Link from 'next/link';
import { useLibrary } from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { LibraryUploadButton } from '@/components/library/library-upload-button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function LibraryPage() {
  const { data, isLoading } = useLibrary();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>LIBRARY</Eyebrow>}
        title="Your knowledge space"
        subtitle="Upload notes, save materials, and let Petros help you learn from them."
        right={<LibraryUploadButton className="shrink-0 gap-1.5" />}
      />

      {isLoading ? (
        <div className="mt-8 h-40 shimmer rounded-[15px]" />
      ) : !data?.uploads.length && !data?.generated.length ? (
        <EmptyState
          className="mt-8"
          eyebrow="START HERE"
          title="Your library starts with your first upload"
          description="Take a photo of notes or upload a PDF — Petros will read it."
          action={<LibraryUploadButton label="Upload notes" capture />}
        />
      ) : (
        <div className="mt-8 space-y-8">
          {data.collections.length > 0 && (
            <section>
              <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">COLLECTIONS</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {data.collections.map((c) => (
                  <Card key={c.id} className="text-sm">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: c.color ?? 'var(--st-accent)' }}
                    />
                    <p className="mt-2 font-medium text-st-ink">{c.name}</p>
                    <p className="text-xs text-st-muted">{c.count} items</p>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {data.uploads.length > 0 && (
            <section>
              <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">MY UPLOADS</h2>
              <div className="mt-3 space-y-2">
                {data.uploads.map((item) => (
                  <Link key={item.id} href={`/library/${item.id}`}>
                    <Card className="transition hover:border-st-accent/40">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-st-ink">{item.title}</p>
                          <p className="text-xs text-st-muted">
                            {item.kind.replace('upload_', '').toUpperCase()} · {item.meta}
                            {item.aiRead && ' · read by Petros ✦'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.generated.length > 0 && (
            <section>
              <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">GENERATED FOR ME ✦</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.generated.map((g) => (
                  <Card key={g.id}>
                    <p className="text-[10px] font-semibold text-st-amber">✦ {g.kind}</p>
                    <p className="mt-1 font-medium text-st-ink">{g.title}</p>
                    <p className="text-xs text-st-muted">{g.fromLabel}</p>
                    {g.freshness && (
                      <div className="mt-2">
                        <FreshnessChip freshness={g.freshness} />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
