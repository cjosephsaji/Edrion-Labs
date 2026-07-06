'use client';
import { useMemo } from 'react';
import { Button, StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ReportCardEntriesPanel } from '@/components/report-cards/report-card-entries-panel';
import { useClassOptions } from '@/lib/academics';
import { usePeopleList, type StudentRow } from '@/lib/people';
import { usePermissions } from '@/lib/permissions';
import {
  usePublishReportCard,
  useReportCardsList,
  useReportCardsMutations,
  useSubmitReportCardReview,
} from '@/lib/report-cards';
import type { ReportCardRow } from '@/lib/report-cards-types';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'report_cards.view',
  create: 'report_cards.manage',
  update: 'report_cards.impossible',
  delete: 'report_cards.impossible',
};

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'published', label: 'Published' },
];

const KINDS = [
  { value: 'structured', label: 'Structured' },
  { value: 'uploaded_pdf', label: 'Uploaded PDF' },
];

const ROSTER_PARAMS = { page: 1, pageSize: 200, sortDir: 'asc' as const, sortBy: 'lastName' };

export default function ReportCardsPage() {
  const { t } = useTerm();
  const { can } = usePermissions();
  const { data: classes } = useClassOptions();
  const { data: students } = usePeopleList<StudentRow>('students', ROSTER_PARAMS);
  const submitReview = useSubmitReportCardReview();
  const publish = usePublishReportCard();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'termLabel', label: `${t('term')} label`, type: 'text', required: true, placeholder: 'e.g. Term 1 2026' },
      {
        name: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: KINDS,
      },
      {
        name: 'studentId',
        label: t('student'),
        type: 'select',
        nullable: true,
        options: (students?.items ?? []).map((s) => ({
          value: s.id,
          label: `${s.firstName} ${s.lastName}`,
        })),
      },
      {
        name: 'classId',
        label: `${t('class')} (bulk create)`,
        type: 'select',
        nullable: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
    ],
    [classes, students, t],
  );

  const columns = useMemo<Column<ReportCardRow>[]>(
    () => [
      { key: 'termLabel', header: t('term'), sortable: true, render: (r) => <span className="font-medium">{r.termLabel}</span> },
      { key: 'kind', header: 'Kind', render: (r) => <span className="text-text-secondary">{r.kind.replace('_', ' ')}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
      { key: 'gpa', header: 'GPA', align: 'right', render: (r) => <span className="tabular-nums">{r.gpa ?? '—'}</span> },
    ],
    [t],
  );

  return (
    <ResourceManager<ReportCardRow>
      resource="report-cards"
      title="Report cards"
      noun="report card"
      columns={columns}
      fields={fields}
      defaultSortBy="termLabel"
      permissions={PERMISSIONS}
      useList={useReportCardsList}
      useMutations={useReportCardsMutations}
      filters={[{ key: 'status', label: 'All statuses', options: STATUSES }]}
      rowLabel={(r) => r.termLabel}
      detailActions={({ row }) => (
        <>
          {row.status === 'draft' && can('report_cards.manage') && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void submitReview.mutateAsync(row.id)}
              disabled={submitReview.isPending}
            >
              Submit for review
            </Button>
          )}
          {row.status === 'in_review' && can('report_cards.publish') && (
            <Button
              size="sm"
              onClick={() => void publish.mutateAsync(row.id)}
              disabled={publish.isPending}
            >
              Publish
            </Button>
          )}
        </>
      )}
      renderDetailExtra={({ row }) => <ReportCardEntriesPanel card={row} />}
      toFormValues={() => ({
        termLabel: '',
        kind: 'structured',
        studentId: '',
        classId: '',
      })}
    />
  );
}
