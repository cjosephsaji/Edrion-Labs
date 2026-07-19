'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Input, Label, Select } from '@edrion/ui';
import {
  STRUCTURE_PRESETS,
  TERM_SYSTEMS,
  generateStructure,
  type GeneratedStructure,
  type SlotOverride,
  type TermSystem,
} from '@edrion/shared-types';
import { useCommitProgrammeStructure } from '@/lib/academics';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import { useTerm } from '@/lib/term';

const TERM_SYSTEM_LABELS: Record<TermSystem, string> = {
  annual: 'Yearly',
  semester: 'Semesters',
  trimester: 'Trimesters',
  quarter: 'Quarters',
  modular: 'No fixed terms',
  custom: 'Custom',
  term: 'Terms',
};

interface ProgrammeBuilderProps {
  departmentId?: string;
  onCreated?: (departmentId: string) => void;
  onCommitted?: (detail: import('@/lib/academics').ProgrammeStructureDetail) => void;
  canManage?: boolean;
  /** When set, creates the department first then commits structure. */
  createDepartment?: (input: {
    name: string;
    code?: string;
    headUserId?: string | null;
    termSystem: TermSystem;
    durationMonths?: number | null;
    termsPerYear?: number;
  }) => Promise<{ id: string }>;
}

export function ProgrammeBuilder({
  departmentId: initialDeptId,
  onCreated,
  onCommitted,
  canManage = true,
  createDepartment,
}: ProgrammeBuilderProps) {
  const { t, tp } = useTerm();
  const commit = useCommitProgrammeStructure();
  const { data: teachers } = useTeachingStaffOptions();
  const teacherOptions = teachingStaffSelectOptions(teachers);

  const [departmentId, setDepartmentId] = useState(initialDeptId ?? '');
  const [name, setName] = useState('');
  const [headUserId, setHeadUserId] = useState('');
  const [presetId, setPresetId] = useState('btech');
  const [termSystem, setTermSystem] = useState<TermSystem>('semester');
  const [durationYears, setDurationYears] = useState('4');
  const [termsPerYear, setTermsPerYear] = useState('2');
  const [gradeCount, setGradeCount] = useState('12');
  const [grid, setGrid] = useState<GeneratedStructure | null>(null);
  const [overrides, setOverrides] = useState<SlotOverride[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function resetForAnother() {
    setDepartmentId('');
    setName('');
    setHeadUserId('');
    setOverrides([]);
    setPresetId('btech');
    setTermSystem('semester');
    setDurationYears('4');
    setTermsPerYear('2');
    setGradeCount('12');
    setError(null);
  }

  const preset = STRUCTURE_PRESETS.find((p) => p.id === presetId);

  useEffect(() => {
    if (!preset) return;
    setTermSystem(preset.termSystem);
    if (preset.durationMonths != null) setDurationYears(String(preset.durationMonths / 12));
    if (preset.gradeCount != null) setGradeCount(String(preset.gradeCount));
    if (preset.termsPerYear != null) setTermsPerYear(String(preset.termsPerYear));
  }, [preset]);

  const previewInput = useMemo(() => {
    const durationMonths =
      termSystem === 'term'
        ? null
        : termSystem === 'modular' && preset?.durationMonths == null
          ? null
          : Math.round(Number(durationYears || '0') * 12) || preset?.durationMonths || null;

    return {
      termSystem,
      durationMonths,
      termsPerYear: termSystem === 'custom' ? Number(termsPerYear) || 2 : undefined,
      gradeCount: termSystem === 'term' ? Number(gradeCount) || 12 : undefined,
      preset: preset?.preset ?? (presetId === 'mbbs' || presetId === 'bds' ? presetId : undefined),
      overrides,
    };
  }, [termSystem, durationYears, termsPerYear, gradeCount, preset, presetId, overrides]);

  useEffect(() => {
    setGrid(generateStructure(previewInput));
  }, [previewInput]);

  function renameSlot(levelSequence: number, sequenceInYear: number, newName: string) {
    setOverrides((prev) => {
      const rest = prev.filter(
        (o) => !(o.levelSequence === levelSequence && o.sequenceInYear === sequenceInYear),
      );
      return [...rest, { levelSequence, sequenceInYear, name: newName }];
    });
  }

  async function handleCommit() {
    if (!grid) return;
    setError(null);
    setSuccess(null);
    const programmeName = name.trim();
    try {
      let deptId = departmentId;
      if (!deptId && createDepartment) {
        const created = await createDepartment({
          name: programmeName,
          headUserId: headUserId || null,
          termSystem,
          durationMonths: previewInput.durationMonths,
          termsPerYear: Number(termsPerYear) || (termSystem === 'semester' ? 2 : 3),
        });
        deptId = created.id;
        onCreated?.(deptId);
      }
      if (!deptId) {
        setError('Enter a programme name first.');
        return;
      }
      const result = await commit.mutateAsync({
        departmentId: deptId,
        body: {
          termSystem,
          durationMonths: previewInput.durationMonths ?? undefined,
          termsPerYear: Number(termsPerYear) || (termSystem === 'semester' ? 2 : 3),
          levels: grid.levels,
          slots: grid.slots,
        },
      });
      onCommitted?.(result);
      setSuccess(`${result.department.name} structure saved.`);
      resetForAnother();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save structure.');
    }
  }

  const slotsByLevel = useMemo(() => {
    const map = new Map<number, GeneratedStructure['slots']>();
    for (const s of grid?.slots ?? []) {
      const list = map.get(s.levelSequence) ?? [];
      list.push(s);
      map.set(s.levelSequence, list);
    }
    return map;
  }, [grid]);

  return (
    <div className="space-y-4">
      <div>
        <Label>{t('department')} name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. MBBS, B.Tech CSE`}
          disabled={!canManage}
        />
      </div>

      <div>
        <Label>{t('department')} head (optional)</Label>
        <Select
          value={headUserId}
          onChange={(e) => setHeadUserId(e.target.value)}
          placeholder="No head assigned"
          options={[{ value: '', label: 'No head assigned' }, ...teacherOptions]}
          disabled={!canManage}
        />
        <p className="mt-1 text-xs text-text-muted">A teaching staff member who leads this {t('department').toLowerCase()}.</p>
      </div>

      <div>
        <Label>Starting template</Label>
        <Select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          options={STRUCTURE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          disabled={!canManage}
        />
      </div>

      <div>
        <Label>How is it split?</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {TERM_SYSTEMS.filter((s) => s !== 'custom').map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={termSystem === s ? 'primary' : 'secondary'}
              onClick={() => setTermSystem(s)}
              disabled={!canManage}
            >
              {TERM_SYSTEM_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>

      {termSystem !== 'term' && termSystem !== 'modular' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>How long? (years)</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={durationYears}
              onChange={(e) => setDurationYears(e.target.value)}
              disabled={!canManage}
            />
          </div>
          {termSystem === 'custom' && (
            <div>
              <Label>Terms per year</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={termsPerYear}
                onChange={(e) => setTermsPerYear(e.target.value)}
                disabled={!canManage}
              />
            </div>
          )}
        </div>
      )}

      {termSystem === 'term' && (
        <div>
          <Label>Number of {tp('gradeLevel').toLowerCase()}</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={gradeCount}
            onChange={(e) => setGradeCount(e.target.value)}
            disabled={!canManage}
          />
        </div>
      )}

      <div className="rounded-lg border border-border bg-background-secondary/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Live preview</p>
        {!grid ? (
          <p className="text-sm text-text-muted">Generating preview…</p>
        ) : grid.slots.length === 0 ? (
          <p className="text-sm text-text-muted">No fixed terms — add modules manually after go-live.</p>
        ) : (
          <ul className="space-y-3">
            {grid.levels.map((level) => (
              <li key={level.sequence}>
                <p className="text-sm font-semibold text-text-primary">
                  {level.name}
                  {level.durationMonths != null && (
                    <span className="ml-2 text-xs font-normal text-text-muted">{level.durationMonths} mo</span>
                  )}
                </p>
                <ul className="mt-1 space-y-1 border-l-2 border-primary/30 pl-3">
                  {(slotsByLevel.get(level.sequence) ?? []).map((slot) => (
                    <li key={`${slot.levelSequence}-${slot.sequenceInYear}`} className="flex items-center gap-2">
                      <Input
                        className="h-8 flex-1 text-sm"
                        value={slot.name}
                        onChange={(e) =>
                          renameSlot(slot.levelSequence, slot.sequenceInYear, e.target.value)
                        }
                        disabled={!canManage}
                      />
                      {slot.durationMonths != null && (
                        <span className="text-xs text-text-muted">{slot.durationMonths} mo</span>
                      )}
                      {slot.isTerminal && (
                        <span className="text-xs text-warning">terminal</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {grid && (
          <p className="mt-4 text-sm text-text-secondary">
            {grid.totals.slots} {tp('term').toLowerCase()} over {grid.totals.years}{' '}
            {tp('gradeLevel').toLowerCase()}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && <p className="text-sm text-success">{success}</p>}

      {canManage && (
        <Button
          onClick={handleCommit}
          loading={commit.isPending}
          disabled={!grid || !name.trim()}
        >
          <Plus className="mr-1 h-4 w-4" /> Add {t('department').toLowerCase()}
        </Button>
      )}
    </div>
  );
}
