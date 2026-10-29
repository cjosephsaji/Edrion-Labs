'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label, Select } from '@edrion/ui';
import { commitStructureSchema } from '@edrion/schemas';
import {
  TERM_SYSTEMS,
  SLOT_KINDS,
  defaultSlotName,
  generateStructure,
  normalizeStructure,
  slotKindForSystem,
  termsPerYearForSystem,
  type GeneratedStructure,
  type InstitutionType,
  type PlannedSlot,
  type TermSystem,
} from '@edrion/shared-types';
import { useCommitProgrammeStructure, type ProgrammeStructureDetail } from '@/lib/academics';
import { useAcademicStructureTerms } from '@/lib/academic-structure-terms';

const TERM_SYSTEM_LABELS: Record<TermSystem, string> = {
  annual: 'Yearly',
  semester: 'Semesters',
  trimester: 'Trimesters',
  quarter: 'Quarters',
  modular: 'Modules',
  custom: 'Custom',
  term: 'Terms',
};
const SLOT_KIND_LABELS = {
  term: 'Term',
  semester: 'Semester',
  trimester: 'Trimester',
  quarter: 'Quarter',
  phase: 'Phase',
  module: 'Module',
};

function initialStructure(type: InstitutionType) {
  const termSystem: TermSystem =
    type === 'school' ? 'term' : type === 'training_center' ? 'modular' : 'semester';
  return {
    termSystem,
    grid: generateStructure({
      termSystem,
      durationMonths: type === 'school' ? null : type === 'training_center' ? 6 : 36,
      gradeCount: type === 'school' ? 1 : undefined,
    }),
  };
}

function slotsForLevel(termSystem: TermSystem, levelSequence: number): PlannedSlot[] {
  return Array.from({ length: termsPerYearForSystem(termSystem) }, (_, index) => ({
    levelSequence,
    sequenceInYear: index + 1,
    absoluteSequence: index + 1,
    name: defaultSlotName(termSystem, index + 1),
    kind: slotKindForSystem(termSystem),
    durationMonths: null,
    isTerminal: false,
  }));
}

function savedStructure(detail: ProgrammeStructureDetail): GeneratedStructure {
  return normalizeStructure(
    detail.levels.map((level) => ({
      id: level.id,
      sequence: level.sequence,
      name: level.name,
      durationMonths: level.durationLabel ? Number.parseInt(level.durationLabel, 10) || null : null,
    })),
    detail.levels.flatMap((level) =>
      level.slots.map((slot) => ({
        id: slot.id,
        levelSequence: level.sequence,
        sequenceInYear: slot.sequenceInYear,
        absoluteSequence: slot.absoluteSequence,
        name: slot.name,
        kind: slot.kind as PlannedSlot['kind'],
        durationMonths: slot.durationMonths,
        isTerminal: slot.isTerminal,
      })),
    ),
  );
}

interface ProgrammeBuilderProps {
  initialStructureDetail?: ProgrammeStructureDetail;
  onCancel?: () => void;
  departmentId?: string;
  onCreated?: (departmentId: string) => void;
  onCommitted?: (detail: import('@/lib/academics').ProgrammeStructureDetail) => void;
  onDraftChange?: (hasDraft: boolean) => void;
  canManage?: boolean;
  createDepartment?: (input: {
    name: string;
    unitKind: 'programme';
    termSystem: TermSystem;
    durationMonths?: number | null;
    termsPerYear?: number;
  }) => Promise<{ id: string }>;
}

