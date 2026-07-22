'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@edrion/ui';
import { useAcademicContext } from '@/lib/academic-context';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useExamOptions } from '@/lib/exams';
import { useWeightMap, useWeightMapMutation, type WeightMapRow } from '@/lib/grading';
import { formatPortalError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';

type ComponentDraft = WeightMapRow['components'][number];

const EMPTY_COMPONENT = (): ComponentDraft => ({
  key: `c${Date.now()}`,
  label: 'Component',
  weight_pct: 0,
  assessments: [{ assessment_name: 'Assessment' }],
  aggregation: 'sum',
});

export function WeightMapEditor() {
  const { can } = usePermissions();
  const { termId } = useAcademicContext();
  const { data: subjects } = useSubjectOptions();
  const { data: classes } = useClassOptions();
  const { data: exams } = useExamOptions();

  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [components, setComponents] = useState<ComponentDraft[]>([EMPTY_COMPONENT()]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const map = useWeightMap(subjectId || undefined, termId || undefined, classId || null);
  const save = useWeightMapMutation();

  useEffect(() => {
    if (!map.data) return;
    setComponents(map.data.components);
    setVersion(map.data.version);
  }, [map.data]);

  const total = useMemo(() => components.reduce((sum, c) => sum + c.weight_pct, 0), [components]);

  if (!can('gradebook.manage')) return null;

  async function onSave() {
    if (!termId || !subjectId) {
      setError('Select term (topbar) and subject.');
      return;
    }
    if (total !== 100) {
      setError(`Weights must sum to 100 (currently ${total}).`);
      return;
    }
    setError(null);
    try {
      await save.mutateAsync({
        term_id: termId,
        subject_id: subjectId,
        class_id: classId || null,
        components,
        version,
      });
    } catch (err) {
      setError(formatPortalError(err));
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-surface-elevated p-4 shadow-sm">
      <h2 className="mb-1 font-semibold text-text-primary">Subject weight map</h2>
      <p className="mb-4 text-xs text-text-muted">Components must total 100%. Required before mark release.</p>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium">
          Subject
          <select className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Select</option>
            {(subjects?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium">
          Class override (optional)
          <select className="mt-1 w-full rounded-lg border px-2 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Institution default</option>
            {(classes?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <p className={`text-sm font-medium ${total === 100 ? 'text-success' : 'text-warning'}`}>Total: {total}%</p>
        </div>
      </div>

      <div className="space-y-3">
        {components.map((component, index) => (
          <div key={component.key} className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-4">
            <input
              className="rounded border px-2 py-1 text-sm"
              value={component.label}
              onChange={(e) => setComponents((rows) => rows.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))}
              placeholder="Label"
            />
            <input
              type="number"
              className="rounded border px-2 py-1 text-sm"
              value={component.weight_pct}
              onChange={(e) => setComponents((rows) => rows.map((r, i) => (i === index ? { ...r, weight_pct: Number(e.target.value) } : r)))}
              placeholder="Weight %"
            />
            <select
              className="rounded border px-2 py-1 text-sm"
              value={'exam_id' in (component.assessments[0] ?? {}) ? 'exam' : 'name'}
              onChange={(e) => {
                const mode = e.target.value;
                setComponents((rows) =>
                  rows.map((r, i) =>
                    i === index
                      ? {
                          ...r,
                          assessments:
                            mode === 'exam'
                              ? [{ exam_id: exams?.items[0]?.id ?? '' }]
                              : [{ assessment_name: r.label }],
                        }
                      : r,
                  ),
                );
              }}
            >
              <option value="name">By assessment name</option>
              <option value="exam">By exam</option>
            </select>
            {('exam_id' in (component.assessments[0] ?? {})) ? (
              <select
                className="rounded border px-2 py-1 text-sm"
                value={(component.assessments[0] as { exam_id?: string })?.exam_id ?? ''}
                onChange={(e) =>
                  setComponents((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, assessments: [{ exam_id: e.target.value }] } : r)),
                  )
                }
              >
                <option value="">Exam</option>
                {(exams?.items ?? []).map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
              </select>
            ) : (
              <input
                className="rounded border px-2 py-1 text-sm"
                value={(component.assessments[0] as { assessment_name?: string })?.assessment_name ?? ''}
                onChange={(e) =>
                  setComponents((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, assessments: [{ assessment_name: e.target.value }] } : r)),
                  )
                }
                placeholder="Assessment name"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setComponents((rows) => [...rows, EMPTY_COMPONENT()])}>
          Add component
        </Button>
        <Button type="button" size="sm" onClick={onSave} disabled={save.isPending}>
          Save weight map
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </section>
  );
}
