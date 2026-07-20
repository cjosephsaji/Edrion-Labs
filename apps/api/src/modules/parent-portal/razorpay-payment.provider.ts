import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import type { CreateIntentArgs, CreatedIntent, PaymentProvider } from './payment-provider';

/** Credential-ready Razorpay Orders adapter. No network call is made unless explicitly selected. */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly key = 'razorpay';
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  clientConfig(): { keyId: string } {
    if (!this.env.RAZORPAY_KEY_ID) throw new ServiceUnavailableException({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Razorpay credentials are not configured.' });
    return { keyId: this.env.RAZORPAY_KEY_ID };
  }

  async createIntent(args: CreateIntentArgs): Promise<CreatedIntent> {
    const keyId = this.env.RAZORPAY_KEY_ID;
    const secret = this.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !secret) throw new ServiceUnavailableException({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'Razorpay credentials are not configured.' });
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: args.amountMinor, currency: args.currency, receipt: args.intentId.slice(0, 40), notes: { invoice_no: args.invoiceNo, intent_id: args.intentId } }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; status?: string; error?: { description?: string } };
    if (!response.ok || !body.id) throw new ServiceUnavailableException({ code: 'PAYMENT_PROVIDER_ERROR', message: body.error?.description ?? 'Razorpay order creation failed.' });
    return { providerRef: body.id, status: body.status === 'created' ? 'created' : 'pending' };
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    const secret = this.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const left = Buffer.from(expected); const right = Buffer.from(signature);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  verifyClientConfirmation(args: { providerRef: string; paymentId: string; signature: string }): boolean {
    const secret=this.env.RAZORPAY_KEY_SECRET;if(!secret||!args.signature)return false;
    const expected=createHmac('sha256',secret).update(`${args.providerRef}|${args.paymentId}`).digest('hex');
    const left=Buffer.from(expected);const right=Buffer.from(args.signature);return left.length===right.length&&timingSafeEqual(left,right);
  }
}
