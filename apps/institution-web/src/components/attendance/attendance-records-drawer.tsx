'use client';
import { Drawer } from '@edrion/ui';
import type { AttendanceSessionRow } from '@/lib/attendance-types';
import { AttendanceRecordsPanel } from './attendance-records-panel';

/** @deprecated Prefer `AttendanceRecordsPanel` in the session detail popup. */
export function AttendanceRecordsDrawer({
  session,
  open,
  onClose,
}: {
  session: AttendanceSessionRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Register"
      description={session ? `${session.className ?? 'Class'} · ${session.date} · ${session.period}` : ''}
    >
      {session && (
        <AttendanceRecordsPanel
          sessionId={session.id}
          classId={session.classId}
          className={session.className}
          date={session.date}
          period={session.period}
        />
      )}
    </Drawer>
  );
}

export { AttendanceRecordsPanel } from './attendance-records-panel';
