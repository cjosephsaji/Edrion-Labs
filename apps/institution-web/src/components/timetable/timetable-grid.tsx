'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Settings2, Trash2 } from 'lucide-react';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Input,
  Label,
  PermissionDenied,
  Select,
  Skeleton,
  useToast,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { ResourceForm, type FieldDef } from '@/components/academics/resource-form';
import {
  useAcademicYearOptions,
  useClassOptions,
  useSubjectOptions,
} from '@/lib/academics';
import { useAcademicContext, useAcademicContextFilters } from '@/lib/academic-context';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import { useScope } from '@/lib/scope';
import { useTerm } from '@/lib/term';
import {
  DAY_LABEL,
  DAY_OPTIONS,
  DEFAULT_GRID_CONFIG,
  KIND_OPTIONS,
  TIME_OPTIONS,
  adjustEndForStart,
  buildSlotMap,
  endTimeOptionsAfter,
  formatSlotLabel,
  formatTimeRange12,
  isBandPeriod,
  isSchedulablePeriod,
  nextPeriodId,
  normalizeGridConfig,
  parseClockTime,
  periodRowLabel,
  slotsToPeriodSkeleton,
  sortPeriods,
  type TimetableGridConfig,
  type TimetablePeriod,
  useTimetableGridConfig,
} from '@/lib/timetable-grid';
import { useTimetableList, useTimetableMutations, type TimetableSlotRow } from '@/lib/timetable';
import type { Paged } from '@/lib/timetable-types';

const PERMISSIONS = {
  view: 'timetable.view',
  create: 'timetable.manage',
  update: 'timetable.manage',
  delete: 'timetable.manage',
};

const HEADER_CELL = 'border border-primary-hover bg-primary px-3 py-2.5 font-semibold text-white';
const TIME_CELL =
  'sticky left-0 z-10 border border-primary-hover bg-primary px-3 py-2 text-xs font-medium text-white';
const SPAN_CELL = 'border border-primary-hover bg-primary px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-white';

interface CellTarget {
  dayOfWeek: number;
  period: TimetablePeriod;
}

