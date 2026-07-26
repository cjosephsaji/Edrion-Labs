import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { entitlementsQuerySchema, type EntitlementsQuery } from '@edrion/schemas';
import { RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { EntitlementsService } from './entitlements.service';

@ApiTags('entitlements')
@Controller('entitlements')
export class EntitlementsController {
  constructor(private readonly service: EntitlementsService) {}

  @Get()
  @RequirePermissions('entitlements.view')
  resolve(@Query(zodBody(entitlementsQuerySchema)) query: EntitlementsQuery) {
    return this.service.forInstitution(query.institutionId);
  }
}
