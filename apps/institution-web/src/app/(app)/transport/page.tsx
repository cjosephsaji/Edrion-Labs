'use client';
import { useMemo, useState } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RouteAssignmentsPanel } from '@/components/transport/route-assignments-panel';
import { useFormat } from '@/lib/format';
import { useTransportList, useTransportMutations, useTransportRouteOptions } from '@/lib/transport';
import type { TransportRouteRow, TransportVehicleRow } from '@/lib/transport-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'transport.view',
  create: 'transport.manage',
  update: 'transport.manage',
  delete: 'transport.manage',
};

const ROUTE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const VEHICLE_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inactive', label: 'Inactive' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

function RoutesTab() {
  const fmt = useFormat();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. North Loop' },
      { name: 'code', label: 'Code', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'fare', label: 'Fare', type: 'money', required: true, min: 0 },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ROUTE_STATUSES },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<TransportRouteRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'code', header: 'Code', render: (r) => r.code ?? '—' },
      { key: 'fare', header: 'Fare', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{fmt.money(r.fare)}</span> },
      { key: 'assignmentCount', header: 'Students', align: 'right', render: (r) => <span className="tabular-nums">{r.assignmentCount}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(ROUTE_STATUSES, r.status) },
    ],
    [fmt],
  );

  return (
    <ResourceManager<TransportRouteRow>
      resource="transport/routes"
      title="Transport"
      noun="route"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      permissions={PERMISSIONS}
      useList={useTransportList}
      useMutations={useTransportMutations}
      rowLabel={(r) => r.name}
      renderFormExtra={({ row }) => <RouteAssignmentsPanel routeId={row.id} routeName={row.name} />}
      toFormValues={(r) => ({
        name: r.name,
        code: r.code ?? '',
        fare: r.fare,
        status: r.status,
        description: r.description ?? '',
      })}
    />
  );
}

function VehiclesTab() {
  const { data: routes } = useTransportRouteOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'registrationNo', label: 'Registration no.', type: 'text', required: true, placeholder: 'e.g. KAA 123A' },
      { name: 'model', label: 'Model', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'capacity', label: 'Capacity', type: 'number', required: true, min: 0 },
      {
        name: 'routeId',
        label: 'Route',
        type: 'select',
        nullable: true,
        options: (routes?.items ?? []).map((r) => ({ value: r.id, label: r.name })),
        help: 'Optional — the route this vehicle serves.',
      },
      { name: 'driverName', label: 'Driver name', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'driverPhone', label: 'Driver phone', type: 'phone', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: VEHICLE_STATUSES },
    ],
    [routes],
  );

  const columns = useMemo<Column<TransportVehicleRow>[]>(
    () => [
      { key: 'registrationNo', header: 'Registration', sortable: true, render: (r) => <span className="font-medium">{r.registrationNo}</span> },
      { key: 'model', header: 'Model', render: (r) => r.model ?? '—' },
      { key: 'routeName', header: 'Route', render: (r) => r.routeName ?? '—' },
      { key: 'capacity', header: 'Capacity', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.capacity}</span> },
      { key: 'driverName', header: 'Driver', render: (r) => r.driverName ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(VEHICLE_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<TransportVehicleRow>
      resource="transport/vehicles"
      title="Transport"
      noun="vehicle"
      columns={columns}
      fields={fields}
      defaultSortBy="registrationNo"
      permissions={PERMISSIONS}
      useList={useTransportList}
      useMutations={useTransportMutations}
      rowLabel={(r) => r.registrationNo}
      toFormValues={(r) => ({
        registrationNo: r.registrationNo,
        model: r.model ?? '',
        capacity: r.capacity,
        routeId: r.routeId ?? '',
        driverName: r.driverName ?? '',
        driverPhone: r.driverPhone ?? '',
        status: r.status,
      })}
    />
  );
}

export default function TransportPage() {
  const [tab, setTab] = useState<'routes' | 'vehicles'>('routes');

  return (
    <>
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        {(['routes', 'vehicles'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              'rounded-t-md px-3 py-2 text-sm font-medium capitalize transition-colors ' +
              (tab === t ? 'border-b-2 border-primary text-text-primary' : 'text-text-muted hover:text-text-primary')
            }
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'routes' ? <RoutesTab /> : <VehiclesTab />}
    </>
  );
}
