'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFrontDeskList, useFrontDeskMutations } from '@/lib/staff-modules';
import type { VisitorRow } from '@/lib/staff-modules-types';

/** Security reads the visitor log (visitors.view) but does not manage it (visitors.manage) — read-only. */
const PERMISSIONS: ResourcePermissions = {
  view: 'visitors.view',
  create: 'visitors.manage',
  update: 'visitors.manage',
  delete: 'visitors.manage',
};

const STATUSES = [
  { value: 'checked_in', label: 'Checked in' },
  { value: 'checked_out', label: 'Checked out' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function SecurityVisitorLogsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'fullName', label: 'Visitor name', type: 'text', required: true },
      { name: 'host', label: 'Host', type: 'text', nullable: true },
      { name: 'badgeNo', label: 'Badge no.', type: 'text', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<VisitorRow>[]>(
    () => [
      { key: 'fullName', header: 'Visitor', sortable: true, render: (r) => <span className="font-medium">{r.fullName}</span> },
      { key: 'host', header: 'Host', render: (r) => r.host ?? '—' },
      { key: 'badgeNo', header: 'Badge', render: (r) => r.badgeNo ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<VisitorRow>
      resource="front-desk/visitors"
      title="Visitor Logs"
      noun="visitor"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useFrontDeskList}
      useMutations={useFrontDeskMutations}
      rowLabel={(r) => r.fullName}
      toFormValues={(r) => ({
        fullName: r.fullName,
        host: r.host ?? '',
        badgeNo: r.badgeNo ?? '',
        status: r.status,
      })}
    />
  );
}
