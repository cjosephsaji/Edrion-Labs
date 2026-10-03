import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';

export const institutionIdentityProviders = pgTable('institution_identity_providers', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('oidc'),
  name: text('name').notNull(),
  issuer: text('issuer').notNull(),
  clientId: text('client_id').notNull(),
  clientSecret: text('client_secret'),
  discoveryUrl: text('discovery_url'),
  scopes: text('scopes').notNull().default('openid email profile'),
  enabled: boolean('enabled').notNull().default(false),
  jitProvision: boolean('jit_provision').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (t) => ({ tenantIdentity: uniqueIndex('institution_identity_provider_tenant_uq').on(t.id, t.institutionId) }));

export const rosterSyncJobs = pgTable('roster_sync_jobs', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: text('status').notNull().default('queued'),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  compatibility: jsonb('compatibility').$type<Record<string, unknown> | null>(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
