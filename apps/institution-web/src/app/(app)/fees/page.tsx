'use client';
import { useMemo, useState } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { InvoicePaymentsPanel } from '@/components/fees/invoice-payments-panel';
import { useAcademicYearOptions, useClassOptions, useGradeLevelOptions } from '@/lib/academics';
import { useStudentOptions } from '@/lib/people';
import { useFeesList, useFeesMutations, useFeeStructureOptions } from '@/lib/fees';
import { useFormat } from '@/lib/format';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useTerm } from '@/lib/term';
import type { FeeInvoiceRow, FeeStructureRow } from '@/lib/fees-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'fees.view',
  create: 'fees.manage',
  update: 'fees.manage',
  delete: 'fees.manage',
};

const FEE_TYPES = [
  { value: 'tuition', label: 'Tuition' },
  { value: 'admission', label: 'Admission' },
  { value: 'transport', label: 'Transport' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'exam', label: 'Exam' },
  { value: 'library', label: 'Library' },
  { value: 'misc', label: 'Misc' },
];
const FREQUENCIES = [
  { value: 'one_time', label: 'One time' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'term', label: 'Term' },
  { value: 'annual', label: 'Annual' },
];
const STRUCTURE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const INVOICE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

function StructuresTab() {
  const fmt = useFormat();
  const { t } = useTerm();
  const facets = useProgrammeFacetFilters();
  const contextFilters = useAcademicContextFilters();
  const [statusFilter, setStatusFilter] = useState('');
  const [feeTypeFilter, setFeeTypeFilter] = useState('');
  const { data: grades } = useGradeLevelOptions();
  const { data: classes } = useClassOptions(facets.classFilters);
  const { data: years } = useAcademicYearOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1 Tuition' },
      { name: 'feeType', label: 'Type', type: 'select', required: true, options: FEE_TYPES },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
      { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: FREQUENCIES },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STRUCTURE_STATUSES },
      {
        name: 'gradeLevelId',
        label: t('gradeLevel'),
        type: 'select',
        nullable: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: 'classId',
        label: t('class'),
        type: 'select',
        nullable: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
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
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [grades, classes, years, facets.showFacets, facets.termOptions, t],
  );

  const toolbarFilters = useMemo<FilterDef[]>(
    () => [
      ...facets.filters,
      { key: 'status', label: 'All statuses', options: STRUCTURE_STATUSES },
      { key: 'feeType', label: 'All types', options: FEE_TYPES },
    ],
    [facets.filters],
  );

  const listFilterValues = useMemo(
    () => ({
      ...facets.filterValues,
      status: statusFilter,
      feeType: feeTypeFilter,
    }),
    [facets.filterValues, statusFilter, feeTypeFilter],
  );

  function onListFilterChange(key: string, value: string) {
    if (key === 'status') setStatusFilter(value);
    else if (key === 'feeType') setFeeTypeFilter(value);
    else facets.onFilterChange(key, value);
  }

  const columns = useMemo<Column<FeeStructureRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'feeType', header: 'Type', sortable: true, render: (r) => <span className="text-text-muted">{label(FEE_TYPES, r.feeType)}</span> },
      { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{fmt.money(r.amount)}</span> },
      { key: 'frequency', header: 'Frequency', render: (r) => label(FREQUENCIES, r.frequency) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STRUCTURE_STATUSES, r.status) },
    ],
    [fmt],
  );

  return (
    <ResourceManager<FeeStructureRow>
      resource="fees/structures"
      title="Fees"
      noun="fee structure"
      columns={columns}
      fields={fields}
      filters={toolbarFilters}
      filterValues={listFilterValues}
      onFilterChange={onListFilterChange}
      extraFilters={contextFilters}
      defaultSortBy="name"
      permissions={PERMISSIONS}
      useList={useFeesList}
      useMutations={useFeesMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({
        name: r.name,
        feeType: r.feeType,
        amount: r.amount,
        frequency: r.frequency,
        status: r.status,
        gradeLevelId: r.gradeLevelId ?? '',
        classId: r.classId ?? '',
        academicYearId: r.academicYearId ?? '',
        termId: r.termId ?? '',
        description: r.description ?? '',
      })}
    />
  );
}

function InvoicesTab() {
  const fmt = useFormat();
  const contextFilters = useAcademicContextFilters();
  const { data: students } = useStudentOptions();
  const { data: structures } = useFeeStructureOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'invoiceNo', label: 'Invoice no.', type: 'text', required: true, placeholder: 'e.g. INV-001' },
      {
        name: 'studentId',
        label: 'Student',
        type: 'select',
        required: true,
        options: (students?.items ?? []).map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} (${s.admissionNo})` })),
      },
      {
        name: 'feeStructureId',
        label: 'Fee structure',
        type: 'select',
        nullable: true,
        options: (structures?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
        help: 'Optional — link the charge to a template.',
      },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
      { name: 'status', label: 'Status', type: 'select', required: true, options: INVOICE_STATUSES },
      { name: 'issueDate', label: 'Issue date', type: 'date', nullable: true },
      { name: 'dueDate', label: 'Due date', type: 'date', nullable: true },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [students, structures],
  );

  const columns = useMemo<Column<FeeInvoiceRow>[]>(
    () => [
      { key: 'invoiceNo', header: 'Invoice', sortable: true, render: (r) => <span className="font-medium">{r.invoiceNo}</span> },
      { key: 'studentName', header: 'Student', render: (r) => r.studentName ?? '—' },
      { key: 'amount', header: 'Billed', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{fmt.money(r.amount)}</span> },
      { key: 'amountPaid', header: 'Paid', align: 'right', render: (r) => <span className="tabular-nums">{fmt.money(r.amountPaid)}</span> },
      { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{fmt.money(r.balance)}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(INVOICE_STATUSES, r.status) },
    ],
    [fmt],
  );

  return (
    <ResourceManager<FeeInvoiceRow>
      resource="fees/invoices"
      title="Fees"
      noun="invoice"
      columns={columns}
      fields={fields}
      extraFilters={contextFilters}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useFeesList}
      useMutations={useFeesMutations}
      rowLabel={(r) => `Invoice ${r.invoiceNo}`}
      renderDetailExtra={({ row }) => (
        <InvoicePaymentsPanel
          invoiceId={row.id}
          invoiceNo={row.invoiceNo}
          amount={row.amount}
          amountPaid={row.amountPaid}
          balance={row.balance}
        />
      )}
      toFormValues={(r) => ({
        invoiceNo: r.invoiceNo,
        studentId: r.studentId,
        feeStructureId: r.feeStructureId ?? '',
        amount: r.amount,
        status: r.status,
        issueDate: r.issueDate ?? '',
        dueDate: r.dueDate ?? '',
        notes: r.notes ?? '',
      })}
    />
  );
}

export default function FeesPage() {
  const [tab, setTab] = useState<'invoices' | 'structures'>('invoices');

  return (
    <>
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        {(['invoices', 'structures'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              'rounded-t-md px-3 py-2 text-sm font-medium capitalize transition-colors ' +
              (tab === t ? 'border-b-2 border-primary text-text-primary' : 'text-text-muted hover:text-text-primary')
            }
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'invoices' ? <InvoicesTab /> : <StructuresTab />}
    </>
  );
}
