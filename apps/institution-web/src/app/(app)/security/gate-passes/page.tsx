'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useSecurityList, useSecurityMutations } from '@/lib/staff-modules';
import type { GatePassRow } from '@/lib/staff-modules-types';

const KEY = 'gate_passes.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const KINDS = [
  { value: 'visitor', label: 'Visitor' },
  { value: 'student', label: 'Student' },
  { value: 'staff', label: 'Staff' },
  { value: 'vehicle', label: 'Vehicle' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
  { value: 'revoked', label: 'Revoked' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function GatePassesPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'holderName', label: 'Holder', type: 'text', required: true, placeholder: 'e.g. Jane Doe' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
      { name: 'reason', label: 'Reason', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'issuedAt', label: 'Issued on', type: 'date', nullable: true },
      { name: 'expiresAt', label: 'Expires on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<GatePassRow>[]>(
    () => [
      { key: 'holderName', header: 'Holder', sortable: true, render: (r) => <span className="font-medium">{r.holderName}</span> },
      { key: 'kind', header: 'Kind', render: (r) => label(KINDS, r.kind) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<GatePassRow>
      resource="security/gate-passes"
      title="Gate Passes"
      noun="gate pass"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useSecurityList}
      useMutations={useSecurityMutations}
      rowLabel={(r) => r.holderName}
      toFormValues={(r) => ({
        holderName: r.holderName,
        kind: r.kind,
        reason: r.reason ?? '',
        issuedAt: r.issuedAt ? r.issuedAt.slice(0, 10) : '',
        expiresAt: r.expiresAt ? r.expiresAt.slice(0, 10) : '',
        status: r.status,
      })}
    />
  );
}
