import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  campusChargePreviewSchema,
  createCampusSchema,
  listCampusesQuerySchema,
  reasonSchema,
  type CampusChargePreviewInput,
  type CreateCampusInput,
  type ListCampusesQuery,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import { CampusesService } from './campuses.service';

const suspendSchema = z.object({ reason: reasonSchema, version: z.number().int().nonnegative() });

@ApiTags('campuses')
@Controller('campuses')
export class CampusesController {
  constructor(private readonly service: CampusesService) {}

  @Get()
  @RequirePermissions('campuses.view')
  async list(@Query(zodBody(listCampusesQuerySchema)) query: ListCampusesQuery) {
    const { items, total } = await this.service.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, hasMore: query.page * query.pageSize < total };
  }

  /** Charge preview — shown for confirmation BEFORE a campus (and its charge) is created. */
  @Post('charge-preview')
  @RequirePermissions('campuses.view')
  preview(@Body(zodBody(campusChargePreviewSchema)) body: CampusChargePreviewInput) {
    return this.service.previewCharge(body);
  }

  @Post()
  @RequirePermissions('campuses.create')
  create(
    @Body(zodBody(createCampusSchema)) body: CreateCampusInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.create(body, { principalContext: pc, request });
  }

  @Post(':id/suspend')
  @RequirePermissions('campuses.suspend')
  suspend(
    @Param('id') id: string,
    @Body(zodBody(suspendSchema)) body: { reason: string; version: number },
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.suspend(id, body.version, body.reason, { principalContext: pc, request });
  }
}
