import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsDeliveriesController {
  constructor(private readonly service: IntegrationsService) {}

  @Get(':id/deliveries')
  @RequirePermissions('integrations.view')
  list(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.listDeliveries(id, Number(limit ?? 50));
  }
}
