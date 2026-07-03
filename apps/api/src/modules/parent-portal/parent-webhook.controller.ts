import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { paymentWebhookSchema, type PaymentWebhookInput } from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
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
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body(zodBody(paymentWebhookSchema)) body: PaymentWebhookInput,
  ) {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body);
    return this.fees.settleWebhook(raw, signature ?? '', body);
  }
}
