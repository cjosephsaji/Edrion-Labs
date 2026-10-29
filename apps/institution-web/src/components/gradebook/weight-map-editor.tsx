'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { useAcademicContext } from '@/lib/academic-context';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useExamOptions } from '@/lib/exams';
import { useWeightMap, useWeightMapMutation, type WeightMapRow } from '@/lib/grading';
import { formatPortalError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { useScope } from '@/lib/scope';

type ComponentDraft = WeightMapRow['components'][number];
type AssessmentDraft = ComponentDraft['assessments'][number];

const EMPTY_COMPONENT = (): ComponentDraft => ({
  key: crypto.randomUUID(),
  label: '',
  weight_pct: 0,
  assessments: [{ assessment_name: '' }],
  aggregation: 'sum',
});

export function WeightMapEditor() {
  const fieldPrefix = useId();
  const { can } = usePermissions();
  const { termId } = useAcademicContext();
  const { scope } = useScope();
  const { data: subjects } = useSubjectOptions();
  const { data: classes } = useClassOptions();
  const { data: exams } = useExamOptions();

  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>([EMPTY_COMPONENT()]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const map = useWeightMap(subjectId || undefined, termId || undefined, classId || null);
  const save = useWeightMapMutation();

  useEffect(() => {
    // A missing map is a fresh draft, never the previously selected subject/class's map.
    setComponents(map.data?.components ?? [EMPTY_COMPONENT()]);
    setVersion(map.data?.version ?? 0);
    setError(null);
    setSaved(false);
  }, [map.data, subjectId, classId, termId, scope]);

  const total = useMemo(() => components.reduce((sum, c) => sum + c.weight_pct, 0), [components]);
  const totalLabel = Number(total.toFixed(2));
  const busy = map.isFetching || save.isPending;

  if (!can('gradebook.manage')) return null;

  function updateComponent(index: number, update: Partial<ComponentDraft>) {
    setComponents((rows) => rows.map((row, i) => (i === index ? { ...row, ...update } : row)));
    setSaved(false);
  }

  function updateAssessment(index: number, assessmentIndex: number, ref: AssessmentDraft) {
    const assessments = components[index]!.assessments.map((current, i) =>
      i === assessmentIndex ? ref : current,
    );
    updateComponent(index, { assessments });
  }

  async function onSave() {
    setSaved(false);
    if (!termId || !subjectId) {
      setError('Select a term in the topbar and a subject.');
      return;
    }
    if (busy || map.isError) return;
    if (total !== 100) {
      setError(`Weights must total 100% (currently ${totalLabel}%).`);
      return;
    }
    for (const [index, component] of components.entries()) {
      if (!component.label.trim() || component.label.trim().length > 80) {
        setError(`Component ${index + 1}: enter a label of 1–80 characters.`);
        return;
      }
      if (
        !Number.isFinite(component.weight_pct) ||
        component.weight_pct < 0 ||
        component.weight_pct > 100
      ) {
        setError(`Component ${index + 1}: weight must be between 0% and 100%.`);
        return;
      }
      if (
        !component.assessments.length ||
        component.assessments.some((ref) =>
          'assessment_name' in ref ? !ref.assessment_name.trim() : !ref.exam_id,
        )
      ) {
        setError(`Component ${index + 1}: select an exam or enter an assessment name.`);
        return;
      }
    }
    setError(null);
    try {
      await save.mutateAsync({
        term_id: termId,
        subject_id: subjectId,
        class_id: classId || null,
        credits_override:
          map.data?.creditsOverride != null ? Number(map.data.creditsOverride) : null,
        components: components.map((component) => ({
          ...component,
          label: component.label.trim(),
          assessments: component.assessments.map((ref) =>
            'assessment_name' in ref ? { assessment_name: ref.assessment_name.trim() } : ref,
          ),
        })),
        version,
      });
      setSaved(true);
    } catch (err) {
      setError(formatPortalError(err));
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-4 shadow-sm">
      <h2 className="font-semibold text-text-primary">Subject weight map</h2>
      <p className="mt-1 text-sm text-text-muted">
        Set how much each assessment contributes to this subject’s term result. Weights must total
        100% before marks can be released.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        For example: coursework 40% + final exam 60%. Use a class override only when that class
        needs different weights.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="min-w-0">
          <Label htmlFor="weight-map-subject">Subject</Label>
          <Select
            id="weight-map-subject"
            value={subjectId}
            disabled={save.isPending}
            onChange={(e) => setSubjectId(e.target.value)}
            options={[
              { value: '', label: 'Select subject' },
              ...(subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor="weight-map-class">Class override (optional)</Label>
          <Select
            id="weight-map-class"
            value={classId}
            disabled={save.isPending}
            onChange={(e) => setClassId(e.target.value)}
            options={[
              { value: '', label: 'Subject default (all classes)' },
              ...(classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <p
          role="status"
          className={`flex h-input items-center rounded-lg px-3 text-sm font-semibold tabular-nums ${total === 100 ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}
        >
          Total: {totalLabel}% / 100%
        </p>
      </div>

      <p className="mt-2 text-xs text-text-muted">
        {classId
          ? 'This map applies only to the selected class.'
          : 'This subject default applies to classes without an override.'}{' '}
        Assessment names must match the names entered in Gradebook.
      </p>
      {!termId ? (
        <p className="mt-2 text-sm text-warning">
          Select a term in the topbar to load or save a weight map.
        </p>
      ) : null}
      {map.isError ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          Could not load this weight map.{' '}
          <Button size="sm" variant="ghost" onClick={() => void map.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}

      {map.isFetching ? (
        <Skeleton className="mt-4 h-28" />
      ) : (
        <fieldset disabled={save.isPending || map.isError} className="mt-4 min-w-0 space-y-3">
          <legend className="sr-only">Assessment components</legend>
          {components.map((component, index) => (
            <div
              key={component.key}
              className="rounded-lg border border-border bg-surface p-3 sm:p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Component {index + 1}</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={components.length <= 1 || save.isPending}
                  aria-label={`Remove component ${index + 1}`}
                  onClick={() => {
                    setComponents((rows) => rows.filter((_, i) => i !== index));
                    setSaved(false);
                  }}
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="min-w-0">
                  <Label htmlFor={`${fieldPrefix}-label-${index}`}>Component label</Label>
                  <Input
                    id={`${fieldPrefix}-label-${index}`}
                    value={component.label}
                    maxLength={80}
                    onChange={(e) => updateComponent(index, { label: e.target.value })}
                    placeholder="e.g. Coursework"
                  />
                </div>
                <div className="min-w-0">
                  <Label htmlFor={`${fieldPrefix}-percent-${index}`}>Weight (%)</Label>
                  <Input
                    id={`${fieldPrefix}-percent-${index}`}
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={component.weight_pct}
                    onChange={(e) => updateComponent(index, { weight_pct: Number(e.target.value) })}
                    className="tabular-nums"
                  />
                </div>
                {component.assessments.map((assessment, assessmentIndex) => {
                  const byExam = 'exam_id' in assessment;
                  const fieldId = `${fieldPrefix}-assessment-${index}-${assessmentIndex}`;
                  return (
                    <div key={fieldId} className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2">
                      <div className="min-w-0">
                        <Label htmlFor={`${fieldId}-mode`}>
                          Match assessment
                          {component.assessments.length > 1 ? ` ${assessmentIndex + 1}` : ''}
                        </Label>
                        <Select
                          id={`${fieldId}-mode`}
                          value={byExam ? 'exam' : 'name'}
                          disabled={save.isPending || map.isError}
                          onChange={(e) =>
                            updateAssessment(
                              index,
                              assessmentIndex,
                              e.target.value === 'exam' ? { exam_id: '' } : { assessment_name: '' },
                            )
                          }
                          options={[
                            { value: 'name', label: 'By assessment name' },
                            { value: 'exam', label: 'By exam' },
                          ]}
                        />
                      </div>
                      <div className="min-w-0">
                        <Label htmlFor={fieldId}>{byExam ? 'Exam' : 'Assessment name'}</Label>
                        {byExam ? (
                          <Select
                            id={fieldId}
                            value={assessment.exam_id ?? ''}
                            disabled={save.isPending || map.isError}
                            onChange={(e) =>
                              updateAssessment(index, assessmentIndex, { exam_id: e.target.value })
                            }
                            placeholder="Select exam"
                            options={(exams?.items ?? []).map((exam) => ({
                              value: exam.id,
                              label: exam.name,
                            }))}
                          />
                        ) : (
                          <Input
                            id={fieldId}
                            value={'assessment_name' in assessment ? assessment.assessment_name : ''}
                            onChange={(e) =>
                              updateAssessment(index, assessmentIndex, {
                                assessment_name: e.target.value,
                              })
                            }
                            placeholder="e.g. Midterm"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || map.isError}
          onClick={() => {
            setComponents((rows) => [...rows, EMPTY_COMPONENT()]);
            setSaved(false);
          }}
        >
          Add component
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          loading={save.isPending}
          disabled={busy || map.isError || !subjectId || !termId}
        >
          Save weight map
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mt-3 text-sm text-success">
          Weight map saved.
        </p>
      ) : null}
    </section>
  );
}
