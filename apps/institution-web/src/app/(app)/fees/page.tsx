'use client';
import { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { InvoicePaymentsDrawer } from '@/components/fees/invoice-payments-drawer';
import { useAcademicYearOptions, useClassOptions, useGradeLevelOptions } from '@/lib/academics';
import { useStudentOptions } from '@/lib/people';
import { useFeesList, useFeesMutations, useFeeStructureOptions } from '@/lib/fees';
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
  const { data: grades } = useGradeLevelOptions();
  const { data: classes } = useClassOptions();
  const { data: years } = useAcademicYearOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1 Tuition' },
      { name: 'feeType', label: 'Type', type: 'select', required: true, options: FEE_TYPES },
      { name: 'amount', label: 'Amount (minor units)', type: 'number', required: true, min: 0 },
      { name: 'frequency', label: 'Frequency', type: 'select', required: true, options: FREQUENCIES },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STRUCTURE_STATUSES },
      {
        name: 'gradeLevelId',
        label: 'Grade',
        type: 'select',
        nullable: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: 'classId',
        label: 'Class',
        type: 'select',
        nullable: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      {
        name: 'academicYearId',
        label: 'Academic year',
        type: 'select',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [grades, classes, years],
  );

  const columns = useMemo<Column<FeeStructureRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'feeType', header: 'Type', sortable: true, render: (r) => <span className="text-text-muted">{label(FEE_TYPES, r.feeType)}</span> },
      { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.amount}</span> },
      { key: 'frequency', header: 'Frequency', render: (r) => label(FREQUENCIES, r.frequency) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STRUCTURE_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<FeeStructureRow>
      resource="fees/structures"
      title="Fees"
      noun="fee structure"
      columns={columns}
      fields={fields}
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
        description: r.description ?? '',
      })}
    />
  );
}

function InvoicesTab() {
  const { data: students } = useStudentOptions();
  const { data: structures } = useFeeStructureOptions();
  const [paymentsFor, setPaymentsFor] = useState<FeeInvoiceRow | null>(null);

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
      { name: 'amount', label: 'Amount (minor units)', type: 'number', required: true, min: 0 },
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
      { key: 'amount', header: 'Billed', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.amount}</span> },
      { key: 'amountPaid', header: 'Paid', align: 'right', render: (r) => <span className="tabular-nums">{r.amountPaid}</span> },
      { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.balance}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(INVOICE_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<FeeInvoiceRow>
        resource="fees/invoices"
        title="Fees"
        noun="invoice"
        columns={columns}
        fields={fields}
        defaultSortBy="createdAt"
        defaultSortDir="desc"
        permissions={PERMISSIONS}
        useList={useFeesList}
        useMutations={useFeesMutations}
        rowLabel={(r) => `Invoice ${r.invoiceNo}`}
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
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Payments"
            title="Payments"
            onClick={() => setPaymentsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <Wallet className="h-4 w-4" />
          </button>
        )}
      />

      <InvoicePaymentsDrawer invoice={paymentsFor} open={!!paymentsFor} onClose={() => setPaymentsFor(null)} />
    </>
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
