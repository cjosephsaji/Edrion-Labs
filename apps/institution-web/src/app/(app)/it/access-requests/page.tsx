'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useItList, useItMutations } from '@/lib/staff-modules';
import type { AccessRequestRow } from '@/lib/staff-modules-types';

const KEY = 'access_requests.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'closed', label: 'Closed' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function AccessRequestsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'requesterName', label: 'Requester', type: 'text', required: true, placeholder: 'e.g. Jane Doe' },
      { name: 'system', label: 'System', type: 'text', nullable: true, placeholder: 'e.g. Wi-Fi, LMS' },
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES },
      { name: 'reason', label: 'Reason', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<AccessRequestRow>[]>(
    () => [
      { key: 'requesterName', header: 'Requester', sortable: true, render: (r) => <span className="font-medium">{r.requesterName}</span> },
      { key: 'system', header: 'System', render: (r) => r.system ?? '—' },
      { key: 'priority', header: 'Priority', sortable: true, render: (r) => label(PRIORITIES, r.priority) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<AccessRequestRow>
      resource="it/access-requests"
      title="Access Requests"
      noun="access request"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useItList}
      useMutations={useItMutations}
      rowLabel={(r) => r.requesterName}
      toFormValues={(r) => ({
        requesterName: r.requesterName,
        system: r.system ?? '',
        priority: r.priority,
        reason: r.reason ?? '',
        status: r.status,
      })}
    />
  );
}
