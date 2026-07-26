'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmOcr, useLibraryItem, usePatchPageText } from '@/lib/hooks';
import { useStudentClient } from '@/lib/student-client';
import { EmptyState } from '@/components/ui/empty-state';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

export default function OcrConfirmPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { say } = useToast();
  const { data, isLoading } = useLibraryItem(params.id);
  const patch = usePatchPageText(params.id);
  const confirm = useConfirmOcr(params.id);
  const client = useStudentClient();

  const pages = data?.pages ?? [];
  const ordered = useMemo(
    () => [...pages].sort((a, b) => Number(b.needsConfirm) - Number(a.needsConfirm) || a.pageIndex - b.pageIndex),
    [pages],
  );
  const [index, setIndex] = useState(0);
  const page = ordered[index];
  const [text, setText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (page) setText(page.text);
  }, [page]);

  useEffect(() => {
    if (!page) return;
    let revoked: string | null = null;
    let cancelled = false;
    void client.fetchBytes(page.objectId).then((buf) => {
      if (cancelled) return;
      const blob = new Blob([buf], { type: page.mimeType ?? 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      revoked = url;
      setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [client, page]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="h-64 shimmer rounded-[15px]" />
      </div>
    );
  }

  if (!data || !page) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <EmptyState eyebrow="OCR" title="Nothing to confirm" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref={`/library/${params.id}`}
        eyebrow={<Eyebrow>CHECK THE TEXT</Eyebrow>}
        title={data.item.title}
        subtitle="Fix anything Petros misread, then confirm."
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[15px] border border-st-bd1 bg-st-card p-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`Page ${page.pageIndex + 1}`} className="mx-auto max-h-[28rem] rounded-[12px]" />
          ) : (
            <div className="h-64 shimmer rounded-[12px]" />
          )}
          <p className="mt-2 text-center font-mono-ui text-[10px] text-st-faint">
            PAGE {page.pageIndex + 1}
            {page.needsConfirm ? ' · LOW CONFIDENCE' : ''}
          </p>
        </div>
        <div className="flex flex-col rounded-[15px] border border-st-bd1 bg-st-card p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[16rem] flex-1 resize-y rounded-[12px] border border-st-bd2 bg-st-cardAlt p-3 text-sm text-st-ink focus:border-st-accent focus:outline-none"
            aria-label="Extracted text"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <PillButton
              type="button"
              variant="soft"
              disabled={patch.isPending}
              onClick={async () => {
                await patch.mutateAsync({ pageIndex: page.pageIndex, text });
                say('Page saved');
              }}
            >
              Save page
            </PillButton>
            <PillButton
              type="button"
              variant="ghost"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Prev
            </PillButton>
            <PillButton
              type="button"
              variant="ghost"
              disabled={index >= ordered.length - 1}
              onClick={() => setIndex((i) => Math.min(ordered.length - 1, i + 1))}
            >
              Next
            </PillButton>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <PillButton
          type="button"
          disabled={confirm.isPending}
          onClick={async () => {
            try {
              await confirm.mutateAsync();
              router.push(`/library/${params.id}`);
            } catch (e) {
              say((e as Error).message ?? 'Confirm failed');
            }
          }}
        >
          Confirm all pages
        </PillButton>
      </div>
    </div>
  );
}
