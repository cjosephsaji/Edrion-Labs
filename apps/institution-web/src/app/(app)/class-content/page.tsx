'use client';
import { useRef, useState } from 'react';
import { Button, Input, Label, Select } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { useClassOptions } from '@/lib/academics';
import {
  useClassMaterials,
  useMaterialMutations,
  useStreamMutations,
  useStreamPosts,
  useUploadClassMaterial,
} from '@/lib/course-content';
import { useTerm } from '@/lib/term';

const STREAM_KINDS = [
  { value: 'covered', label: 'Covered topic' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'pinned_next', label: 'Pinned next' },
];

export default function ClassContentPage() {
  const { t } = useTerm();
  const { data: classes } = useClassOptions();
  const [classId, setClassId] = useState('');
  const { data: stream } = useStreamPosts('class', classId || undefined);
  const { data: materials } = useClassMaterials('class', classId || undefined);
  const createStream = useStreamMutations();
  const createMaterial = useMaterialMutations();
  const uploadMaterial = useUploadClassMaterial();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [streamKind, setStreamKind] = useState('covered');
  const [streamTitle, setStreamTitle] = useState('');
  const [streamBody, setStreamBody] = useState('');
  const [materialTitle, setMaterialTitle] = useState('');
  const [objectId, setObjectId] = useState('');
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const selectedClass = (classes?.items ?? []).find((c) => c.id === classId);

  async function postStream() {
    if (!classId || !streamTitle.trim()) return;
    await createStream.mutateAsync({
      contextType: 'class',
      contextId: classId,
      kind: streamKind,
      title: streamTitle.trim(),
      body: streamBody.trim() || undefined,
    });
    setStreamTitle('');
    setStreamBody('');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      const result = await uploadMaterial.mutateAsync(file);
      setObjectId(result.id);
      setUploadName(result.filename);
      if (!materialTitle.trim()) setMaterialTitle(file.name.replace(/\.[^.]+$/, ''));
    } catch {
      setUploadError('Upload failed. Try again or use a smaller file.');
    } finally {
      e.target.value = '';
    }
  }

  async function postMaterial() {
    if (!classId || !materialTitle.trim() || !objectId.trim()) return;
    await createMaterial.mutateAsync({
      contextType: 'class',
      contextId: classId,
      title: materialTitle.trim(),
      objectId: objectId.trim(),
      kindLabel: 'PDF',
    });
    setMaterialTitle('');
    setObjectId('');
    setUploadName(null);
  }

  return (
    <>
      <Topbar title="Class content" />
      <div className="page-enter flex flex-1 flex-col gap-6 p-5">
        <div className="max-w-xl">
          <Label>{t('class')}</Label>
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="mt-1"
            options={[
              { value: '', label: 'Select a class…' },
              ...(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>

        {!classId ? (
          <p className="text-sm text-text-muted">Choose a class to manage stream posts and materials.</p>
        ) : (
          <>
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">Stream — {selectedClass?.name}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Kind</Label>
                  <Select
                    value={streamKind}
                    onChange={(e) => setStreamKind(e.target.value)}
                    className="mt-1"
                    options={STREAM_KINDS}
                  />
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={streamTitle} onChange={(e) => setStreamTitle(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-xs">Body</Label>
                <Input value={streamBody} onChange={(e) => setStreamBody(e.target.value)} className="mt-1" />
              </div>
              <Button className="mt-3" size="sm" onClick={() => void postStream()} disabled={createStream.isPending}>
                Post to stream
              </Button>
              <ul className="mt-4 space-y-2 text-sm">
                {(stream?.items ?? []).map((p) => (
                  <li key={p.id} className="rounded-md bg-background-secondary/50 px-3 py-2">
                    <span className="text-xs font-semibold uppercase text-text-muted">{p.kind}</span>
                    <p className="font-medium">{p.title ?? '—'}</p>
                    {p.body && <p className="text-text-secondary">{p.body}</p>}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-text-primary">Materials</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">File</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,image/*"
                    className="hidden"
                    onChange={(e) => void handleFileChange(e)}
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadMaterial.isPending}
                    >
                      {uploadMaterial.isPending ? 'Uploading…' : 'Choose file'}
                    </Button>
                    {uploadName && (
                      <span className="text-xs text-text-muted truncate max-w-[12rem]">{uploadName}</span>
                    )}
                  </div>
                  {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
                </div>
              </div>
              <Button
                className="mt-3"
                size="sm"
                onClick={() => void postMaterial()}
                disabled={createMaterial.isPending || !objectId}
              >
                Add material
              </Button>
              <ul className="mt-4 space-y-2 text-sm">
                {(materials?.items ?? []).map((m) => (
                  <li key={m.id} className="rounded-md bg-background-secondary/50 px-3 py-2">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-text-muted">{m.kindLabel}{m.weekNo ? ` · Week ${m.weekNo}` : ''}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
