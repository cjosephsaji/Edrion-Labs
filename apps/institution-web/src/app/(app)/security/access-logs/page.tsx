'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useSecurityList, useSecurityMutations } from '@/lib/staff-modules';
import type { CampusAccessLogRow } from '@/lib/staff-modules-types';

const KEY = 'campus_access_logs.view';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const DIRECTIONS = [
  { value: 'in', label: 'In' },
  { value: 'out', label: 'Out' },
];
const METHODS = [
  { value: 'badge', label: 'Badge' },
  { value: 'manual', label: 'Manual' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function CampusAccessLogsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'subjectName', label: 'Subject', type: 'text', required: true, placeholder: 'e.g. Jane Doe' },
      { name: 'direction', label: 'Direction', type: 'select', required: true, options: DIRECTIONS },
      { name: 'gate', label: 'Gate', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'method', label: 'Method', type: 'select', required: true, options: METHODS },
      { name: 'occurredAt', label: 'Occurred on', type: 'date', nullable: true },
    ],
    [],
  );

  const columns = useMemo<Column<CampusAccessLogRow>[]>(
    () => [
      { key: 'subjectName', header: 'Subject', sortable: true, render: (r) => <span className="font-medium">{r.subjectName}</span> },
      { key: 'direction', header: 'Direction', render: (r) => label(DIRECTIONS, r.direction) },
      { key: 'gate', header: 'Gate', render: (r) => r.gate ?? '—' },
      { key: 'method', header: 'Method', render: (r) => label(METHODS, r.method) },
    ],
    [],
  );

  return (
    <ResourceManager<CampusAccessLogRow>
      resource="security/access-logs"
      title="Campus Access Logs"
      noun="access log"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useSecurityList}
      useMutations={useSecurityMutations}
      rowLabel={(r) => r.subjectName}
      toFormValues={(r) => ({
        subjectName: r.subjectName,
        direction: r.direction,
        gate: r.gate ?? '',
        method: r.method,
        occurredAt: r.occurredAt ? r.occurredAt.slice(0, 10) : '',
      })}
    />
  );
}
