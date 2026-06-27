import { Module } from '@nestjs/common';
import { SupportAccessModule } from '../support-access/support-access.module';
import { MaintenanceService } from './maintenance.service';

/** Schedules + runs the tracked maintenance sweeps (Phase 10e). Queue infra is global. */
@Module({
  imports: [SupportAccessModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
