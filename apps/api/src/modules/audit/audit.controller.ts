import { Controller, Get, Header, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  listActivityQuerySchema,
  listAuditQuerySchema,
  type ListActivityQuery,
  type ListAuditQuery,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  list(@Query(zodBody(listAuditQuerySchema)) query: ListAuditQuery) {
    return this.service.listAudit(query);
  }

  /** Human-readable activity feed (cursor-paginated). */
  @Get('activity')
  @RequirePermissions('audit.view')
  activity(@Query(zodBody(listActivityQuerySchema)) query: ListActivityQuery) {
    return this.service.listActivity(query);
  }

  /** CSV export of filtered audit rows. Sensitive — audited server-side. */
  @Get('export')
  @RequirePermissions('audit.export')
  @Header('content-type', 'text/csv')
  async export(
    @Query(zodBody(listAuditQuerySchema)) query: ListAuditQuery,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx: ActionContext = { principalContext: pc, request };
    const { filename, csv } = await this.service.exportCsv(query, ctx);
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @Get(':id')
  @RequirePermissions('audit.view')
  get(@Param('id') id: string) {
    return this.service.getAudit(id);
  }
}
