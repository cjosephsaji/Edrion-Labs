/**
 * Payment provider seam. A guardian creates an intent against a fee invoice; the provider confirms
 * out-of-band and settlement happens ONLY via a signed webhook (verified here). The mock provider is
 * fully working for dev; a Razorpay adapter is a clean skeleton (no secrets committed).
 */
export interface CreateIntentArgs {
  intentId: string;
  amountMinor: number;
  currency: string;
  invoiceNo: string;
}

export interface CreatedIntent {
  providerRef: string;
  status: 'created' | 'pending';
}

export interface PaymentProvider {
  readonly key: string;
  createIntent(args: CreateIntentArgs): Promise<CreatedIntent>;
  /** Browser-safe checkout configuration. Secrets are never returned. */
  clientConfig?(): { keyId: string };
  /** Verify a webhook's raw body against its signature header. */
  verifyWebhook(rawBody: string, signature: string): boolean;
  /** Verify the provider's browser-return signature without trusting client status text. */
  verifyClientConfirmation?(args: { providerRef: string; paymentId: string; signature: string }): boolean;
}
