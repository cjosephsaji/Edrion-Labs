'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFormat } from '@/lib/format';
import { useExpensesList, useExpensesMutations, type ExpenseRow } from '@/lib/expenses';

const PERMISSIONS: ResourcePermissions = {
  view: 'expenses.view',
  create: 'expenses.manage',
  update: 'expenses.manage',
  delete: 'expenses.manage',
};

const CATEGORIES = [
  { value: 'salaries', label: 'Salaries' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'rent', label: 'Rent' },
  { value: 'transport', label: 'Transport' },
  { value: 'events', label: 'Events' },
  { value: 'misc', label: 'Misc' },
];
const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];
const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function ExpensesPage() {
  const fmt = useFormat();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. August electricity' },
      { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 },
      { name: 'vendor', label: 'Vendor / payee', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'method', label: 'Payment method', type: 'select', required: true, options: METHODS },
      { name: 'reference', label: 'Reference / bill no.', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'expenseDate', label: 'Date', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<ExpenseRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'category', header: 'Category', sortable: true, render: (r) => <span className="text-text-muted">{label(CATEGORIES, r.category)}</span> },
      { key: 'vendor', header: 'Vendor', render: (r) => r.vendor ?? '—' },
      { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => <span className="tabular-nums font-medium">{fmt.money(r.amount)}</span> },
      { key: 'expenseDate', header: 'Date', sortable: true, render: (r) => fmt.date(r.expenseDate) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [fmt],
  );

  return (
    <ResourceManager<ExpenseRow>
      resource="expenses"
      title="Expenses"
      noun="expense"
      columns={columns}
      fields={fields}
      defaultSortBy="expenseDate"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useExpensesList}
      useMutations={useExpensesMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        category: r.category,
        amount: r.amount,
        vendor: r.vendor ?? '',
        method: r.method,
        reference: r.reference ?? '',
        expenseDate: r.expenseDate ?? '',
        status: r.status,
        notes: r.notes ?? '',
      })}
    />
  );
}
