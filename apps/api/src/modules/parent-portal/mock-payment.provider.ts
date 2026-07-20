import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CreateIntentArgs, CreatedIntent, PaymentProvider } from './payment-provider';

/**
 * Dev/test payment provider. `createIntent` mints a deterministic provider ref; settlement is driven
 * by POSTing a signed webhook to /v1/parent/payments/webhook. The signature is
 * HMAC-SHA256(rawBody, secret) — the same shape a real provider uses — so the webhook verification
 * path is exercised for real. Secret from PARENT_PAYMENT_WEBHOOK_SECRET (dev default below).
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly key = 'mock';
  private readonly secret = process.env.PARENT_PAYMENT_WEBHOOK_SECRET ?? 'dev-parent-webhook-secret';

  async createIntent(args: CreateIntentArgs): Promise<CreatedIntent> {
    return { providerRef: `mock_${args.invoiceNo}_${randomUUID().slice(0, 8)}`, status: 'pending' };
  }

  sign(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!signature) return false;
    const expected = this.sign(rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  verifyClientConfirmation(args: { providerRef: string; paymentId: string; signature: string }): boolean {
    return this.verifyWebhook(`${args.providerRef}|${args.paymentId}`, args.signature);
  }
}
