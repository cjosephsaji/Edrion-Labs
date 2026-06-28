'use client';
import { useMemo, useState } from 'react';
import { BedDouble } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RoomAllocationsDrawer } from '@/components/hostel/room-allocations-drawer';
import { useHostelBlockOptions, useHostelList, useHostelMutations } from '@/lib/hostel';
import type { HostelBlockRow, HostelRoomRow } from '@/lib/hostel-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'hostel.view',
  create: 'hostel.manage',
  update: 'hostel.manage',
  delete: 'hostel.manage',
};

const BLOCK_TYPES = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'mixed', label: 'Mixed' },
];
const BLOCK_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
const ROOM_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'full', label: 'Full' },
  { value: 'maintenance', label: 'Maintenance' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

function BlocksTab() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. A Block' },
      { name: 'code', label: 'Code', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'blockType', label: 'Type', type: 'select', required: true, options: BLOCK_TYPES },
      { name: 'warden', label: 'Warden', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: BLOCK_STATUSES },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<HostelBlockRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'blockType', header: 'Type', render: (r) => label(BLOCK_TYPES, r.blockType) },
      { key: 'warden', header: 'Warden', render: (r) => r.warden ?? '—' },
      { key: 'roomCount', header: 'Rooms', align: 'right', render: (r) => <span className="tabular-nums">{r.roomCount}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(BLOCK_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<HostelBlockRow>
      resource="hostel/blocks"
      title="Hostel"
      noun="block"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      permissions={PERMISSIONS}
      useList={useHostelList}
      useMutations={useHostelMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({
        name: r.name,
        code: r.code ?? '',
        blockType: r.blockType,
        warden: r.warden ?? '',
        status: r.status,
        description: r.description ?? '',
      })}
    />
  );
}

function RoomsTab() {
  const { data: blocks } = useHostelBlockOptions();
  const [allocationsFor, setAllocationsFor] = useState<HostelRoomRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'blockId',
        label: 'Block',
        type: 'select',
        nullable: true,
        options: (blocks?.items ?? []).map((b) => ({ value: b.id, label: b.name })),
        help: 'Optional — the block this room belongs to.',
      },
      { name: 'roomNo', label: 'Room no.', type: 'text', required: true, placeholder: 'e.g. A-101' },
      { name: 'floor', label: 'Floor', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'capacity', label: 'Capacity (beds)', type: 'number', required: true, min: 0 },
      { name: 'roomType', label: 'Room type', type: 'text', nullable: true, placeholder: 'e.g. standard' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ROOM_STATUSES },
    ],
    [blocks],
  );

  const columns = useMemo<Column<HostelRoomRow>[]>(
    () => [
      { key: 'roomNo', header: 'Room', sortable: true, render: (r) => <span className="font-medium">{r.roomNo}</span> },
      { key: 'blockName', header: 'Block', render: (r) => r.blockName ?? '—' },
      { key: 'capacity', header: 'Capacity', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.capacity}</span> },
      { key: 'occupied', header: 'Occupied', align: 'right', render: (r) => <span className="tabular-nums">{r.occupied}</span> },
      { key: 'available', header: 'Free', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.available}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(ROOM_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<HostelRoomRow>
        resource="hostel/rooms"
        title="Hostel"
        noun="room"
        columns={columns}
        fields={fields}
        defaultSortBy="roomNo"
        permissions={PERMISSIONS}
        useList={useHostelList}
        useMutations={useHostelMutations}
        rowLabel={(r) => `Room ${r.roomNo}`}
        toFormValues={(r) => ({
          blockId: r.blockId ?? '',
          roomNo: r.roomNo,
          floor: r.floor ?? '',
          capacity: r.capacity,
          roomType: r.roomType ?? '',
          status: r.status,
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Allocations"
            title="Allocations"
            onClick={() => setAllocationsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <BedDouble className="h-4 w-4" />
          </button>
        )}
      />

      <RoomAllocationsDrawer room={allocationsFor} open={!!allocationsFor} onClose={() => setAllocationsFor(null)} />
    </>
  );
}

export default function HostelPage() {
  const [tab, setTab] = useState<'rooms' | 'blocks'>('rooms');

  return (
    <>
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        {(['rooms', 'blocks'] as const).map((t) => (
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
      {tab === 'rooms' ? <RoomsTab /> : <BlocksTab />}
    </>
  );
}
