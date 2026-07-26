import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { InstitutionPrincipal } from '@edrion/auth';
import {
  createEndpointSchema,
  testDeliverySchema,
  type CreateEndpointInput,
  type TestDeliveryInput,
} from '@edrion/schemas';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { IntegrationsService } from '../integrations/integrations.service';
import type { ActionContext } from '../../common/action-context';
import type { EdrionRequestContext } from '../../common/request-context';
import { ReqContext } from '../../common/decorators';

@ApiTags('portal-integrations')
@Controller('portal/integrations')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  private ctx(principal: InstitutionPrincipal, request: EdrionRequestContext): ActionContext {
    return {
      principalContext: {
        principal: {
          employeeId: principal.institutionUserId,
          email: principal.email,
          permissions: principal.permissions,
        } as never,
        kind: 'institution',
      },
      request,
    };
  }

  @Get('webhooks')
  @RequireInstitutionPermissions('integrations.view')
  list(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.integrations.list({
      page: 1,
      pageSize: 50,
      institutionId: principal.institutionId,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  }

  @Get('webhooks/:id/deliveries')
  @RequireInstitutionPermissions('integrations.view')
  deliveries(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.integrations.listDeliveries(id, Number(limit ?? 50));
  }

  @Post('webhooks')
  @RequireInstitutionPermissions('integrations.manage')
  create(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(createEndpointSchema)) body: CreateEndpointInput,
  ) {
    return this.integrations.create(
      { ...body, institutionId: principal.institutionId },
      this.ctx(principal, request),
    );
  }

  @Post('webhooks/:id/test')
  @RequireInstitutionPermissions('integrations.manage')
  test(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(testDeliverySchema)) body: TestDeliveryInput,
  ) {
    return this.integrations.testDelivery(id, body, this.ctx(principal, request));
  }

  @Post('webhooks/:id/retry')
  @RequireInstitutionPermissions('integrations.manage')
  retry(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(z.object({ event_type: z.string().default('webhook.retry') }))) body: { event_type: string },
  ) {
    return this.integrations.testDelivery(
      id,
      { eventType: body.event_type },
      this.ctx(principal, request),
    );
  }
}
