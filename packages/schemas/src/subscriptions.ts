import { z } from 'zod';
import { BillingCycle, SubscriptionStatus } from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, versionSchema, zEnumFromConst } from './common';

export const billingCycleSchema = zEnumFromConst(BillingCycle);
export const subscriptionStatusSchema = zEnumFromConst(SubscriptionStatus);
export const overagePolicySchema = z.enum(['block', 'allow', 'notify']);

export const listSubscriptionsQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  institutionId: z.string().uuid().optional(),
  status: subscriptionStatusSchema.optional(),
  billingCycle: billingCycleSchema.optional(),
});
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;

// --- Plan change (immediate + scheduled) + preview ----------------------------------------

export const planChangePreviewSchema = z.object({
  planVersionId: z.string().uuid(),
  billingCycle: billingCycleSchema.optional(),
  effectiveDate: z.string().datetime().optional(),
});
export type PlanChangePreviewInput = z.infer<typeof planChangePreviewSchema>;

export const changePlanSchema = z.object({
  planVersionId: z.string().uuid(),
  billingCycle: billingCycleSchema.optional(),
  effectiveDate: z.string().datetime().optional(),
  reason: reasonSchema,
  version: versionSchema,
});
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

export const schedulePlanChangeSchema = z.object({
  planVersionId: z.string().uuid(),
  billingCycle: billingCycleSchema.optional(),
  scheduledChangeAt: z.string().datetime(),
  reason: reasonSchema,
  version: versionSchema,
});
export type SchedulePlanChangeInput = z.infer<typeof schedulePlanChangeSchema>;

// --- Cycle change + preview ---------------------------------------------------------------

export const cycleChangePreviewSchema = z.object({
  billingCycle: billingCycleSchema,
  effectiveDate: z.string().datetime().optional(),
});
export type CycleChangePreviewInput = z.infer<typeof cycleChangePreviewSchema>;

export const changeCycleSchema = z.object({
  billingCycle: billingCycleSchema,
  effectiveDate: z.string().datetime().optional(),
  reason: reasonSchema,
  version: versionSchema,
});
export type ChangeCycleInput = z.infer<typeof changeCycleSchema>;

// --- Trial / add-ons / pricing / discount / credit ----------------------------------------

export const extendSubTrialSchema = z.object({
  trialEndsAt: z.string().datetime(),
  reason: reasonSchema,
  version: versionSchema,
});
export type ExtendSubTrialInput = z.infer<typeof extendSubTrialSchema>;

export const addCampusAddonSchema = z.object({
  campusId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(1000).default(1),
  /** Per-unit price override (minor); omit to use the subscription's per-campus price. */
  unitPriceMinor: z.number().int().min(0).max(100_000_000).optional(),
  effectiveDate: z.string().datetime().optional(),
  reason: reasonSchema,
  version: versionSchema,
});
export type AddCampusAddonInput = z.infer<typeof addCampusAddonSchema>;

export const removeAddonSchema = z.object({
  addonId: z.string().uuid(),
  reason: reasonSchema,
  version: versionSchema,
});
export type RemoveAddonInput = z.infer<typeof removeAddonSchema>;

export const overridePricingSchema = z.object({
  /** null clears the override → revert to plan-version price. */
  overridePriceMinor: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  institutionPerCampusPriceMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
  reason: reasonSchema,
  version: versionSchema,
});
export type OverridePricingInput = z.infer<typeof overridePricingSchema>;

export const discountSchema = z.object({
  discountBps: z.number().int().min(0).max(10_000),
  reason: reasonSchema,
  version: versionSchema,
});
export type DiscountInput = z.infer<typeof discountSchema>;

export const creditSchema = z.object({
  /** Positive grants credit; negative consumes it. Cannot be zero. */
  amountMinor: z.number().int().refine((n) => n !== 0, 'Amount cannot be zero'),
  reason: reasonSchema,
  version: versionSchema,
});
export type CreditInput = z.infer<typeof creditSchema>;

export const usageLimitsSchema = z.object({
  usageLimitsOverride: z.record(z.string(), z.number().int().min(0)),
  reason: reasonSchema,
  version: versionSchema,
});
export type UsageLimitsInput = z.infer<typeof usageLimitsSchema>;

export const overageSchema = z.object({
  overagePolicy: overagePolicySchema,
  reason: reasonSchema,
  version: versionSchema,
});
export type OverageInput = z.infer<typeof overageSchema>;

export const graceSchema = z.object({
  gracePeriodEndsAt: z.string().datetime(),
  reason: reasonSchema,
  version: versionSchema,
});
export type GraceInput = z.infer<typeof graceSchema>;

// --- Lifecycle (pause / resume / cancel) --------------------------------------------------

export const subscriptionStatusActionSchema = z.object({
  reason: reasonSchema,
  version: versionSchema,
});
export type SubscriptionStatusActionInput = z.infer<typeof subscriptionStatusActionSchema>;

export const cancelSubscriptionSchema = z.object({
  reason: reasonSchema,
  version: versionSchema,
  /** When false, schedule cancellation for period end; when true, cancel now. */
  immediate: z.boolean().default(false),
  cancelAt: z.string().datetime().optional(),
});
export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
