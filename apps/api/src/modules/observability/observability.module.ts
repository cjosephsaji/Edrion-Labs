import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { ObservabilityController } from './observability.controller';
import { PrincipalMetricsController } from './principal-metrics.controller';
import { PrincipalMetricsService } from './principal-metrics.service';

/** Receives client-side crash reports. Logger + reporter come from the global CoreModule. */
@Module({
  imports: [PortalModule],
  controllers: [ObservabilityController, PrincipalMetricsController],
  providers: [PrincipalMetricsService],
  exports: [PrincipalMetricsService],
})
export class ObservabilityModule {}
