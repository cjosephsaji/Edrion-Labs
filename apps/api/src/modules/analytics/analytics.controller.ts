import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  /** Aggregated platform dashboard — a few grouped queries, no N+1. */
  @Get('dashboard')
  @RequirePermissions('platform.dashboard.view')
  dashboard() {
    return this.service.dashboard();
  }

  /** Pending actions grouped Critical/Today/Upcoming/Informational. */
  @Get('pending-actions')
  @RequirePermissions('platform.dashboard.view')
  pendingActions() {
    return this.service.pendingActions();
  }
}
