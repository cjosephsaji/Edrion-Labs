import { Module } from '@nestjs/common';
import { SupportCasesController } from './support-cases.controller';
import { SupportCasesService } from './support-cases.service';
import { SupportCasesRepository } from './support-cases.repository';

@Module({
  controllers: [SupportCasesController],
  providers: [SupportCasesService, SupportCasesRepository],
  exports: [SupportCasesService],
})
export class SupportCasesModule {}
