import { describe, expect, it, vi } from 'vitest';
import { schema, type Database, type SQL } from '@edrion/database';
import { PgDialect } from 'drizzle-orm/pg-core';
import { OnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';
import type { PortalActionContext } from './portal-action-context';

const ctx = {
  principal: { institutionId: 'institution', roleKeys: ['institution_admin'] },
  request: {},
} as PortalActionContext;
const meta = {
  displayName: 'School',
  status: 'onboarding',
  onboardingStatus: 'in_progress',
  activatedAt: null,
};
const completeSignals = {
  academicYears: 1,
  departments: 0,
  programmeStructures: 1,
  subjects: 1,
  classes: 1,
  students: 1,
  staff: 1,
};

describe('onboarding progress after removal', () => {
  it('counts placed subjects rather than reusable subject records left in the directory', async () => {
    const filters = new Map<unknown, SQL>();
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: async (condition: SQL) => {
            filters.set(table, condition);
            return [{ value: table === schema.programmeSubjects ? 0 : 1 }];
          },
        }),
      }),
    } as unknown as Database;
    const signals = await new OnboardingRepository(db).signals('institution');
    expect(signals.subjects).toBe(0);
    expect(signals.programmeStructures).toBe(1);
    expect(signals.classes).toBe(1);
    const departmentQuery = new PgDialect().sqlToQuery(filters.get(schema.departments)!);
    expect(departmentQuery.params).toEqual(['institution', 'department']);
  });

  it('makes an emptied required step incomplete and prevents go-live', async () => {
    const repo = {
      getMeta: vi.fn().mockResolvedValue({
        displayName: 'School',
        status: 'onboarding',
        onboardingStatus: 'in_progress',
        activatedAt: null,
      }),
      signals: vi.fn().mockResolvedValue({
        academicYears: 1,
        departments: 1,
        programmeStructures: 1,
        subjects: 0,
        classes: 1,
        students: 1,
        staff: 1,
      }),
      goLive: vi.fn(),
    };
    const service = new OnboardingService(
      repo as never,
      {} as never,
      { logAudit: vi.fn() } as never,
    );
    expect(
      (await service.getSummary(ctx)).steps.find((step) => step.key === 'subjects'),
    ).toMatchObject({ count: 0, done: false });
    await expect(service.complete(ctx)).rejects.toMatchObject({
      response: { code: 'ONBOARDING_INCOMPLETE' },
    });
    expect(repo.goLive).not.toHaveBeenCalled();
  });

  it('offers department and class creation before their dependent people steps', async () => {
    const repo = {
      getMeta: vi.fn().mockResolvedValue(meta),
      signals: vi.fn().mockResolvedValue(completeSignals),
    };
    const service = new OnboardingService(repo as never, {} as never, {} as never);
    const summary = await service.getSummary(ctx);
    expect(summary.steps.map((step) => step.key)).toEqual([
      'academicYears',
      'departments',
      'programmeStructures',
      'subjects',
      'classes',
      'students',
      'staff',
    ]);
    expect(summary.steps.find((step) => step.key === 'departments')).toMatchObject({
      required: 0,
      count: 0,
    });
    expect(summary.progress).toEqual({ done: 6, total: 6, percent: 100 });
  });

  it('blocks go-live when classes have not been created or the last class was removed', async () => {
    const repo = {
      getMeta: vi.fn().mockResolvedValue(meta),
      signals: vi.fn().mockResolvedValue({ ...completeSignals, classes: 0 }),
      goLive: vi.fn(),
    };
    const service = new OnboardingService(repo as never, {} as never, {} as never);
    expect(
      (await service.getSummary(ctx)).steps.find((step) => step.key === 'classes'),
    ).toMatchObject({ required: 1, count: 0, done: false });
    await expect(service.complete(ctx)).rejects.toMatchObject({
      response: { code: 'ONBOARDING_INCOMPLETE' },
    });
    expect(repo.goLive).not.toHaveBeenCalled();
  });

  it('allows go-live without optional departments once classes and the other required steps exist', async () => {
    const liveMeta = {
      ...meta,
      status: 'active',
      onboardingStatus: 'completed',
      activatedAt: new Date(),
    };
    const repo = {
      getMeta: vi.fn().mockResolvedValueOnce(meta).mockResolvedValue(liveMeta),
      signals: vi.fn().mockResolvedValue(completeSignals),
      goLive: vi.fn().mockResolvedValue(liveMeta),
    };
    const structure = { scheduleAllYears: vi.fn() },
      audit = { logAudit: vi.fn() };
    const service = new OnboardingService(repo as never, structure as never, audit as never);
    expect((await service.complete(ctx)).institution.isComplete).toBe(true);
    expect(repo.goLive).toHaveBeenCalledWith('institution');
    expect(structure.scheduleAllYears).toHaveBeenCalledWith(ctx);
    expect(audit.logAudit).toHaveBeenCalledTimes(1);
  });
});
