import { Module } from '@nestjs/common';
import { SupportAccessModule } from '../support-access/support-access.module';
import { VisualStudioModule } from '../student/visual-studio/visual-studio.module';
import { MaintenanceService } from './maintenance.service';

/** Schedules + runs the tracked maintenance sweeps (Phase 10e). Queue infra is global. */
@Module({
  imports: [SupportAccessModule, VisualStudioModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
