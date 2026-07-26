import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
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
import { SensitiveReportService } from './sensitive-report.service';

const unsealSchema = z.object({
  purpose: z.string().trim().min(10).max(500),
  ttl_hours: z.number().int().min(1).max(72).default(24),
  first_approval_id: z.string().uuid().optional(),
});

@ApiTags('portal-sensitive-reports')
@Controller('portal/sensitive-reports')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalSensitiveReportsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly seals: SensitiveReportService,
  ) {}

  @Get()
  @RequireInstitutionPermissions('requests.review')
  async list(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    const rows = await this.db
      .select({
        requestId: schema.studentRequests.id,
        humanCode: schema.studentRequests.humanCode,
        status: schema.studentRequests.status,
        createdAt: schema.studentRequests.createdAt,
        sealId: schema.sensitiveReportSeals.id,
      })
      .from(schema.studentRequests)
      .innerJoin(
        schema.sensitiveReportSeals,
        eq(schema.sensitiveReportSeals.requestId, schema.studentRequests.id),
      )
      .where(
        and(
          eq(schema.studentRequests.institutionId, principal.institutionId),
          eq(schema.studentRequests.type, 'sensitive_report'),
        ),
      )
      .orderBy(desc(schema.studentRequests.createdAt))
      .limit(50);
    return { items: rows };
  }

  /** First or second approver records purpose-bound approval. Identity revealed only after two distinct approvers. */
  @Post(':requestId/unseal')
  @RequireInstitutionPermissions('requests.review')
  async unseal(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Param('requestId') requestId: string,
    @Body(zodBody(unsealSchema)) body: z.infer<typeof unsealSchema>,
  ) {
    const [seal] = await this.db
      .select()
      .from(schema.sensitiveReportSeals)
      .where(
        and(
          eq(schema.sensitiveReportSeals.requestId, requestId),
          eq(schema.sensitiveReportSeals.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!seal) return { ok: false, reason: 'no_seal' };

    if (body.first_approval_id) {
      const [first] = await this.db
        .select()
        .from(schema.sensitiveReportUnsealApprovals)
        .where(
          and(
            eq(schema.sensitiveReportUnsealApprovals.id, body.first_approval_id),
            eq(schema.sensitiveReportUnsealApprovals.sealId, seal.id),
            eq(schema.sensitiveReportUnsealApprovals.institutionId, principal.institutionId),
            isNull(schema.sensitiveReportUnsealApprovals.consumedAt),
            gt(schema.sensitiveReportUnsealApprovals.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!first || first.approverUserId === principal.institutionUserId) {
        return { ok: false, reason: 'invalid_first_approval' };
      }
      const expiresAt = new Date(Date.now() + body.ttl_hours * 3600000);
      const [second] = await this.db
        .insert(schema.sensitiveReportUnsealApprovals)
        .values({
          sealId: seal.id,
          institutionId: principal.institutionId,
          approverUserId: principal.institutionUserId,
          purpose: body.purpose,
          expiresAt,
        })
        .returning();
      const identity = this.seals.decryptReporterIdentity(seal.sealedPayload as Buffer);
      await this.db
        .update(schema.sensitiveReportUnsealApprovals)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(schema.sensitiveReportUnsealApprovals.sealId, seal.id),
            isNull(schema.sensitiveReportUnsealApprovals.consumedAt),
          ),
        );
      await this.seals.audit(
        principal.institutionId,
        seal.id,
        requestId,
        principal.institutionUserId,
        'unseal_revealed',
        { first_approval_id: first.id, second_approval_id: second!.id },
      );
      return { ok: true, identity, secondApprovalId: second!.id };
    }

    const expiresAt = new Date(Date.now() + body.ttl_hours * 3600000);
    const [approval] = await this.db
      .insert(schema.sensitiveReportUnsealApprovals)
      .values({
        sealId: seal.id,
        institutionId: principal.institutionId,
        approverUserId: principal.institutionUserId,
        purpose: body.purpose,
        expiresAt,
      })
      .returning();
    await this.seals.audit(
      principal.institutionId,
      seal.id,
      requestId,
      principal.institutionUserId,
      'unseal_requested',
      { approval_id: approval!.id },
    );
    return {
      ok: true,
      stage: 'awaiting_second_approver',
      approvalId: approval!.id,
      expiresAt,
    };
  }
}