export function TimetableGrid() {
  const { t } = useTerm();
  const { can } = usePermissions();
  const { say } = useToast();
  const client = usePortalClient();
  const { scope } = useScope();
  const { academicYearLabel } = useAcademicContext();
  const facets = useProgrammeFacetFilters();
  const contextFilters = useAcademicContextFilters();
  const { data: classes } = useClassOptions(facets.classFilters);
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeachingStaffOptions();
  const { data: years } = useAcademicYearOptions();

  const [classId, setClassId] = useState('');
  const [copyFromClassId, setCopyFromClassId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftConfig, setDraftConfig] = useState<TimetableGridConfig>(DEFAULT_GRID_CONFIG);
  const [cellTarget, setCellTarget] = useState<CellTarget | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimetableSlotRow | null>(null);
  const [deletingSlot, setDeletingSlot] = useState<TimetableSlotRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);

  const listParams = useMemo(
    () => ({
      page: 1,
      pageSize: 100,
      sortBy: 'startTime',
      sortDir: 'asc' as const,
      filters: {
        ...contextFilters,
        ...(classId ? { classId } : {}),
        ...(facets.showFacets ? facets.filterValues : {}),
      },
    }),
    [classId, contextFilters, facets.filterValues, facets.showFacets],
  );

  const { data, isLoading, isError } = useTimetableList<TimetableSlotRow>('timetable', listParams);
  const { create, update, remove } = useTimetableMutations('timetable');
  const slots = useMemo(() => data?.items ?? [], [data?.items]);
  const { config, saveConfig } = useTimetableGridConfig(classId, slots);
  const slotMap = useMemo(() => buildSlotMap(slots), [slots]);

  const canManage = can(PERMISSIONS.create);
  const classOptions = useMemo(
    () =>
      (classes?.items ?? []).map((c) => {
        const lineage = [c.departmentName, c.gradeLevelName].filter(Boolean).join(' · ');
        const section = c.section?.trim();
        const name = section && !c.name.includes(section) ? `${c.name} (${section})` : c.name;
        return {
          value: c.id,
          label: lineage ? `${lineage} · ${name}` : name,
        };
      }),
    [classes],
  );

  const copyFromOptions = useMemo(
    () => classOptions.filter((o) => o.value !== classId),
    [classOptions, classId],
  );

  useEffect(() => {
    if (!classId) return;
    if (!(classes?.items ?? []).some((c) => c.id === classId)) setClassId('');
  }, [classId, classes?.items]);

  const selectedClass = (classes?.items ?? []).find((c) => c.id === classId);
  const selectedClassName = selectedClass?.name;

  async function onCopyPeriodsFrom(sourceClassId: string) {
    if (!sourceClassId || !classId) return;
    try {
      const sp = new URLSearchParams({
        page: '1',
        pageSize: '100',
        sortBy: 'startTime',
        sortDir: 'asc',
        classId: sourceClassId,
      });
      const result = await client.get<Paged<TimetableSlotRow>>(`/portal/timetable?${sp}`, scope);
      const skeleton = slotsToPeriodSkeleton(result.items ?? []);
      if (skeleton.length === 0) {
        say('That class has no timetable periods to copy');
        return;
      }
      setDraftConfig(
        normalizeGridConfig({
          days: DEFAULT_GRID_CONFIG.days,
          periods: skeleton,
        }),
      );
      setSettingsOpen(true);
      setCopyFromClassId('');
      say('Period skeleton loaded — fill teachers/subjects and save');
    } catch (err) {
      say(formatPortalError(err));
    }
  }

  const slotFields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'subjectId',
        label: t('subject'),
        type: 'select',
        nullable: true,
        options: (subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: 'teacherId',
        label: t('teacher'),
        type: 'select',
        nullable: true,
        options: teachingStaffSelectOptions(teachers),
      },
      { name: 'room', label: 'Room', type: 'text', nullable: true, placeholder: 'Optional' },
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'select',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      ...(facets.showFacets
        ? [
            {
              name: 'termId',
              label: t('term'),
              type: 'select' as const,
              nullable: true,
              options: facets.termOptions,
            },
          ]
        : []),
    ],
    [subjects, teachers, years, facets.showFacets, facets.termOptions, t],
  );

  function openSettings() {
    setDraftConfig(config);
    setSettingsOpen(true);
  }

  async function saveSettings() {
    setSavingLayout(true);
    try {
      await saveConfig({ ...draftConfig, periods: sortPeriods(draftConfig.periods) }, slots);
      setSettingsOpen(false);
      say('Timetable layout saved');
    } catch (err) {
      say(formatPortalError(err));
    } finally {
      setSavingLayout(false);
    }
  }

  function onCellClick(dayOfWeek: number, period: TimetablePeriod) {
    if (!canManage || !isSchedulablePeriod(period) || !classId) return;
    const existing = slotMap.get(`${dayOfWeek}:${period.startTime}`);
    setFormError(null);
    setCellTarget({ dayOfWeek, period });
    setEditingSlot(existing ?? null);
  }

  async function onSaveSlot(body: Record<string, unknown>) {
    if (!cellTarget || !classId) return;
    setFormError(null);
    const payload = {
      ...body,
      classId,
      dayOfWeek: cellTarget.dayOfWeek,
      startTime: cellTarget.period.startTime,
      endTime: cellTarget.period.endTime,
      kind: 'teaching',
      label: cellTarget.period.label ?? null,
    };
    try {
      if (editingSlot) {
        await update.mutateAsync({ id: editingSlot.id, body: { ...payload, version: editingSlot.version } });
      } else {
        await create.mutateAsync(payload);
      }
      setCellTarget(null);
      setEditingSlot(null);
    } catch (err) {
      setFormError(formatPortalError(err));
    }
  }

  async function onDeleteSlot() {
    if (!deletingSlot) return;
    try {
      await remove.mutateAsync({ id: deletingSlot.id, version: deletingSlot.version });
      setDeletingSlot(null);
      setCellTarget(null);
      setEditingSlot(null);
    } catch (err) {
      setFormError(formatPortalError(err));
    }
  }

  const slotFormValues = useMemo(() => {
    if (!cellTarget) return {};
    return {
      subjectId: editingSlot?.subjectId ?? '',
      teacherId: editingSlot?.teacherId ?? '',
      room: editingSlot?.room ?? '',
      academicYearId: editingSlot?.academicYearId ?? contextFilters.academicYearId ?? '',
      termId: editingSlot?.termId ?? contextFilters.termId ?? '',
    };
  }, [cellTarget, editingSlot, contextFilters]);

  if (!can(PERMISSIONS.view)) {
    return (
      <>
        <Topbar title="Timetable" />
        <div className="p-6">
          <PermissionDenied description="You don't have permission to view the timetable." />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Timetable"
        actions={
          canManage && classId ? (
            <Button variant="secondary" size="sm" onClick={openSettings}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Configure grid
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <Label htmlFor="timetable-class">{t('class')}</Label>
            <Select
              id="timetable-class"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              options={classOptions}
              placeholder={`Select ${t('class').toLowerCase()}`}
            />
          </div>
          {classId && canManage ? (
            <div className="min-w-[14rem] flex-1">
              <Label htmlFor="timetable-copy-from">Copy periods from</Label>
              <div className="flex gap-2">
                <Select
                  id="timetable-copy-from"
                  value={copyFromClassId}
                  onChange={(e) => setCopyFromClassId(e.target.value)}
                  options={copyFromOptions}
                  placeholder="Select class"
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!copyFromClassId}
                  onClick={() => void onCopyPeriodsFrom(copyFromClassId)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
          {facets.showFacets &&
            facets.filters.map((f) => (
              <div key={f.key} className="min-w-[12rem]">
                <Label>{f.label}</Label>
                <Select
                  value={facets.filterValues[f.key as keyof typeof facets.filterValues] ?? ''}
                  onChange={(e) => facets.onFilterChange(f.key, e.target.value)}
                  options={f.options}
                  placeholder={f.label}
                />
              </div>
            ))}
        </div>

        {classId && (
          <p className="text-sm text-text-muted">
            Each class defines its own period times.
            {selectedClassName ? (
              <>
                {' '}
                Currently viewing{' '}
                <span className="font-medium text-text-secondary">{selectedClassName}</span>
                {contextFilters.academicYearId ? (
                  <>
                    {' '}
                    · <span className="font-medium text-text-secondary">{academicYearLabel}</span>
                  </>
                ) : null}
              </>
            ) : null}
            . Use Configure grid to add or edit period rows, or copy the time skeleton from another class.
          </p>
        )}

        {!classId ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-elevated px-6 py-16 text-center">
            <p className="text-sm text-text-muted">
              Select a {t('class').toLowerCase()} to view and edit its weekly timetable grid.
            </p>
          </div>
        ) : isLoading ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : isError ? (
          <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            Could not load timetable slots. Please try again.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface-elevated shadow-sm">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`sticky left-0 z-10 w-28 text-left ${HEADER_CELL}`}>Time</th>
                  {config.days.map((day) => (
                    <th key={day} className={`min-w-[9rem] text-center ${HEADER_CELL}`}>
                      {DAY_LABEL[day] ?? day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {config.periods.map((period) => {
                  if (isBandPeriod(period)) {
                    return (
                      <tr key={period.id}>
                        <td className={TIME_CELL}>
                          <ClockTimeLabel time={period.startTime} />
                        </td>
                        <td colSpan={config.days.length} className={SPAN_CELL}>
                          {periodRowLabel(period)}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={period.id}>
                      <td className={TIME_CELL}>
                        <ClockTimeLabel time={period.startTime} />
                      </td>
                      {config.days.map((day) => {
                        const slot = slotMap.get(`${day}:${period.startTime}`);
                        const clickable = canManage && !!classId;
                        return (
                          <td key={day} className="border border-border bg-surface p-0">
                            <button
                              type="button"
                              disabled={!clickable}
                              onClick={() => onCellClick(day, period)}
                              className={
                                'flex min-h-[3.25rem] w-full flex-col items-center justify-center px-2 py-2 text-center transition-colors ' +
                                (clickable
                                  ? 'cursor-pointer hover:bg-primary-soft/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset'
                                  : 'cursor-default')
                              }
                            >
                              {slot ? (
                                <span className="text-xs leading-snug text-text-primary">{formatSlotLabel(slot)}</span>
                              ) : clickable ? (
                                <span className="text-xs text-text-muted">+ Add</span>
                              ) : (
                                <span className="text-xs text-text-muted">—</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Configure timetable grid" className="max-w-3xl">
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex-1 overflow-y-auto p-5">
            <p className="mb-4 text-sm text-text-muted">
              Adjust which days appear as columns and define period rows for{' '}
              <span className="font-medium text-text-secondary">{selectedClassName ?? t('class').toLowerCase()}</span>
              {contextFilters.academicYearId ? (
                <>
                  {' '}
                  in <span className="font-medium text-text-secondary">{academicYearLabel}</span>
                </>
              ) : null}
              . Break and lunch rows span all day columns; teaching rows are filled per cell.
            </p>
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">Days (columns)</h3>
                <div className="flex flex-wrap gap-3">
                  {DAY_OPTIONS.map((day) => {
                    const dayNum = Number(day.value);
                    const checked = draftConfig.days.includes(dayNum);
                    return (
                      <label key={day.value} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onChange={(e) => {
                            setDraftConfig((prev) => ({
                              ...prev,
                              days: e.target.checked
                                ? [...prev.days, dayNum].sort((a, b) => a - b)
                                : prev.days.filter((d) => d !== dayNum),
                            }));
                          }}
                        />
                        {day.label}
                      </label>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">Periods (rows)</h3>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        periods: [
                          ...prev.periods,
                          {
                            id: nextPeriodId(),
                            startTime: '08:00',
                            endTime: '08:45',
                            kind: 'teaching',
                          },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add row
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {draftConfig.periods.map((period, index) => (
                    <PeriodRowEditor
                      key={period.id}
                      period={period}
                      onChange={(next) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          periods: prev.periods.map((p, i) => (i === index ? next : p)),
                        }))
                      }
                      onRemove={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          periods: prev.periods.filter((_, i) => i !== index),
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <Button variant="secondary" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveSettings()} disabled={savingLayout}>
              {savingLayout ? 'Saving…' : 'Save layout'}
            </Button>
          </div>
        </div>
      </Dialog>

      <ResourceForm
        open={!!cellTarget}
        onClose={() => {
          setCellTarget(null);
          setEditingSlot(null);
          setFormError(null);
        }}
        title={editingSlot ? 'Edit timetable slot' : 'Add timetable slot'}
        description={
          cellTarget
            ? `${DAY_LABEL[cellTarget.dayOfWeek]} · ${formatTimeRange12(cellTarget.period.startTime, cellTarget.period.endTime)}`
            : undefined
        }
        fields={slotFields}
        initial={slotFormValues}
        error={formError}
        submitting={create.isPending || update.isPending}
        onSubmit={onSaveSlot}
        drawerClassName="max-w-md"
        extra={
          editingSlot && canManage ? (
            <Button
              type="button"
              variant="danger"
              className="w-full"
              onClick={() => setDeletingSlot(editingSlot)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Remove slot
            </Button>
          ) : undefined
        }
      />

      <ConfirmDialog
        open={!!deletingSlot}
        onClose={() => setDeletingSlot(null)}
        title="Remove timetable slot"
        description={
          deletingSlot
            ? `Remove ${DAY_LABEL[deletingSlot.dayOfWeek]} ${formatTimeRange12(deletingSlot.startTime, deletingSlot.endTime)}?`
            : ''
        }
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={onDeleteSlot}
      />
    </>
  );
}

function ClockTimeLabel({ time }: { time: string }) {
  const { clock, period } = parseClockTime(time);
  return (
    <span className="inline-grid w-[4.85rem] grid-cols-[1fr_1.4rem] items-baseline tabular-nums leading-none">
      <span className="pr-1 text-right">{clock}</span>
      <span className="text-left">{period}</span>
    </span>
  );
}

function PeriodRowEditor({
  period,
  onChange,
  onRemove,
}: {
  period: TimetablePeriod;
  onChange: (period: TimetablePeriod) => void;
  onRemove: () => void;
}) {
  const endOptions = endTimeOptionsAfter(period.startTime);
  const isBand = isBandPeriod(period);

  return (
    <div
      className={
        isBand
          ? 'grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2'
          : 'grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2'
      }
    >
      <div>
        <Label className="text-xs">Start</Label>
        <Select
          value={period.startTime}
          options={TIME_OPTIONS}
          searchPlaceholder="Search time…"
          onChange={(e) => {
            const startTime = e.target.value;
            const endTime = adjustEndForStart(startTime, period.startTime, period.endTime);
            onChange({ ...period, startTime, endTime });
          }}
        />
      </div>
      <div>
        <Label className="text-xs">End</Label>
        <Select
          value={period.endTime}
          options={endOptions.length > 0 ? endOptions : TIME_OPTIONS}
          searchPlaceholder="Search time…"
          onChange={(e) => onChange({ ...period, endTime: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Kind</Label>
        <Select
          value={period.kind}
          searchPlaceholder="Search kind…"
          onChange={(e) => {
            const kind = e.target.value as TimetablePeriod['kind'];
            onChange({
              ...period,
              kind,
              label: isBandPeriod({ ...period, kind }) ? period.label : undefined,
            });
          }}
          options={KIND_OPTIONS}
        />
      </div>
      {isBand ? (
        <div>
          <Label className="text-xs">Row label</Label>
          <Input
            value={period.label ?? ''}
            onChange={(e) => onChange({ ...period, label: e.target.value })}
            placeholder={period.kind === 'lunch' ? 'Lunch' : 'Break'}
          />
        </div>
      ) : null}
      <Button type="button" variant="ghost" size="icon" aria-label="Remove period" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-danger" />
      </Button>
    </div>
  );
}
