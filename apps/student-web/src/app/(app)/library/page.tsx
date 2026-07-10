'use client';
import { useState } from 'react';
import { useDeleteLibraryItem, useLibrary } from '@/lib/hooks';
import { usePersona } from '@/lib/persona';
import { ArtifactCard, SourceCard } from '@/components/library/SourceCard';
import { CollectionsRow } from '@/components/library/CollectionsRow';
import { RecentlyAdded } from '@/components/library/RecentlyAdded';
import { SearchBar } from '@/components/library/SearchBar';
import { UploadFlow } from '@/components/library/UploadFlow';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

function leadLine(persona: string | undefined) {
  if (persona === 'independent') {
    return 'Your private study space — nothing is shared with anyone.';
  }
  if (persona === 'college') {
    return 'Upload notes, save materials, and let Petros help you learn from them.';
  }
  return 'Upload notes, save materials, and let Petros help you learn from them.';
}

export default function LibraryPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useLibrary(q);
  const { me } = usePersona();
  const remove = useDeleteLibraryItem();
  const { say } = useToast();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>LIBRARY</Eyebrow>}
        title="Your knowledge space"
        subtitle={leadLine(me?.persona)}
        right={<UploadFlow />}
      />

      <SearchBar value={q} onChange={setQ} />

      {isLoading ? (
        <div className="mt-8 h-40 shimmer rounded-[15px]" />
      ) : isError ? (
        <EmptyState
          className="mt-8"
          eyebrow="SOMETHING WENT WRONG"
          title="Couldn’t load your library"
          description="Check your connection and try again."
        />
      ) : !data?.uploads.length && !data?.generated.length && !q ? (
        <EmptyState
          className="mt-8"
          eyebrow="START HERE"
          title="Your library starts with your first upload"
          description="Take a photo of notes or upload a PDF — Petros will read it."
          action={<UploadFlow />}
        />
      ) : (
        <div className="mt-8 space-y-8">
          {!q && <CollectionsRow collections={data?.collections ?? []} />}
          {!q && <RecentlyAdded items={data?.recentAdded ?? []} />}

          {(data?.uploads.length ?? 0) > 0 && (
            <section>
              <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">MY UPLOADS</h2>
              <div className="mt-3 space-y-2">
                {data!.uploads.map((item) => (
                  <SourceCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    status={item.status}
                    errorMessage={item.errorMessage}
                    pagesDone={item.pagesDone}
                    pageCount={item.pageCount}
                    updatedAt={item.updatedAt}
                    meta={`${item.kind.replace('upload_', '').toUpperCase()}${item.meta ? ` · ${item.meta}` : ''}${
                      item.aiRead ? ' · read by Petros ✦' : ''
                    }`}
                    deleting={remove.isPending && remove.variables === item.id}
                    onDelete={() => {
                      if (!window.confirm(`Delete “${item.title}”? This can’t be undone.`)) return;
                      remove.mutate(item.id, {
                        onError: (e) => say((e as Error).message ?? 'Could not delete'),
                      });
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {(data?.generated.length ?? 0) > 0 && (
            <section>
              <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">
                GENERATED FOR ME ✦
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data!.generated.map((g) => (
                  <ArtifactCard
                    key={`${g.kind}-${g.id}`}
                    id={g.id}
                    kind={g.kind}
                    title={g.title}
                    fromLabel={g.fromLabel}
                    freshness={g.freshness}
                    meta={g.meta}
                  />
                ))}
              </div>
            </section>
          )}

          {q && !data?.uploads.length && !data?.generated.length && (
            <EmptyState
              eyebrow="NO MATCHES"
              title={`Nothing matched “${q}”`}
              description="Try another word from a title or source."
            />
          )}
        </div>
      )}
    </div>
  );
}
