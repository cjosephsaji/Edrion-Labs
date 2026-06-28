'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useStudentOptions } from '@/lib/people';
import { useRouteAssignmentMutations, useRouteAssignments } from '@/lib/transport';
import type { TransportRouteRow } from '@/lib/transport-types';
import { PortalClientError } from '@/lib/portal-client';

/**
 * Assign students to a route (the transport join). Viewers see the assignments; `transport.manage` is
 * required to add or remove — the API re-checks. One assignment per (route, student); a duplicate is
 * rejected with a friendly message.
 */
export function RouteAssignmentsDrawer({
  route,
  open,
  onClose,
}: {
  route: TransportRouteRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('transport.manage');
  const { data: assignments, isLoading } = useRouteAssignments(open ? route?.id ?? null : null);
  const { data: students } = useStudentOptions();
  const { create, remove } = useRouteAssignmentMutations(route?.id ?? '');

  const [studentId, setStudentId] = useState('');
  const [stopName, setStopName] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [dropTime, setDropTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStudentId('');
    setStopName('');
    setPickupTime('');
    setDropTime('');
  }

  async function add() {
    if (!studentId) return;
    setError(null);
    try {
      await create.mutateAsync({
        studentId,
        stopName: stopName || null,
        pickupTime: pickupTime || null,
        dropTime: dropTime || null,
      });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add the assignment.');
    }
  }

  async function drop(id: string, version: number) {
    setError(null);
    try {
      await remove.mutateAsync({ id, version });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the assignment.');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Route assignments" description={route?.name ?? ''}>
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label htmlFor="asn-student">Student</Label>
                <Select
                  id="asn-student"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Student…"
                  options={(students?.items ?? []).map((s) => ({
                    value: s.id,
                    label: `${s.firstName} ${s.lastName} (${s.admissionNo})`,
                  }))}
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="asn-stop">Stop</Label>
                <Input id="asn-stop" value={stopName} onChange={(e) => setStopName(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label htmlFor="asn-pickup">Pickup (HH:MM)</Label>
                <Input id="asn-pickup" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} placeholder="07:30" />
              </div>
              <div>
                <Label htmlFor="asn-drop">Drop (HH:MM)</Label>
                <Input id="asn-drop" value={dropTime} onChange={(e) => setDropTime(e.target.value)} placeholder="15:30" />
              </div>
            </div>
            <Button onClick={add} loading={create.isPending} disabled={!studentId}>
              Add assignment
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (assignments ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No students are assigned to this route yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(assignments ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{a.studentName ?? 'Student'}</p>
                  <p className="truncate text-xs text-text-muted">
                    {[a.stopName, a.pickupTime && a.dropTime ? `${a.pickupTime}–${a.dropTime}` : null, a.status]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove assignment"
                    onClick={() => drop(a.id, a.version)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
