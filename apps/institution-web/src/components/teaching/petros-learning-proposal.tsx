'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  FileText,
  MoreHorizontal,
} from 'lucide-react';
import { Button, Drawer, Input, Label } from '@edrion/ui';
import type { ContentUnit, M3Proposal } from '@edrion/schemas';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type { TeachingAssignment } from '@/lib/teaching';
import {
  ActivityPresentation,
  activityTitle,
  reviewRequirement,
  reviewStatus,
  sourceLocation,
  NativeSourceTable,
} from './petros-lesson-presentation';
import styles from './petros-learn.module.css';

type PrivateReviewView = {
  family: { id: string; version: number };
  origin: string;
  classification: string;
  panels: Array<{ label: string; content: string }>;
};
export type ProposalView = {
  manifest?: {
    id: string;
    proposalVersion: number;
    recordedAt: string;
    mode: string;
    studentPublication: string;
    currentChecksRequired: boolean;
  } | null;
  instrumentFamilies?: Array<{
    id: string;
    version: number;
    status: string;
    receiptId?: string;
  }>;
  proposal: M3Proposal;
  review: Record<string, { status: string; receiptId?: string }>;
  reviewEligibility: {
    items: Array<{
      id: string;
      version: number;
      subjectKey: string;
      status: string;
    }>;
    reason: string;
  };
  readiness: {
    eligible: boolean;
    blockers: string[];
    verification: string;
    studentPublication: string;
    studentPublicationBlockers: string[];
  };
};
type Source = {
  revisionId: string;
  title: string;
  format: string;
  semantics: string;
  extraction: string;
  proposalId: string | null;
  originalHash: string;
  coverage: { status: string };
};
type Evidence = {
  id: string;
  kind: string;
  text: string;
  locator: unknown;
  contentHash: string;
  uncertainties: string[];
  rendering: string;
  payload?: ContentUnit['payload'];
};
type Detail =
  | 'source'
  | 'review'
  | 'concepts'
  | 'claims'
  | 'history'
  | 'conflict'
  | 'sample'
  | 'activity'
  | null;
