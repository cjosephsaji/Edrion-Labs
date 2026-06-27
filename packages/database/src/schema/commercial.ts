import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  actorColumns,
  billingCycleEnum,
  currencyEnum,
  planAudienceEnum,
  planStatusEnum,
  primaryId,
  subscriptionStatusEnum,
  timestamps,
} from './_helpers';
import { institutions } from './institutions';

export const plans = pgTable('plans', {
  id: primaryId(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  audience: planAudienceEnum('audience').notNull().default('institution'),
  status: planStatusEnum('status').notNull().default('draft'),
  /** Optimistic-concurrency token for sensitive status transitions (publish/archive). */
  version: integer('version').notNull().default(0),
  ...actorColumns,
  ...timestamps,
});

/**
 * Immutable plan versions. Active subscriptions point at a version; editing is done by
 * creating a new version so history stays auditable.
 */
export const planVersions = pgTable(
  'plan_versions',
  {
    id: primaryId(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: planStatusEnum('status').notNull().default('draft'),
    currency: currencyEnum('currency').notNull().default('USD'),
    monthlyPriceMinor: integer('monthly_price_minor').notNull().default(0),
    annualPriceMinor: integer('annual_price_minor').notNull().default(0),
    baseCampusAllowance: integer('base_campus_allowance').notNull().default(1),
    perCampusPriceMinor: integer('per_campus_price_minor').notNull().default(0),
    usageLimits: jsonb('usage_limits').$type<Record<string, number>>().default({}),
    featureEntitlements: jsonb('feature_entitlements').$type<Record<string, boolean>>().default({}),
    trialDays: integer('trial_days').notNull().default(0),
    supportTier: text('support_tier').notNull().default('standard'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    planIdx: index('plan_versions_plan_idx').on(t.planId),
    uniq: index('plan_versions_uniq').on(t.planId, t.version),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'cascade',
    }),
    independentUserId: uuid('independent_user_id'),
    planVersionId: uuid('plan_version_id')
      .notNull()
      .references(() => planVersions.id, { onDelete: 'restrict' }),
    status: subscriptionStatusEnum('status').notNull().default('trial'),
    billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
    currency: currencyEnum('currency').notNull().default('USD'),

    /** Pricing override (minor units), null → use plan version price. */
    overridePriceMinor: integer('override_price_minor'),
    institutionPerCampusPriceMinor: integer('institution_per_campus_price_minor'),
    /** Custom discount in basis points applied to the recurring charge (e.g. 1000 = 10%). */
    discountBps: integer('discount_bps').notNull().default(0),
    /** Account credit balance (minor units) drawn down against future invoices. */
    creditBalanceMinor: integer('credit_balance_minor').notNull().default(0),
    /** Per-subscription overage policy when a usage limit is exceeded. */
    overagePolicy: text('overage_policy').notNull().default('block'),
    /** Subscription-level usage-limit overrides, merged over the plan version's limits. */
    usageLimitsOverride: jsonb('usage_limits_override').$type<Record<string, number>>().default({}),

    /** Scheduled (future) plan change — applied by a job at scheduledChangeAt. */
    scheduledPlanVersionId: uuid('scheduled_plan_version_id'),
    scheduledBillingCycle: billingCycleEnum('scheduled_billing_cycle'),
    scheduledChangeAt: timestamp('scheduled_change_at', { withTimezone: true }),

    periodStart: timestamp('period_start', { withTimezone: true }).notNull().defaultNow(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),

    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('subscriptions_institution_idx').on(t.institutionId),
    statusIdx: index('subscriptions_status_idx').on(t.status),
  }),
);

export const subscriptionAddons = pgTable('subscription_addons', {
  id: primaryId(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('campus'),
  campusId: uuid('campus_id'),
  quantity: integer('quantity').notNull().default(1),
  unitPriceMinor: integer('unit_price_minor').notNull().default(0),
  active: boolean('active').notNull().default(true),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanVersion = typeof planVersions.$inferSelect;
export type NewPlanVersion = typeof planVersions.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionAddon = typeof subscriptionAddons.$inferSelect;
export type NewSubscriptionAddon = typeof subscriptionAddons.$inferInsert;
