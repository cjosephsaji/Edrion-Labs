'use client';
import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { Badge, type BadgeTone, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useDocumentsList, useDocumentsMutations, type DocumentRow } from '@/lib/documents';

const PERMISSIONS: ResourcePermissions = {
  view: 'documents.view',
  create: 'documents.manage',
  update: 'documents.manage',
  delete: 'documents.manage',
};

const CATEGORIES = [
  { value: 'policy', label: 'Policy' },
  { value: 'handbook', label: 'Handbook' },
  { value: 'form', label: 'Form' },
  { value: 'other', label: 'Other' },
];
const CATEGORY_TONE: Record<string, BadgeTone> = {
  policy: 'info',
  handbook: 'success',
  form: 'warning',
  other: 'neutral',
};
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

export default function DocumentsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Student Code of Conduct' },
      { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
      { name: 'url', label: 'Document link', type: 'text', required: true, placeholder: 'https://…', help: 'External https link. File uploads arrive in a later release.' },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true },
      { name: 'requiresAck', label: 'Requires acknowledgement', type: 'checkbox', help: 'Flag documents staff must acknowledge (tracking arrives later).' },
      { name: 'published', label: 'Published (visible to staff)', type: 'checkbox' },
    ],
    [],
  );

  const columns = useMemo<Column<DocumentRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      {
        key: 'category',
        header: 'Category',
        sortable: true,
        render: (r) => <Badge tone={CATEGORY_TONE[r.category] ?? 'neutral'}>{CATEGORY_LABEL[r.category] ?? r.category}</Badge>,
      },
      {
        key: 'url',
        header: 'Link',
        render: (r) => (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ),
      },
      {
        key: 'published',
        header: 'Status',
        render: (r) => (
          <Badge tone={r.published ? 'success' : 'neutral'}>{r.published ? 'Published' : 'Draft'}</Badge>
        ),
      },
    ],
    [],
  );

  return (
    <ResourceManager<DocumentRow>
      resource="documents"
      title="Documents & Policies"
      noun="document"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useDocumentsList}
      useMutations={useDocumentsMutations}
      rowLabel={(r) => r.title}
      filters={[
        { key: 'category', label: 'All categories', options: CATEGORIES },
        {
          key: 'published',
          label: 'All statuses',
          options: [
            { value: 'true', label: 'Published' },
            { value: 'false', label: 'Draft' },
          ],
        },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        category: r.category,
        url: r.url,
        description: r.description ?? '',
        requiresAck: r.requiresAck,
        published: r.published,
      })}
    />
  );
}
