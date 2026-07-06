'use client';
import type { DocumentSurfaceItemDto } from '@edrion/schemas';
import { useDocumentsSurface } from '@/lib/hooks';
import { Card } from '@/components/ui/card';

export default function DocumentsPage() {
  const { data, isLoading } = useDocumentsSurface();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Documents</h1>

      {isLoading ? (
        <div className="mt-8 h-32 shimmer rounded-2xl" />
      ) : (
        <div className="mt-6 space-y-3">
          {((data?.items ?? []) as DocumentSurfaceItemDto[]).map((doc) => (
            <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer">
              <Card className="transition hover:border-st-accent/40">
                <p className="font-semibold text-st-ink">{doc.title}</p>
                <p className="text-xs text-st-muted">{doc.category}</p>
              </Card>
            </a>
          ))}
          {(data?.items ?? []).length === 0 && (
            <p className="text-sm text-st-muted">No documents available.</p>
          )}
        </div>
      )}
    </div>
  );
}
