import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { currencyEnum, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { feeInvoices } from './fees';
import { institutionUsers } from './users';

/**
 * PARENT-PORTAL online payment intents. A guardian creates an intent against a fee invoice; the
 * provider (mock in dev, Razorpay/Stripe adapters) confirms out-of-band, and settlement happens ONLY
 * via a signed webhook that verifies HMAC + timestamp, inserts a fee_payments row and audits. Amount
 * is in MINOR units (matching fees). Idempotency-Key makes intent creation safe to retry.
 */
export const parentPaymentIntents = pgTable(
  'parent_payment_intents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    feeInvoiceId: uuid('fee_invoice_id')
      .notNull()
      .references(() => feeInvoices.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** Amount to charge, minor units. */
    amount: integer('amount').notNull(),
    currency: currencyEnum('currency').notNull().default('INR'),
    /** razorpay | stripe | manual | mock. */
    provider: text('provider').notNull().default('mock'),
    /** Provider-side order/intent id. */
    providerRef: text('provider_ref'),
    /** created | pending | succeeded | failed | expired. */
    status: text('status').notNull().default('created'),
    /** The Idempotency-Key the intent was created under (unique per institution). */
    idempotencyKey: text('idempotency_key'),
    /** fee_payments id inserted on settlement (bridge). */
    settledPaymentId: uuid('settled_payment_id'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    invoiceIdx: index('parent_payment_intents_invoice_idx').on(t.feeInvoiceId),
    guardianIdx: index('parent_payment_intents_guardian_idx').on(t.guardianUserId, t.createdAt),
    providerRefIdx: index('parent_payment_intents_provider_ref_idx').on(t.provider, t.providerRef),
    idemUniq: uniqueIndex('parent_payment_intents_idem_uniq').on(t.institutionId, t.idempotencyKey),
  }),
);

export type ParentPaymentIntent = typeof parentPaymentIntents.$inferSelect;
export type NewParentPaymentIntent = typeof parentPaymentIntents.$inferInsert;
