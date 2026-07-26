'use client';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { DataTable, Input, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RoomAllocationsPanel } from '@/components/hostel/room-allocations-panel';
import { useHostelBlockOptions, useHostelList, useHostelMutations } from '@/lib/hostel';
import type { HostelBlockRow, HostelRoomRow, HostellerRow } from '@/lib/hostel-types';

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
      renderFormExtra={({ row }) => (
        <RoomAllocationsPanel
          roomId={row.id}
          roomNo={row.roomNo}
          capacity={row.capacity}
          occupied={row.occupied}
          available={row.available}
        />
      )}
      toFormValues={(r) => ({
        blockId: r.blockId ?? '',
        roomNo: r.roomNo,
        floor: r.floor ?? '',
        capacity: r.capacity,
        roomType: r.roomType ?? '',
        status: r.status,
      })}
    />
  );
}

/** Read-only roster of current residents across all blocks/rooms (active allocations). */
function HostellersTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const pageSize = 25;
  const list = useHostelList<HostellerRow>('hostel/hostellers', { page, pageSize, sortDir: 'desc', search: search || undefined });

  const columns = useMemo<Column<HostellerRow>[]>(
    () => [
      {
        key: 'studentName',
        header: 'Student',
        render: (r) => (
          <div>
            <span className="font-medium">{r.studentName ?? '—'}</span>
            {r.admissionNo && <span className="ml-1.5 text-xs text-text-muted">{r.admissionNo}</span>}
          </div>
        ),
      },
      { key: 'blockName', header: 'Block', render: (r) => <span className="text-text-secondary">{r.blockName ?? '—'}</span> },
      { key: 'roomNo', header: 'Room', render: (r) => <span className="tabular-nums text-text-secondary">{r.roomNo ?? '—'}</span> },
      { key: 'bedNo', header: 'Bed', render: (r) => <span className="tabular-nums">{r.bedNo ?? '—'}</span> },
      { key: 'fromDate', header: 'Since', render: (r) => <span className="text-text-secondary">{r.fromDate ?? '—'}</span> },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={search}
          placeholder="Search resident or admission no…"
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>
      <DataTable<HostellerRow>
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        page={page}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        emptyTitle="No hostellers"
        emptyDescription="Students allocated to a hostel room appear here."
      />
    </div>
  );
}

export default function HostelPage() {
  const [tab, setTab] = useState<'rooms' | 'blocks' | 'hostellers'>('rooms');

  return (
    <>
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        {(['rooms', 'blocks', 'hostellers'] as const).map((t) => (
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
      {tab === 'rooms' ? <RoomsTab /> : tab === 'blocks' ? <BlocksTab /> : <HostellersTab />}
    </>
  );
}
