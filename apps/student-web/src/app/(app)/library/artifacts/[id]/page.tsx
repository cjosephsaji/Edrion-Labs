'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLibraryArtifact } from '@/lib/hooks';
import { GlossaryPanel } from '@/components/library/GlossaryPanel';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import type { GlossaryContent } from '@edrion/schemas';

export default function ArtifactPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useLibraryArtifact(params.id);
  const [open, setOpen] = useState<number | null>(0);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <EmptyState eyebrow="ARTIFACT" title="Not found" />
      </div>
    );
  }

  if (data.kind === 'glossary') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref={data.itemId ? `/library/${data.itemId}` : '/library'}
          eyebrow={<Eyebrow>✦ GLOSSARY</Eyebrow>}
          title={data.title}
          subtitle={data.fromLabel}
        />
        <div className="mt-6">
          <GlossaryPanel content={data.content as GlossaryContent} fromLabel={data.fromLabel} />
        </div>
      </div>
    );
  }

  const content = data.content as {
    title?: string;
    sections?: Array<{ heading: string; body: string; deeper?: string; sourcePage?: number }>;
  };
  const sections = content.sections ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref={data.itemId ? `/library/${data.itemId}` : '/library'}
        eyebrow={<Eyebrow>✦ {data.kind.replace(/_/g, ' ').toUpperCase()}</Eyebrow>}
        title={data.title}
        subtitle={data.fromLabel}
      />
      {data.itemId && (
        <Link
          href={`/library/${data.itemId}`}
          className="mt-2 inline-block text-sm font-semibold text-st-accent"
        >
          Open source →
        </Link>
      )}

      <div className="mt-6 space-y-3">
        {sections.map((section, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="rounded-[15px] border border-st-bd1 bg-st-card">
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left"
                onClick={() => setOpen(isOpen ? null : i)}
              >
                <span className="font-display font-semibold text-st-ink">{section.heading}</span>
                {section.sourcePage && (
                  <span className="font-mono-ui text-[10px] text-st-faint">p.{section.sourcePage}</span>
                )}
              </button>
              {isOpen && (
                <div className="border-t border-st-bd2 px-4 py-3">
                  <p className="whitespace-pre-wrap text-sm text-st-ink">{section.body}</p>
                  {section.deeper && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold text-st-accent">
                        Go deeper
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-st-muted">{section.deeper}</p>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
