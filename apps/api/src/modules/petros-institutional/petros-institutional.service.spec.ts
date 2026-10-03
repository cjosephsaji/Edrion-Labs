import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import type { GuardianContext } from '../parent-portal/guardian-context';
import { defaultInstitutionPolicy, resolveInstitutionPolicy } from './petros-institutional.engine';
import { PetrosInstitutionalService } from './petros-institutional.service';

const INSTITUTION = '11111111-1111-4111-8111-111111111111';
const STUDENT = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT = '44444444-4444-4444-8444-444444444444';
const CLASS = '55555555-5555-4555-8555-555555555555';
const SUBJECT = '66666666-6666-4666-8666-666666666666';
const TEACHER = '77777777-7777-4777-8777-777777777777';
const GUARDIAN = '88888888-8888-4888-8888-888888888888';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional', institutionId: INSTITUTION, campusId: null,
  institutionUserId: '99999999-9999-4999-8999-999999999999', studentId: STUDENT,
  email: 'learner@example.test', fullName: 'Learner', lastAuthAt: null,
  permissions: ['student.learn.use'],
};
const guardian: GuardianContext = {
  guardianUserId: GUARDIAN,
  institutionId: INSTITUTION,
  studentIds: [STUDENT],
  students: [{ studentId: STUDENT, campusId: null, hidden: {} }],
};

function policyRow(digestEnabled = false) {
  const config = defaultInstitutionPolicy();
  config.digest.enabled = digestEnabled;
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', institutionId: INSTITUTION,
    campusId: null, programmeId: null, gradeId: null, subjectId: null,
    scopeLevel: 'institution' as const, version: 1, status: 'published', schemaVersion: 'petros.institutional.policy.v1',
    config, reason: 'Safe baseline', authorId: TEACHER,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveUntil: null,
    supersedesId: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), publishedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function resolved(digestEnabled = false) {
  const row = policyRow(digestEnabled);
  return resolveInstitutionPolicy({ institutionId: INSTITUTION, versions: [row], fixture: { campusId: null, programmeId: null, gradeId: null, subjectId: SUBJECT, studentId: STUDENT, language: 'en', accessibility: [] }, now: new Date('2026-08-13T10:00:00.000Z') });
}

function harness(options: { existingSnapshot?: boolean; digestEnabled?: boolean } = {}) {
  let snapshot: any = options.existingSnapshot ? { id: SNAPSHOT, institutionId: INSTITUTION, studentId: STUDENT, sessionId: SESSION, resolvedPolicy: resolved(options.digestEnabled), stableForSession: true } : undefined;
  let handoff: any;
  let digest: any;
  const repo: any = {
    findSessionSnapshot: vi.fn(async () => snapshot),
    ownsSession: vi.fn().mockResolvedValue(true),
    listPolicies: vi.fn().mockResolvedValue([policyRow(options.digestEnabled)]),
    studentPolicyFixture: vi.fn().mockResolvedValue({ campusId: null, classId: CLASS, gradeId: null, programmeId: null }),
    createSessionSnapshot: vi.fn(async (value: any) => {
      snapshot = { id: SNAPSHOT, ...value };
      return snapshot;
    }),
    acknowledgeDisclosure: vi.fn().mockResolvedValue({ acknowledgedAt: new Date('2026-08-13T10:01:00.000Z') }),
    recordEvent: vi.fn().mockResolvedValue({ id: 'event' }),
    handoffEligible: vi.fn().mockResolvedValue(true),
    teacherFor: vi.fn().mockResolvedValue(TEACHER),
    createHandoff: vi.fn(async (value: any) => {
      handoff = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...value, createdAt: new Date(), updatedAt: new Date(), consentedAt: null, deliveredAt: null, readAt: null, cancelledAt: null };
      return handoff;
    }),
    findStudentHandoff: vi.fn(async () => handoff),
    listStudentHandoffs: vi.fn(async () => handoff ? [handoff] : []),
    updateStudentHandoff: vi.fn(async (_institution: string, _student: string, _id: string, patch: any) => (handoff = { ...handoff, ...patch, updatedAt: new Date() })),
    preference: vi.fn().mockResolvedValue(undefined),
    digestEvidence: vi.fn().mockResolvedValue([
      { conceptId: 'quadratic-roots', outcome: 'correct', errorCategory: 'none', occurredAt: new Date('2026-08-12T10:00:00.000Z') },
      { conceptId: 'factorisation', outcome: 'partial', errorCategory: 'procedure_gap', occurredAt: new Date('2026-08-12T11:00:00.000Z') },
    ]),
    createDigest: vi.fn(async (value: any) => {
      digest = { ...value, periodStart: new Date(value.periodStart), periodEnd: new Date(value.periodEnd), attemptCount: 0, nextRetryAt: null, deliveredAt: null, errorCode: null, createdAt: new Date() };
      return digest;
    }),
    listDigests: vi.fn(async () => digest ? [digest] : []),
    findDigest: vi.fn(async () => digest),
    updateDigest: vi.fn(async (_institution: string, _guardian: string, _id: string, patch: any) => (digest = { ...digest, ...patch })),
    queuedHandoffs: vi.fn().mockResolvedValue([]),
    queuedDigests: vi.fn(async () => digest?.status === 'queued' ? [digest] : []),
    exportStudent: vi.fn().mockResolvedValue({ handoffs: [], digests: [], receipts: [] }),
    deleteStudentDerived: vi.fn(),
  };
  const gateway: any = { execute: vi.fn().mockRejectedValue(new Error('route unavailable')) };
  const audit: any = { logAudit: vi.fn() };
  return { service: new PetrosInstitutionalService(repo, gateway, audit), repo, gateway, getSnapshot: () => snapshot };
}

