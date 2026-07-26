'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useSecurityList, useSecurityMutations } from '@/lib/staff-modules';
import type { EmergencyAlertRow } from '@/lib/staff-modules-types';

const KEY = 'emergency_alerts.view';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const LEVELS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function EmergencyAlertsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Fire drill' },
      { name: 'level', label: 'Level', type: 'select', required: true, options: LEVELS },
      { name: 'message', label: 'Message', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'raisedAt', label: 'Raised on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<EmergencyAlertRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'level', header: 'Level', sortable: true, render: (r) => label(LEVELS, r.level) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<EmergencyAlertRow>
      resource="security/alerts"
      title="Emergency Alerts"
      noun="alert"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useSecurityList}
      useMutations={useSecurityMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        level: r.level,
        message: r.message ?? '',
        raisedAt: r.raisedAt ? r.raisedAt.slice(0, 10) : '',
        status: r.status,
      })}
    />
  );
}
