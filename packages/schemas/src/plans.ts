import { z } from 'zod';
import { PlanAudience, PlanStatus, SupportTier } from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, versionSchema, zEnumFromConst } from './common';

export const planStatusSchema = zEnumFromConst(PlanStatus);
export const planAudienceSchema = zEnumFromConst(PlanAudience);
/** Local (institutions.ts already exports a `supportTierSchema`); avoid a duplicate re-export. */
const supportTierSchema = zEnumFromConst(SupportTier);
export const planCurrencySchema = z.enum(['USD', 'INR', 'EUR', 'GBP', 'AED']);

/**
 * The full priced shape of a plan version. The same schema backs creating the first version of
 * a draft plan and cutting a new version of an existing plan — editing a published version is
 * never an UPDATE, it is always a new version (immutable history). Money is integer minor units.
 */
export const planVersionPricingSchema = z.object({
  currency: planCurrencySchema.default('USD'),
  monthlyPriceMinor: z.number().int().min(0).max(100_000_000),
  annualPriceMinor: z.number().int().min(0).max(1_000_000_000),
  /** Campuses the base price already covers (no per-campus add-on charge). */
  baseCampusAllowance: z.number().int().min(0).max(10_000).default(1),
  /** Per-campus add-on price beyond the base allowance, minor units. */
  perCampusPriceMinor: z.number().int().min(0).max(100_000_000).default(0),
  /** Metered usage caps keyed by metric (e.g. { ai_messages: 5000 }). 0 = unlimited convention. */
  usageLimits: z.record(z.string(), z.number().int().min(0)).default({}),
  /** Feature entitlements toggled on at this plan tier, keyed by feature key. */
  featureEntitlements: z.record(z.string(), z.boolean()).default({}),
  trialDays: z.number().int().min(0).max(365).default(0),
  supportTier: supportTierSchema.default(SupportTier.Standard),
});
export type PlanVersionPricingInput = z.infer<typeof planVersionPricingSchema>;

/** Plan key — stable machine identifier, lower_snake_case. */
const planKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, numbers and underscores; must start with a letter');

export const createPlanDraftSchema = z.object({
  key: planKeySchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  audience: planAudienceSchema.default(PlanAudience.Institution),
  /** Pricing of the initial draft version (v1). */
  pricing: planVersionPricingSchema,
});
export type CreatePlanDraftInput = z.infer<typeof createPlanDraftSchema>;

/** Cut a new draft version from new pricing. Never mutates an existing version. */
export const newPlanVersionSchema = z.object({
  pricing: planVersionPricingSchema,
  /** Optional changelog note recorded on the version + in the audit event. */
  note: z.string().trim().max(500).optional(),
});
export type NewPlanVersionInput = z.infer<typeof newPlanVersionSchema>;

/** Publish a specific draft version (supersedes any currently-published version). Sensitive. */
export const publishPlanVersionSchema = z.object({ reason: reasonSchema });
export type PublishPlanVersionInput = z.infer<typeof publishPlanVersionSchema>;

/** Archive the whole plan. Sensitive; optimistic-concurrency on the plan row. */
export const archivePlanSchema = z.object({ reason: reasonSchema, version: versionSchema });
export type ArchivePlanInput = z.infer<typeof archivePlanSchema>;

export const listPlansQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(120).optional(),
  status: planStatusSchema.optional(),
  audience: planAudienceSchema.optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

// --- Pure version-diff helper (reused by the FE version-history timeline) ------------------

/** The comparable, human-meaningful fields of a plan version. */
export interface PlanVersionSnapshot {
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  baseCampusAllowance: number;
  perCampusPriceMinor: number;
  trialDays: number;
  supportTier: string;
  usageLimits: Record<string, number>;
  featureEntitlements: Record<string, boolean>;
}

export interface PlanVersionFieldChange {
  field: string;
  label: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

const SCALAR_FIELDS: { field: keyof PlanVersionSnapshot; label: string }[] = [
  { field: 'currency', label: 'Currency' },
  { field: 'monthlyPriceMinor', label: 'Monthly price' },
  { field: 'annualPriceMinor', label: 'Annual price' },
  { field: 'baseCampusAllowance', label: 'Base campus allowance' },
  { field: 'perCampusPriceMinor', label: 'Per-campus price' },
  { field: 'trialDays', label: 'Trial days' },
  { field: 'supportTier', label: 'Support tier' },
];

/**
 * Diff two plan-version snapshots, oldest → newest. Returns one entry per changed field; nested
 * usage-limit and feature-entitlement keys are flattened so an added/removed/changed key reads
 * cleanly in the timeline. Pure — no IO — and unit-tested in plans.spec.ts.
 */
export function diffPlanVersions(
  prev: PlanVersionSnapshot | null,
  next: PlanVersionSnapshot,
): PlanVersionFieldChange[] {
  if (!prev) return [];
  const changes: PlanVersionFieldChange[] = [];

  for (const { field, label } of SCALAR_FIELDS) {
    if (prev[field] !== next[field]) {
      changes.push({ field, label, before: prev[field] as string | number, after: next[field] as string | number });
    }
  }

  changes.push(...diffRecord('usageLimits', 'Usage limit', prev.usageLimits, next.usageLimits));
  changes.push(...diffRecord('featureEntitlements', 'Feature', prev.featureEntitlements, next.featureEntitlements));

  return changes;
}

function diffRecord<V extends number | boolean>(
  field: string,
  labelPrefix: string,
  prev: Record<string, V>,
  next: Record<string, V>,
): PlanVersionFieldChange[] {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const out: PlanVersionFieldChange[] = [];
  for (const key of [...keys].sort()) {
    const before = prev?.[key] ?? null;
    const after = next?.[key] ?? null;
    if (before !== after) {
      out.push({ field: `${field}.${key}`, label: `${labelPrefix}: ${key}`, before, after });
    }
  }
  return out;
}
