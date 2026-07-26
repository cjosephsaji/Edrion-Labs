import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { MockPaymentProvider } from './mock-payment.provider';
import type { PaymentProvider } from './payment-provider';
import { RazorpayPaymentProvider } from './razorpay-payment.provider';

@Injectable()
export class PaymentProviderRegistry {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly mock: MockPaymentProvider,
    private readonly razorpay: RazorpayPaymentProvider,
  ) {}

  configured(): PaymentProvider {
    if (this.env.FEES_PAYMENT_PROVIDER === 'razorpay') return this.razorpay;
    if (this.env.NODE_ENV === 'production') throw new ServiceUnavailableException({ code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', message: 'A live fee provider must be configured in production.' });
    return this.mock;
  }

  byKey(key: string): PaymentProvider | undefined {
    return key === 'razorpay' ? this.razorpay : key === 'mock' ? this.mock : undefined;
  }
}
