'use client';
import { useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useStudentOptions } from '@/lib/people';
import { namedPersonLabel } from '@/lib/person-name';
import { useRoomAllocationMutations, useRoomAllocations } from '@/lib/hostel';
import { PortalClientError } from '@/lib/portal-client';

/** Inline room allocations editor — used inside the room edit form. */
export function RoomAllocationsPanel({
  roomId,
  roomNo,
  capacity,
  occupied,
  available,
}: {
  roomId: string;
  roomNo: string;
  capacity: number;
  occupied: number;
  available: number;
}) {
  const { can } = usePermissions();
  const canManage = can('hostel.manage');
  const { data: allocations, isLoading } = useRoomAllocations(roomId);
  const { data: students } = useStudentOptions();
  const { allocate, vacate, remove } = useRoomAllocationMutations(roomId);

  const [studentId, setStudentId] = useState('');
  const [bedNo, setBedNo] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStudentId('');
    setBedNo('');
    setFromDate('');
  }

  async function add() {
    if (!studentId) return;
    setError(null);
    try {
      await allocate.mutateAsync({ studentId, bedNo: bedNo || null, fromDate: fromDate || null });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not allocate this room.');
    }
  }

  async function vac(allocationId: string) {
    setError(null);
    try {
      await vacate.mutateAsync({ allocationId, body: {} });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not vacate this allocation.');
    }
  }

  async function drop(allocationId: string) {
    setError(null);
    try {
      await remove.mutateAsync(allocationId);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove this allocation.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Allocations</h3>
      <p className="text-xs text-text-muted">Bed assignments for room {roomNo}.</p>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
        <div>
          <p className="text-xs text-text-muted">Capacity</p>
          <p className="font-medium tabular-nums">{capacity}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Occupied</p>
          <p className="font-medium tabular-nums">{occupied}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Free</p>
          <p className="font-medium tabular-nums">{available}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label htmlFor="alloc-student">Student</Label>
              <Select
                id="alloc-student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Student…"
                options={(students?.items ?? []).map((s) => ({
                  value: s.id,
                  label: namedPersonLabel(s, s.admissionNo),
                }))}
              />
            </div>
            <div>
              <Label htmlFor="alloc-bed">Bed no.</Label>
              <Input id="alloc-bed" value={bedNo} onChange={(e) => setBedNo(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <Label htmlFor="alloc-from">From</Label>
              <Input id="alloc-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
          </div>
          <Button onClick={add} loading={allocate.isPending} disabled={!studentId}>
            Allocate bed
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (allocations ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">No students are allocated to this room yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(allocations ?? []).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{a.studentName ?? 'Student'}</p>
                <p className="truncate text-xs text-text-muted">
                  {[a.bedNo ? `Bed ${a.bedNo}` : null, a.status, a.fromDate, a.toDate ? `→ ${a.toDate}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  {a.status === 'active' && (
                    <button
                      type="button"
                      aria-label="Vacate allocation"
                      title="Vacate"
                      onClick={() => vac(a.id)}
                      className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove allocation"
                    onClick={() => drop(a.id)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