describe('Petros Stage 12 institutional service', () => {
  it('creates one owner-scoped snapshot and keeps it stable after policy data changes', async () => {
    const { service, repo, getSnapshot } = harness();
    const first = await service.resolveForStudentSession(principal, SESSION, SUBJECT);
    repo.listPolicies.mockResolvedValue([{ ...policyRow(), id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', version: 2, config: { ...defaultInstitutionPolicy(), syllabus: { ...defaultInstitutionPolicy().syllabus, maxDepth: 9 } } }]);
    const second = await service.resolveForStudentSession(principal, SESSION, SUBJECT);
    expect(first.snapshotId).toBe(SNAPSHOT);
    expect(second.policyVersionIds).toEqual(first.policyVersionIds);
    expect(second.config.syllabus.maxDepth).toBe(first.config.syllabus.maxDepth);
    expect(repo.createSessionSnapshot).toHaveBeenCalledTimes(1);
    expect(getSnapshot().stableForSession).toBe(true);
  });

  it('refuses cross-owner snapshot creation before reading or persisting policy', async () => {
    const { service, repo } = harness(); repo.ownsSession.mockResolvedValue(false);
    await expect(service.resolveForStudentSession(principal, SESSION, SUBJECT)).rejects.toMatchObject({ status: 404 });
    expect(repo.createSessionSnapshot).not.toHaveBeenCalled();
  });

  it('offers an evidence-bounded, correctly routed handoff only after the struggle threshold', async () => {
    const { service, repo } = harness({ existingSnapshot: true });
    const input = {
      sessionId: SESSION, classId: CLASS, subjectId: SUBJECT,
      summary: { concept: 'Quadratics', goal: 'Factor reliably', whatWasTried: ['Contrast case'], observedBreakPoint: 'Choosing signs', evidence: [{ label: 'Incorrect equivalent attempt', sourceEventId: 'event-1' }], usefulTeacherNextStep: 'Check one sign contrast' },
      idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };
    const preview = await service.createHandoff(principal, input);
    expect(preview).toMatchObject({ status: 'preview', privateContentExcluded: true });
    expect(repo.createHandoff).toHaveBeenCalledWith(expect.objectContaining({ teacherId: TEACHER, classId: CLASS, subjectId: SUBJECT }));
    await service.updateHandoff(principal, preview.id, { action: 'consent', idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    const queued = await service.updateHandoff(principal, preview.id, { action: 'deliver', idempotencyKey: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
    expect(queued.status).toBe('queued');

    const blocked = harness({ existingSnapshot: true }); blocked.repo.handoffEligible.mockResolvedValue(false);
    await expect(blocked.service.createHandoff(principal, input)).rejects.toMatchObject({ status: 409 });
    const wrongClass = harness({ existingSnapshot: true }); wrongClass.repo.studentPolicyFixture.mockResolvedValue({ campusId: null, classId: '00000000-0000-4000-8000-000000000001', gradeId: null, programmeId: null });
    await expect(wrongClass.service.createHandoff(principal, input)).rejects.toMatchObject({ status: 403 });
  });

  it('hard-disables new Petros guardian outputs even when older digest policy is enabled', async () => {
    const { service, repo } = harness({ digestEnabled: true });
    const command = { studentId: STUDENT, periodStart: '2026-08-06T10:00:00.000Z', periodEnd: '2026-08-13T10:00:00.000Z', language: 'en', action: 'preview' as const, idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
    await expect(service.parentDigestCommand(guardian, command)).rejects.toMatchObject({ status: 403, response: expect.objectContaining({ code: 'PETROS_GUARDIAN_OUTPUT_DISABLED' }) });
    await expect(service.parentPreferences(guardian, { studentId: STUDENT, optedOut: false, language: 'en', deliveryChannels: ['portal'] })).rejects.toMatchObject({ status: 403 });
    await expect(service.parentDigestHistory(guardian, STUDENT)).rejects.toMatchObject({ status: 403 });
    expect(repo.createDigest).not.toHaveBeenCalled();
  });

  it('does not deliver queued Petros guardian digests from the worker', async () => {
    const { service, repo } = harness({ digestEnabled: true });
    repo.queuedDigests.mockResolvedValue([{ status: 'queued' }]);
    await service.processJobs(new Date('2026-08-13T12:00:00.000Z'));
    expect(repo.updateDigest).not.toHaveBeenCalled();
  });

  it('keeps guardian delivery disabled regardless of stored digest channel', async () => {
    const portal = harness({ digestEnabled: true });
    await expect(portal.service.parentDigestCommand(guardian, {
      studentId: STUDENT, periodStart: '2026-08-01T10:00:00.000Z', periodEnd: '2026-08-08T10:00:00.000Z', language: 'en', action: 'send', idempotencyKey: '33333333-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    })).rejects.toMatchObject({ status: 403 });
    await expect(portal.service.processJobs(new Date('2026-08-13T12:00:00.000Z'))).resolves.toMatchObject({ digestsDelivered: 0, digestsFailed: 0 });

    const email = harness({ digestEnabled: true });
    email.repo.preference.mockResolvedValue({ optedOut: false, language: 'en', deliveryChannels: ['email'] });
    await expect(email.service.parentDigestCommand(guardian, {
      studentId: STUDENT, periodStart: '2026-08-01T10:00:00.000Z', periodEnd: '2026-08-08T10:00:00.000Z', language: 'en', action: 'send', idempotencyKey: '44444444-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    })).rejects.toMatchObject({status:403});
    await expect(email.service.processJobs(new Date('2026-08-13T12:00:00.000Z'))).resolves.toMatchObject({ digestsDelivered: 0, digestsFailed: 0, digestsExhausted: 0 });
    expect(email.repo.updateDigest).not.toHaveBeenCalled();
  });
});
