import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, deliveryStatusEnum, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';

/**
 * Outbound webhook endpoints (Phase 10f-4). Platform- or institution-scoped HTTP targets that
 * receive HMAC-signed event payloads. `secret` signs the body (never returned in full by the
 * API). Versioned for optimistic concurrency on update/rotate.
 */
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: primaryId(),
    /** Null = platform-wide endpoint; set = scoped to one institution (RLS-isolated). */
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    /** HMAC-SHA256 signing secret. Redacted in API responses. */
    secret: text('secret').notNull(),
    previousSecret: text('previous_secret'),
    previousSecretExpiresAt: timestamp('previous_secret_expires_at', { withTimezone: true }),
    description: text('description'),
    /** Subscribed event types (WebhookEventType values). */
    events: text('events').array().notNull().default([]),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    byInstitution: index('webhook_endpoints_institution_idx').on(t.institutionId),
    activeIdx: index('webhook_endpoints_active_idx').on(t.active),
  }),
);

/**
 * Webhook delivery attempts — APPEND-ONLY (insert/select only; see zzz_grants.sql). Each row is
 * one immutable attempt: a worker signs + POSTs the payload, then records the outcome here.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: primaryId(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    eventId: uuid('event_id'),
    eventVersion: text('event_version'),
    envelope: jsonb('envelope').$type<Record<string, unknown> | null>(),
    status: deliveryStatusEnum('status').notNull().default('pending'),
    /** Attempt number (1-based) within the delivering job. */
    attempts: integer('attempts').notNull().default(1),
    responseStatus: integer('response_status'),
    lastError: text('last_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEndpoint: index('webhook_deliveries_endpoint_idx').on(t.endpointId, t.createdAt),
    statusIdx: index('webhook_deliveries_status_idx').on(t.status),
  }),
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
