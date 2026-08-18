import { describe, expect, it } from 'vitest';
import { petrosAssignmentFocusId, type AssignmentRow } from './assignment-list-screen';

const assignment = (id: string, status: string): AssignmentRow => ({
  id,
  status,
  title: id,
  subjectName: null,
  dueAt: null,
});

describe('Petros assignment focus', () => {
  it('skips graded and submitted work in favour of an active assignment', () => {
    expect(petrosAssignmentFocusId([
      assignment('machine-learning', 'graded'),
      assignment('cloud-computing', 'assigned'),
      assignment('ethics', 'submitted'),
    ])).toBe('cloud-computing');
  });

  it('does not point at anything when every assignment is closed', () => {
    expect(petrosAssignmentFocusId([
      assignment('machine-learning', 'returned'),
      assignment('ethics', 'submitted'),
    ])).toBeNull();
  });
});
