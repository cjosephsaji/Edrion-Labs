'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFrontDeskList, useFrontDeskMutations } from '@/lib/staff-modules';
import type { VisitorRow } from '@/lib/staff-modules-types';

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

export default function FrontDeskVisitorsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'fullName', label: 'Visitor name', type: 'text', required: true, placeholder: 'e.g. Jane Doe' },
      { name: 'purpose', label: 'Purpose', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'host', label: 'Host', type: 'text', nullable: true, placeholder: 'Who they are visiting' },
      { name: 'badgeNo', label: 'Badge no.', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'checkInAt', label: 'Check-in', type: 'date', nullable: true },
      { name: 'checkOutAt', label: 'Check-out', type: 'date', nullable: true },
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
      title="Front Desk"
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
        purpose: r.purpose ?? '',
        host: r.host ?? '',
        badgeNo: r.badgeNo ?? '',
        checkInAt: r.checkInAt ? r.checkInAt.slice(0, 10) : '',
        checkOutAt: r.checkOutAt ? r.checkOutAt.slice(0, 10) : '',
        status: r.status,
      })}
    />
  );
}