const steps = [
  'Choose material',
  'Review lesson',
  'Preview activities',
  'Save & submit',
];
const dimensions = {
  teaching_scope: 'Teaching material',
  concepts: 'Concepts',
  activities: 'Activities',
  assessment_instrument: 'Assessment verification',
};
function initialStep() {
  if (typeof window === 'undefined') return 0;
  const key = window.location.hash.split('-').at(-1);
  return (
    (
      { material: 0, review: 1, preview: 2, submit: 3 } as Record<
        string,
        number
      >
    )[key ?? ''] ?? 0
  );
}
export function lessonError(error: unknown): string {
  const e = error as { status?: number; code?: string; message?: string };
  const text = `${e.code ?? ''} ${e.message ?? ''}`;
  if (/QUALIF|INDEPENDENT|SELF_REVIEW/.test(text))
    return "You don't have permission to complete this action. A current, independent qualified reviewer with access to this material is required.";
  if (e.status === 403 || /FORBIDDEN|PERMISSION/.test(text))
    return "You don't have permission to complete this action. Ask an academic administrator to check your access to the teaching material and the required permissions.";
  if (
    e.status === 404 ||
    /M3_(SOURCE|PROPOSAL|EVIDENCE|TEACHING_CONTEXT)_UNAVAILABLE|WITHDRAWN/.test(
      text,
    )
  )
    return 'This lesson or its material is no longer available to you. Check access or choose another document.';
  if (e.status === 503 || /ISOLATED|GENUINE|PROVIDER/.test(text))
    return "Automatic lesson generation isn't available in this environment. You can continue an existing sample lesson or prepare a document outline.";
  if (
    e.status === 422 ||
    /SUPPORT|CITATION|NUMERIC|SOURCE_CONTRADICTION|PRIVATE_FRAGMENT/.test(text)
  )
    return 'These changes could not be supported by the teaching material. Check your wording against the source and try again. Your changes are still here.';
  if (/RELEASE|BLOCKED/.test(text))
    return 'This lesson cannot be made available yet. Open review details to see the approvals and source checks needed.';
  return 'That action could not be completed. Your changes are still here. Check your connection and try again.';
}
export function lessonPrimaryStatus(view: ProposalView | null): string {
  if (!view) return '';
  const p = view.proposal;
  if (p.state === 'withdrawn') return 'Lesson withdrawn';
  const requestsChanges =
    p.state === 'revision_requested' ||
    Object.values(view.review).some((r) =>
      ['revision_requested', 'rejected'].includes(r.status),
    );
  if (requestsChanges) return 'Changes requested';
  if (view.review.teaching_scope?.status === 'approved')
    return 'Teaching approved';
  if (p.state === 'under_review') return 'Submitted for review';
  if (
    ['needs_source_review', 'blocked', 'superseded'].includes(p.state) ||
    p.objectives.some((o) => {
      const activity = p.activities.find((a) => a.id === o.selectedActivityId);
      return (
        !activity ||
        activity.reviewStatus === 'rejected' ||
        activity.capabilityStatus === 'unsupported_execution'
      );
    })
  )
    return 'Needs your attention';
  return 'Draft saved';
}
export function PetrosLearningProposal({
  assignment,
  mode = 'lessons',
  onReviewAccess,
}: {
  assignment: TeachingAssignment;
  mode?: 'lessons' | 'reviews';
  onReviewAccess?: (available: boolean) => void;
}) {
  const client = usePortalClient(),
    { scope } = useScope();
  const path = `/portal/teaching/${assignment.classId}/${assignment.subjectId}/proposals`;
  const [sources, setSources] = useState<Source[]>([]),
    [loading, setLoading] = useState(true),
    [sourceAttempt, setSourceAttempt] = useState(0);
  const [sourceId, setSourceId] = useState(''),
    [focus, setFocus] = useState(''),
    [duration, setDuration] = useState(20);
  const [view, setView] = useState<ProposalView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [step, setStep] = useState(0),
    [detail, setDetail] = useState<Detail>(null),
    [evidence, setEvidence] = useState<Evidence | null>(null),
    [previewEvidence, setPreviewEvidence] = useState<Evidence | null>(null);
  const [editing, setEditing] = useState<string | null>(null),
    [wording, setWording] = useState(''),
    [claimEdit, setClaimEdit] = useState<string | null>(null);
  const [activityIndex, setActivityIndex] = useState(0),
    [conflict, setConflict] = useState(false),
    [latest, setLatest] = useState<ProposalView | null>(null);
  const [qualification, setQualification] = useState(''),
    [reason, setReason] = useState('');
  const [familyId, setFamilyId] = useState(''),
    [privateView, setPrivateView] = useState<PrivateReviewView | null>(null);
  const [distinct, setDistinct] = useState(false),
    [privateEditing, setPrivateEditing] = useState(false),
    [privateText, setPrivateText] = useState('');
  const [release, setRelease] = useState<string | null>(null),
    [history, setHistory] = useState<ProposalView | null>(null);
  const sourceReturn = useRef<{
    trigger: HTMLElement | null;
    main: HTMLElement | null;
    scrollTop: number;
  } | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null),
    noticeRef = useRef<HTMLDivElement>(null),
    headingRef = useRef<HTMLHeadingElement>(null);
  const epoch = useRef(0),
    privateEpoch = useRef(0),
    busyRef = useRef(false),
    prepareId = useRef<string | null>(null);
  const p = view?.proposal,
    selected = sources.find((s) => s.revisionId === sourceId);
  const currentQualification =
    view?.reviewEligibility?.items.find((q) => q.id === qualification) ??
    view?.reviewEligibility?.items[0];
  const canReview = Boolean(currentQualification),
    localEdit = Boolean(editing || claimEdit || privateEditing);
  const objective =
    p?.objectives[Math.min(activityIndex, p.objectives.length - 1)];
  const activity = p?.activities.find(
    (a) => a.id === objective?.selectedActivityId,
  );
  const chosenFamily =
    p?.taskCandidates.find(
      (t) => t.id === familyId && t.kind !== 'formative_practice',
    ) ??
    p?.taskCandidates.find(
      (t) =>
        t.kind !== 'formative_practice' &&
        view?.instrumentFamilies?.some((i) => i.id === t.id && i.version > 0),
    ) ??
    p?.taskCandidates.find((t) => t.kind !== 'formative_practice');
  const qualificationPins = view?.reviewEligibility?.items
    .map((q) => `${q.id}:${q.version}`)
    .join(',');

  useEffect(() => {
    let active = true;
    epoch.current++;
    busyRef.current = false;
    setBusy(false);
    setLoading(true);
    setView(null);
    setError('');
    setSourceId('');
    client
      .get<{ items: Source[] }>(`${path}/sources`, scope)
      .then(async (r) => {
        if (!active) return;
        setSources(r.items);
        if (
          initialStep() > 0 ||
          mode === 'reviews' ||
          window.location.hash === '#petros-reviews'
        ) {
          const existing = r.items.find((s) => s.proposalId);
          if (existing?.proposalId) {
            setSourceId(existing.revisionId);
            const saved = await client.get<ProposalView>(
              `${path}/${existing.proposalId}`,
              scope,
            );
            if (active) {
              const requested = Number(
                new URLSearchParams(window.location.search).get('objective'),
              );
              setActivityIndex(
                Number.isInteger(requested) &&
                  requested >= 1 &&
                  requested <= saved.proposal.objectives.length
                  ? requested - 1
                  : 0,
              );
              setView(saved);
              setStep(initialStep());
            }
          } else if (active) setStep(0);
        }
      })
      .catch((e) => {
        if (active) setError(lessonError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      epoch.current++;
    };
  }, [client, path, scope, sourceAttempt]);
  useEffect(() => {
    onReviewAccess?.(canReview);
  }, [canReview, onReviewAccess]);
  useEffect(() => {
    if ((editing && !detail) || (claimEdit && detail === 'claims'))
      editRef.current?.focus();
  }, [editing, claimEdit, detail]);
  useEffect(() => {
    privateEpoch.current++;
    setPrivateView(null);
    setDistinct(false);
    setPrivateEditing(false);
    setPrivateText('');
  }, [path, scope, p?.id, p?.version, sourceId, qualificationPins, mode]);
  useEffect(() => {
    if (!localEdit) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [localEdit]);
  useEffect(() => {
    if (step !== 2 || !p || !activity || mode !== 'lessons') {
      setPreviewEvidence(null);
      return;
    }
    let active = true;
    setPreviewEvidence(null);
    client
      .get<Evidence>(
        `${path}/${p.id}/evidence/${activity.support[0]!.reference.unitId}`,
        scope,
      )
      .then((result) => {
        if (active) setPreviewEvidence(result);
      })
      .catch(() => {
        /* The validated public quotation remains the honest fallback. */
      });
    return () => {
      active = false;
    };
  }, [client, path, scope, p?.id, p?.version, activity?.id, step, mode]);
  useEffect(() => {
    if (step !== 2 || !p || mode !== 'lessons') return;
    const url = new URL(window.location.href);
    url.searchParams.set('objective', String(activityIndex + 1));
    window.history.replaceState(null, '', url);
  }, [step, p?.id, activityIndex, mode]);
  useEffect(() => {
    const syncStep = () => {
      if (
        window.location.hash.startsWith('#petros-lessons-') &&
        !busy &&
        !conflict &&
        !localEdit
      )
        setStep(initialStep());
    };
    window.addEventListener('hashchange', syncStep);
    return () => window.removeEventListener('hashchange', syncStep);
  }, [busy, conflict, localEdit]);
  function navigate(index: number) {
    if (localEdit || conflict || busy) return;
    setStep(index);
    setError('');
    setNotice('');
    window.history.replaceState(
      null,
      '',
      `#petros-lessons-${['material', 'review', 'preview', 'submit'][index]}`,
    );
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      headingRef.current?.scrollIntoView?.({ block: 'start' });
    });
  }
  async function run(fn: () => Promise<void>, preserveNotice = false) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError('');
    if (!preserveNotice) setNotice('');
    const pin = epoch.current;
    try {
      await fn();
      return true;
    } catch (e) {
      if (pin !== epoch.current) return false;
      const err = e as { status?: number; code?: string; message?: string };
      if (/M3_REVISION_CONFLICT/.test(`${err.code} ${err.message}`)) {
        setConflict(true);
        setLatest(null);
        setError('');
      } else setError(lessonError(e));
      requestAnimationFrame(() => noticeRef.current?.focus());
      return false;
    } finally {
      if (pin === epoch.current) {
        setBusy(false);
        busyRef.current = false;
      }
    }
  }
  async function prepare() {
    const pin = epoch.current;
    const done = await run(async () => {
      prepareId.current ??= crypto.randomUUID();
      const result = selected?.proposalId
        ? await client.get<ProposalView>(
            `${path}/${selected.proposalId}`,
            scope,
          )
        : await client.post<ProposalView>(path, scope, {
            commandId: prepareId.current,
            sourceRevisionId: sourceId,
            preferences: { focus, durationMinutes: duration },
          });
      if (pin !== epoch.current) return;
      setView(result);
      setSources((s) =>
        s.map((row) =>
          row.revisionId === sourceId
            ? { ...row, proposalId: result.proposal.id }
            : row,
        ),
      );
      setRelease(null);
      setEvidence(null);
      setHistory(null);
      if (result.proposal.id !== p?.id) setActivityIndex(0);
      setNotice('Your lesson draft is saved.');
    });
    if (done) navigate(1);
  }
  async function edit(
    change: unknown,
    message = 'Changes saved. This revision needs review again.',
  ) {
    if (!p || conflict) return;
    const pin = epoch.current;
    await run(async () => {
      const result = await client.post<ProposalView>(
        `${path}/${p.id}/edits`,
        scope,
        { commandId: crypto.randomUUID(), expectedVersion: p.version, change },
      );
      if (pin !== epoch.current) return;
      const retainedIndex = result.proposal.objectives.findIndex(
        (o) => o.id === objective?.id,
      );
      setActivityIndex(
        retainedIndex >= 0
          ? retainedIndex
          : Math.min(activityIndex, result.proposal.objectives.length - 1),
      );
      setView(result);
      setEditing(null);
      setClaimEdit(null);
      setRelease(null);
      setNotice(message);
    });
  }
  async function inspect(unitId: string) {
    if (!p) return;
    if (detail !== 'source') {
      const active = document.activeElement as HTMLElement | null;
      const menu = active?.closest('details');
      const trigger = menu?.querySelector<HTMLElement>('summary') ?? active;
      const main = headingRef.current?.closest('main') ?? null;
      sourceReturn.current = { trigger, main, scrollTop: main?.scrollTop ?? 0 };
    }
    setDetail('source');
    setEvidence(null);
    const pin = epoch.current;
    await run(async () => {
      const result = await client.get<Evidence>(
        `${path}/${p.id}/evidence/${unitId}`,
        scope,
      );
      if (pin === epoch.current) setEvidence(result);
    }, true);
  }
  async function loadLatest() {
    if (!p) return;
    setDetail('conflict');
    await run(async () =>
      setLatest(await client.get<ProposalView>(`${path}/${p.id}`, scope)),
    );
  }
  function adoptLatest(keep: boolean) {
    if (!latest) return;
    setView(latest);
    setConflict(false);
    setError('');
    setDetail(null);
    setRelease(null);
    if (!keep) {
      setEditing(null);
      setClaimEdit(null);
      setWording('');
    }
    setNotice(
      keep
        ? 'Latest version loaded. Your wording is preserved; check it and save when ready.'
        : 'Latest version loaded.',
    );
  }
  async function review(
    dimension: string,
    decision = 'approved',
    instrument = false,
  ) {
    if (!p || !currentQualification) return;
    await run(async () => {
      setView(
        await client.post<ProposalView>(`${path}/${p.id}/reviews`, scope, {
          commandId: crypto.randomUUID(),
          expectedVersion: p.version,
          qualificationId: currentQualification.id,
          qualificationVersion: currentQualification.version,
          dimension,
          decision,
          reason,
          taskFamilyId: instrument ? privateView?.family.id : null,
          taskFamilyVersion: instrument ? privateView?.family.version : null,
          nonEquivalenceDecision: instrument
            ? distinct
              ? 'distinct'
              : 'uncertain'
            : null,
        }),
      );
      setNotice('Review decision recorded for this revision.');
    });
  }
  async function inspectPrivate(create = false) {
    if (!p || !chosenFamily || !currentQualification) return;
    await run(async () => {
      const endpoint = `${path}/${p.id}/verification/${chosenFamily.id}`,
        pin = privateEpoch.current;
      setDistinct(false);
      const result = create
        ? await client.post<PrivateReviewView>(endpoint, scope, {
            commandId: crypto.randomUUID(),
            expectedVersion: p.version,
            expectedFamilyVersion:
              view?.instrumentFamilies?.find((i) => i.id === chosenFamily.id)
                ?.version ?? 0,
          })
        : await client.get<PrivateReviewView>(endpoint, scope);
      if (pin !== privateEpoch.current) return;
      setPrivateView(result);
      const current = await client.get<ProposalView>(`${path}/${p.id}`, scope);
      if (pin === privateEpoch.current) setView(current);
    });
  }
  function move(id: string, offset: number) {
    if (!p) return;
    const ids = p.objectives.map((o) => o.id),
      index = ids.indexOf(id);
    [ids[index], ids[index + offset]] = [ids[index + offset]!, ids[index]!];
    void edit({ kind: 'reorder', objectiveIds: ids });
  }
  const requestsChanges =
    p?.state === 'revision_requested' ||
    Object.values(view?.review ?? {}).some((r) =>
      ['revision_requested', 'rejected'].includes(r.status),
    );
  const lessonStatus = lessonPrimaryStatus(view);
  const requirements = [
    ...new Set(
      [
        ...(view?.readiness.blockers ?? []),
        ...(view?.readiness.studentPublicationBlockers ?? []),
      ].map(reviewRequirement),
    ),
  ];
  const blocked = busy || conflict || localEdit;
  const saved = p && (
    <span
      className={styles.saveStatus}
      role="status"
      aria-label="Lesson status"
    >
      <Check size={15} aria-hidden="true" />
      {lessonStatus}
      {localEdit ? ' · Unsaved wording' : ''}
    </span>
  );
  const sample = p && p.generator.origin !== 'genuine_model' && (
    <div className={styles.sample}>
      <span>
        {p.generator.origin === 'controlled_fixture'
          ? 'Sample lesson — prepared from test data'
          : 'Document outline — automatic lesson generation unavailable'}
      </span>
      <button onClick={() => setDetail('sample')}>About this draft</button>
    </div>
  );
  return (
    <section
      className={styles.workspace}
      aria-label="Petros learning proposals"
      aria-busy={busy || loading}
    >
      <div ref={noticeRef} tabIndex={-1} aria-live="polite">
        {error && (
          <div role="alert" className={styles.notice} data-error="true">
            {error}
          </div>
        )}
        {conflict && (
          <div role="alert" className={styles.notice}>
            <h4>This lesson was updated</h4>
            <p>
              Your unsaved changes are preserved. Review the latest changes
              before saving.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              disabled={busy}
              onClick={loadLatest}
            >
              Review latest changes
            </Button>
          </div>
        )}
        {notice && (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        )}
        {busy && (
          <p role="status" className="mb-4 text-sm text-text-secondary">
            {!p ? 'Preparing your lesson…' : 'Saving or checking your lesson…'}
          </p>
        )}
      </div>
      {mode === 'lessons' && (
        <>
          <nav className={styles.steps} aria-label="Lesson preparation steps">
            {steps.map((label, i) => (
              <button
                key={label}
                aria-current={step === i ? 'step' : undefined}
                disabled={blocked || (!p && i > 0)}
                onClick={() => navigate(i)}
              >
                <span className={styles.stepNumber} aria-hidden="true">
                  {i + 1}
                </span>
                {label}
              </button>
            ))}
          </nav>
          <div className={styles.sheet}>
            <div className={styles.body}>
              <p className={styles.eyebrow}>Step {step + 1} of 4</p>
              <h3 ref={headingRef} tabIndex={-1}>
                {
                  [
                    'What would you like Petros to teach?',
                    "Here's what your students will learn",
                    'Preview the proposed student activities',
                    p?.state === 'withdrawn'
                      ? 'This lesson has been withdrawn'
                      : requestsChanges
                        ? 'Review the requested corrections'
                        : p?.state === 'under_review'
                          ? 'Your lesson has been submitted for review'
                          : 'Review your lesson before submitting',
                  ][step]
                }
              </h3>
              {step === 0 && (
                <>
                  <p className={styles.intro}>
                    Start with your teaching material. Review the lesson,
                    preview the activities, then request approval.
                  </p>
                  {loading ? (
                    <p role="status" className="mt-6 text-sm">
                      Loading teaching material…
                    </p>
                  ) : error && !sources.length ? (
                    <div className="mt-6">
                      <h4 className="font-semibold">
                        Teaching material could not be loaded
                      </h4>
                      <Button
                        variant="secondary"
                        className="mt-3"
                        onClick={() =>
                          setSourceAttempt((attempt) => attempt + 1)
                        }
                      >
                        Try again
                      </Button>
                    </div>
                  ) : !sources.length ? (
                    <div className="mt-6">
                      <h4 className="font-semibold">
                        No teaching material available
                      </h4>
                      <p className={styles.muted}>
                        Add or select a supported file in the teaching
                        workspace’s Files tab.
                      </p>
                    </div>
                  ) : (
                    <div className={styles.chooseLayout}>
                      <div className={styles.form}>
                        <div>
                          <Label htmlFor="proposal-source">
                            Teaching material
                          </Label>
                          <select
                            id="proposal-source"
                            className={styles.field}
                            value={sourceId}
                            disabled={blocked}
                            onChange={(e) => {
                              epoch.current++;
                              setSourceId(e.target.value);
                              setView(null);
                              setEvidence(null);
                              setHistory(null);
                              setNotice('');
                              setError('');
                              prepareId.current = null;
                            }}
                          >
                            <option value="">Choose a document</option>
                            {sources.map((s) => (
                              <option key={s.revisionId} value={s.revisionId}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        {selected && (
                          <div className={styles.material}>
                            <FileText size={24} aria-hidden="true" />
                            <div>
                              <strong>{selected.title}</strong>
                              <small>
                                {selected.format.toUpperCase()} ·{' '}
                                {selected.proposalId
                                  ? 'Saved lesson available'
                                  : 'Ready to prepare a document outline'}
                              </small>
                            </div>
                          </div>
                        )}
                        {!selected?.proposalId && (
                          <details>
                            <summary>
                              Lesson focus and duration · optional
                            </summary>
                            <div>
                              <div>
                                <Label htmlFor="proposal-focus">
                                  What should students focus on?
                                </Label>
                                <Input
                                  id="proposal-focus"
                                  value={focus}
                                  disabled={busy}
                                  maxLength={500}
                                  onChange={(e) => {
                                    setFocus(e.target.value);
                                    prepareId.current = null;
                                  }}
                                />
                              </div>
                              <div>
                                <Label htmlFor="proposal-duration">
                                  Lesson duration (minutes)
                                </Label>
                                <Input
                                  id="proposal-duration"
                                  type="number"
                                  min={5}
                                  max={90}
                                  value={duration}
                                  disabled={busy}
                                  onChange={(e) => {
                                    setDuration(Number(e.target.value));
                                    prepareId.current = null;
                                  }}
                                />
                              </div>
                              {selected?.proposalId && (
                                <p className={styles.muted}>
                                  Continuing a saved lesson keeps its existing
                                  focus and duration.
                                </p>
                              )}
                            </div>
                          </details>
                        )}
                        {selected && !selected.proposalId && (
                          <h4 className="font-semibold">
                            No lesson prepared yet
                          </h4>
                        )}
                        <p className={styles.muted}>
                          {selected?.proposalId
                            ? 'Continue the saved draft to review its objectives and activities.'
                            : "Automatic lesson generation isn't available in this environment. A new draft contains an outline drawn from the document."}
                        </p>
                      </div>
                      <aside className={styles.guide}>
                        <h4>A lesson in four steps</h4>
                        <ol>
                          <li>
                            <span>01</span>
                            <div>
                              Choose material
                              <small>Use a document from this subject.</small>
                            </div>
                          </li>
                          <li>
                            <span>02</span>
                            <div>
                              Review the lesson
                              <small>
                                Check and adjust what students will learn.
                              </small>
                            </div>
                          </li>
                          <li>
                            <span>03</span>
                            <div>
                              Preview activities
                              <small>See the proposed lesson content.</small>
                            </div>
                          </li>
                          <li>
                            <span>04</span>
                            <div>
                              Save & submit
                              <small>Keep a draft or send it for review.</small>
                            </div>
                          </li>
                        </ol>
                      </aside>
                    </div>
                  )}
                </>
              )}
              {p && step > 0 && (
                <>
                  <div className={styles.meta}>
                    <span>
                      <FileText size={16} aria-hidden="true" />
                      {selected?.title ?? 'Selected teaching material'}
                    </span>
                    <span>
                      <Clock size={16} aria-hidden="true" />
                      About {p.preferences.durationMinutes} minutes
                    </span>
                    {saved}
                  </div>
                  {sample}
                </>
              )}
              {p && step === 1 && (
                <>
                  <div className={styles.objectives}>
                    {p.objectives.map((o, i) => (
                      <article
                        key={o.id}
                        aria-label={`Objective ${i + 1}`}
                        className={styles.objective}
                      >
                        <span className={styles.objectiveNumber}>{i + 1}</span>
                        <div>
                          {editing === o.id ? (
                            <>
                              <Label htmlFor="objective-wording">
                                Objective wording
                              </Label>
                              <textarea
                                ref={editRef}
                                id="objective-wording"
                                className={styles.field}
                                rows={4}
                                value={wording}
                                maxLength={2000}
                                onChange={(e) => setWording(e.target.value)}
                              />
                              <p>
                                This objective has changed and needs to be
                                reviewed again. Saving checks its source
                                support.
                              </p>
                              <div className={`${styles.actions} mt-3`}>
                                <Button
                                  disabled={busy || conflict || !wording.trim()}
                                  onClick={() =>
                                    edit({
                                      kind: 'objective',
                                      objectiveId: o.id,
                                      wording,
                                    })
                                  }
                                >
                                  Save changes
                                </Button>
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditing(null);
                                    setWording('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </>
                          ) : (
                            <h4>{o.wording}</h4>
                          )}
                          <p>
                            {o.selectedActivityId
                              ? activityTitle(
                                  p.activities.find(
                                    (a) => a.id === o.selectedActivityId,
                                  )!,
                                )
                              : 'Choose an activity in the next step.'}
                          </p>
                          <div className="mt-3">
                            <span className={styles.status}>
                              {o.reviewStatus === 'accepted'
                                ? 'Kept in draft · academic review still required'
                                : o.reviewStatus === 'edited'
                                  ? 'Objective wording changed'
                                  : 'Check this objective'}
                            </span>
                          </div>
                        </div>
                        <div className={styles.objectiveActions}>
                          <Button
                            variant="ghost"
                            disabled={blocked}
                            aria-label={`Edit objective ${i + 1}`}
                            onClick={() => {
                              setEditing(o.id);
                              setWording(o.wording);
                            }}
                          >
                            Edit
                          </Button>
                          <details
                            className={styles.menu}
                            onToggle={(event) => {
                              const menu = event.currentTarget;
                              if (!menu.open) return;
                              const panel = menu.querySelector<HTMLElement>(
                                '[data-objective-menu]',
                              );
                              if (!panel) return;
                              const bounds = menu.getBoundingClientRect();
                              const main = menu
                                .closest('main')
                                ?.getBoundingClientRect();
                              const above = bounds.top - (main?.top ?? 0) - 110;
                              const below =
                                (main?.bottom ?? window.innerHeight) -
                                bounds.bottom -
                                90;
                              const up =
                                below < panel.scrollHeight && above > below;
                              menu.dataset.side = up ? 'up' : 'down';
                              panel.style.maxHeight = `${Math.max(140, up ? above : below)}px`;
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.currentTarget.open = false;
                                e.currentTarget
                                  .querySelector('summary')
                                  ?.focus();
                              }
                            }}
                          >
                            <summary
                              aria-label={`More actions for objective ${i + 1}`}
                            >
                              <MoreHorizontal size={19} aria-hidden="true" />
                            </summary>
                            <div
                              className={styles.menuItems}
                              data-objective-menu
                              onClick={(e) => {
                                const menu = e.currentTarget
                                  .parentElement as HTMLDetailsElement;
                                menu.open = false;
                                menu.querySelector('summary')?.focus();
                              }}
                            >
                              <p
                                className={styles.menuHelp}
                                id={`objective-actions-${o.id}`}
                              >
                                Keeping an objective records a draft choice.{' '}
                                {i === 0
                                  ? 'Move up is unavailable: this is first. '
                                  : ''}
                                {i === p.objectives.length - 1
                                  ? 'Move down is unavailable: this is last. '
                                  : ''}
                                {p.objectives.length === 1
                                  ? 'Removal is unavailable: a lesson needs one objective. '
                                  : ''}
                                {blocked
                                  ? 'Finish the current edit or resolve the save conflict before making another change.'
                                  : ''}
                              </p>
                              <button
                                aria-describedby={`objective-actions-${o.id}`}
                                disabled={
                                  blocked || o.reviewStatus === 'accepted'
                                }
                                title={
                                  o.reviewStatus === 'accepted'
                                    ? 'Already kept in this draft; this is not academic approval.'
                                    : blocked
                                      ? 'Finish the current edit or resolve the save conflict first.'
                                      : 'Keep in your draft; academic approval is separate.'
                                }
                                onClick={() =>
                                  edit(
                                    {
                                      kind: 'accept_objective',
                                      objectiveId: o.id,
                                    },
                                    'Objective kept in this draft. Academic approval is still required.',
                                  )
                                }
                              >
                                Keep this objective
                              </button>
                              <button
                                disabled={blocked || p.objectives.length === 1}
                                title={
                                  p.objectives.length === 1
                                    ? 'A lesson needs at least one objective.'
                                    : blocked
                                      ? 'Finish the current edit or resolve the save conflict first.'
                                      : undefined
                                }
                                onClick={() =>
                                  edit({
                                    kind: 'remove_objective',
                                    objectiveId: o.id,
                                  })
                                }
                              >
                                Remove from lesson
                              </button>
                              <button
                                disabled={blocked || i === 0}
                                title={
                                  i === 0
                                    ? 'This is the first objective.'
                                    : blocked
                                      ? 'Finish the current edit or resolve the save conflict first.'
                                      : undefined
                                }
                                onClick={() => move(o.id, -1)}
                              >
                                Move up
                              </button>
                              <button
                                disabled={
                                  blocked || i === p.objectives.length - 1
                                }
                                title={
                                  i === p.objectives.length - 1
                                    ? 'This is the last objective.'
                                    : blocked
                                      ? 'Finish the current edit or resolve the save conflict first.'
                                      : undefined
                                }
                                onClick={() => move(o.id, 1)}
                              >
                                Move down
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  inspect(o.support[0]!.reference.unitId)
                                }
                              >
                                Inspect source
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => {
                                  setActivityIndex(i);
                                  setDetail('activity');
                                }}
                              >
                                Objective details
                              </button>
                            </div>
                          </details>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className={`${styles.actions} mt-4`}>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDetail('concepts')}
                    >
                      Concepts & connections
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDetail('claims')}
                    >
                      Check lesson claims
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setHistory(null);
                        setDetail('history');
                      }}
                    >
                      Version history
                    </Button>
                  </div>
                </>
              )}
              {p && step === 2 && objective && (
                <>
                  <div className={styles.previewHeading}>
                    <div>
                      <p className={styles.eyebrow}>
                        Objective{' '}
                        {Math.min(activityIndex + 1, p.objectives.length)} of{' '}
                        {p.objectives.length}
                      </p>
                      <h4>{objective.wording}</h4>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={blocked}
                      onClick={() => setDetail('activity')}
                    >
                      Change activity
                    </Button>
                  </div>
                  <div className={styles.previewControls}>
                    <Button
                      variant="ghost"
                      disabled={busy || activityIndex === 0}
                      onClick={() => setActivityIndex((i) => i - 1)}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Previous activity
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={
                        busy || activityIndex >= p.objectives.length - 1
                      }
                      onClick={() => setActivityIndex((i) => i + 1)}
                    >
                      Next activity
                      <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                  </div>
                  {objective.reviewStatus === 'edited' && (
                    <p className={styles.muted}>
                      Objective wording changed. Check that this proposed
                      activity still fits before submitting.
                    </p>
                  )}
                  {activity ? (
                    <ActivityPresentation
                      proposal={p}
                      activityId={activity.id}
                      sourcePayload={previewEvidence?.payload}
                      sourceUnitId={previewEvidence?.id}
                    />
                  ) : (
                    <div className={styles.notice}>
                      No activity selected. Choose a supported activity for this
                      objective.
                    </div>
                  )}
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      aria-disabled={busy}
                      onClick={() => {
                        if (!busy) void inspect((activity?.support ?? objective.support)[0]!.reference.unitId);
                      }}
                    >
                      View source material
                    </Button>
                  </div>
                </>
              )}
              {p && view && step === 3 && (
                <>
                  <dl className={styles.summary}>
                    <div>
                      <dt>Lesson</dt>
                      <dd>{assignment.subjectName}</dd>
                    </div>
                    <div>
                      <dt>Objectives</dt>
                      <dd>{p.objectives.length} learning objectives</dd>
                    </div>
                    <div>
                      <dt>Activities prepared</dt>
                      <dd>
                        {
                          p.objectives.filter((o) => o.selectedActivityId)
                            .length
                        }{' '}
                        of {p.objectives.length}
                      </dd>
                    </div>
                  </dl>
                  <section className={styles.notice}>
                    <h4>
                      {p.state === 'withdrawn'
                        ? 'Lesson withdrawn'
                        : requestsChanges
                          ? 'Review the requested corrections'
                          : p.state === 'under_review'
                            ? 'What happens next'
                            : lessonStatus === 'Teaching approved'
                              ? 'Teaching review recorded'
                              : 'Before you submit'}
                    </h4>
                    <p>
                      {p.state === 'withdrawn'
                        ? 'This lesson is withdrawn and cannot be saved, submitted or made available to students.'
                        : requestsChanges
                          ? 'A reviewer has requested corrections. Check the review details, adjust the lesson and submit it again.'
                          : p.state === 'under_review'
                            ? 'Your lesson has been submitted for teaching review. Changes create a new revision that needs review again.'
                            : view.review.teaching_scope?.status === 'approved'
                              ? 'Teaching approval is valid for this revision. Concepts, activities and assessments have separate review requirements.'
                              : 'Your changes are saved. Submit this revision when you are ready for a qualified reviewer to check it.'}
                    </p>
                  </section>
                  <section>
                    <h4 className="font-semibold">Student use unavailable</h4>
                    <p className={`${styles.muted} mt-2`}>
                      Students cannot use this lesson in this development build.
                      Source checks and separate approvals are still required.
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-2"
                      onClick={() => setDetail('review')}
                    >
                      See what’s needed
                    </Button>
                  </section>
                  {(p.source.coverage.status !== 'complete' ||
                    p.uncertainties.length > 0) && (
                    <div className="mt-5">
                      <h4 className="text-sm font-semibold">
                        Source checks to discuss with your reviewer
                      </h4>
                      <p className={styles.muted}>
                        {p.source.coverage.status !== 'complete'
                          ? 'Some parts of this document could not be read completely. '
                          : ''}
                        {p.uncertainties[0]}
                      </p>
                      <Button
                        variant="ghost"
                        onClick={() => setDetail('review')}
                      >
                        View review details
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
            <footer className={styles.footer}>
              <p>
                {step === 0
                  ? 'Prepare a private lesson draft.'
                  : localEdit
                    ? 'Save or cancel your wording to continue.'
                    : 'Student use is unavailable. See review details for requirements.'}
              </p>
              <div className={styles.actions}>
                {step > 0 && (
                  <Button
                    variant="ghost"
                    disabled={blocked}
                    onClick={() => navigate(step - 1)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back
                  </Button>
                )}
                {step === 0 ? (
                  <Button
                    disabled={
                      !sourceId ||
                      busy ||
                      loading ||
                      duration < 5 ||
                      duration > 90 ||
                      !Number.isInteger(duration)
                    }
                    loading={busy}
                    onClick={prepare}
                  >
                    {selected?.proposalId
                      ? 'Continue editing lesson'
                      : 'Prepare document outline'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                ) : step < 3 ? (
                  <Button disabled={blocked} onClick={() => navigate(step + 1)}>
                    {step === 1 ? 'Preview lesson' : 'Continue to submission'}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      disabled={blocked || p?.state === 'withdrawn'}
                      onClick={() =>
                        edit(
                          { kind: 'save' },
                          'Draft saved. This new revision needs review before student use.',
                        )
                      }
                    >
                      Save draft
                    </Button>
                    <Button
                      disabled={
                        blocked ||
                        p?.state === 'under_review' ||
                        p?.state === 'withdrawn'
                      }
                      onClick={() =>
                        edit(
                          { kind: 'submit_review' },
                          'Your lesson has been submitted for teaching review.',
                        )
                      }
                    >
                      {p?.state === 'withdrawn'
                        ? 'Lesson withdrawn'
                        : requestsChanges && p?.state === 'under_review'
                          ? 'Changes requested'
                          : p?.state === 'under_review'
                            ? 'Submitted for review'
                            : 'Submit for review'}
                    </Button>
                  </>
                )}
              </div>
            </footer>
          </div>
        </>
      )}
      {mode === 'reviews' &&
        (!p || !view || !canReview ? (
          <div className={styles.empty}>
            <h3>Qualified review access required</h3>
            <p>
              You don't have permission to record academic decisions. You need a
              current subject qualification and access to this lesson’s source.
              Continue preparing your lesson under Lessons.
            </p>
          </div>
        ) : (
          <div className={styles.sheet}>
            <div className={styles.body}>
              <p className={styles.eyebrow}>Qualified academic reviewer</p>
              <h3>Lesson reviews</h3>
              <p className={styles.intro}>
                Review this exact lesson revision. Teaching material, concepts,
                activities and assessment questions each require their own
                decision.
              </p>
              <div className={styles.meta}>
                <span>{selected?.title}</span>
                <span>Revision {p.version}</span>
                {saved}
              </div>
              {sample}
              <div className={`${styles.actions} my-5`}>
                <Button
                  variant="secondary"
                  onClick={() => setDetail('concepts')}
                >
                  Inspect concepts
                </Button>
                <Button variant="secondary" onClick={() => setDetail('claims')}>
                  Inspect claims
                </Button>
                <Button variant="secondary" onClick={() => setDetail('review')}>
                  Review & availability details
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setHistory(null);
                    setDetail('history');
                  }}
                >
                  Version history
                </Button>
              </div>
              <div className={styles.form}>
                <div>
                  <Label htmlFor="qualification">
                    Current reviewer qualification
                  </Label>
                  <select
                    id="qualification"
                    className={styles.field}
                    value={currentQualification?.id ?? ''}
                    disabled={busy}
                    onChange={(e) => setQualification(e.target.value)}
                  >
                    {view.reviewEligibility.items.map((q, i) => (
                      <option key={q.id} value={q.id}>
                        Qualified subject reviewer {i + 1} · version {q.version}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="review-reason">Review reason</Label>
                  <textarea
                    id="review-reason"
                    rows={3}
                    className={styles.field}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.reviewRows}>
                {Object.entries(dimensions)
                  .filter(([d]) => d !== 'assessment_instrument')
                  .map(([d, label]) => (
                    <div key={d}>
                      <h4>{label}</h4>
                      <p className={styles.muted}>
                        {reviewStatus(view.review[d]?.status)}
                      </p>
                      <div className={`${styles.actions} mt-3`}>
                        <Button
                          variant="secondary"
                          disabled={blocked || !reason.trim()}
                          onClick={() => review(d)}
                        >
                          Approve {label.toLowerCase()}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={blocked || !reason.trim()}
                          onClick={() => review(d, 'revision_requested')}
                        >
                          Request changes to {label.toLowerCase()}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
              <section className="mt-8" aria-label="Assessment reviews">
                <h4 className="text-lg font-semibold">Assessment reviews</h4>
                <p className={styles.muted}>
                  Private drafts are visible only with current reviewer
                  qualification and source access. Approval requires a separate
                  decision about source support and independence from practice.
                </p>
                <Label htmlFor="verification-family" className="mt-4 block">
                  Candidate family
                </Label>
                <select
                  id="verification-family"
                  className={styles.field}
                  value={chosenFamily?.id ?? ''}
                  disabled={busy}
                  onChange={(e) => {
                    privateEpoch.current++;
                    setFamilyId(e.target.value);
                    setPrivateView(null);
                    setDistinct(false);
                    setPrivateEditing(false);
                  }}
                >
                  {p.taskCandidates
                    .filter((t) => t.kind !== 'formative_practice')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Objective{' '}
                        {p.objectives.findIndex((o) => o.id === t.objectiveId) +
                          1}{' '}
                        · {t.kind.replaceAll('_', ' ')} ·{' '}
                        {view.instrumentFamilies
                          ?.find((i) => i.id === t.id)
                          ?.status.replaceAll('_', ' ') ?? 'Not prepared'}
                      </option>
                    ))}
                </select>
                <div className={`${styles.actions} mt-3`}>
                  <Button
                    variant="secondary"
                    disabled={blocked || p.state !== 'under_review'}
                    onClick={() => inspectPrivate(true)}
                  >
                    Prepare private review draft
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={
                      blocked ||
                      !view.instrumentFamilies?.some(
                        (i) => i.id === chosenFamily?.id && i.version > 0,
                      )
                    }
                    onClick={() => inspectPrivate()}
                  >
                    Inspect private review draft
                  </Button>
                </div>
                {privateView && (
                  <section
                    className="mt-5 space-y-4"
                    aria-label="Qualified private review"
                  >
                    <p className={styles.muted}>
                      Private sample draft · family version{' '}
                      {privateView.family.version} ·{' '}
                      {privateView.classification}
                    </p>
                    {privateView.panels.map((panel, i) => (
                      <details key={i}>
                        <summary className="cursor-pointer text-sm font-semibold">
                          {panel.label}
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                          {panel.content}
                        </p>
                      </details>
                    ))}
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setPrivateEditing(true);
                        setPrivateText(privateView.panels[0]?.content ?? '');
                      }}
                    >
                      Edit candidate wording
                    </Button>
                    {privateEditing && (
                      <>
                        <Label htmlFor="private-question">
                          Private candidate wording
                        </Label>
                        <textarea
                          id="private-question"
                          rows={4}
                          className={styles.field}
                          value={privateText}
                          maxLength={2000}
                          onChange={(e) => setPrivateText(e.target.value)}
                        />
                        <div className={styles.actions}>
                          <Button
                            disabled={busy || conflict || !privateText.trim()}
                            onClick={() =>
                              run(async () => {
                                const pin = privateEpoch.current;
                                const revised =
                                  await client.post<PrivateReviewView>(
                                    `${path}/${p.id}/verification/${privateView.family.id}`,
                                    scope,
                                    {
                                      commandId: crypto.randomUUID(),
                                      expectedVersion: p.version,
                                      expectedFamilyVersion:
                                        privateView.family.version,
                                      questionText: privateText,
                                    },
                                  );
                                if (pin !== privateEpoch.current) return;
                                setPrivateView(revised);
                                setDistinct(false);
                                setPrivateEditing(false);
                                const current = await client.get<ProposalView>(
                                  `${path}/${p.id}`,
                                  scope,
                                );
                                if (pin === privateEpoch.current)
                                  setView(current);
                              })
                            }
                          >
                            Save private candidate revision
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setPrivateEditing(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </>
                    )}
                    <label className="flex items-start gap-3 text-sm leading-6">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={distinct}
                        onChange={(e) => setDistinct(e.target.checked)}
                      />
                      I have reviewed source support, exposure and defensible
                      alternatives, and established this family’s
                      non-equivalence to practice and other verification
                      families.
                    </label>
                    <div className={styles.actions}>
                      <Button
                        variant="secondary"
                        disabled={blocked || !reason.trim() || !distinct}
                        onClick={() =>
                          review('assessment_instrument', 'approved', true)
                        }
                      >
                        Approve this instrument
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={blocked || !reason.trim()}
                        onClick={() =>
                          review(
                            'assessment_instrument',
                            'revision_requested',
                            true,
                          )
                        }
                      >
                        Request instrument changes
                      </Button>
                    </div>
                  </section>
                )}
              </section>
              <section className="mt-8 border-t border-border pt-5">
                <h4 className="font-semibold">
                  Isolated teaching authorization
                </h4>
                <p className={styles.muted}>
                  {view.readiness.eligible
                    ? 'Eligible to record teaching authorization in this isolated environment.'
                    : 'Additional approvals and source checks are required.'}{' '}
                  Recording authorization does not make this lesson available to
                  students.
                </p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  disabled={blocked || !view.readiness.eligible}
                  onClick={() =>
                    run(async () => {
                      const receipt = await client.post<{ id: string }>(
                        `${path}/${p.id}/release`,
                        scope,
                        {
                          commandId: crypto.randomUUID(),
                          expectedVersion: p.version,
                        },
                      );
                      setRelease(receipt.id);
                      setView(
                        await client.get<ProposalView>(
                          `${path}/${p.id}`,
                          scope,
                        ),
                      );
                    })
                  }
                >
                  Record isolated teaching authorization
                </Button>
                {release && (
                  <p role="status" className={styles.muted}>
                    Authorization receipt recorded. Students have not received
                    this lesson.
                  </p>
                )}
                {view.manifest && (
                  <p className={styles.muted}>
                    An isolated authorization was recorded for revision{' '}
                    {view.manifest.proposalVersion}. Current checks are required
                    again before any use.
                  </p>
                )}
              </section>
            </div>
          </div>
        ))}
      <Drawer
        open={Boolean(detail)}
        onClose={() => {
          const returning = detail === 'source' ? sourceReturn.current : null;
          sourceReturn.current = null;
          setDetail(null);
          if (returning)
            requestAnimationFrame(() => {
              if (returning.trigger?.isConnected)
                returning.trigger.focus({ preventScroll: true });
              if (returning.main?.isConnected)
                returning.main.scrollTop = returning.scrollTop;
            });
        }}
        title={
          {
            source: 'Supporting source material',
            review: 'Review & student availability',
            concepts: 'Concepts & connections',
            claims: 'Check lesson claims',
            history: 'Lesson version history',
            conflict: 'Review the latest changes',
            sample: 'About this draft',
            activity: 'Activity & objective details',
          }[detail ?? 'source']
        }
      >
        <div className={styles.drawerContent}>
          {detail === 'sample' && (
            <>
              <p>
                {p?.generator.origin === 'controlled_fixture'
                  ? 'This sample lesson uses controlled test data linked to the selected source. It was not generated by a live AI model.'
                  : 'This outline is assembled from extracted document sections. It is not a model-generated lesson.'}
              </p>
              <p>
                Automatic lesson generation is unavailable here. Subject
                accuracy, assessment validity and student use still require
                their separate approvals.
              </p>
              <details>
                <summary>Exact preparation and source provenance</summary>
                <pre>
                  {JSON.stringify(
                    {
                      generator: p?.generator,
                      originalSourceHash: p?.source.originalHash,
                      sourceRevisionId: p?.source.revisionId,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          )}
          {detail === 'source' && p && p.source.references.length > 1 && (
            <nav className={styles.actions} aria-label="Cited source sections">
              {p.source.references.map((ref, index) => (
                <Button
                  key={ref.unitId}
                  variant="secondary"
                  disabled={busy}
                  aria-pressed={evidence?.id === ref.unitId}
                  onClick={() => inspect(ref.unitId)}
                >
                  Source section {index + 1} · {sourceLocation(ref.locator)}
                </Button>
              ))}
            </nav>
          )}
          {detail === 'source' &&
            (evidence ? (
              <>
                <p>
                  {selected?.title} · {sourceLocation(evidence.locator)}
                </p>
                <p className={styles.muted}>
                  Source excerpt · {evidence.kind.replaceAll('_', ' ')}. The
                  original layout may differ. Check any uncertainties below.
                </p>
                {evidence.payload?.kind === 'table' ? (
                  <NativeSourceTable table={evidence.payload} />
                ) : (
                  <blockquote>{evidence.text}</blockquote>
                )}
                {evidence.uncertainties.map((u, i) => (
                  <p key={i}>{u}</p>
                ))}
                <details>
                  <summary>Exact source reference</summary>
                  <pre>{JSON.stringify(evidence.locator, null, 2)}</pre>
                  <p className="break-all text-xs">
                    Content hash: {evidence.contentHash}
                  </p>
                </details>
              </>
            ) : (
              <p role="status">
                {busy
                  ? 'Loading the selected source section…'
                  : 'Source material could not be loaded. Close this panel and try again.'}
              </p>
            ))}
          {detail === 'review' && view && p && (
            <>
              <p>
                These decisions apply to revision {p.version}. Teaching approval
                does not approve assessment questions or make this lesson
                available to students.
              </p>
              {Object.entries(dimensions).map(([d, label]) => (
                <div key={d}>
                  <h4>{label}</h4>
                  <p>{reviewStatus(view.review[d]?.status)}</p>
                </div>
              ))}
              <div>
                <h4>Student availability</h4>
                <p>Not available in this development build.</p>
              </div>
              <h4>What’s needed</h4>
              <ul className="list-disc space-y-2 pl-5">
                {requirements.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <h4>Source sections to check</h4>
              <p>
                {p.source.coverage.status === 'complete'
                  ? 'All identified sections were extracted. Their meaning and accuracy still need review.'
                  : 'Some parts of this document could not be read completely. Inspect the relevant passages and ask for a source review.'}
              </p>
              {p.uncertainties.map((u, i) => (
                <p key={i}>{u}</p>
              ))}
              <h4>Reviewer access</h4>
              <p>
                {canReview
                  ? 'Current subject qualification is available. The server checks independence and source access on each decision.'
                  : 'You need an independent qualified subject reviewer with access to this source. Your current account cannot record qualified decisions.'}
              </p>
              {canReview && (
                <details>
                  <summary>Exact review requirements</summary>
                  {[
                    ...view.readiness.blockers,
                    ...view.readiness.studentPublicationBlockers,
                  ].map((code, i) => (
                    <p key={i} className="font-mono text-xs">
                      {code}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {detail === 'concepts' && p && (
            <>
              <p>
                Suggested connections need subject review. They are not approved
                prerequisites.
              </p>
              {p.concepts.map((c) => (
                <div key={c.id}>
                  <h4>{c.label}</h4>
                  <p>{c.definition}</p>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => inspect(c.support[0]!.reference.unitId)}
                  >
                    View source for {c.label}
                  </Button>
                </div>
              ))}
              <h4>Connections</h4>
              {p.relationships.length ? (
                p.relationships.map((r, i) => (
                  <div key={i}>
                    <p>
                      {p.concepts.find((c) => c.key === r.from)?.label} ·{' '}
                      {p.concepts.find((c) => c.key === r.to)?.label}
                    </p>
                    <p>
                      {r.kind === 'hard_prerequisite'
                        ? 'Suggested required preparation'
                        : r.kind === 'recommended'
                          ? 'Recommended connection'
                          : 'Related ideas'}{' '}
                      · {r.rationale}
                    </p>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => inspect(r.support[0]!.reference.unitId)}
                    >
                      View connection source
                    </Button>
                  </div>
                ))
              ) : (
                <p>
                  No source-supported connection is proposed. Concepts appearing
                  in the same document do not establish a cause or prerequisite.
                </p>
              )}
            </>
          )}
          {detail === 'claims' && p && (
            <>
              <p>
                Check that each statement is supported by the material. A source
                citation alone does not establish accuracy.
              </p>
              {p.claims.map((c) => (
                <div key={c.id} className="border-t border-border pt-4">
                  <p>{c.statement}</p>
                  <p className={styles.muted}>
                    {c.classification === 'rejected'
                      ? 'Removed from supported claims'
                      : 'Subject review needed'}
                    {c.highRisk ? ' · needs careful accuracy review' : ''}
                  </p>
                  {claimEdit === c.id && (
                    <>
                      <Label htmlFor="claim-wording">Claim wording</Label>
                      <textarea
                        id="claim-wording"
                        ref={editRef}
                        className={styles.field}
                        rows={4}
                        value={wording}
                        onChange={(e) => setWording(e.target.value)}
                      />
                      <div className={styles.actions}>
                        <Button
                          disabled={busy || conflict || !wording.trim()}
                          onClick={() =>
                            edit({
                              kind: 'claim',
                              claimId: c.id,
                              statement: wording,
                            })
                          }
                        >
                          Save claim
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setClaimEdit(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </>
                  )}
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => inspect(c.support[0]!.reference.unitId)}
                    >
                      View claim source
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={blocked || mode === 'reviews'}
                      onClick={() => {
                        setClaimEdit(c.id);
                        setWording(c.statement);
                      }}
                    >
                      Edit claim
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={blocked || mode === 'reviews'}
                      onClick={() =>
                        edit({ kind: 'reject_claim', claimId: c.id })
                      }
                    >
                      Reject claim
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
          {detail === 'activity' && objective && p && (
            <>
              <h4>{objective.wording}</h4>
              <p>{objective.observableCapability}</p>
              {objective.assumptions.map((a, i) => (
                <p key={i}>{a}</p>
              ))}
              <Label htmlFor="activity-choice">Lesson activity</Label>
              <select
                id="activity-choice"
                className={styles.field}
                value={objective.selectedActivityId ?? ''}
                disabled={blocked || mode === 'reviews'}
                onChange={(e) =>
                  edit({
                    kind: 'select_activity',
                    objectiveId: objective.id,
                    activityId: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Choose an activity
                </option>
                {p.activities
                  .filter(
                    (a) =>
                      a.objectiveId === objective.id &&
                      a.reviewStatus !== 'rejected' &&
                      a.capabilityStatus === 'structural_preview',
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {activityTitle(a)}
                      {a.capabilityStatus === 'unsupported_execution'
                        ? ' · cannot run here'
                        : ' · read-only preview'}
                    </option>
                  ))}
              </select>
              {activity && (
                <>
                  <p>{activity.purpose}</p>
                  <h4>What students would demonstrate</h4>
                  <p>{activity.expectedObservation}</p>
                  <h4>Accessible alternative</h4>
                  <p>{activity.accessibilityAlternative}</p>
                  <Button
                    variant="ghost"
                    disabled={blocked || mode === 'reviews'}
                    onClick={() =>
                      edit({ kind: 'reject_activity', activityId: activity.id })
                    }
                  >
                    Reject selected activity
                  </Button>
                </>
              )}
            </>
          )}
          {detail === 'history' && p && (
            <>
              <p>
                Current revision {p.version}. Changes preserve earlier versions
                and require new review.
              </p>
              <p>
                Previous revision:{' '}
                {p.correction.previousVersion ?? 'No earlier revision'}
              </p>
              <Button
                variant="secondary"
                disabled={busy || p.version <= 1}
                onClick={() =>
                  run(async () =>
                    setHistory(
                      await client.get<ProposalView>(
                        `${path}/${p.id}/revisions/${history ? Math.max(1, history.proposal.version - 1) : p.version - 1}`,
                        scope,
                      ),
                    ),
                  )
                }
              >
                Inspect previous revision
              </Button>
              {history && (
                <>
                  <h4>Revision {history.proposal.version} · read only</h4>
                  {history.proposal.objectives.map((o) => (
                    <p key={o.id}>{o.wording}</p>
                  ))}
                  <p>Historical approvals do not approve the current lesson.</p>
                </>
              )}
              <details>
                <summary>Change record</summary>
                <p>
                  {p.correction.changedFields.join(', ') ||
                    'Initial preparation'}
                </p>
                <p>{p.updatedAt}</p>
              </details>
              <Button
                variant="ghost"
                disabled={
                  blocked || mode === 'reviews' || p.state === 'withdrawn'
                }
                onClick={() =>
                  edit(
                    {
                      kind: 'withdraw',
                      reason: 'Teacher withdrew this lesson.',
                    },
                    'Lesson withdrawn. It is unavailable for review or student use.',
                  )
                }
              >
                Withdraw lesson
              </Button>
            </>
          )}
          {detail === 'conflict' && (
            <>
              <p>
                Your changes have not overwritten the saved lesson. Compare the
                latest revision with your work.
              </p>
              {latest ? (
                <>
                  <h4>
                    Latest saved version · revision {latest.proposal.version}
                  </h4>
                  {latest.proposal.objectives.map((o) => (
                    <p key={o.id}>{o.wording}</p>
                  ))}
                  {(editing || claimEdit) && (
                    <>
                      <h4>Your unsaved wording</h4>
                      <blockquote>{wording}</blockquote>
                    </>
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => adoptLatest(false)}
                  >
                    Use latest version
                  </Button>
                  {(editing || claimEdit) && (
                    <Button
                      disabled={
                        busy ||
                        (editing
                          ? !latest.proposal.objectives.some(
                              (o) => o.id === editing,
                            )
                          : !latest.proposal.claims.some(
                              (c) => c.id === claimEdit,
                            ))
                      }
                      onClick={() => adoptLatest(true)}
                    >
                      Continue with my wording
                    </Button>
                  )}
                  {editing &&
                    !latest.proposal.objectives.some(
                      (o) => o.id === editing,
                    ) && (
                      <p>
                        This objective was removed in the latest version. Copy
                        your wording before choosing the latest version.
                      </p>
                    )}
                  <p>
                    Continuing with your wording does not save it. Review the
                    field, then choose Save changes.
                  </p>
                </>
              ) : (
                <p role="status">
                  {busy
                    ? 'Loading the latest saved version…'
                    : 'The latest version could not be loaded. Your work is preserved; close this panel and try again.'}
                </p>
              )}
            </>
          )}
        </div>
      </Drawer>
    </section>
  );
}
