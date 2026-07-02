'use client';
import { useMemo } from 'react';
import { Badge, type BadgeTone, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useCampusesList, useCampusesMutations, type CampusRow } from '@/lib/campuses';

const PERMISSIONS: ResourcePermissions = {
  view: 'campuses.view',
  create: 'campuses.manage',
  update: 'campuses.manage',
  delete: 'campuses.manage',
};

const BILLING_TONE: Record<string, BadgeTone> = {
  included: 'neutral',
  paid_addon: 'info',
  suspended: 'danger',
};

const place = (r: CampusRow) => [r.address?.city, r.address?.country].filter(Boolean).join(', ');

export default function CampusesPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Campus name', type: 'text', required: true, placeholder: 'e.g. North Campus' },
      { name: 'addressLine1', label: 'Address line', type: 'text', nullable: true, placeholder: 'Street address' },
      { name: 'addressCountry', label: 'Country', type: 'country' },
      { name: 'addressRegion', label: 'State / Province', type: 'division', countryField: 'addressCountry' },
      { name: 'addressCity', label: 'City', type: 'text', nullable: true },
      { name: 'timezoneOverride', label: 'Timezone', type: 'timezone', countryField: 'addressCountry', help: 'Overrides the institution timezone for this campus.' },
      { name: 'studentCapacity', label: 'Student capacity', type: 'number', nullable: true, min: 0 },
      { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    ],
    [],
  );

  const columns = useMemo<Column<CampusRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="tabular-nums text-text-secondary">{r.code}</span> },
      { key: 'place', header: 'Location', render: (r) => <span className="text-text-secondary">{place(r) || '—'}</span> },
      {
        key: 'studentCapacity',
        header: 'Capacity',
        align: 'right',
        render: (r) => <span className="tabular-nums">{r.studentCapacity ?? '—'}</span>,
      },
      {
        key: 'isActive',
        header: 'Status',
        render: (r) => (
          <div className="flex items-center gap-1.5">
            <Badge tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>
            {r.billingStatus !== 'included' && (
              <Badge tone={BILLING_TONE[r.billingStatus] ?? 'neutral'}>{r.billingStatus.replace('_', ' ')}</Badge>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <ResourceManager<CampusRow>
      resource="campuses"
      title="Campuses"
      noun="campus"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useCampusesList}
      useMutations={useCampusesMutations}
      rowLabel={(r) => r.name}
      filters={[
        {
          key: 'status',
          label: 'All statuses',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ]}
      toFormValues={(r) => ({
        name: r.name,
        addressLine1: r.address?.line1 ?? '',
        addressCountry: r.address?.country ?? '',
        addressRegion: r.address?.region ?? '',
        addressCity: r.address?.city ?? '',
        timezoneOverride: r.timezoneOverride ?? '',
        studentCapacity: r.studentCapacity ?? '',
        status: r.isActive ? 'active' : 'inactive',
      })}
    />
  );
}
