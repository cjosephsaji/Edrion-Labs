'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { EntityRef } from '@/components/common/entity-ref';
import { StudentCardHeader, studentContextFields } from '@/components/common/student-card';
import { usePermissions } from '@/lib/permissions';
import { useHealthList, useHealthMutations } from '@/lib/staff-modules';
import { useStudentDirectory, studentOptions } from '@/lib/directory';
import type { MedicalIncidentRow } from '@/lib/staff-modules-types';

const KEY = 'medical_incidents.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

export default function MedicalIncidentsPage() {
  const { can } = usePermissions();
  const { data: students } = useStudentDirectory(can('student_basic_profile.view'));
  const studentOpts = useMemo(() => studentOptions(students?.items), [students]);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Sprained ankle in PE' },
      {
        name: 'studentId',
        label: 'Student',
        type: 'combobox',
        nullable: true,
        options: studentOpts,
        placeholder: 'Search a student…',
        searchPlaceholder: 'Search by name or admission no…',
        emptyText: 'No matching students',
      },
      { name: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITIES },
      { name: 'location', label: 'Location', type: 'text', nullable: true, placeholder: 'e.g. Playground' },
      { name: 'description', label: 'What happened', type: 'textarea', nullable: true },
      { name: 'actionTaken', label: 'Action taken', type: 'textarea', nullable: true },
      { name: 'treatment', label: 'Treatment given', type: 'textarea', nullable: true },
      { name: 'attendedBy', label: 'Attended by', type: 'text', nullable: true, placeholder: 'e.g. Nurse Usha' },
      { name: 'occurredAt', label: 'Occurred on', type: 'date', nullable: true },
      { name: 'followUpRequired', label: 'Follow-up required', type: 'checkbox' },
      { name: 'followUpAt', label: 'Follow-up on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [studentOpts],
  );

  const columns = useMemo<Column<MedicalIncidentRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'student', header: 'Student', render: (r) => <EntityRef entity={r.student} /> },
      { key: 'severity', header: 'Severity', sortable: true, render: (r) => <StatusBadge status={r.severity} /> },
      { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  const detail = (r: MedicalIncidentRow): DetailSection[] => [
    { title: 'Student', fields: studentContextFields(r.student) },
    {
      title: 'Incident',
      fields: [
        { label: 'Title', value: r.title },
        { label: 'Severity', value: <StatusBadge status={r.severity} /> },
        { label: 'Location', value: r.location },
        { label: 'Occurred on', value: r.occurredAt ? r.occurredAt.slice(0, 16).replace('T', ' ') : null },
        { label: 'What happened', value: r.description, full: true },
        { label: 'Action taken', value: r.actionTaken, full: true },
        { label: 'Treatment', value: r.treatment, full: true },
        { label: 'Attended by', value: r.attendedBy },
        { label: 'Status', value: <StatusBadge status={r.status} /> },
        { label: 'Follow-up required', value: r.followUpRequired ? 'Yes' : 'No' },
        { label: 'Follow-up on', value: r.followUpAt },
      ],
    },
  ];

  return (
    <ResourceManager<MedicalIncidentRow>
      resource="health/incidents"
      title="Medical Incidents"
      noun="incident"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useHealthList}
      useMutations={useHealthMutations}
      rowLabel={(r) => r.title}
      detail={detail}
      detailHeader={(r) => <StudentCardHeader student={r.student} />}
      toFormValues={(r) => ({
        title: r.title,
        studentId: r.studentId ?? '',
        severity: r.severity,
        location: r.location ?? '',
        description: r.description ?? '',
        actionTaken: r.actionTaken ?? '',
        treatment: r.treatment ?? '',
        attendedBy: r.attendedBy ?? '',
        occurredAt: r.occurredAt ? r.occurredAt.slice(0, 10) : '',
        followUpRequired: r.followUpRequired,
        followUpAt: r.followUpAt ?? '',
        status: r.status,
      })}
    />
  );
}
