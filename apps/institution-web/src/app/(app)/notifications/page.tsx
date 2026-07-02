'use client';
import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useMarkNotificationRead, useNotificationsList, useNotificationsMutations } from '@/lib/announcements';
import type { NotificationRow } from '@/lib/announcements-types';
import { usePermissions } from '@/lib/permissions';

const PERMISSIONS: ResourcePermissions = {
  view: 'announcements.view',
  create: 'announcements.send',
  update: 'announcements.send',
  delete: 'announcements.send',
};

const KINDS = [
  { value: 'system', label: 'System' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'alert', label: 'Alert' },
];
const AUDIENCES = [
  { value: 'all', label: 'Everyone' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'students', label: 'Students' },
  { value: 'parents', label: 'Parents' },
  { value: 'staff', label: 'Staff' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function NotificationsPage() {
  const { can } = usePermissions();
  const canSend = can('announcements.send');
  const markRead = useMarkNotificationRead();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Fee reminder' },
      { name: 'body', label: 'Body', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
      { name: 'audience', label: 'Audience', type: 'select', required: true, options: AUDIENCES },
    ],
    [],
  );

  const columns = useMemo<Column<NotificationRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'kind', header: 'Kind', sortable: true, render: (r) => label(KINDS, r.kind) },
      {
        key: 'recipients',
        header: 'Recipients',
        render: (r) => (
          <span className="text-text-secondary">
            {r.targetSummary ?? label(AUDIENCES, r.audience)}
            {r.recipientCount != null && <span className="text-text-muted"> · {r.recipientCount}</span>}
          </span>
        ),
      },
      { key: 'status', header: 'Status', sortable: true, render: (r) => (r.status === 'read' ? 'Read' : 'Unread') },
    ],
    [],
  );

  return (
    <ResourceManager<NotificationRow>
      resource="notifications"
      title="Notifications"
      noun="notification"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useNotificationsList}
      useMutations={useNotificationsMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        body: r.body ?? '',
        kind: r.kind,
        audience: r.audience,
      })}
      extraActions={(row) =>
        canSend && row.status !== 'read' ? (
          <button
            type="button"
            aria-label="Mark read"
            title="Mark read"
            onClick={() => markRead.mutate(row.id)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <Check className="h-4 w-4" />
          </button>
        ) : null
      }
    />
  );
}
