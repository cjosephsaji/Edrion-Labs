'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import {
  useAcademicMutations,
  useProgrammeLevelSelectOptions,
  useSubjectPlacements,
} from '@/lib/academics';
import { usePermissions } from '@/lib/permissions';
import { PortalClientError } from '@/lib/portal-client';
import { useTerm } from '@/lib/term';

const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/**
 * Curriculum placements for one subject — where in the programme structure it is actually taught.
 * A subject on its own says nothing about year or semester; this is the panel that answers it.
 */
export function SubjectPlacementsPanel({
  subjectId,
  subjectName,
}: {
  subjectId: string;
  subjectName: string;
}) {
  const { t } = useTerm();
  const { can } = usePermissions();
  const canManage = can('academics.manage');
  const { data, isLoading } = useSubjectPlacements(subjectId);
  const { options: levelOptions } = useProgrammeLevelSelectOptions();
  const mut = useAcademicMutations('programme-subjects');

  const [programmeLevelId, setProgrammeLevelId] = useState('');
  const [semesterSequence, setSemesterSequence] = useState('1');
  const [credits, setCredits] = useState('');
  const [isElective, setIsElective] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placements = data?.items ?? [];

  async function add() {
    if (!programmeLevelId) return;
    setError(null);
    try {
      await mut.create.mutateAsync({
        subjectId,
        programmeLevelId,
        semesterSequence: Number(semesterSequence),
        credits: credits === '' ? null : Number(credits),
        isElective,
      });
      setProgrammeLevelId('');
      setSemesterSequence('1');
      setCredits('');
      setIsElective(false);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add the placement.');
    }
  }

  async function drop(id: string, version: number) {
    setError(null);
    try {
      await mut.remove.mutateAsync({ id, version });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the placement.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Taught in</h3>
      <p className="text-xs text-text-muted">
        Which {t('term').toLowerCase()} of which {t('department').toLowerCase()} {subjectName} is
        part of. This is the curriculum, so it carries over to every intake.
      </p>

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <Select
            value={programmeLevelId}
            onChange={(e) => setProgrammeLevelId(e.target.value)}
            placeholder={levelOptions.length ? `${t('department')} and ${t('gradeLevel').toLowerCase()}…` : 'No programme years defined yet'}
            options={levelOptions}
            disabled={levelOptions.length === 0}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t('term')}</Label>
              <Select
                value={semesterSequence}
                onChange={(e) => setSemesterSequence(e.target.value)}
                options={SEMESTER_OPTIONS}
              />
            </div>
            <div>
              <Label>Credits</Label>
              <Input
                type="number"
                min={0}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={isElective}
              onChange={(e) => setIsElective(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Elective in this {t('term').toLowerCase()}
          </label>
          <Button onClick={add} loading={mut.create.isPending} disabled={!programmeLevelId}>
            Add placement
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-md" />
      ) : placements.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">
          Not placed in any {t('department').toLowerCase()} yet — this subject won’t appear in the
          programme structure.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {placements.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {[p.departmentName, p.gradeLevelName].filter(Boolean).join(' · ')}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span>
                    {t('term')} {p.semesterSequence}
                  </span>
                  {p.credits != null && <span>· {p.credits} credits</span>}
                  {p.isElective && <Badge tone="neutral">Elective</Badge>}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  aria-label="Remove placement"
                  onClick={() => drop(p.id, p.version)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
