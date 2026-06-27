import { Module } from '@nestjs/common';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsRepository } from './entitlements.repository';

@Module({
  controllers: [EntitlementsController],
  providers: [EntitlementsService, EntitlementsRepository],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
