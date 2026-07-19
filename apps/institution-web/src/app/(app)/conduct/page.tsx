'use client';
import { useMemo } from 'react';
import { Badge, type BadgeTone, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useConductList, useConductMutations, type IncidentRow } from '@/lib/conduct';

// Create is intentionally hidden here (the key is unheld) — incidents are logged from a student's
// profile, where the student is already in context. This page browses / resolves existing ones.
const PERMISSIONS: ResourcePermissions = {
  view: 'student_conduct.view',
  create: 'student_conduct.__log_from_profile',
  update: 'student_conduct.manage',
  delete: 'student_conduct.manage',
};

const CATEGORIES = [
  { value: 'behavior', label: 'Behaviour' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'bullying', label: 'Bullying' },
  { value: 'property_damage', label: 'Property damage' },
  { value: 'other', label: 'Other' },
];
const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];
const SEV_TONE: Record<string, BadgeTone> = { high: 'danger', medium: 'warning', low: 'neutral' };
const STATUS_TONE: Record<string, BadgeTone> = { open: 'warning', resolved: 'success', dismissed: 'neutral' };
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

export default function ConductPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true },
      { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
      { name: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITIES },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'occurredOn', label: 'Date', type: 'date', nullable: true },
      { name: 'reporterName', label: 'Reported by', type: 'text', nullable: true },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true },
      { name: 'resolutionNote', label: 'Resolution note', type: 'textarea', nullable: true },
      { name: 'notifyGuardians', label: 'Flagged to notify guardians', type: 'checkbox' },
    ],
    [],
  );

  const detail = (r: IncidentRow): DetailSection[] => [
    {
      title: 'Incident',
      fields: [
        { label: 'Student', value: r.studentName ?? '—' },
        { label: 'Admission no.', value: r.admissionNo ?? '—' },
        { label: 'Title', value: r.title },
        { label: 'Category', value: catLabel(r.category) },
        { label: 'Severity', value: <Badge tone={SEV_TONE[r.severity] ?? 'neutral'}>{r.severity}</Badge> },
        { label: 'Status', value: <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
        { label: 'Date', value: r.occurredOn ?? '—' },
        { label: 'Reported by', value: r.reporterName, full: true },
        { label: 'Description', value: r.description, full: true },
        { label: 'Resolution note', value: r.resolutionNote, full: true },
        { label: 'Notify guardians', value: r.notifyGuardians ? 'Yes' : 'No' },
      ],
    },
  ];

  const columns = useMemo<Column<IncidentRow>[]>(
    () => [
      {
        key: 'studentName',
        header: 'Student',
        render: (r) => (
          <span>
            <span className="font-medium">{r.studentName ?? '—'}</span>
            {r.admissionNo && <span className="ml-1.5 text-xs text-text-muted">{r.admissionNo}</span>}
          </span>
        ),
      },
      { key: 'title', header: 'Incident', sortable: true, render: (r) => <span className="text-text-secondary">{r.title}</span> },
      { key: 'category', header: 'Category', render: (r) => <span className="text-text-secondary">{catLabel(r.category)}</span> },
      { key: 'severity', header: 'Severity', sortable: true, render: (r) => <Badge tone={SEV_TONE[r.severity] ?? 'neutral'}>{r.severity}</Badge> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
      { key: 'occurredOn', header: 'Date', render: (r) => <span className="text-text-secondary">{r.occurredOn ?? '—'}</span> },
    ],
    [],
  );

  return (
    <ResourceManager<IncidentRow>
      resource="conduct"
      title="Student Conduct"
      noun="incident"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useConductList}
      useMutations={useConductMutations}
      rowLabel={(r) => r.title}
      detail={detail}
      filters={[
        { key: 'category', label: 'All categories', options: CATEGORIES },
        { key: 'severity', label: 'All severities', options: SEVERITIES },
        { key: 'status', label: 'All statuses', options: STATUSES },
      ]}
      toFormValues={(r) => ({
        title: r.title,
        category: r.category,
        severity: r.severity,
        status: r.status,
        occurredOn: r.occurredOn ?? '',
        reporterName: r.reporterName ?? '',
        description: r.description ?? '',
        resolutionNote: r.resolutionNote ?? '',
        notifyGuardians: r.notifyGuardians,
      })}
    />
  );
}
