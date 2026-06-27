import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingRepository } from './billing.repository';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, IdempotencyService],
  exports: [BillingService],
})
export class BillingModule {}
