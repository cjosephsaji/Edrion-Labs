'use client';
import { useMemo } from 'react';
import { Badge, type Column, type DetailSection } from '@edrion/ui';
import { SUBJECT_KIND_OPTIONS, subjectKindLabel, type SubjectKind } from '@edrion/schemas';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import { ProgrammeSlotFields } from '@/components/academics/programme-slot-fields';
import { SubjectPlacementsPanel } from '@/components/academics/subject-placements-panel';
import type { FieldDef } from '@/components/academics/resource-form';
import {
  placementTermLabel,
  useAcademicMutations,
  useDepartmentOptions,
  useProgrammeLevelSelectOptions,
  type SubjectRow,
} from '@/lib/academics';
import { useTerm } from '@/lib/term';

const SEMESTER_FILTER_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function subjectKindBadgeTone(kind: SubjectKind): 'info' | 'neutral' | 'warning' | 'success' {
  switch (kind) {
    case 'elective':
      return 'neutral';
    case 'honor':
      return 'warning';
    case 'minor':
      return 'success';
    default:
      return 'info';
  }
}

export default function SubjectsPage() {
  const { t, tp } = useTerm();
  const { data } = useDepartmentOptions();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();
  const curriculumMut = useAcademicMutations('programme-subjects');

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        key: 'kind',
        label: 'All types',
        options: SUBJECT_KIND_OPTIONS,
      },
      {
        key: 'departmentId',
        label: `All ${tp('department')}`,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
      {
        key: 'programmeLevelId',
        label: `All ${tp('gradeLevel')}`,
        options: levelOptions,
      },
      {
        key: 'semesterSequence',
        label: `All ${tp('term')}`,
        options: SEMESTER_FILTER_OPTIONS.map((o) => ({
          value: o.value,
          label: `${t('term')} ${o.label}`,
        })),
      },
    ],
    [data, levelOptions, t, tp],
  );

  const columns: Column<SubjectRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.code}</span> },
      {
        key: 'kind',
        header: 'Type',
        sortable: true,
        render: (r) => (
          <span className="flex flex-wrap items-center gap-1">
            <Badge tone={subjectKindBadgeTone(r.kind)}>{subjectKindLabel(r.kind)}</Badge>
            {r.isLabSubject && <Badge tone="info">Lab</Badge>}
          </span>
        ),
      },
      {
        key: 'placements',
        header: 'Taught in',
        render: (r) => {
          const placements = r.placements ?? [];
          if (placements.length === 0) {
            return <span className="text-xs text-text-muted">Not placed</span>;
          }
          const shown = placements.slice(0, 2);
          return (
            <span className="flex flex-wrap items-center gap-1">
              {shown.map((p) => (
                <Badge key={p.id} tone="neutral">
                  {[p.departmentName, p.gradeLevelName].filter(Boolean).join(' · ')} ·{' '}
                  {placementTermLabel(p, t('term'))}
                </Badge>
              ))}
              {placements.length > shown.length && (
                <span className="text-xs text-text-muted">+{placements.length - shown.length}</span>
              )}
            </span>
          );
        },
      },
      { key: 'departmentName', header: `Owning ${t('department')}`, render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
      { key: 'classCount', header: 'Classes', align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? '—'}</span> },
    ],
    [t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Discrete Mathematics' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. MATH-DM' },
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        required: true,
        options: SUBJECT_KIND_OPTIONS,
      },
      {
        name: 'departmentId',
        label: `Owning ${t('department')}`,
        type: 'select',
        nullable: true,
        options: (data?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
        help: `Who owns the subject. You can also place it in a programme year and ${t('term').toLowerCase()} below.`,
      },
      {
        name: 'isLabSubject',
        label: 'Lab subject',
        type: 'checkbox',
        help: 'When scheduled on the timetable, this subject is automatically added to the lab schedule.',
      },
    ],
    [data, t],
  );

  const detail = useMemo(
    () =>
      (r: SubjectRow): DetailSection[] => [
        {
          title: 'Overview',
          fields: [
            { label: 'Name', value: r.name },
            { label: 'Code', value: r.code },
            { label: 'Type', value: subjectKindLabel(r.kind) },
            { label: 'Lab subject', value: r.isLabSubject ? 'Yes' : 'No' },
            { label: `Owning ${t('department').toLowerCase()}`, value: r.departmentName ?? '—' },
            { label: 'Classes teaching it', value: r.classCount ?? 0 },
          ],
        },
      ],
    [t],
  );

  return (
    <ResourceManager<SubjectRow>
      resource="subjects"
      title={tp('subject')}
      noun={t('subject').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      detail={detail}
      renderCreateExtra={({ setSubmitPayload }) => (
        <ProgrammeSlotFields setSubmitPayload={setSubmitPayload} />
      )}
      onSubmitCreate={async (body, { create }) => {
        const {
          placementProgrammeLevelId,
          placementSlotId,
          placementCredits,
          placementIsElective,
          ...subjectBody
        } = body;
        const subject = (await create.mutateAsync(subjectBody)) as { id: string };
        if (
          typeof placementProgrammeLevelId === 'string' &&
          placementProgrammeLevelId &&
          typeof placementSlotId === 'string' &&
          placementSlotId
        ) {
          await curriculumMut.create.mutateAsync({
            subjectId: subject.id,
            programmeLevelId: placementProgrammeLevelId,
            slotId: placementSlotId,
            credits: typeof placementCredits === 'number' ? placementCredits : null,
            isElective: placementIsElective === true,
          });
        }
      }}
      renderFormExtra={({ row }) => (
        <SubjectPlacementsPanel subjectId={row.id} subjectName={row.name} />
      )}
      renderDetailExtra={({ row }) => (
        <SubjectPlacementsPanel subjectId={row.id} subjectName={row.name} />
      )}
      toFormValues={(r) => ({ name: r.name, code: r.code, kind: r.kind, isLabSubject: r.isLabSubject, departmentId: r.departmentId ?? '' })}
    />
  );
}
