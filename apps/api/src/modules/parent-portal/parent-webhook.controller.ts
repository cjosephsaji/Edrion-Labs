import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { paymentWebhookSchema, type PaymentWebhookInput } from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { SkipRateLimit } from '../../common/decorators';
import { ParentFeesService } from './parent-fees.service';

/**
 * UNAUTHENTICATED payment settlement webhook (/v1/parent/payments/webhook). No guardian/auth guard —
 * the HMAC signature over the raw body (verified in the service) is the only trust anchor. Separate
 * from ParentController so the auth guards don't apply.
 */
@ApiTags('parent-portal')
@Controller('parent/payments')
@Public()
@SkipRateLimit()
export class ParentWebhookController {
  constructor(private readonly fees: ParentFeesService) {}

  @Post('webhook')
  webhook(
    @Req() req: Request,
    @Headers('x-webhook-signature') mockSignature: string | undefined,
    @Headers('x-razorpay-signature') razorpaySignature: string | undefined,
    @Headers('x-razorpay-event-id') razorpayEventId: string | undefined,
    @Body() body: unknown,
  ) {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body);
    const normalized = razorpaySignature ? normalizeRazorpay(body) : paymentWebhookSchema.parse(body);
    return this.fees.settleWebhook(raw, razorpaySignature ?? mockSignature ?? '', normalized, razorpayEventId);
  }
}

function normalizeRazorpay(body: unknown): PaymentWebhookInput {
  const value=body as {event?:unknown;payload?:{payment?:{entity?:{order_id?:unknown;amount?:unknown;status?:unknown}}}};
  const entity=value.payload?.payment?.entity;
  return paymentWebhookSchema.parse({provider:'razorpay',providerRef:entity?.order_id,event:value.event,status:entity?.status==='captured'?'succeeded':entity?.status==='failed'?'failed':'expired',amount:entity?.amount});
}
