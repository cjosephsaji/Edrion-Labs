'use client';
import Link from 'next/link';
import { useLibrary } from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { LibraryUploadButton } from '@/components/library/library-upload-button';
import { Card } from '@/components/ui/card';

export default function LibraryPage() {
  const { data, isLoading } = useLibrary();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-st-faint">LIBRARY</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-st-ink">Your knowledge space</h1>
          <p className="mt-2 text-sm text-st-muted">Upload notes, save materials, and let Petros help you learn from them.</p>
        </div>
        <LibraryUploadButton className="shrink-0 gap-1.5" />
      </div>

      {isLoading ? (
        <div className="mt-8 h-40 shimmer rounded-2xl" />
      ) : !data?.uploads.length && !data?.generated.length ? (
        <Card className="mt-8 text-center">
          <p className="text-4xl">📚</p>
          <p className="mt-3 font-display text-lg font-semibold text-st-ink">Your library starts with your first upload</p>
          <p className="mt-2 text-sm text-st-muted">Take a photo of notes or upload a PDF — Petros will read it.</p>
          <LibraryUploadButton label="📷 Take a photo of notes" capture className="mt-4" />
        </Card>
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
