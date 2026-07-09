'use client';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, FileUp, Upload } from 'lucide-react';
import { useUploadLibraryItem } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { IngestionCard } from './IngestionCard';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function validateFiles(files: File[]): string | null {
  for (const f of files) {
    if (f.size > MAX_BYTES) return `${f.name} is too large (max 25 MB).`;
    if (f.type && !ALLOWED.has(f.type) && !f.name.match(/\.(pdf|docx|jpe?g|png|webp)$/i)) {
      return `${f.name} isn’t a supported type.`;
    }
  }
  return null;
}

type PendingState =
  | { kind: 'uploading'; name: string }
  | { kind: 'error'; name: string; error: string };

export function UploadFlow({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const upload = useUploadLibraryItem();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingState[]>([]);
  const [dragging, setDragging] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const err = validateFiles(files);
      if (err) {
        setPending(files.map((f) => ({ kind: 'error' as const, name: f.name, error: err })));
        return;
      }
      setPending(files.map((f) => ({ kind: 'uploading' as const, name: f.name })));
      try {
        const result = await upload.mutateAsync(files);
        setPending([]);
        setOpen(false);
        onDone?.();
        const id = result.item.id;
        if (result.item.status === 'needs_ocr_confirm') router.push(`/library/${id}/confirm`);
        else router.push(`/library/${id}`);
      } catch (e) {
        const message = (e as Error).message ?? 'Upload failed';
        setPending(files.map((f) => ({ kind: 'error' as const, name: f.name, error: message })));
      }
    },
    [onDone, router, upload],
  );

  return (
    <div className="relative">
      <PillButton type="button" className="shrink-0 gap-1.5" onClick={() => setOpen((v) => !v)}>
        <Upload className="h-4 w-4" />
        Upload
      </PillButton>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-[15px] border border-st-bd1 bg-st-card p-3 shadow-lg">
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center gap-3 rounded-[12px] px-3 text-left text-sm font-medium text-st-ink hover:bg-st-accentSoft/40"
            onClick={() => photoRef.current?.click()}
          >
            <Camera className="h-4 w-4 text-st-accent" />
            Take a photo of notes
          </button>
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center gap-3 rounded-[12px] px-3 text-left text-sm font-medium text-st-ink hover:bg-st-accentSoft/40"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="h-4 w-4 text-st-accent" />
            Upload a PDF or doc
          </button>
          <div
            className={`mt-2 rounded-[12px] border border-dashed p-4 text-center text-xs text-st-muted ${
              dragging ? 'border-st-accent bg-st-accentSoft/30' : 'border-st-bd2'
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              void run(Array.from(e.dataTransfer.files ?? []));
            }}
          >
            Or drag and drop here
          </div>
        </div>
      )}

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void run(files);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void run(files);
        }}
      />

      {pending.length > 0 && (
        <div className="fixed bottom-20 left-1/2 z-30 w-[min(92vw,24rem)] -translate-x-1/2 space-y-2">
          {pending.map((p) => (
            <IngestionCard
              key={p.name}
              title={p.name}
              status={p.kind === 'uploading' ? 'queued' : 'error'}
              error={p.kind === 'error' ? p.error : undefined}
              onRetry={
                p.kind === 'error'
                  ? () => {
                      setPending([]);
                      fileRef.current?.click();
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
