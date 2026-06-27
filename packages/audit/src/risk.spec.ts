import { describe, expect, it } from 'vitest';
import { RiskLevel } from '@edrion/shared-types';
import { classifyRisk } from './risk';

describe('classifyRisk', () => {
  it('classifies destructive actions as critical', () => {
    expect(classifyRisk('institution.suspend')).toBe(RiskLevel.Critical);
    expect(classifyRisk('support_access.start')).toBe(RiskLevel.Critical);
    expect(classifyRisk('subscription.cancel')).toBe(RiskLevel.Critical);
  });

  it('classifies sensitive config changes as high', () => {
    expect(classifyRisk('subscription.override_pricing')).toBe(RiskLevel.High);
    expect(classifyRisk('feature.manage_global')).toBe(RiskLevel.High);
  });

  it('classifies routine edits as medium', () => {
    expect(classifyRisk('institution.update')).toBe(RiskLevel.Medium);
    expect(classifyRisk('campus.create')).toBe(RiskLevel.Medium);
  });

  it('defaults unknown actions to low', () => {
    expect(classifyRisk('something.view')).toBe(RiskLevel.Low);
  });
});
