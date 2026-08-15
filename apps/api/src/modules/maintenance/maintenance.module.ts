import { Module } from '@nestjs/common';
import { SupportAccessModule } from '../support-access/support-access.module';
import { CampusMirrorsModule } from '../student/campus-mirrors/campus-mirrors.module';
import { ObservabilityModule } from '../observability/observability.module';
import { MaintenanceService } from './maintenance.service';

/** Schedules + runs the tracked maintenance sweeps (Phase 10e). Queue infra is global. */
@Module({
  imports: [SupportAccessModule, CampusMirrorsModule, ObservabilityModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
