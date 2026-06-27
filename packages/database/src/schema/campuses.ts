import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  actorColumns,
  campusBillingStatusEnum,
  primaryId,
  timestamps,
} from './_helpers';
import { institutions } from './institutions';

export const campuses = pgTable(
  'campuses',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: jsonb('address').$type<Record<string, unknown>>(),
    contact: jsonb('contact').$type<Record<string, unknown>>(),
    timezoneOverride: text('timezone_override'),
    academicConfig: jsonb('academic_config').$type<Record<string, unknown>>().default({}),

    isActive: boolean('is_active').notNull().default(true),
    openingDate: timestamp('opening_date', { withTimezone: true }),
    studentCapacity: integer('student_capacity'),
    currentUserCount: integer('current_user_count').notNull().default(0),

    billingStatus: campusBillingStatusEnum('billing_status').notNull().default('included'),
    /** Per-campus add-on price (minor units). Null → use plan default. */
    addonPriceMinor: integer('addon_price_minor'),
    /** Custom discount in basis points. */
    customDiscountBps: integer('custom_discount_bps'),
    effectiveBillingDate: timestamp('effective_billing_date', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),

    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('campuses_institution_idx').on(t.institutionId),
    codeUniq: index('campuses_institution_code_uniq').on(t.institutionId, t.code),
    billingIdx: index('campuses_billing_status_idx').on(t.billingStatus),
  }),
);

export type Campus = typeof campuses.$inferSelect;
export type NewCampus = typeof campuses.$inferInsert;
