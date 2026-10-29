import { describe, expect, it, vi } from 'vitest';
import { schema } from '@edrion/database';
import { createPetrosTeacherGuidanceSchema } from '@edrion/schemas';
import { PetrosTeacherGuidanceService } from './petros-teacher-guidance.service';
import type { PortalActionContext } from '../portal-action-context';

vi.mock('@edrion/database', async importOriginal => ({
  ...await importOriginal<object>(),
  runInAuthorizedAssignmentParticipation: (_db: unknown, _institution: string, _assignment: string, fn: () => Promise<unknown>) => fn(),
}));

const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const institutionId = id(1), classId = id(2), subjectId = id(3), studentId = id(4), commandId = id(5);
const ctx = { principal: { institutionId, institutionUserId: id(6), isInstitutionWide: true, allowedCampusIds: [],
  roleKeys: ['teacher'], fullName: 'Teacher', email: 'teacher@example.test', permissions: { keys: new Set(['class_content.manage']), hasWildcard: false },
  mfaEnrolled: false, lastAuthAt: null }, scope: { mode: 'institution' },
  request: { requestId: 'guidance-test', correlationId: 'guidance-test', apiEndpoint: 'POST /portal/teaching' } } as PortalActionContext;
const classRow = { id: classId, campusId: id(7), academicYearId: id(8), termId: null };
const students = [{ id: studentId, firstName: 'Ananya', lastName: 'Rao', rollNo: '12' }];
const input = () => createPetrosTeacherGuidanceSchema.parse({ schemaVersion: 'petros.teacher-guidance.v1',
  commandId, focus: 'Add fractions with unlike denominators', instructions: 'Use visual examples, then ask for an explanation.',
  approach: 'practice', sessionMinutes: 15, dueDate: '2099-10-14', audience: { kind: 'students', studentIds: [studentId] } });

function query(rows: unknown[]) {
  const builder = { from: () => builder, where: () => builder, innerJoin: () => builder, leftJoin: () => builder,
    orderBy: () => builder, limit: async () => rows,
    then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
  return builder;
}
function harness(queries: unknown[][] = [[classRow], students, [{ timezone: 'Asia/Kolkata' }]], existing: unknown[] = []) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const tx = { select: () => query(existing), insert: (table: unknown) => ({ values: async (value: unknown) => { inserts.push({ table, value }); } }) };
  const db = { select: vi.fn(() => query(queries.shift() ?? [])), transaction: vi.fn(async (fn: (transaction: typeof tx) => unknown) => fn(tx)),
    update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [{ id: commandId }] }) }) })) };
  const teaching = { assignment: vi.fn().mockResolvedValue({ teacherId: id(9) }) };
  const audit = { logAudit: vi.fn() };
  const files = { resolve: vi.fn().mockResolvedValue([]), upload: vi.fn() };
  return { service: new PetrosTeacherGuidanceService(db as never, teaching as never, audit as never, files as never), db, teaching, audit, inserts, files };
}

describe('Petros teacher guidance', () => {
  it('authorizes every file before publishing and preserves the selected file IDs', async () => {
    const { service, files, inserts } = harness();
    await service.create(ctx, classId, subjectId, { ...input(), attachmentObjectIds: [id(15)] });
    expect(files.resolve).toHaveBeenCalledWith(ctx, classId, subjectId, [id(15)]);
    expect(inserts.find((row) => row.table === schema.assignments)?.value).toMatchObject({ petrosGuidance: { attachmentObjectIds: [id(15)] } });
    const denied = harness(); denied.files.resolve.mockRejectedValueOnce(new Error('File not authorized'));
    await expect(denied.service.create(ctx, classId, subjectId, { ...input(), attachmentObjectIds: [id(16)] })).rejects.toThrow('File not authorized');
    expect(denied.db.transaction).not.toHaveBeenCalled();
  });
  it('publishes a learning goal and its exact recipients together without lesson pack IDs', async () => {
    const { service, inserts, audit } = harness();
    await expect(service.create(ctx, classId, subjectId, input())).resolves.toEqual({ id: commandId, replayed: false });
    expect(inserts.find((row) => row.table === schema.assignments)?.value).toMatchObject({
      id: commandId, institutionId, classId, subjectId, campusId: classRow.campusId, status: 'published', aiPolicy: 'full',
      petrosGuidance: { focus: input().focus, approach: 'practice', instructions: input().instructions },
    });
    expect(inserts.find((row) => row.table === schema.assignmentAssignees)?.value).toEqual([{ assignmentId: commandId, studentId }]);
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'petros.guidance.assigned' }));
  });

  it('resolves the whole class to the current enrolled roster', async () => {
    const { service, inserts } = harness();
    await service.create(ctx, classId, subjectId, { ...input(), audience: { kind: 'class' } });
    expect(inserts.find((row) => row.table === schema.assignmentAssignees)?.value).toEqual([{ assignmentId: commandId, studentId }]);
  });

  it('denies students outside the class before writing', async () => {
    const { service, db } = harness();
    await expect(service.create(ctx, classId, subjectId, { ...input(), audience: { kind: 'students', studentIds: [id(10)] } })).rejects.toMatchObject({ status: 400 });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('requires current teaching authority and campus access', async () => {
    const first = harness();
    first.teaching.assignment.mockRejectedValueOnce(new Error('Not your subject'));
    await expect(first.service.create(ctx, classId, subjectId, input())).rejects.toThrow('Not your subject');
    expect(first.db.transaction).not.toHaveBeenCalled();
    const second = harness();
    await expect(second.service.workspace({ ...ctx, principal: { ...ctx.principal, isInstitutionWide: false,
      allowedCampusIds: [id(11)] } }, classId, subjectId)).rejects.toMatchObject({ status: 404 });
  });

  it('retries the same command without duplicate assignment or delivery even after JSONB key reordering', async () => {
    const value = input();
    const { service, inserts, audit } = harness(undefined, [{ id: commandId, institutionId,
      createdBy: ctx.principal.institutionUserId, classId, subjectId, dueDate: value.dueDate,
      petrosGuidance: { sessionMinutes: value.sessionMinutes, approach: value.approach, instructions: value.instructions,
        focus: value.focus, schemaVersion: value.schemaVersion }, audience: [{ refId: studentId, kind: 'student' }] }]);
    await expect(service.create(ctx, classId, subjectId, value)).resolves.toEqual({ id: commandId, replayed: true });
    expect(inserts).toEqual([]);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it('rejects changed guidance reusing the same command', async () => {
    const { service } = harness(undefined, [{ institutionId: id(12) }]);
    await expect(service.create(ctx, classId, subjectId, input())).rejects.toMatchObject({ status: 409 });
  });

  it('returns bounded participation labels without exposing session answers or transcripts', async () => {
    const { service } = harness([[classRow], students,
      [{ id: commandId, version: 0, status: 'published', dueDate: input().dueDate, petrosGuidance: input() }],
      [{ assignmentId: commandId, studentId, firstName: 'Ananya', lastName: 'Rao', submissionStatus: 'submitted' }],
      [{ assignmentId: commandId, studentId, status: 'closed', transcript: 'PRIVATE CONTENT' }],
    ]);
    const workspace = await service.workspace(ctx, classId, subjectId);
    expect(workspace.goals[0]?.recipients).toEqual([{ studentId, name: 'Ananya Rao', progress: 'reported_complete' }]);
    expect(JSON.stringify(workspace)).not.toContain('PRIVATE CONTENT');
  });
});
