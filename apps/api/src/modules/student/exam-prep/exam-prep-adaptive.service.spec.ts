import { describe, expect, it } from 'vitest';
import { ExamPrepAdaptiveService } from './exam-prep-adaptive.service';

describe('ExamPrepAdaptiveService', () => {
  const svc = new ExamPrepAdaptiveService({
    resolveByKey: async () => ({ value: true }),
  } as never);

  it('routes harder module after strong module 0', async () => {
    const route = await svc.routeSatModule({ kind: 'independent', independentUserId: 'u1' } as never, {
      module_index: 0,
      correct_count: 18,
      total_count: 20,
    });
    expect(route.next_module_difficulty).toBe('harder');
    expect(route.methodology).toBe('sat_digital_two_stage_v1');
  });
});
