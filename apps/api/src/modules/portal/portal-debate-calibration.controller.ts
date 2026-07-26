import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import type { InstitutionPrincipal } from '@edrion/auth';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  RequireInstitutionPermissions,
} from '../portal/portal.decorators';

const pinSchema = z.object({
  pipeline_version: z.string().trim().min(1).max(32),
  note: z.string().trim().max(400).optional(),
});

@ApiTags('portal-debate-calibration')
@Controller('portal/debate/calibration')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalDebateCalibrationController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get('reviews')
  @RequireInstitutionPermissions('audit.view')
  async listReviews(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    const rows = await this.db
      .select({
        id: schema.debateAdjudicationCalls.id,
        stage: schema.debateAdjudicationCalls.stage,
        model: schema.debateAdjudicationCalls.model,
        createdAt: schema.debateAdjudicationCalls.createdAt,
        debateId: schema.debateAdjudicationRuns.debateId,
      })
      .from(schema.debateAdjudicationCalls)
      .innerJoin(
        schema.debateAdjudicationRuns,
        eq(schema.debateAdjudicationRuns.id, schema.debateAdjudicationCalls.runId),
      )
      .innerJoin(schema.debates, eq(schema.debates.id, schema.debateAdjudicationRuns.debateId))
      .where(eq(schema.debates.institutionId, principal.institutionId))
      .limit(50);
    return { items: rows };
  }

  @Post('model-pin')
  @RequireInstitutionPermissions('institution_settings.manage')
  async pinModel(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(pinSchema)) body: z.infer<typeof pinSchema>,
  ) {
    return {
      ok: true,
      institutionId: principal.institutionId,
      pipelineVersion: body.pipeline_version,
      note: body.note ?? null,
      pinnedAt: new Date().toISOString(),
    };
  }
}
