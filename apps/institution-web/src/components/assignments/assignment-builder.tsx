'use client';
import { useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button, Combobox, Input, Label, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { QuestionDraftList } from '@/components/questions/builder/question-draft-list';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useAssignmentFull, useAssignmentFullMutations } from '@/lib/assignments';
import { formatPortalError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import type { Target } from '@/lib/recipients';
import { useTerm } from '@/lib/term';
import { emptyQuestionDraft, type QuestionDraft } from '@/lib/question-types';

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
];
const DELIVERY_MODES = [
  { value: 'file', label: 'File submission' },
  { value: 'quiz', label: 'Online quiz' },
];

interface AssignmentDraft {
  version?: number;
  title: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  status: string;
  deliveryMode: string;
  dueDate: string;
  durationMin: string;
  maxPoints: number;
  instructions: string;
  audience: Target[];
  questions: QuestionDraft[];
}

type Action =
  | { type: 'hydrate'; draft: AssignmentDraft }
  | { type: 'patch'; patch: Partial<AssignmentDraft> };

function reducer(state: AssignmentDraft, action: Action): AssignmentDraft {
  if (action.type === 'hydrate') return action.draft;
  return { ...state, ...action.patch };
}

function emptyDraft(): AssignmentDraft {
  return {
    title: '',
    classId: '',
    subjectId: '',
    teacherId: '',
    status: 'draft',
    deliveryMode: 'quiz',
    dueDate: '',
    durationMin: '',
    maxPoints: 100,
    instructions: '',
    audience: [],
    questions: [emptyQuestionDraft(1)],
  };
}

function serializeQuestion(q: QuestionDraft) {
  return {
    ...(q.id ? { id: q.id, version: q.version } : {}),
    qtype: q.qtype,
    prompt: q.prompt,
    promptImageObjectId: q.promptImageObjectId ?? null,
    options: q.options,
    correctKey: q.correctKey ?? null,
    markingNote: q.markingNote ?? null,
    marks: q.marks,
    sequence: q.sequence,
    config: q.config ?? null,
  };
}

