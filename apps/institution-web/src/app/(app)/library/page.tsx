'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { BookLoansPanel } from '@/components/library/book-loans-panel';
import { useLibraryList, useLibraryMutations } from '@/lib/library';
import type { LibraryBookRow } from '@/lib/library-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'library.view',
  create: 'library.manage',
  update: 'library.manage',
  delete: 'library.manage',
};

const BOOK_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'archived', label: 'Archived' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function LibraryPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Things Fall Apart' },
      { name: 'author', label: 'Author', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'isbn', label: 'ISBN', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'category', label: 'Category', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'publisher', label: 'Publisher', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'totalCopies', label: 'Total copies', type: 'number', required: true, min: 0 },
      { name: 'status', label: 'Status', type: 'select', required: true, options: BOOK_STATUSES },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<LibraryBookRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'author', header: 'Author', render: (r) => r.author ?? '—' },
      { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
      { key: 'totalCopies', header: 'Copies', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.totalCopies}</span> },
      { key: 'availableCopies', header: 'Available', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.availableCopies}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(BOOK_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<LibraryBookRow>
      resource="library/books"
      title="Library"
      noun="book"
      columns={columns}
      fields={fields}
      defaultSortBy="title"
      permissions={PERMISSIONS}
      useList={useLibraryList}
      useMutations={useLibraryMutations}
      rowLabel={(r) => r.title}
      renderDetailExtra={({ row }) => (
        <BookLoansPanel
          bookId={row.id}
          title={row.title}
          totalCopies={row.totalCopies}
          availableCopies={row.availableCopies}
          activeLoans={row.activeLoans}
        />
      )}
      toFormValues={(r) => ({
        title: r.title,
        author: r.author ?? '',
        isbn: r.isbn ?? '',
        category: r.category ?? '',
        publisher: r.publisher ?? '',
        totalCopies: r.totalCopies,
        status: r.status,
        description: r.description ?? '',
      })}
    />
  );
}
