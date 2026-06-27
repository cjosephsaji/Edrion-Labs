import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  actorColumns,
  currencyEnum,
  institutionStatusEnum,
  institutionTypeEnum,
  onboardingStatusEnum,
  primaryId,
  supportTierEnum,
  timestamps,
} from './_helpers';
import { platformEmployees } from './identity';

type Contact = { name: string; email: string; phone?: string; title?: string };
type Address = {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
};

export const institutions = pgTable(
  'institutions',
  {
    id: primaryId(),
    /** Human-friendly slug/identifier shown in the UI (e.g. INST-00123). */
    publicId: text('public_id').notNull().unique(),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name').notNull(),
    type: institutionTypeEnum('type').notNull(),
    logoUrl: text('logo_url'),

    country: text('country').notNull(),
    region: text('region'),
    timezone: text('timezone').notNull().default('UTC'),
    currency: currencyEnum('currency').notNull().default('USD'),
    dataRegion: text('data_region').notNull().default('default'),

    address: jsonb('address').$type<Address>(),
    primaryContact: jsonb('primary_contact').$type<Contact>().notNull(),
    billingContact: jsonb('billing_contact').$type<Contact>(),
    technicalContact: jsonb('technical_contact').$type<Contact>(),

    status: institutionStatusEnum('status').notNull().default('lead'),
    onboardingStatus: onboardingStatusEnum('onboarding_status').notNull().default('not_started'),
    supportTier: supportTierEnum('support_tier').notNull().default('standard'),

    customerSuccessOwnerId: uuid('customer_success_owner_id').references(
      () => platformEmployees.id,
      { onDelete: 'set null' },
    ),

    activatedAt: timestamp('activated_at', { withTimezone: true }),
    trialStartsAt: timestamp('trial_starts_at', { withTimezone: true }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspensionReason: text('suspension_reason'),

    /** Flexible bag for risk flags + cached usage stats; queried fields are promoted to columns. */
    riskFlags: jsonb('risk_flags').$type<string[]>().default([]),
    usageStats: jsonb('usage_stats').$type<Record<string, number>>().default({}),
    internalNotes: text('internal_notes'),

    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('institutions_status_idx').on(t.status),
    typeIdx: index('institutions_type_idx').on(t.type),
    countryIdx: index('institutions_country_idx').on(t.country),
    ownerIdx: index('institutions_owner_idx').on(t.customerSuccessOwnerId),
    displayIdx: index('institutions_display_idx').on(t.displayName),
  }),
);

export type Institution = typeof institutions.$inferSelect;
export type NewInstitution = typeof institutions.$inferInsert;