export function AssignmentBuilder({ assignmentId }: { assignmentId?: string }) {
  const isNew = !assignmentId;
  const router = useRouter();
  const { can } = usePermissions();
  const { t } = useTerm();
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeachingStaffOptions();
  const { data: full, isLoading } = useAssignmentFull(assignmentId ?? null);
  const { create, reconcile } = useAssignmentFullMutations();
  const [draft, dispatch] = useReducer(reducer, undefined, emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(isNew);

  useEffect(() => {
    if (!full || hydrated) return;
    dispatch({
      type: 'hydrate',
      draft: {
        version: full.version,
        title: full.title,
        classId: full.classId,
        subjectId: full.subjectId ?? '',
        teacherId: full.teacherId ?? '',
        status: full.status,
        deliveryMode: full.deliveryMode,
        dueDate: full.dueDate ?? '',
        durationMin: full.durationMin != null ? String(full.durationMin) : '',
        maxPoints: full.maxPoints,
        instructions: full.instructions ?? '',
        audience: (full.audience as Target[]) ?? [],
        questions:
          full.questions.length > 0
            ? full.questions.map((q) => ({
                id: q.id,
                clientKey: q.id,
                version: q.version,
                qtype: q.qtype,
                prompt: q.prompt,
                promptImageObjectId: q.promptImageObjectId,
                options: q.options ?? undefined,
                correctKey: q.correctKey,
                markingNote: q.markingNote,
                marks: q.marks,
                sequence: q.sequence,
                config: q.config ?? null,
              }))
            : [emptyQuestionDraft(1)],
      },
    });
    setHydrated(true);
  }, [full, hydrated]);

  if (!can('assignments.manage') && !can('assignments.view')) {
    return (
      <>
        <Topbar title="Assignment" />
        <p className="p-5 text-sm text-text-muted">You don’t have permission to view assignments.</p>
      </>
    );
  }

  async function save(opts?: { publish?: boolean }) {
    const publish = opts?.publish === true;
    if (!draft.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!draft.classId) {
      setError('Class is required.');
      return;
    }
    if (draft.deliveryMode === 'quiz') {
      for (const q of draft.questions) {
        if (!q.prompt.trim()) {
          setError('Every question needs a prompt.');
          return;
        }
      }
      if (publish && draft.questions.length === 0) {
        setError('Add at least one question before publishing.');
        return;
      }
    }
    setError(null);
    setSaving(true);
    const status = publish ? 'published' : draft.status;
    if (publish) dispatch({ type: 'patch', patch: { status } });
    const audience =
      draft.audience.length > 0
        ? draft.audience
        : [{ kind: 'class' as const, refId: draft.classId }];
    const body = {
      title: draft.title.trim(),
      classId: draft.classId,
      subjectId: draft.subjectId || null,
      teacherId: draft.teacherId || null,
      status,
      deliveryMode: draft.deliveryMode,
      dueDate: draft.dueDate || null,
      durationMin: draft.durationMin ? Number(draft.durationMin) : null,
      maxPoints: draft.maxPoints,
      instructions: draft.instructions || null,
      audience,
      questions: draft.deliveryMode === 'quiz' ? draft.questions.map(serializeQuestion) : [],
    };
    try {
      if (isNew) {
        const row = (await create.mutateAsync(body)) as { id: string };
        if (publish) {
          router.push('/assignments');
        } else {
          router.replace(`/assignments/${row.id}`);
        }
      } else {
        await reconcile.mutateAsync({ id: assignmentId!, body: { ...body, version: draft.version! } });
        if (publish) {
          router.push('/assignments');
        } else {
          setHydrated(false);
        }
      }
    } catch (err) {
      setError(formatPortalError(err));
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && (isLoading || !hydrated)) {
    return (
      <>
        <Topbar title="Edit assignment" />
        <div className="p-5">
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={isNew ? 'New assignment' : 'Edit assignment'}
        actions={
          can('assignments.manage') ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" loading={saving} onClick={() => void save()}>
                Save draft
              </Button>
              {draft.status !== 'published' && (
                <Button size="sm" loading={saving} onClick={() => void save({ publish: true })}>
                  Publish
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div className="page-enter mx-auto flex w-full max-w-4xl flex-col gap-8 p-5">
        <Link
          href="/assignments"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to assignments
        </Link>

        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-text-primary">Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="asg-title">Title</Label>
              <Input
                id="asg-title"
                value={draft.title}
                onChange={(e) => dispatch({ type: 'patch', patch: { title: e.target.value } })}
              />
            </div>
            <div>
              <Label>{t('class')}</Label>
              <Combobox
                value={draft.classId}
                onChange={(v) => dispatch({ type: 'patch', patch: { classId: v } })}
                options={(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
                placeholder={`${t('class')}…`}
              />
            </div>
            <div>
              <Label>{t('subject')}</Label>
              <Combobox
                value={draft.subjectId}
                onChange={(v) => dispatch({ type: 'patch', patch: { subjectId: v } })}
                options={(subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
                placeholder={`${t('subject')}…`}
              />
            </div>
            <div>
              <Label>{t('teacher')}</Label>
              <Combobox
                value={draft.teacherId}
                onChange={(v) => dispatch({ type: 'patch', patch: { teacherId: v } })}
                options={teachingStaffSelectOptions(teachers)}
                placeholder={`${t('teacher')}…`}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Combobox
                value={draft.status}
                onChange={(v) => dispatch({ type: 'patch', patch: { status: v } })}
                options={STATUSES}
              />
            </div>
            <div>
              <Label>Delivery mode</Label>
              <Combobox
                value={draft.deliveryMode}
                onChange={(v) => dispatch({ type: 'patch', patch: { deliveryMode: v } })}
                options={DELIVERY_MODES}
              />
            </div>
            <div>
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={draft.dueDate}
                onChange={(e) => dispatch({ type: 'patch', patch: { dueDate: e.target.value } })}
              />
            </div>
            <div>
              <Label htmlFor="pts">Max points</Label>
              <Input
                id="pts"
                type="number"
                value={draft.maxPoints}
                onChange={(e) =>
                  dispatch({ type: 'patch', patch: { maxPoints: Number(e.target.value) || 100 } })
                }
              />
            </div>
            <div className="col-span-2">
              <Label>Student audience</Label>
              <RecipientPicker
                value={draft.audience}
                onChange={(audience) => dispatch({ type: 'patch', patch: { audience } })}
                studentsOnly
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="instr">Instructions</Label>
              <textarea
                id="instr"
                className="min-h-[64px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                value={draft.instructions}
                onChange={(e) => dispatch({ type: 'patch', patch: { instructions: e.target.value } })}
              />
            </div>
          </div>
        </section>

        {draft.deliveryMode === 'quiz' && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-primary">Questions</h2>
            <QuestionDraftList
              questions={draft.questions}
              uploadPath="/portal/assignments/uploads"
              onChange={(questions) => dispatch({ type: 'patch', patch: { questions } })}
            />
          </section>
        )}

      </div>

      {can('assignments.manage') && (
        <div className="sticky bottom-0 z-10 border-t border-border bg-surface/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl justify-end gap-2">
            <Button variant="secondary" loading={saving} onClick={() => void save()}>
              Save draft
            </Button>
            {draft.status !== 'published' && (
              <Button loading={saving} onClick={() => void save({ publish: true })}>
                Publish
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
