import { describe, expect, it } from 'vitest';
import {
  createPlanDraftSchema,
  diffPlanVersions,
  newPlanVersionSchema,
  planVersionPricingSchema,
  type PlanVersionSnapshot,
} from './plans';

const validPricing = {
  currency: 'USD',
  monthlyPriceMinor: 49900,
  annualPriceMinor: 499000,
  baseCampusAllowance: 2,
  perCampusPriceMinor: 9900,
  trialDays: 30,
  supportTier: 'standard',
};

describe('planVersionPricingSchema', () => {
  it('accepts a well-formed pricing object and applies defaults', () => {
    const parsed = planVersionPricingSchema.parse(validPricing);
    expect(parsed.usageLimits).toEqual({});
    expect(parsed.featureEntitlements).toEqual({});
  });

  it('rejects negative and non-integer money', () => {
    expect(() => planVersionPricingSchema.parse({ ...validPricing, monthlyPriceMinor: -1 })).toThrow();
    expect(() => planVersionPricingSchema.parse({ ...validPricing, monthlyPriceMinor: 4.99 })).toThrow();
  });

  it('rejects an unknown currency and support tier', () => {
    expect(() => planVersionPricingSchema.parse({ ...validPricing, currency: 'BTC' })).toThrow();
    expect(() => planVersionPricingSchema.parse({ ...validPricing, supportTier: 'gold' })).toThrow();
  });
});

describe('createPlanDraftSchema', () => {
  it('enforces a lower_snake_case key', () => {
    expect(() =>
      createPlanDraftSchema.parse({ key: 'Institution Pro', name: 'Pro', pricing: validPricing }),
    ).toThrow();
    const ok = createPlanDraftSchema.parse({ key: 'institution_pro', name: 'Pro', pricing: validPricing });
    expect(ok.audience).toBe('institution');
  });
});

describe('newPlanVersionSchema', () => {
  it('accepts pricing with an optional changelog note', () => {
    const parsed = newPlanVersionSchema.parse({ pricing: validPricing, note: 'price increase' });
    expect(parsed.note).toBe('price increase');
  });
});

describe('diffPlanVersions', () => {
  const base: PlanVersionSnapshot = {
    currency: 'USD',
    monthlyPriceMinor: 49900,
    annualPriceMinor: 499000,
    baseCampusAllowance: 2,
    perCampusPriceMinor: 9900,
    trialDays: 30,
    supportTier: 'standard',
    usageLimits: { ai_messages: 5000 },
    featureEntitlements: { copilot: true },
  };

  it('returns no changes against a null predecessor (the first version)', () => {
    expect(diffPlanVersions(null, base)).toEqual([]);
  });

  it('detects scalar price changes', () => {
    const next = { ...base, monthlyPriceMinor: 59900 };
    const changes = diffPlanVersions(base, next);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: 'monthlyPriceMinor', before: 49900, after: 59900 });
  });

  it('flattens added / removed / changed usage-limit and feature keys', () => {
    const next: PlanVersionSnapshot = {
      ...base,
      usageLimits: { ai_messages: 8000, storage_gb: 50 },
      featureEntitlements: { copilot: false },
    };
    const changes = diffPlanVersions(base, next);
    const fields = changes.map((c) => c.field);
    expect(fields).toContain('usageLimits.ai_messages'); // changed
    expect(fields).toContain('usageLimits.storage_gb'); // added
    expect(fields).toContain('featureEntitlements.copilot'); // toggled off
    const added = changes.find((c) => c.field === 'usageLimits.storage_gb');
    expect(added).toMatchObject({ before: null, after: 50 });
  });
});
