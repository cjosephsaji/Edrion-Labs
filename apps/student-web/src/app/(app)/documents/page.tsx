'use client';
import Link from 'next/link';
import type { DocumentSurfaceItemDto } from '@edrion/schemas';
import { useDocumentsSurface, useStudentMe } from '@/lib/hooks';
import { useStudentVault } from '@/lib/requests';
import { useStudentClient } from '@/lib/student-client';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function DocumentsPage() {
  const { data, isLoading } = useDocumentsSurface();
  const { data: me } = useStudentMe();
  const requestsEnabled = Boolean(me?.surfaces.requests);
  const vault = useStudentVault(requestsEnabled);
  const client = useStudentClient();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader eyebrow={<Eyebrow>SCHOOL</Eyebrow>} title="Documents" />
      {requestsEnabled && <div className="mt-5 flex gap-2">
          <Link href="/requests?new=document_request" className="rounded-full bg-st-accent px-4 py-2 text-sm font-semibold text-white">Request a document</Link>
          <Link href="/requests" className="rounded-full border border-st-bd2 bg-st-card px-4 py-2 text-sm font-semibold text-st-ink">Requests</Link>
        </div>}

      {(vault.data?.items ?? []).length > 0 && (
        <section className="mt-7">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-st-faint">Your vault</p>
          <div className="space-y-2">{vault.data!.items.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between rounded-[15px] border border-st-bd1 bg-st-card px-4 py-3.5">
              <div>
                <p className="font-semibold text-st-ink">{doc.title}</p>
                <p className="text-xs text-st-faint">
                  Issued {new Date(doc.issuedAt).toLocaleDateString()}
                  {doc.family ? ` · ${doc.family}` : ''}
                </p>
                {doc.deliveryMode === 'physical_pickup' && doc.pickupNote ? (
                  <p className="mt-1 text-xs text-st-accentDeep">{doc.pickupNote}</p>
                ) : null}
              </div>
              {doc.deliveryMode === 'physical_pickup' ? (
                <span className="rounded-full bg-st-amberSoft px-2 py-1 text-xs font-semibold text-st-ink">Collect at office</span>
              ) : doc.revokedAt ? (
                <span className="rounded-full bg-st-page px-2 py-1 text-xs text-st-muted">Revoked</span>
              ) : (
                <a href={client.resourceUrl(`/requests/documents/${doc.id}/file`)} target="_blank" className="text-sm font-semibold text-st-accentDeep">Open</a>
              )}
            </div>
          ))}</div>
        </section>
      )}

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
