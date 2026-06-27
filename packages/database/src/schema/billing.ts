import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, currencyEnum, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';

/**
 * Billing tables. All money is integer minor units. Financial mutations are guarded for
 * replay by the idempotency_keys table (see IdempotencyService). Status columns are text with
 * documented allowed values (kept out of pg enums to avoid migration churn on new states).
 */

/** invoice.status: draft | open | paid | void | uncollectible | refunded */
export const invoices = pgTable(
  'invoices',
  {
    id: primaryId(),
    /** Human invoice number, assigned on finalize (null while draft). */
    number: text('number').unique(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id'),
    status: text('status').notNull().default('draft'),
    currency: currencyEnum('currency').notNull().default('USD'),
    subtotalMinor: integer('subtotal_minor').notNull().default(0),
    discountMinor: integer('discount_minor').notNull().default(0),
    taxMinor: integer('tax_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull().default(0),
    amountPaidMinor: integer('amount_paid_minor').notNull().default(0),
    amountDueMinor: integer('amount_due_minor').notNull().default(0),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    /** dunning lifecycle: none | reminder | overdue | final_notice | written_off */
    dunningState: text('dunning_state').notNull().default('none'),
    attemptCount: integer('attempt_count').notNull().default(0),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('invoices_institution_idx').on(t.institutionId),
    statusIdx: index('invoices_status_idx').on(t.status),
  }),
);

/** invoice_item.kind: subscription | campus_addon | usage | adjustment | discount */
export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: primaryId(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('subscription'),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceMinor: integer('unit_price_minor').notNull().default(0),
    amountMinor: integer('amount_minor').notNull().default(0),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => ({ invoiceIdx: index('invoice_items_invoice_idx').on(t.invoiceId) }),
);

/** payment.status: pending | succeeded | failed | refunded */
export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id'),
    status: text('status').notNull().default('pending'),
    method: text('method').notNull().default('card'),
    amountMinor: integer('amount_minor').notNull().default(0),
    currency: currencyEnum('currency').notNull().default('USD'),
    provider: text('provider').notNull().default('manual'),
    providerRef: text('provider_ref'),
    failureReason: text('failure_reason'),
    idempotencyKey: text('idempotency_key'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('payments_institution_idx').on(t.institutionId),
    statusIdx: index('payments_status_idx').on(t.status),
    invoiceIdx: index('payments_invoice_idx').on(t.invoiceId),
  }),
);

/** refund.status: pending | succeeded | failed */
export const refunds = pgTable('refunds', {
  id: primaryId(),
  paymentId: uuid('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id'),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  amountMinor: integer('amount_minor').notNull().default(0),
  currency: currencyEnum('currency').notNull().default('USD'),
  reason: text('reason'),
  status: text('status').notNull().default('succeeded'),
  providerRef: text('provider_ref'),
  ...actorColumns,
  ...timestamps,
});

/** Credit ledger. source: manual | proration | refund | adjustment | goodwill */
export const credits = pgTable(
  'credits',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id'),
    amountMinor: integer('amount_minor').notNull().default(0),
    remainingMinor: integer('remaining_minor').notNull().default(0),
    currency: currencyEnum('currency').notNull().default('USD'),
    reason: text('reason'),
    source: text('source').notNull().default('manual'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({ instIdx: index('credits_institution_idx').on(t.institutionId) }),
);

/** discount.kind: percentage | fixed. appliesTo: subscription | invoice */
export const discounts = pgTable('discounts', {
  id: primaryId(),
  code: text('code').unique(),
  name: text('name').notNull(),
  institutionId: uuid('institution_id'),
  kind: text('kind').notNull().default('percentage'),
  valueBps: integer('value_bps'),
  valueMinor: integer('value_minor'),
  currency: currencyEnum('currency'),
  appliesTo: text('applies_to').notNull().default('invoice'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  ...actorColumns,
  ...timestamps,
});

export const usageMetrics = pgTable(
  'usage_metrics',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id'),
    metric: text('metric').notNull(),
    quantity: integer('quantity').notNull().default(0),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => ({ instIdx: index('usage_metrics_institution_idx').on(t.institutionId) }),
);

/** Per-period snapshot of what each campus contributes to billing. */
export const campusBillingItems = pgTable(
  'campus_billing_items',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').notNull(),
    subscriptionId: uuid('subscription_id'),
    invoiceId: uuid('invoice_id'),
    billingStatus: text('billing_status').notNull().default('paid_addon'),
    unitPriceMinor: integer('unit_price_minor').notNull().default(0),
    proratedMinor: integer('prorated_minor').notNull().default(0),
    currency: currencyEnum('currency').notNull().default('USD'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => ({ instIdx: index('campus_billing_items_institution_idx').on(t.institutionId) }),
);

/**
 * Replay protection for financial mutations. The unique key short-circuits a retried request
 * to its stored response. status: in_progress | completed.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: primaryId(),
    key: text('key').notNull().unique(),
    scope: text('scope').notNull(),
    status: text('status').notNull().default('in_progress'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    entityId: uuid('entity_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({ keyIdx: index('idempotency_keys_key_idx').on(t.key) }),
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
export type Credit = typeof credits.$inferSelect;
export type NewCredit = typeof credits.$inferInsert;
export type Discount = typeof discounts.$inferSelect;
export type NewDiscount = typeof discounts.$inferInsert;
export type UsageMetric = typeof usageMetrics.$inferSelect;
export type NewUsageMetric = typeof usageMetrics.$inferInsert;
export type CampusBillingItem = typeof campusBillingItems.$inferSelect;
export type NewCampusBillingItem = typeof campusBillingItems.$inferInsert;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
