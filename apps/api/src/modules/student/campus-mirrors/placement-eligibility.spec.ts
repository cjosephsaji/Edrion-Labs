import { describe, expect, it } from 'vitest';
import { evaluatePlacementEligibility } from './placement-eligibility.service';

describe('placement eligibility DSL', () => {
  it('passes when rules satisfied', () => {
    const out = evaluatePlacementEligibility({ min_gpa: 3 }, { gpa: 3.2 });
    expect(out.eligible).toBe(true);
  });

  it('fails with reasons', () => {
    const out = evaluatePlacementEligibility({ min_gpa: 3.5, min_attendance_pct: 90 }, { gpa: 3.1, attendancePct: 80 });
    expect(out.eligible).toBe(false);
    expect(out.reasons.length).toBeGreaterThan(0);
  });
});
