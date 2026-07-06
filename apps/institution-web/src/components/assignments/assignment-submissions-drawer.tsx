'use client';
import { Drawer } from '@edrion/ui';
import type { AssignmentRow } from '@/lib/assignments-types';
import { AssignmentSubmissionsPanel } from './assignment-submissions-panel';

/** @deprecated Prefer `AssignmentSubmissionsPanel` in the assignment detail popup. */
export function AssignmentSubmissionsDrawer({
  assignment,
  open,
  onClose,
}: {
  assignment: AssignmentRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Submissions"
      description={assignment ? `${assignment.title} · ${assignment.className ?? 'Class'} · max ${assignment.maxPoints}` : ''}
    >
      {assignment && (
        <AssignmentSubmissionsPanel
          assignmentId={assignment.id}
          classId={assignment.classId}
          title={assignment.title}
          className={assignment.className}
          maxPoints={assignment.maxPoints}
        />
      )}
    </Drawer>
  );
}

export { AssignmentSubmissionsPanel } from './assignment-submissions-panel';
