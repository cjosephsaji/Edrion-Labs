import { z } from 'zod';
import { WebhookEventType } from '@edrion/shared-types';
import { paginationQuerySchema, reasonSchema, sortQuerySchema, zEnumFromConst } from './common';

export const webhookEventTypeSchema = zEnumFromConst(WebhookEventType);

/** Event types a user may subscribe an endpoint to (excludes the on-demand `webhook.test`). */
export const SUBSCRIBABLE_WEBHOOK_EVENTS = Object.values(WebhookEventType).filter(
  (e) => e !== WebhookEventType.WebhookTest,
);

const urlSchema = z
  .string()
  .trim()
  .url('Must be a valid URL')
  .max(2048)
  .refine((u) => u.startsWith('http://') || u.startsWith('https://'), 'Must be an http(s) URL');

export const listEndpointsQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(120).optional(),
  active: z.coerce.boolean().optional(),
  institutionId: z.string().uuid().optional(),
});
export type ListEndpointsQuery = z.infer<typeof listEndpointsQuerySchema>;

export const createEndpointSchema = z.object({
  url: urlSchema,
  events: z.array(webhookEventTypeSchema).min(1, 'Subscribe to at least one event').max(20),
  institutionId: z.string().uuid().optional(),
  description: z.string().trim().max(280).optional(),
});
export type CreateEndpointInput = z.infer<typeof createEndpointSchema>;

export const updateEndpointSchema = z.object({
  url: urlSchema.optional(),
  events: z.array(webhookEventTypeSchema).min(1).max(20).optional(),
  active: z.boolean().optional(),
  description: z.string().trim().max(280).nullable().optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateEndpointInput = z.infer<typeof updateEndpointSchema>;

/** Rotate an endpoint's signing secret. Sensitive — reason required, recorded in audit. */
export const rotateSecretSchema = z.object({
  reason: reasonSchema,
  version: z.number().int().nonnegative(),
});
export type RotateSecretInput = z.infer<typeof rotateSecretSchema>;

/** Fire a test delivery against an endpoint. */
export const testDeliverySchema = z.object({
  eventType: webhookEventTypeSchema.default(WebhookEventType.WebhookTest),
});
export type TestDeliveryInput = z.infer<typeof testDeliverySchema>;
