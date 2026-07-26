'use client';
import { useRouter } from 'next/navigation';
import { useDeleteLibraryItem, useLibraryItem, useRetryIngest } from '@/lib/hooks';
import { AlreadyMade } from '@/components/library/AlreadyMade';
import { DocViewer } from '@/components/library/DocViewer';
import { IngestionCard } from '@/components/library/IngestionCard';
import { LibraryActionsRail } from '@/components/library/library-actions-rail';
import { SubjectClassifyChip } from '@/components/library/subject-classify-chip';
import { EmptyState } from '@/components/ui/empty-state';
import { PillButton } from '@/components/ui/pill-button';
import { useToast } from '@/components/ui/toast';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { ingestStatusLine } from '@/lib/library-ingest';
import Link from 'next/link';

export default function LibraryItemPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading, isError } = useLibraryItem(params.id);
  const retry = useRetryIngest(params.id);
  const remove = useDeleteLibraryItem();
  const { say } = useToast();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="h-48 shimmer rounded-[15px]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <EmptyState
          eyebrow="NOT FOUND"
          title="This source isn’t here"
          action={
            <Link href="/library" className="text-sm font-semibold text-st-accent">
              Back to library
            </Link>
          }
        />
      </div>
    );
  }

  const { item, pages, artifacts } = data;
  const ready = item.status === 'ready';
  const ingestLine = ingestStatusLine(item).line;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/library"
        eyebrow={<Eyebrow>{item.kind.replace(/_/g, ' ').toUpperCase()}</Eyebrow>}
        title={item.title}
        subtitle={
          item.aiRead
            ? `Read by Petros ✦ · ${item.pageCount ?? (pages.some((p) => p.text) ? pages.length : '…')} pages`
            : item.pageCount
              ? `${item.pageCount} pages`
              : item.status === 'queued' || item.status === 'reading'
                ? ingestLine
                : pages.some((p) => p.text)
                  ? `${pages.length} pages`
                  : undefined
        }
        right={
          <PillButton
            type="button"
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (!window.confirm(`Delete “${item.title}”? This can’t be undone.`)) return;
              remove.mutate(item.id, {
                onSuccess: () => router.push('/library'),
                onError: (e) => say((e as Error).message ?? 'Could not delete'),
              });
            }}
          >
            Delete
          </PillButton>
        }
      />

      {ready && (
        <div className="mt-4">
          <SubjectClassifyChip itemId={item.id} />
        </div>
      )}

      {(item.status === 'queued' || item.status === 'reading') && (
        <div className="mt-4">
          <IngestionCard
            title={item.title}
            status={item.status}
            pagesDone={item.pagesDone}
            pageCount={item.pageCount}
            updatedAt={item.updatedAt}
            itemId={item.id}
            onRetry={() => retry.mutate()}
          />
        </div>
      )}

      {item.status === 'error' && (
        <div className="mt-4">
          <IngestionCard
            title={item.title}
            status="error"
            error={item.errorMessage}
            itemId={item.id}
            onRetry={() => retry.mutate()}
          />
        </div>
      )}

      {item.status === 'needs_ocr_confirm' && (
        <div className="mt-4">
          <IngestionCard
            title={item.title}
            status="needs_ocr_confirm"
            confirmHref={`/library/${item.id}/confirm`}
            itemId={item.id}
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <DocViewer pages={pages} kind={item.kind} pageCount={item.pageCount} />
        <div className="space-y-6">
          <LibraryActionsRail itemId={item.id} ready={ready} />
          <div>
            <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">
              ALREADY MADE FROM THIS
            </h2>
            <div className="mt-3">
              <AlreadyMade artifacts={artifacts} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
