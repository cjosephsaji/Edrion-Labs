import { describe, expect, it } from 'vitest';
import {
  createEndpointSchema,
  rotateSecretSchema,
  testDeliverySchema,
  updateEndpointSchema,
} from './integrations';

describe('integrations schemas', () => {
  it('requires a valid http(s) url and at least one event on create', () => {
    expect(
      createEndpointSchema.safeParse({ url: 'https://example.com/hook', events: ['invoice.paid'] }).success,
    ).toBe(true);
    expect(createEndpointSchema.safeParse({ url: 'ftp://x', events: ['invoice.paid'] }).success).toBe(false);
    expect(createEndpointSchema.safeParse({ url: 'https://x.co', events: [] }).success).toBe(false);
  });

  it('rejects unknown event types', () => {
    expect(
      createEndpointSchema.safeParse({ url: 'https://x.co', events: ['not.a.real.event'] }).success,
    ).toBe(false);
  });

  it('update requires a version and allows toggling active', () => {
    expect(updateEndpointSchema.safeParse({ active: false }).success).toBe(false);
    expect(updateEndpointSchema.safeParse({ active: false, version: 1 }).success).toBe(true);
  });

  it('rotateSecret requires a reason + version', () => {
    expect(rotateSecretSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(rotateSecretSchema.safeParse({ reason: 'leaked secret', version: 0 }).success).toBe(true);
  });

  it('testDelivery defaults to webhook.test', () => {
    expect(testDeliverySchema.parse({}).eventType).toBe('webhook.test');
  });
});
