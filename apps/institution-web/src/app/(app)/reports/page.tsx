'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ReportRunsPanel } from '@/components/reports/report-runs-panel';
import { useReportsList, useReportsMutations } from '@/lib/reports';
import type { ReportDefinitionRow } from '@/lib/reports-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'reports.view',
  create: 'reports.export',
  update: 'reports.export',
  delete: 'reports.export',
};

const TYPES = [
  { value: 'attendance', label: 'Attendance' },
  { value: 'fees', label: 'Fees' },
  { value: 'admissions', label: 'Admissions' },
  { value: 'exams', label: 'Exams' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'custom', label: 'Custom' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function ReportsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term attendance summary' },
      { name: 'referenceCode', label: 'Reference code', type: 'text', required: true, placeholder: 'e.g. RPT-2026-001' },
      { name: 'reportType', label: 'Type', type: 'select', required: true, options: TYPES },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'config', label: 'Config (JSON)', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<ReportDefinitionRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'referenceCode', header: 'Code', sortable: true, render: (r) => <span className="tabular-nums">{r.referenceCode}</span> },
      { key: 'reportType', header: 'Type', sortable: true, render: (r) => label(TYPES, r.reportType) },
      { key: 'runCount', header: 'Exports', align: 'right', render: (r) => <span className="tabular-nums">{r.runCount}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<ReportDefinitionRow>
      resource="reports"
      title="Reports"
      noun="report"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useReportsList}
      useMutations={useReportsMutations}
      rowLabel={(r) => r.name}
      renderDetailExtra={({ row }) => <ReportRunsPanel reportId={row.id} reportName={row.name} />}
      toFormValues={(r) => ({
        name: r.name,
        referenceCode: r.referenceCode,
        reportType: r.reportType,
        description: r.description ?? '',
        config: r.config ?? '',
        status: r.status,
      })}
    />
  );
}
