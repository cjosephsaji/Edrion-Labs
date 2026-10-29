'use client';

import { useRef, useState } from 'react';
import { Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button, Label } from '@edrion/ui';
import { PETROS_GUIDANCE_FILE_ACCEPT, PETROS_GUIDANCE_MAX_FILES, PETROS_GUIDANCE_MAX_FILE_BYTES,
  type PetrosGuidanceAttachment } from '@edrion/schemas';
import { useFormat } from '@/lib/format';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

export function GuidanceFileList({ files, path, onRemove, disabled = false, onError }: {
  files: PetrosGuidanceAttachment[]; path: string; onRemove?: (id: string) => void;
  disabled?: boolean; onError: (error: string) => void;
}) {
  const client = usePortalClient();
  const { scope } = useScope();
  const fmt = useFormat();
  const [downloading, setDownloading] = useState<string | null>(null);
  async function download(file: PetrosGuidanceAttachment) {
    setDownloading(file.id);
    try {
      const blob = await client.fetchFile(`${path}/files/${file.id}`, scope);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { onError(formatPortalError(error, 'The file could not be downloaded.')); }
    finally { setDownloading(null); }
  }
  if (!files.length) return null;
  return <ul className="mt-3 flex flex-col gap-2">{files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2">
    <div className="flex min-w-0 flex-1 items-start gap-2.5"><Paperclip size={15} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0"><p className="break-words text-sm font-medium text-text-primary">{file.filename}</p>
        <p className="mt-0.5 text-xs text-text-muted">{fmt.number(Math.max(1, Math.round(file.sizeBytes / 1024)))} KiB · {file.textStatus === 'readable' ? `Petros can use readable excerpts${file.textTruncated ? ' · text preparation was shortened' : ''}` : 'Student reference · text is unavailable to Petros'}</p></div></div>
    <div className="flex items-center gap-1"><Button size="sm" variant="ghost" disabled={disabled || Boolean(downloading)} loading={downloading === file.id} aria-label={`Download ${file.filename}`} onClick={() => void download(file)}><Download size={14} aria-hidden="true" />Download</Button>
      {onRemove ? <Button size="sm" variant="ghost" disabled={disabled} aria-label={`Remove ${file.filename}`} onClick={() => onRemove(file.id)}><Trash2 size={14} aria-hidden="true" />Remove</Button> : null}</div>
  </li>)}</ul>;
}

export function GuidanceAttachments({ files, path, disabled, onChange, onBusy, onError }: {
  files: PetrosGuidanceAttachment[]; path: string; disabled: boolean;
  onChange: (files: PetrosGuidanceAttachment[]) => void; onBusy: (busy: boolean) => void; onError: (error: string) => void;
}) {
  const client = usePortalClient();
  const { scope } = useScope();
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function upload(selected: FileList | null) {
    if (!selected?.length) return;
    const incoming = Array.from(selected);
    if (files.length + incoming.length > PETROS_GUIDANCE_MAX_FILES) { onError('Attach up to five files to a learning goal.'); return; }
    if (incoming.some((file) => !file.size || file.size > PETROS_GUIDANCE_MAX_FILE_BYTES)) { onError('Choose non-empty files up to 20 MiB each.'); return; }
    if (incoming.some((file) => !PETROS_GUIDANCE_FILE_ACCEPT.split(',').includes('.' + file.name.split('.').pop()?.toLowerCase()))) {
      onError('Choose a PDF, document, presentation, spreadsheet, text file, or image.'); return;
    }
    onError(''); setUploading(true); onBusy(true);
    const saved = [...files];
    try {
      for (const file of incoming) {
        saved.push(await client.upload<PetrosGuidanceAttachment>(`${path}/files?filename=${encodeURIComponent(file.name)}`, scope, file));
        onChange([...saved]);
      }
    } catch (error) { onError(formatPortalError(error, 'The file could not be attached.')); }
    finally { setUploading(false); onBusy(false); }
  }
  return <div>
    <Label>Supporting files <span className="font-normal text-text-muted">· optional</span></Label>
    <p id="petros-files-help" className="text-xs leading-5 text-text-muted">Attach up to five PDFs, documents, slides, spreadsheets, text files, or images, up to 20 MiB each. Files are shared with the students when you assign this goal.</p>
    <input ref={ref} type="file" multiple accept={PETROS_GUIDANCE_FILE_ACCEPT} className="hidden" aria-label="Attach supporting files" onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} />
    <Button className="mt-3" size="sm" variant="secondary" loading={uploading} disabled={disabled || files.length >= PETROS_GUIDANCE_MAX_FILES} aria-describedby="petros-files-help" onClick={() => ref.current?.click()}><Upload size={14} aria-hidden="true" />{uploading ? 'Preparing files…' : 'Attach files'}</Button>
    <GuidanceFileList files={files} path={path} onRemove={(id) => onChange(files.filter((file) => file.id !== id))} disabled={disabled} onError={onError} />
  </div>;
}
