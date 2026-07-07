'use client';
import type { DocumentSurfaceItemDto } from '@edrion/schemas';
import { useDocumentsSurface } from '@/lib/hooks';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function DocumentsPage() {
  const { data, isLoading } = useDocumentsSurface();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>SCHOOL</Eyebrow>} title="Documents" />

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-[15px]" />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="NO DOCUMENTS"
          title="No documents available"
          description="Certificates and school documents will appear here when published."
        />
      ) : (
        <div className="mt-6 space-y-2">
          {((data?.items ?? []) as DocumentSurfaceItemDto[]).map((doc) => (
            <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer">
              <div className="rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5 transition hover:border-st-accent/40">
                <p className="font-semibold text-st-ink">{doc.title}</p>
                <p className="font-mono-ui text-xs text-st-faint">{doc.category}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
