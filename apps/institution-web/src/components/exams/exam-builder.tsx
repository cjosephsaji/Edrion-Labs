'use client';
import { useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button, Combobox, Input, Label, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { QuestionDraftList } from '@/components/questions/builder/question-draft-list';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { useAcademicYearOptions, useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useExamFull, useExamFullMutations } from '@/lib/exams';
import { formatPortalError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import type { Target } from '@/lib/recipients';
import { useTerm } from '@/lib/term';
import {
  emptyQuestionDraft,
  newClientKey,
  type QuestionDraft,
} from '@/lib/question-types';

const EXAM_TYPES = [
  { value: 'term', label: 'Term' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
  { value: 'unit_test', label: 'Unit test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'practical', label: 'Practical' },
  { value: 'mock', label: 'Mock' },
];
const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface ScheduleDraft {
  id?: string;
  clientKey: string;
  version?: number;
  classId: string;
  subjectId: string;
  examDate: string;
  startTime: string;
  endTime: string;
  maxMarks: number;
  passMarks: string;
  room: string;
  questions: QuestionDraft[];
}

interface ExamDraft {
  version?: number;
  name: string;
  examType: string;
  status: string;
  academicYearId: string;
  termId: string;
  termLabel: string;
  startDate: string;
  endDate: string;
  durationMin: string;
  description: string;
  audience: Target[];
  schedules: ScheduleDraft[];
}

type Action =
  | { type: 'hydrate'; draft: ExamDraft }
  | { type: 'patch'; patch: Partial<ExamDraft> }
  | { type: 'setSchedules'; schedules: ScheduleDraft[] }
  | { type: 'patchSchedule'; clientKey: string; patch: Partial<ScheduleDraft> };

function reducer(state: ExamDraft, action: Action): ExamDraft {
  switch (action.type) {
    case 'hydrate':
      return action.draft;
    case 'patch':
      return { ...state, ...action.patch };
    case 'setSchedules':
      return { ...state, schedules: action.schedules };
    case 'patchSchedule':
      return {
        ...state,
        schedules: state.schedules.map((s) =>
          s.clientKey === action.clientKey ? { ...s, ...action.patch } : s,
        ),
      };
    default:
      return state;
  }
}

function emptySchedule(): ScheduleDraft {
  return {
    clientKey: newClientKey(),
    classId: '',
    subjectId: '',
    examDate: '',
    startTime: '',
    endTime: '',
    maxMarks: 100,
    passMarks: '',
    room: '',
    questions: [emptyQuestionDraft(1)],
  };
}

function emptyExam(): ExamDraft {
  return {
    name: '',
    examType: 'term',
    status: 'draft',
    academicYearId: '',
    termId: '',
    termLabel: '',
    startDate: '',
    endDate: '',
    durationMin: '',
    description: '',
    audience: [],
    schedules: [emptySchedule()],
  };
}

/** Class ids implied by the student audience (section pickers live in the audience control). */
function audienceClassIds(audience: Target[]): string[] {
  const ids: string[] = [];
  for (const t of audience) {
    if (t.kind === 'students_of_class' && t.refId && !ids.includes(t.refId)) ids.push(t.refId);
  }
  return ids;
}

function resolvePaperClassId(schedule: ScheduleDraft, audience: Target[]): string {
  const fromAudience = audienceClassIds(audience);
  if (fromAudience.length > 0) {
    if (schedule.classId && fromAudience.includes(schedule.classId)) return schedule.classId;
    return fromAudience[0]!;
  }
  return schedule.classId;
}

function serializeQuestion(q: QuestionDraft) {
  return {
    ...(q.id ? { id: q.id } : {}),
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

export function ExamBuilder({ examId }: { examId?: string }) {
  const isNew = !examId;
  const router = useRouter();
  const { can } = usePermissions();
  const { t } = useTerm();
  const facets = useProgrammeFacetFilters();
  const { data: years } = useAcademicYearOptions();
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: full, isLoading } = useExamFull(examId ?? null);
  const { create, reconcile } = useExamFullMutations();
  const [draft, dispatch] = useReducer(reducer, undefined, emptyExam);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(isNew);

  useEffect(() => {
    if (!full || hydrated) return;
    dispatch({
      type: 'hydrate',
      draft: {
        version: full.version,
        name: full.name,
        examType: full.examType,
        status: full.status,
        academicYearId: full.academicYearId ?? '',
        termId: full.termId ?? '',
        termLabel: full.termLabel ?? '',
        startDate: full.startDate ?? '',
        endDate: full.endDate ?? '',
        durationMin: full.durationMin != null ? String(full.durationMin) : '',
        description: full.description ?? '',
        audience: (full.audience as Target[]) ?? [],
        schedules:
          full.schedules.length > 0
            ? full.schedules.map((s) => ({
                id: s.id,
                clientKey: s.id,
                version: s.version,
                classId: s.classId,
                subjectId: s.subjectId,
                examDate: s.examDate ?? '',
                startTime: s.startTime ?? '',
                endTime: s.endTime ?? '',
                maxMarks: s.maxMarks,
                passMarks: s.passMarks != null ? String(s.passMarks) : '',
                room: s.room ?? '',
                questions:
                  s.questions.length > 0
                    ? s.questions.map((q) => ({
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
              }))
            : [emptySchedule()],
      },
    });
    setHydrated(true);
  }, [full, hydrated]);

  if (!can('exams.manage') && !can('exams.view')) {
    return (
      <>
        <Topbar title="Exam" />
        <p className="p-5 text-sm text-text-muted">You don’t have permission to view exams.</p>
      </>
    );
  }

  async function save(opts?: { publish?: boolean }) {
    const publish = opts?.publish === true;
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    if (publish && draft.schedules.length === 0) {
      setError('Add at least one paper before publishing.');
      return;
    }
    for (const s of draft.schedules) {
      const classId = resolvePaperClassId(s, draft.audience);
      if (!classId || !s.subjectId) {
        setError(
          audienceClassIds(draft.audience).length > 0
            ? 'Each paper needs a subject.'
            : `Each paper needs a ${t('class').toLowerCase()} and subject.`,
        );
        return;
      }
      for (const q of s.questions) {
        if (!q.prompt.trim()) {
          setError('Every question needs a prompt.');
          return;
        }
      }
      if (publish && s.questions.length === 0) {
        setError('Each paper needs at least one question before publishing.');
        return;
      }
    }
    setError(null);
    setSaving(true);
    const status = publish ? 'published' : draft.status;
    if (publish) dispatch({ type: 'patch', patch: { status } });
    const body = {
      name: draft.name.trim(),
      examType: draft.examType,
      status,
      academicYearId: draft.academicYearId || null,
      termId: draft.termId || null,
      termLabel: draft.termLabel || null,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
      durationMin: draft.durationMin ? Number(draft.durationMin) : null,
      description: draft.description || null,
      audience: draft.audience,
      schedules: draft.schedules.map((s) => ({
        ...(s.id ? { id: s.id, version: s.version } : {}),
        classId: resolvePaperClassId(s, draft.audience),
        subjectId: s.subjectId,
        examDate: s.examDate || null,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        maxMarks: s.maxMarks,
        passMarks: s.passMarks ? Number(s.passMarks) : null,
        room: s.room || null,
        questions: s.questions.map(serializeQuestion),
      })),
    };
    try {
      if (isNew) {
        const row = (await create.mutateAsync(body)) as { id: string };
        if (publish) {
          router.push('/exams');
        } else {
          router.replace(`/exams/${row.id}`);
        }
      } else {
        await reconcile.mutateAsync({ id: examId!, body: { ...body, version: draft.version! } });
        if (publish) {
          router.push('/exams');
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
        <Topbar title="Edit exam" />
        <div className="p-5">
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={isNew ? 'New exam' : 'Edit exam'}
        actions={
          can('exams.manage') ? (
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
        <Link href="/exams" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to exams
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
              <Label htmlFor="exam-name">Name</Label>
              <Input
                id="exam-name"
                value={draft.name}
                onChange={(e) => dispatch({ type: 'patch', patch: { name: e.target.value } })}
                placeholder="e.g. Term 1 Finals"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Combobox
                value={draft.examType}
                onChange={(v) => dispatch({ type: 'patch', patch: { examType: v } })}
                options={EXAM_TYPES}
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
            {facets.showFacets ? (
              <div>
                <Label>{t('term')}</Label>
                <Combobox
                  value={draft.termId}
                  onChange={(v) => dispatch({ type: 'patch', patch: { termId: v } })}
                  options={facets.termOptions}
                  placeholder={`${t('term')}…`}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="term-label">{t('term')}</Label>
                <Input
                  id="term-label"
                  value={draft.termLabel}
                  onChange={(e) => dispatch({ type: 'patch', patch: { termLabel: e.target.value } })}
                />
              </div>
            )}
            <div>
              <Label>{t('academicYear')}</Label>
              <Combobox
                value={draft.academicYearId}
                onChange={(v) => dispatch({ type: 'patch', patch: { academicYearId: v } })}
                options={(years?.items ?? []).map((y) => ({ value: y.id, label: y.name }))}
                placeholder={`${t('academicYear')}…`}
              />
            </div>
            <div>
              <Label htmlFor="start">Start date</Label>
              <Input
                id="start"
                type="date"
                value={draft.startDate}
                onChange={(e) => dispatch({ type: 'patch', patch: { startDate: e.target.value } })}
              />
            </div>
            <div>
              <Label htmlFor="end">End date</Label>
              <Input
                id="end"
                type="date"
                value={draft.endDate}
                onChange={(e) => dispatch({ type: 'patch', patch: { endDate: e.target.value } })}
              />
            </div>
            <div>
              <Label htmlFor="dur">Duration (minutes)</Label>
              <Input
                id="dur"
                type="number"
                min={1}
                value={draft.durationMin}
                onChange={(e) => dispatch({ type: 'patch', patch: { durationMin: e.target.value } })}
              />
            </div>
            <div className="col-span-2">
              <Label>Student audience</Label>
              <RecipientPicker
                value={draft.audience}
                onChange={(audience) => {
                  const classIds = audienceClassIds(audience);
                  const schedules =
                    classIds.length === 0
                      ? draft.schedules
                      : draft.schedules.map((s, i) => ({
                          ...s,
                          classId: classIds[Math.min(i, classIds.length - 1)]!,
                        }));
                  dispatch({ type: 'hydrate', draft: { ...draft, audience, schedules } });
                }}
                studentsOnly
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="desc">Description</Label>
              <textarea
                id="desc"
                className="min-h-[64px] w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong"
                value={draft.description}
                onChange={(e) => dispatch({ type: 'patch', patch: { description: e.target.value } })}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Papers</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                dispatch({ type: 'setSchedules', schedules: [...draft.schedules, emptySchedule()] })
              }
            >
              Add paper
            </Button>
          </div>

          {draft.schedules.map((s, sIdx) => (
            <div key={s.clientKey} className="flex flex-col gap-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-text-primary">Paper {sIdx + 1}</h3>
                {draft.schedules.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      dispatch({
                        type: 'setSchedules',
                        schedules: draft.schedules.filter((x) => x.clientKey !== s.clientKey),
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {audienceClassIds(draft.audience).length === 0 && (
                  <div>
                    <Label>{t('class')}</Label>
                    <Combobox
                      value={s.classId}
                      onChange={(v) =>
                        dispatch({ type: 'patchSchedule', clientKey: s.clientKey, patch: { classId: v } })
                      }
                      options={(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
                      placeholder={`${t('class')}…`}
                    />
                  </div>
                )}
                <div>
                  <Label>{t('subject')}</Label>
                  <Combobox
                    value={s.subjectId}
                    onChange={(v) =>
                      dispatch({ type: 'patchSchedule', clientKey: s.clientKey, patch: { subjectId: v } })
                    }
                    options={(subjects?.items ?? []).map((sub) => ({ value: sub.id, label: sub.name }))}
                    placeholder={`${t('subject')}…`}
                  />
                </div>
                <div>
                  <Label htmlFor={`date-${s.clientKey}`}>Date</Label>
                  <Input
                    id={`date-${s.clientKey}`}
                    type="date"
                    value={s.examDate}
                    onChange={(e) =>
                      dispatch({
                        type: 'patchSchedule',
                        clientKey: s.clientKey,
                        patch: { examDate: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`room-${s.clientKey}`}>Room</Label>
                  <Input
                    id={`room-${s.clientKey}`}
                    value={s.room}
                    onChange={(e) =>
                      dispatch({ type: 'patchSchedule', clientKey: s.clientKey, patch: { room: e.target.value } })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`max-${s.clientKey}`}>Max marks</Label>
                  <Input
                    id={`max-${s.clientKey}`}
                    type="number"
                    value={s.maxMarks}
                    onChange={(e) =>
                      dispatch({
                        type: 'patchSchedule',
                        clientKey: s.clientKey,
                        patch: { maxMarks: Number(e.target.value) || 100 },
                      })
                    }
                  />
                </div>
              </div>

              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Questions</h4>
              <QuestionDraftList
                questions={s.questions}
                uploadPath="/portal/exams/uploads"
                onChange={(questions) =>
                  dispatch({ type: 'patchSchedule', clientKey: s.clientKey, patch: { questions } })
                }
              />
            </div>
          ))}
        </section>

      </div>

      {can('exams.manage') && (
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
