'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Input, Select, Skeleton } from '@edrion/ui';
import { useAcademicContext } from '@/lib/academic-context';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useExamOptions } from '@/lib/exams';
import {
  type MarkReleaseBatch,
  useMarkReleaseMutations,
  useMarkReleases,
  useResultsSettings,
} from '@/lib/mark-release';
import { formatPortalError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { usePortalMe } from '@/lib/hooks';
import { useScope } from '@/lib/scope';
import { ReleaseConfirmDrawer } from './release-confirm-drawer';

export function GradebookReleasePanel() {
  const { can } = usePermissions();
  const { termId } = useAcademicContext();
  const { scope, campuses } = useScope();
  const { data: me } = usePortalMe();
  const { data: subjects } = useSubjectOptions();
  const { data: classes } = useClassOptions();
  const { data: exams } = useExamOptions();
  const { data: settings } = useResultsSettings();

  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [examId, setExamId] = useState('');
  const [assessmentName, setAssessmentName] = useState('');
  const [campusId, setCampusId] = useState('');
  const [confirmBatch, setConfirmBatch] = useState<MarkReleaseBatch | null>(null);
  const [confirmMode, setConfirmMode] = useState<'release' | 'approve'>('release');
  const [error, setError] = useState<string | null>(null);

  const campus =
    scope.mode === 'campus'
      ? scope.campusId
      : campusId || campuses[0]?.id || me?.campuses[0]?.id || '';

  const {
    data: batches,
    isLoading,
    refetch,
  } = useMarkReleases(termId || undefined, subjectId || undefined);
  const { upsert, release, approve, retract } = useMarkReleaseMutations();

  const scopedBatches = useMemo(() => {
    if (!classId) return batches ?? [];
    return (batches ?? []).filter((b) => b.scope.class_ids?.includes(classId));
  }, [batches, classId]);

  const canManage = can('gradebook.manage');
  const canApprove = can('gradebook.approve_release');
  const hodGate = settings?.hodReleaseGate === true;

  async function ensureDraft() {
    if (!termId || !subjectId || !campus || !classId) {
      throw new Error('Select term, subject, class, and campus before releasing.');
    }
    if (!examId && !assessmentName.trim()) {
      throw new Error('Select an exam or enter an assessment name.');
    }
    const scopePayload = examId
      ? { exam_id: examId, class_ids: [classId] }
      : { assessment_name: assessmentName.trim(), class_ids: [classId] };
    return upsert.mutateAsync({
      term_id: termId,
      subject_id: subjectId,
      campus_id: campus,
      scope: scopePayload,
    }) as Promise<MarkReleaseBatch>;
  }

  async function openRelease() {
    setError(null);
    try {
      const batch = await ensureDraft();
      setConfirmMode('release');
      setConfirmBatch(batch);
    } catch (err) {
      setError(formatPortalError(err));
    }
  }

  function statusTone(status: MarkReleaseBatch['status']) {
    switch (status) {
      case 'released':
        return 'success' as const;
      case 'pending_approval':
        return 'warning' as const;
      case 'retracted':
        return 'danger' as const;
      default:
        return 'neutral' as const;
    }
  }

  if (!canManage && !canApprove) return null;

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-text-primary">Mark release</h2>
          <p className="text-xs text-text-muted">
            {hodGate ? 'Releases require HOD approval.' : 'Release publishes marks to students.'}
          </p>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={openRelease} disabled={upsert.isPending}>
            Prepare release
          </Button>
        ) : null}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Subject">
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            options={[
              { value: '', label: 'Select subject' },
              ...(subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </Field>
        <Field label="Class">
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={[
              { value: '', label: 'Select class' },
              ...(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>
        <Field label="Exam">
          <Select
            value={examId}
            onChange={(e) => {
              setExamId(e.target.value);
              if (e.target.value) setAssessmentName('');
            }}
            options={[
              { value: '', label: 'Ad-hoc assessment' },
              ...(exams?.items ?? []).map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
        </Field>
        {!examId ? (
          <Field label="Assessment name">
            <Input
              value={assessmentName}
              onChange={(e) => setAssessmentName(e.target.value)}
              placeholder="e.g. Midterm"
            />
          </Field>
        ) : null}
        {scope.mode === 'institution' ? (
          <Field label="Campus">
            <Select
              value={campusId}
              onChange={(e) => setCampusId(e.target.value)}
              options={[
                { value: '', label: 'Default campus' },
                ...campuses.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Field>
        ) : null}
      </div>

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      {isLoading ? <Skeleton className="h-20" /> : null}

      {!isLoading && subjectId && scopedBatches.length === 0 ? (
        <p className="text-sm text-text-muted">No release batches for this subject yet.</p>
      ) : null}

      <ul className="space-y-2">
        {scopedBatches.map((batch) => (
          <li
            key={batch.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(batch.status)}>{batch.status.replace('_', ' ')}</Badge>
                <span className="text-text-muted">
                  {batch.scope.exam_id ? 'Exam scope' : batch.scope.assessment_name} ·{' '}
                  {batch.preview.entered} marks
                </span>
              </div>
              {batch.preview.missing > 0 ? (
                <span className="text-xs text-warning">{batch.preview.missing} missing</span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && ['draft', 'retracted'].includes(batch.status) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setConfirmMode('release');
                    setConfirmBatch(batch);
                  }}
                >
                  {hodGate ? 'Submit' : 'Release'}
                </Button>
              ) : null}
              {canApprove && batch.status === 'pending_approval' ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setConfirmMode('approve');
                    setConfirmBatch(batch);
                  }}
                >
                  Approve
                </Button>
              ) : null}
              {canManage && batch.preview.retractable ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const note = window.prompt('Retract note (required):');
                    if (!note?.trim()) return;
                    try {
                      await retract.mutateAsync({
                        id: batch.id,
                        body: { version: batch.version, note: note.trim() },
                      });
                      await refetch();
                    } catch (err) {
                      setError(formatPortalError(err));
                    }
                  }}
                >
                  Retract
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <ReleaseConfirmDrawer
        batch={confirmBatch}
        open={Boolean(confirmBatch)}
        onClose={() => setConfirmBatch(null)}
        mode={confirmMode}
        onConfirm={async (confirmMissing) => {
          if (!confirmBatch) return;
          const body = { version: confirmBatch.version, confirm_missing: confirmMissing };
          if (confirmMode === 'approve') {
            await approve.mutateAsync({ id: confirmBatch.id, body });
          } else {
            await release.mutateAsync({ id: confirmBatch.id, body });
          }
          await refetch();
        }}
      />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-text-secondary">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
