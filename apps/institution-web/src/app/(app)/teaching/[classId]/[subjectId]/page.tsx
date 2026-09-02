'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Paperclip, Trash2, Upload } from 'lucide-react';
import { Badge, Button, EmptyState, Input, Label, Skeleton, Tabs, useToast, type TabItem } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { NoteEditor } from '@/components/teaching/note-editor';
import {
  useClassMaterials,
  useClassNotes,
  useDeleteMaterial,
  useNoteMutations,
  useStreamMutations,
  useStreamPosts,
  type ClassNoteRow,
} from '@/lib/course-content';
import { useAssignment, usePublishMaterial } from '@/lib/teaching';
import { formatPortalError } from '@/lib/portal-client';

const TEXTAREA =
  'w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary shadow-xs ' +
  'placeholder:text-text-muted focus-visible:bg-surface focus-visible:outline-none focus-visible:border-primary ' +
  'focus-visible:ring-2 focus-visible:ring-ring/25';

const OPTIONAL = <span className="font-normal text-text-muted"> · optional</span>;

interface Draft {
  id: string | null;
  version: number;
  title: string;
  summary: string;
  body: string;
}
const BLANK: Draft = { id: null, version: 0, title: '', summary: '', body: '' };

/** A subject's content can sit against the class or against the course that teaches it. */
interface TabProps {
  classId: string;
  subjectId: string;
  contextIds?: string[];
}

