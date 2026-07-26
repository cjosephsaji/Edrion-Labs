import { Module } from '@nestjs/common';
import { SupportAccessController } from './support-access.controller';
import { SupportAccessService } from './support-access.service';
import { SupportAccessRepository } from './support-access.repository';

@Module({
  controllers: [SupportAccessController],
  providers: [SupportAccessService, SupportAccessRepository],
  exports: [SupportAccessService],
})
export class SupportAccessModule {}