export function ProgrammeBuilder({
  initialStructureDetail,
  onCancel,
  departmentId: initialDeptId,
  onCreated,
  onCommitted,
  onDraftChange,
  canManage = true,
  createDepartment,
}: ProgrammeBuilderProps) {
  const { t, tp, type } = useAcademicStructureTerms();
  const commit = useCommitProgrammeStructure();
  const [departmentId, setDepartmentId] = useState(
    initialStructureDetail?.department.id ?? initialDeptId ?? '',
  );
  const [name, setName] = useState(initialStructureDetail?.department.name ?? '');
  const [termSystem, setTermSystem] = useState<TermSystem>(() =>
    initialStructureDetail
      ? (initialStructureDetail.department.termSystem as TermSystem)
      : initialStructure(type).termSystem,
  );
  const [grid, setGrid] = useState<GeneratedStructure>(() =>
    initialStructureDetail ? savedStructure(initialStructureDetail) : initialStructure(type).grid,
  );
  const [hasDraft, setHasDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const editable = canManage && !saving && !initialStructureDetail?.department.structureLocked;

  useEffect(() => {
    onDraftChange?.(hasDraft);
  }, [hasDraft, onDraftChange]);

  function editGrid(update: (current: GeneratedStructure) => GeneratedStructure) {
    setGrid(update);
    setHasDraft(true);
    setSuccess(null);
  }

  function changeTermSystem(next: TermSystem) {
    setTermSystem(next);
    editGrid((current) =>
      normalizeStructure(
        current.levels,
        current.levels.flatMap((level) => slotsForLevel(next, level.sequence)),
      ),
    );
  }

  function editSlot(levelSequence: number, sequenceInYear: number, update: Partial<PlannedSlot>) {
    editGrid((current) =>
      normalizeStructure(
        current.levels,
        current.slots.map((slot) =>
          slot.levelSequence === levelSequence && slot.sequenceInYear === sequenceInYear
            ? { ...slot, ...update }
            : slot,
        ),
      ),
    );
  }

  function addSlot(levelSequence: number) {
    editGrid((current) => {
      const sequenceInYear =
        current.slots.filter((slot) => slot.levelSequence === levelSequence).length + 1;
      return normalizeStructure(current.levels, [
        ...current.slots,
        {
          levelSequence,
          sequenceInYear,
          absoluteSequence: current.slots.length + 1,
          name: defaultSlotName(termSystem, sequenceInYear),
          kind: slotKindForSystem(termSystem),
          durationMonths: null,
          isTerminal: false,
        },
      ]);
    });
  }

  function addLevel() {
    editGrid((current) => {
      const sequence = current.levels.length + 1;
      return normalizeStructure(
        [
          ...current.levels,
          {
            sequence,
            name: t('gradeLevel') + ' ' + sequence,
            durationMonths: type === 'school' ? null : 12,
          },
        ],
        [...current.slots, ...slotsForLevel(termSystem, sequence)],
      );
    });
  }

  async function handleCommit() {
    setError(null);
    setSuccess(null);
    if (
      grid.levels.some((level) => !grid.slots.some((slot) => slot.levelSequence === level.sequence))
    ) {
      setError('Add at least one term or module to each ' + t('gradeLevel').toLowerCase() + '.');
      return;
    }
    const durationMonths = grid.levels.every((level) => level.durationMonths != null)
      ? grid.levels.reduce((total, level) => total + (level.durationMonths ?? 0), 0)
      : null;
    const termsPerYear = Math.max(
      ...grid.levels.map(
        (level) => grid.slots.filter((slot) => slot.levelSequence === level.sequence).length,
      ),
    );
    const validated = commitStructureSchema.safeParse({
      name: name.trim(),
      version: initialStructureDetail?.department.version,
      termSystem,
      durationMonths,
      termsPerYear,
      levels: grid.levels,
      slots: grid.slots,
    });
    if (!validated.success) {
      setError(
        validated.error.issues[0]?.message ?? 'Check the names and durations in the preview.',
      );
      return;
    }
    setSaving(true);
    try {
      let deptId = departmentId;
      if (!deptId && createDepartment) {
        const created = await createDepartment({
          name: name.trim(),
          unitKind: 'programme',
          termSystem,
          durationMonths,
          termsPerYear,
        });
        deptId = created.id;
        // A failed structure save can retry without creating a duplicate department.
        setDepartmentId(deptId);
        onCreated?.(deptId);
      }
      if (!deptId) {
        setError('Enter a ' + t('department').toLowerCase() + ' name first.');
        return;
      }
      const result = await commit.mutateAsync({ departmentId: deptId, body: validated.data });
      onCommitted?.(result);
      setSuccess(result.department.name + ' structure saved.');
      if (initialStructureDetail) {
        setHasDraft(false);
        return;
      }
      const defaults = initialStructure(type);
      setDepartmentId(initialDeptId ?? '');
      setName('');
      setTermSystem(defaults.termSystem);
      setGrid(defaults.grid);
      setHasDraft(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save structure.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {initialStructureDetail?.department.structureLocked && (
        <p role="status" className="text-sm text-text-secondary">
          This structure is locked because students are enrolled.
        </p>
      )}
      {type === 'school' && (
        <p className="text-sm text-text-secondary">
          Create a course or stream, add the grades it offers (for example Grade X and Grade XI),
          then assign required and elective subjects in Curriculum.
        </p>
      )}
      <div>
        <Label htmlFor="programme-name">{t('department')} name</Label>
        <Input
          id="programme-name"
          value={name}
          maxLength={160}
          onChange={(e) => {
            setName(e.target.value);
            setHasDraft(true);
            setSuccess(null);
          }}
          placeholder={
            type === 'school'
              ? 'e.g. Computer Mathematics, Science, Commerce'
              : type === 'training_center'
                ? 'e.g. Web development'
                : 'e.g. BSc Computer Science'
          }
          disabled={!editable}
        />
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-background-secondary/40 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Live preview
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Add, edit, or remove {tp('gradeLevel').toLowerCase()} and their terms here before
            saving.
          </p>
        </div>
        <div>
          <Label>Academic calendar</Label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TERM_SYSTEMS.filter((system) => system !== 'custom').map((system) => (
              <Button
                key={system}
                type="button"
                size="sm"
                variant={termSystem === system ? 'primary' : 'secondary'}
                onClick={() => changeTermSystem(system)}
                disabled={!editable || system === termSystem}
              >
                {TERM_SYSTEM_LABELS[system]}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Choosing a calendar rebuilds its default terms. You can customise each row below.
          </p>
        </div>
        <ul className="space-y-4">
          {grid.levels.map((level) => {
            const slots = grid.slots.filter((slot) => slot.levelSequence === level.sequence);
            return (
              <li key={level.sequence} className="rounded-md border border-border bg-surface p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1">
                    <Label htmlFor={'level-name-' + level.sequence}>{t('gradeLevel')} name</Label>
                    <Input
                      id={'level-name-' + level.sequence}
                      value={level.name}
                      maxLength={160}
                      disabled={!editable}
                      onChange={(e) =>
                        editGrid((current) =>
                          normalizeStructure(
                            current.levels.map((item) =>
                              item.sequence === level.sequence
                                ? { ...item, name: e.target.value }
                                : item,
                            ),
                            current.slots,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="w-36">
                    <Label htmlFor={'level-duration-' + level.sequence}>Months (optional)</Label>
                    <Input
                      id={'level-duration-' + level.sequence}
                      type="number"
                      min={1}
                      max={120}
                      value={level.durationMonths ?? ''}
                      disabled={!editable}
                      onChange={(e) =>
                        editGrid((current) =>
                          normalizeStructure(
                            current.levels.map((item) =>
                              item.sequence === level.sequence
                                ? {
                                    ...item,
                                    durationMonths:
                                      e.target.value === '' ? null : Number(e.target.value),
                                  }
                                : item,
                            ),
                            current.slots,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={'Remove ' + level.name}
                    disabled={!editable || grid.levels.length === 1}
                    onClick={() =>
                      editGrid((current) =>
                        normalizeStructure(
                          current.levels.filter((item) => item.sequence !== level.sequence),
                          current.slots,
                        ),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <ul className="mt-3 space-y-3 border-l-2 border-primary/30 pl-3">
                  {slots.map((slot) => {
                    const key = slot.levelSequence + '-' + slot.sequenceInYear;
                    return (
                      <li key={key} className="flex flex-wrap items-end gap-2">
                        <div className="min-w-36 flex-1">
                          <Label htmlFor={'slot-name-' + key}>Name</Label>
                          <Input
                            id={'slot-name-' + key}
                            value={slot.name}
                            maxLength={160}
                            disabled={!editable}
                            onChange={(e) =>
                              editSlot(level.sequence, slot.sequenceInYear, {
                                name: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="w-36">
                          <Label htmlFor={'slot-kind-' + key}>Type</Label>
                          <Select
                            id={'slot-kind-' + key}
                            value={slot.kind}
                            options={SLOT_KINDS.map((kind) => ({
                              value: kind,
                              label: SLOT_KIND_LABELS[kind],
                            }))}
                            disabled={!editable}
                            onChange={(e) =>
                              editSlot(level.sequence, slot.sequenceInYear, {
                                kind: e.target.value as PlannedSlot['kind'],
                              })
                            }
                          />
                        </div>
                        <div className="w-36">
                          <Label htmlFor={'slot-duration-' + key}>Months (optional)</Label>
                          <Input
                            id={'slot-duration-' + key}
                            type="number"
                            min={1}
                            max={120}
                            value={slot.durationMonths ?? ''}
                            disabled={!editable}
                            onChange={(e) =>
                              editSlot(level.sequence, slot.sequenceInYear, {
                                durationMonths:
                                  e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={'Remove ' + slot.name + ' from ' + level.name}
                          disabled={!editable}
                          onClick={() =>
                            editGrid((current) =>
                              normalizeStructure(
                                current.levels,
                                current.slots.filter(
                                  (item) =>
                                    !(
                                      item.levelSequence === level.sequence &&
                                      item.sequenceInYear === slot.sequenceInYear
                                    ),
                                ),
                              ),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  className="mt-3"
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!editable || slots.length >= 12 || grid.slots.length >= 200}
                  onClick={() => addSlot(level.sequence)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add{' '}
                  {SLOT_KIND_LABELS[slotKindForSystem(termSystem)].toLowerCase()}
                </Button>
              </li>
            );
          })}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={
            !editable ||
            grid.levels.length >= 20 ||
            grid.slots.length + termsPerYearForSystem(termSystem) > 200
          }
          onClick={addLevel}
        >
          <Plus className="mr-1 h-4 w-4" /> Add {t('gradeLevel').toLowerCase()}
        </Button>
        <p className="text-sm text-text-secondary">
          {grid.totals.slots} terms over {grid.totals.years} {tp('gradeLevel').toLowerCase()}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-success">
          {success}
        </p>
      )}
      {canManage && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleCommit}
            loading={saving}
            disabled={!editable || !name.trim() || grid.slots.length === 0}
          >
            {initialStructureDetail ? (
              'Save changes'
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" /> Add {t('department').toLowerCase()}
              </>
            )}
          </Button>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
