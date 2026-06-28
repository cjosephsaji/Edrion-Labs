'use client';
import { useMemo } from 'react';
import { Send } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useAnnouncementsList, useAnnouncementsMutations, usePublishAnnouncement } from '@/lib/announcements';
import type { AnnouncementRow } from '@/lib/announcements-types';
import { usePermissions } from '@/lib/permissions';

const PERMISSIONS: ResourcePermissions = {
  view: 'announcements.view',
  create: 'announcements.send',
  update: 'announcements.send',
  delete: 'announcements.send',
};

const AUDIENCES = [
  { value: 'all', label: 'Everyone' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'students', label: 'Students' },
  { value: 'parents', label: 'Parents' },
  { value: 'staff', label: 'Staff' },
];
const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function AnnouncementsPage() {
  const { can } = usePermissions();
  const canSend = can('announcements.send');
  const publish = usePublishAnnouncement();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Sports day rescheduled' },
      { name: 'referenceCode', label: 'Reference code', type: 'text', required: true, placeholder: 'e.g. ANN-2026-001' },
      { name: 'body', label: 'Body', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'audience', label: 'Audience', type: 'select', required: true, options: AUDIENCES },
      { name: 'category', label: 'Category', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'publishAt', label: 'Publish on', type: 'date', nullable: true },
    ],
    [],
  );

  const columns = useMemo<Column<AnnouncementRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'referenceCode', header: 'Code', sortable: true, render: (r) => <span className="tabular-nums">{r.referenceCode}</span> },
      { key: 'audience', header: 'Audience', render: (r) => label(AUDIENCES, r.audience) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<AnnouncementRow>
      resource="announcements"
      title="Announcements"
      noun="announcement"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useAnnouncementsList}
      useMutations={useAnnouncementsMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        referenceCode: r.referenceCode,
        body: r.body ?? '',
        audience: r.audience,
        category: r.category ?? '',
        status: r.status,
        publishAt: r.publishAt ?? '',
      })}
      extraActions={(row) =>
        canSend && row.status !== 'published' ? (
          <button
            type="button"
            aria-label="Publish"
            title="Publish"
            onClick={() => publish.mutate(row.id)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <Send className="h-4 w-4" />
          </button>
        ) : null
      }
    />
  );
}