export default function TeachingWorkspacePage() {
  const params = useParams<{ classId: string; subjectId: string }>();
  const { classId, subjectId } = params;
  const { data: assignment, isLoading } = useAssignment(classId, subjectId);

  const contextIds = assignment?.contextIds;
  const tabs: TabItem[] = useMemo(
    () => [
      {
        key: 'notes',
        label: 'Notes',
        content: <NotesTab classId={classId} subjectId={subjectId} contextIds={contextIds} />,
      },
      {
        key: 'files',
        label: 'Files',
        content: <FilesTab classId={classId} subjectId={subjectId} contextIds={contextIds} />,
      },
      {
        key: 'updates',
        label: 'Class updates',
        content: <UpdatesTab classId={classId} subjectId={subjectId} contextIds={contextIds} />,
      },
    ],
    [classId, subjectId, contextIds],
  );

  return (
    <>
      <Topbar title={assignment ? assignment.subjectName : 'Teaching'} />
      <div className="page-enter flex flex-1 flex-col gap-5 p-5">
        <div>
          <Link
            href="/teaching"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-primary"
          >
            <ArrowLeft aria-hidden="true" size={13} /> All subjects
          </Link>

          {isLoading ? (
            <Skeleton className="mt-2 h-12 w-80 rounded-md" />
          ) : assignment ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold text-text-primary">
                {assignment.subjectCode ? (
                  <span className="font-mono text-sm text-text-muted">{assignment.subjectCode} </span>
                ) : null}
                {assignment.subjectName}
              </h1>
              <p className="text-sm text-text-secondary">
                {assignment.className} · {assignment.studentCount}{' '}
                {assignment.studentCount === 1 ? 'student' : 'students'}
              </p>
              {!assignment.isMine && assignment.teacherName && (
                <Badge tone="warning">Posting as {assignment.teacherName}</Badge>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-danger">
              That subject is not taught to that class, or it is not yours to publish to.
            </p>
          )}
        </div>

        {assignment && <Tabs items={tabs} defaultKey="notes" />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ notes */

function NotesTab({ classId, subjectId, contextIds }: TabProps) {
  const { data } = useClassNotes('class', classId, subjectId, contextIds);
  const { create, update, setStatus } = useNoteMutations();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);

  const notes = data?.items ?? [];
  const editing = draft.id !== null;
  const saving = create.isPending || update.isPending;

  async function save(publish: boolean) {
    if (!draft.title.trim()) return setError('Give the note a title.');
    if (!draft.body.trim()) return setError('Write the note before saving it.');
    setError(null);
    const payload = {
      title: draft.title.trim(),
      summary: draft.summary.trim() || null,
      body: draft.body.trim(),
    };
    try {
      const saved = draft.id
        ? await update.mutateAsync({ id: draft.id, version: draft.version, ...payload })
        : await create.mutateAsync({ contextType: 'class', contextId: classId, subjectId, ...payload });
      const row = saved as ClassNoteRow;
      if (publish && row.status !== 'published') {
        await setStatus.mutateAsync({ id: row.id, version: row.version, status: 'published' });
      }
      toast.say(publish ? 'Published to the class' : 'Draft saved');
      setDraft(BLANK);
    } catch {
      setError('That did not save. Check the fields and try again.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary">
          {editing ? 'Edit note' : 'Write a note'}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Students read this as text in their portal. Drafts stay private until you publish.
        </p>

        <div className="mt-3">
          <Label className="text-xs">Title</Label>
          <Input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="Module 2 — virtualisation and hypervisors"
            className="mt-1"
          />
        </div>

        <div className="mt-3">
          <Label className="text-xs">One-line summary{OPTIONAL}</Label>
          <Input
            value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            placeholder="Shown under the title in the student's list"
            className="mt-1"
          />
        </div>

        <div className="mt-3">
          <Label className="text-xs">Note</Label>
          <NoteEditor
            value={draft.body}
            onChange={(body) => setDraft({ ...draft, body })}
          />
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Publish to class'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void save(false)} disabled={saving}>
            Save as draft
          </Button>
          {editing && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(BLANK)} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      </section>

      {notes.length === 0 ? (
        <EmptyState
          title="No notes for this subject yet"
          description="Write one above. It reaches this class the moment you publish it."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{n.title}</p>
                  <p className="text-xs text-text-muted">
                    {n.status === 'published' && n.publishedAt
                      ? `Published ${new Date(n.publishedAt).toLocaleDateString()}`
                      : 'Not published — only you can see this'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!n.subjectId && <Badge tone="neutral">Not filed under a subject</Badge>}
                  <Badge tone={n.status === 'published' ? 'success' : 'warning'}>{n.status}</Badge>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setDraft({
                        id: n.id,
                        version: n.version,
                        title: n.title,
                        summary: n.summary ?? '',
                        body: n.body,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={n.status === 'published' ? 'secondary' : 'primary'}
                    onClick={() =>
                      void setStatus.mutateAsync({
                        id: n.id,
                        version: n.version,
                        status: n.status === 'published' ? 'draft' : 'published',
                      })
                    }
                    disabled={setStatus.isPending}
                  >
                    {n.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                </div>
              </div>
              {n.summary && <p className="mt-1 text-sm text-text-secondary">{n.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ files */

function FilesTab({ classId, subjectId, contextIds }: TabProps) {
  const { data } = useClassMaterials('class', classId, subjectId, contextIds);
  const publish = usePublishMaterial(classId, subjectId);
  const remove = useDeleteMaterial();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const files = data?.items ?? [];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const saved = await publish.mutateAsync({ file, title });
      setTitle('');
      toast.say(`“${(saved as { title: string }).title}” is now available to the class`);
    } catch (caught) {
      setError(formatPortalError(caught, 'That file did not upload. Try again, or use a smaller file.'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary">Share a file</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Choosing a file publishes it to this class straight away. PDF, Word, slides, or images, up to 50 MB.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <Label className="text-xs">Title{OPTIONAL}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the file name"
              className="mt-1"
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,image/*"
            className="hidden"
            onChange={(e) => void onFile(e)}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={publish.isPending}>
            <Upload aria-hidden="true" size={14} />
            {publish.isPending ? 'Publishing…' : 'Choose file and publish'}
          </Button>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </section>

      {files.length === 0 ? (
        <EmptyState
          title="No files for this subject yet"
          description="Anything you share here appears under this subject in the student portal."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Paperclip aria-hidden="true" size={15} className="shrink-0 text-text-muted" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{m.title}</p>
                  <p className="text-xs text-text-muted">
                    {m.kindLabel} · shared {new Date(m.createdAt).toLocaleDateString()}
                    {!m.subjectId && ' · not filed under a subject'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void remove.mutateAsync({ id: m.id, version: m.version })}
                disabled={remove.isPending}
                aria-label={`Remove ${m.title}`}
              >
                <Trash2 aria-hidden="true" size={14} />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- updates */

function UpdatesTab({ classId, subjectId, contextIds }: TabProps) {
  const { data } = useStreamPosts('class', classId, subjectId, contextIds);
  const post = useStreamMutations();
  const toast = useToast();
  const [body, setBody] = useState('');
  const posts = data?.items ?? [];

  async function send() {
    if (!body.trim()) return;
    await post.mutateAsync({
      contextType: 'class',
      contextId: classId,
      subjectId,
      kind: 'covered',
      title: body.trim().slice(0, 120),
      body: body.trim(),
    });
    setBody('');
    toast.say('Posted to the class');
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary">Post an update</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          A short dated line for this class — what you covered today, or what to prepare next. For anything
          longer, write a note instead.
        </p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Covered quorum and failover. Read section 4.2 before Thursday."
          className={`mt-3 ${TEXTAREA}`}
        />
        <Button className="mt-3" size="sm" onClick={() => void send()} disabled={post.isPending || !body.trim()}>
          {post.isPending ? 'Posting…' : 'Post update'}
        </Button>
      </section>

      {posts.length === 0 ? (
        <EmptyState
          title="No updates yet"
          description="Updates are optional. Use them to keep a running record of what the class covered."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="text-xs text-text-muted">{new Date(p.postedAt).toLocaleDateString()}</p>
              <p className="mt-0.5 text-sm text-text-primary">{p.body ?? p.title}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
