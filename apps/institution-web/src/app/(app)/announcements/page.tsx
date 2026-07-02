'use client';
import { useMemo } from 'react';
import { Send } from 'lucide-react';
import { StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { useAnnouncementsList, useAnnouncementsMutations, usePublishAnnouncement } from '@/lib/announcements';
import type { AnnouncementRow } from '@/lib/announcements-types';
import type { Target } from '@/lib/recipients';
import { usePermissions } from '@/lib/permissions';

const PERMISSIONS: ResourcePermissions = {
  view: 'announcements.view',
  create: 'announcements.send',
  update: 'announcements.send',
  delete: 'announcements.send',
};

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

/** Compact "who it's for" summary from the resolved targets. */
function recipientsSummary(targets: AnnouncementRow['targets']): string {
  if (!targets || targets.length === 0) return 'Not targeted';
  const shown = targets.slice(0, 2).map((t) => t.label);
  const more = targets.length - shown.length;
  return more > 0 ? `${shown.join(', ')} +${more}` : shown.join(', ');
}

export default function AnnouncementsPage() {
  const { can } = usePermissions();
  const canSend = can('announcements.send');
  const publish = usePublishAnnouncement();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Sports day rescheduled' },
      { name: 'referenceCode', label: 'Reference code', type: 'text', required: true, placeholder: 'e.g. ANN-2026-001' },
      { name: 'body', label: 'Body', type: 'textarea', nullable: true, placeholder: 'Optional' },
      {
        name: 'targets',
        label: 'Recipients',
        type: 'custom',
        render: (value, onChange) => (
          <RecipientPicker value={(value as Target[]) ?? []} onChange={(t) => onChange(t)} />
        ),
      },
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
      { key: 'targets', header: 'Recipients', render: (r) => <span className="text-text-secondary">{recipientsSummary(r.targets)}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  const detail = (r: AnnouncementRow): DetailSection[] => [
    {
      title: 'Announcement',
      fields: [
        { label: 'Title', value: r.title },
        { label: 'Code', value: r.referenceCode },
        { label: 'Category', value: r.category },
        { label: 'Status', value: <StatusBadge status={r.status} /> },
        { label: 'Publish on', value: r.publishAt },
        { label: 'Published at', value: r.publishedAt ? r.publishedAt.slice(0, 16).replace('T', ' ') : null },
        { label: 'Body', value: r.body, full: true },
      ],
    },
    {
      title: `Recipients (${r.targets?.length ?? 0})`,
      fields: [
        {
          label: 'Targets',
          full: true,
          value:
            r.targets && r.targets.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {r.targets.map((t, i) => (
                  <span key={i} className="rounded-full bg-background-secondary px-2 py-0.5 text-xs text-text-secondary">
                    {t.label}
                  </span>
                ))}
              </div>
            ) : null,
        },
      ],
    },
  ];

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
      detail={detail}
      toFormValues={(r) => ({
        title: r.title,
        referenceCode: r.referenceCode,
        body: r.body ?? '',
        targets: (r.targets ?? []).map((t) => ({ kind: t.kind, refId: t.refId })),
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
