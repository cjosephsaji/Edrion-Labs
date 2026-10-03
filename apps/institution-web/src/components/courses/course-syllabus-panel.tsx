'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label, Skeleton } from '@edrion/ui';
import { useCourseSyllabus, useUpsertSyllabus } from '@/lib/courses';
import type { CourseRow, SyllabusModuleRow } from '@/lib/courses-types';
import { PortalClientError } from '@/lib/portal-client';

const emptyModule = (): SyllabusModuleRow => ({
  weekNo: 1,
  title: '',
  topics: [],
  covered: false,
});

export function CourseSyllabusPanel({ course }: { course: CourseRow }) {
  const { data: syllabus, isLoading } = useCourseSyllabus(course.id);
  const existing = syllabus?.modules;
  const curriculum = syllabus?.curriculum;
  const upsert = useUpsertSyllabus(course.id);
  const [modules, setModules] = useState<SyllabusModuleRow[]>([emptyModule()]);
  const [topicsText, setTopicsText] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setModules([emptyModule()]);
    setTopicsText({});
  }, [course.id]);

  useEffect(() => {
    if (loaded || isLoading || !existing) return;
    if (existing.length > 0) {
      setModules(existing);
      setTopicsText(Object.fromEntries(existing.map((m, idx) => [idx, m.topics.join(', ')])));
    }
    setLoaded(true);
  }, [existing, isLoading, loaded]);

  function update(idx: number, patch: Partial<SyllabusModuleRow>) {
    setModules((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }

  async function save() {
    setError(null);
    setSaved(false);
    try {
      const payload = modules
        .filter((m) => m.title.trim())
        .map((m, idx) => ({
          weekNo: m.weekNo,
          title: m.title.trim(),
          topics: (topicsText[idx] ?? '').split(',').map((t) => t.trim()).filter(Boolean),
          covered: m.covered,
        }));
      await upsert.mutateAsync({ modules: payload });
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save syllabus.');
    }
  }

  if (isLoading && !loaded) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">Syllabus</h3>
        <p className="text-xs text-text-muted">{course.code} · {course.name}</p>
      </div>
      {modules.map((m, idx) => (
        <div key={idx} className="rounded-lg border border-border p-3">
          <div className="flex gap-2">
            <div className="w-20">
              <Label className="text-xs">Week</Label>
              <Input
                type="number"
                min={1}
                value={m.weekNo}
                onChange={(e) => update(idx, { weekNo: Number(e.target.value) })}
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Title</Label>
              <Input value={m.title} onChange={(e) => update(idx, { title: e.target.value })} />
            </div>
            {modules.length > 1 && (
              <button
                type="button"
                className="mt-6 text-text-muted hover:text-danger"
                onClick={() => setModules((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-2">
            <Label className="text-xs">Topics (comma-separated)</Label>
            <Input
              value={topicsText[idx] ?? m.topics.join(', ')}
              onChange={(e) => setTopicsText((prev) => ({ ...prev, [idx]: e.target.value }))}
              placeholder="Topic A, Topic B"
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setModules((prev) => [...prev, { ...emptyModule(), weekNo: prev.length + 1 }])}>
          <Plus className="h-4 w-4" />
          Add week
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={upsert.isPending}>
          Save syllabus
        </Button>
      </div>
      {saved && <p className="text-xs text-success">Syllabus saved.</p>}
      {curriculum ? <details className="rounded-lg border border-border p-3 text-sm">
        <summary>Standard alignment · revision {curriculum.revision}</summary>
        <p>These mappings describe the course plan. They do not show what a learner has demonstrated.</p>
        {curriculum.status !== 'ready' ? <p>{curriculum.status === 'unmapped' ? 'No objective-to-standard mappings have been published.' :
          curriculum.status === 'stale' ? 'The syllabus or subject changed. Review and republish the mappings before using them.' : 'This mapping version cannot be read. Existing syllabus topics remain available.'}</p> : <>
          {curriculum.data.alignments.map((alignment) => {
            const objective = curriculum.data.objectives.find((o) => o.id === alignment.objective.id);
            const standard = curriculum.data.items.find((i) => i.id === alignment.standard.id);
            return <div key={alignment.id} className="mt-3">
              <strong>{objective?.descriptor}</strong>
              <p>{standard?.externalId}: {standard?.descriptor}</p>
              <p>{alignment.state.replace(/_/g, ' ')} · {alignment.relation.replace(/_/g, ' ')} · confidence {alignment.confidence ?? 'unknown'}</p>
              <p>{alignment.rationale}</p>
              {alignment.gaps.length ? <p>Gaps: {alignment.gaps.join('; ')}</p> : null}
              {alignment.overrideReason ? <p>Override: {alignment.overrideReason}</p> : null}
              <p>Source: {standard?.provenance.sourceRef}</p>
            </div>;
          })}
          <p>{curriculum.data.unmappedObjectives.length} objectives have no current approved alignment.</p>
        </>}
        {syllabus?.history.length ? <details><summary>Recent mapping revisions</summary><ol>
          {syllabus.history.map((entry) => <li key={entry.revision}>Revision {entry.revision}: {entry.reason} · {entry.recordedAt}</li>)}
        </ol></details> : null}
      </details> : null}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
