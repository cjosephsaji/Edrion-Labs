import { describe, expect, it, vi } from 'vitest';
import { StudentAssignmentsService } from './student-assignments.service';
import type { InstitutionalStudentPrincipal } from '../student.types';

const principal = { institutionId: 'school', studentId: 'learner' } as InstitutionalStudentPrincipal;
function harness() {
  const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => [] };
  const db = { select: vi.fn(() => query), insert: vi.fn() };
  const service = new StudentAssignmentsService(db as never, { log: vi.fn() } as never);
  vi.spyOn(service as unknown as { loadVisibleAssignment: () => Promise<unknown> }, 'loadVisibleAssignment')
    .mockResolvedValue({ assignment: { petrosGuidance: { focus: 'Fractions' } } });
  vi.spyOn(service, 'detail').mockResolvedValue({ petrosGuidance: { focus: 'Fractions' } } as never);
  return { service, db };
}
describe('Petros goal completion authority', () => {
  it('requires reflection rather than accepting an arbitrary upload', async () => {
    const { service, db } = harness();
    await expect(service.submit(principal, 'goal', { fileObjectIds: ['file'], note: 'I learned fractions.' })).rejects.toMatchObject({ status: 400 });
    await expect(service.submit(principal, 'goal', { fileObjectIds: [], note: 'Done' })).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('requires a completed Petros step belonging to this student and assignment', async () => {
    const { service, db } = harness();
    await expect(service.submit(principal, 'goal', { fileObjectIds: [], note: 'I learned equivalent fractions.' })).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('does not grant Learn-only permission to ordinary assignment submissions', async () => {
    const { service, db } = harness();
    vi.mocked(service.detail).mockResolvedValue({ petrosGuidance: null } as never);
    await expect(service.reportLearningGoal(principal, 'ordinary-assignment', { fileObjectIds: [], note: 'Please submit this.' })).rejects.toMatchObject({ status: 404 });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
