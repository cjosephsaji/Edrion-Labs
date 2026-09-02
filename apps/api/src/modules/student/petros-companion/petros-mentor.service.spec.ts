import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@edrion/database';
import { petrosMentorStateSchema, type PetrosReflectionSurface } from '@edrion/schemas';
import type { InstitutionalStudentPrincipal } from '../student.types';
import type { PetrosReflectionService } from '../petros-reflection/petros-reflection.service';
import type { StudentMaterialsService } from '../materials/student-materials.service';
import type { PetrosBriefingService } from './petros-briefing.service';
import type { PetrosCompanionRepository } from './petros-companion.repository';
import type { PetrosStudentContextService } from './petros-student-context.service';
import { PetrosMentorService } from './petros-mentor.service';

const principal = { institutionId: 'institution1', studentId: 'student1', permissions: ['student.learn.use'] } as InstitutionalStudentPrincipal;
const now = new Date('2026-08-31T12:00:00Z');
const work = { kind: 'due_work', entityId: 'assignment1', entityType: 'assignment', title: 'Assignment', href: '/assignments/assignment1', detail: 'Due next week', deadlineAt: '2026-09-07T12:00:00Z', priority: 20 };
const reflection = { stale: false, recommendations: [], map: { topics: [], coverage: { solid: 3, shaky: 1, untouched: 5 } } } as unknown as PetrosReflectionSurface;

function setup() {
  const collect = vi.fn().mockResolvedValue([work]);
  const read = vi.fn().mockResolvedValue(reflection);
  const findPreferences = vi.fn().mockResolvedValue(null);
  const insert = vi.fn();
  const service = new PetrosMentorService(
    { insert } as unknown as Database,
    { collect } as unknown as PetrosBriefingService,
    { read } as unknown as PetrosReflectionService,
    { findPreferences } as unknown as PetrosCompanionRepository,
    { clock: vi.fn().mockResolvedValue({ timeZone: 'Asia/Kolkata', isoNow: now.toISOString() }) } as unknown as PetrosStudentContextService,
    { list: vi.fn() } as unknown as StudentMaterialsService,
  );
  vi.spyOn(service as unknown as { momentum: () => Promise<unknown> }, 'momentum').mockResolvedValue({ completedToday: 0, practicedMinutesToday: 0, activeMinutes: 0, lastActivityAt: null });
  return { service, collect, read, findPreferences, insert };
}

describe('account-scoped mentor orchestration', () => {
  it('retains deadlines when progress fails and reports the missing evidence', async () => {
    const { service, read, collect } = setup(); read.mockRejectedValue(new Error('Unavailable'));
    const decision = await service.build(principal, false, now);
    expect(collect).toHaveBeenCalledWith(principal, now);
    expect(decision.status).toBe('partial');
    expect(decision.unavailable).toContain('learning progress');
    expect(decision.priorities[0]?.entityId).toBe('assignment1');
    expect(decision.learning).toBeNull();
  });

  it('does not report an empty workload when all remaining suggestions were postponed', async () => {
    const { service, findPreferences } = setup();
    findPreferences.mockResolvedValue({ mentorState: { history: [{ key: 'due_work:assignment1', decision: 'postponed', at: now.toISOString() }] } });
    const decision = await service.build(principal, false, now);
    expect(decision.priorities).toEqual([]);
    expect(decision.message).toContain('still outstanding');
  });

  it('rechecks actual work so submitted tasks drop from the next plan', async () => {
    const { service, collect } = setup();
    expect((await service.build(principal, false, now)).plan).toHaveLength(1);
    collect.mockResolvedValue([]);
    expect((await service.build(principal, false, now)).plan).toEqual([]);
  });

  it('keeps quiet-mode preferences while still answering an explicit request', async () => {
    const { service, findPreferences } = setup();
    findPreferences.mockResolvedValue({ quietMode: true, proactiveCheckIns: true, mentorState: {} });
    const decision = await service.build(principal, false, now);
    expect(decision.proactiveAllowed).toBe(false);
    expect(decision.priorities).toHaveLength(1);
    expect(findPreferences).toHaveBeenCalledWith({ institutionId: 'institution1', studentId: 'student1' });
  });

  it('does not schedule an old weak-topic suggestion after newer learning activity', async () => {
    const { service, read } = setup();
    read.mockResolvedValue({ ...reflection, stale: true, recommendations: [{ id: 'old-rec', status: 'active', title: 'Old weakness' }] });
    const decision = await service.build(principal, false, now);
    expect(decision.priorities.some((item) => item.entityId === 'old-rec')).toBe(false);
    expect(decision.priorities.some((item) => item.key === 'progress:refresh')).toBe(true);
    expect(decision.plan.map((step) => step.priorityKey)).toEqual(['due_work:assignment1']);
  });

  it('does not treat a suggested default budget as availability confirmed by the student', async () => {
    const { service } = setup();
    expect((await service.build(principal, false, now)).planConfirmed).toBe(false);
    expect(petrosMentorStateSchema.parse({}).planConfirmed).toBe(false);
  });

  it('rejects feedback for a recommendation absent from the student’s authorised records', async () => {
    const { service, insert } = setup();
    await expect(service.feedback(principal, { key: 'due_work:another-students-assignment', decision: 'started' })).rejects.toThrow('no longer available');
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects study availability in the past without changing saved data', async () => {
    const { service, insert } = setup();
    await expect(service.plan(principal, { minutes: 45, energy: 'normal', availability: [{ date: '2026-08-30', minutes: 90 }] })).rejects.toThrow('today or a future date');
    expect(insert).not.toHaveBeenCalled();
  });
});
