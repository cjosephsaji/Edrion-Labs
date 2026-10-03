import { BadRequestException, Body, Header, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  petrosArtifactDashboardQuerySchema,
  petrosArtifactLifecycleSchema,
  petrosArtifactQuerySchema,
  petrosCommitArtifactBundleSchema,
  petrosSaveBlockArtifactSchema,
  petrosSubmitArtifactReviewSchema,
  petrosUpdateArtifactProposalSchema,
  petrosUpdateSavedArtifactSchema,
  type PetrosArtifactDashboardQuery,
  type PetrosArtifactLifecycleInput,
  type PetrosArtifactQuery,
  type PetrosCommitArtifactBundleInput,
  type PetrosSaveBlockArtifactInput,
  type PetrosSubmitArtifactReviewInput,
  type PetrosUpdateArtifactProposalInput,
  type PetrosUpdateSavedArtifactInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { PrincipalCtx, ReqContext, RequirePermissions, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { PetrosArtifactsDashboardService } from './petros-artifacts-dashboard.service';
import { PetrosArtifactsService } from './petros-artifacts.service';

const versionSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();

@ApiTags('student-petros-artifacts')
@Controller('student/petros/artifacts')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(40, 60)
export class StudentPetrosArtifactsController {
  constructor(private readonly service: PetrosArtifactsService) {}

  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Get('sessions/:sessionId/bundle')
  @Header('Cache-Control', 'private, no-store')
  bundle(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string) {
    return this.service.bundle(this.principal(raw), sessionId);
  }

  @Post('sessions/:sessionId/blocks/:blockId')
  @Header('Cache-Control', 'private, no-store')
  saveBlockArtifact(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Param('blockId') blockId: string,
    @Body(zodBody(petrosSaveBlockArtifactSchema)) body: PetrosSaveBlockArtifactInput,
  ) {
    return this.service.saveBlockArtifact(this.principal(raw), sessionId, blockId, body);
  }

  @Put('proposals/:proposalId')
  @Header('Cache-Control', 'private, no-store')
  updateProposal(@CurrentStudent() raw: StudentPrincipal, @Param('proposalId') proposalId: string, @Body(zodBody(petrosUpdateArtifactProposalSchema)) body: PetrosUpdateArtifactProposalInput) {
    return this.service.updateProposal(this.principal(raw), proposalId, body);
  }

  @Post('bundles/:bundleId/commit')
  @Header('Cache-Control', 'private, no-store')
  commit(@CurrentStudent() raw: StudentPrincipal, @Param('bundleId') bundleId: string, @Body(zodBody(petrosCommitArtifactBundleSchema)) body: PetrosCommitArtifactBundleInput) {
    return this.service.commit(this.principal(raw), bundleId, body);
  }

  @Post('bundles/:bundleId/discard')
  @Header('Cache-Control', 'private, no-store')
  discard(@CurrentStudent() raw: StudentPrincipal, @Param('bundleId') bundleId: string, @Body(zodBody(versionSchema)) body: z.infer<typeof versionSchema>) {
    return this.service.discard(this.principal(raw), bundleId, body.expectedVersion);
  }

  @Get('review/due')
  @Header('Cache-Control', 'private, no-store')
  due(@CurrentStudent() raw: StudentPrincipal, @Query('limit') rawLimit?: string) {
    return this.service.due(this.principal(raw), Number(rawLimit ?? 30));
  }

  @Post(':artifactId/reviews')
  @Header('Cache-Control', 'private, no-store')
  review(@CurrentStudent() raw: StudentPrincipal, @Param('artifactId') artifactId: string, @Body(zodBody(petrosSubmitArtifactReviewSchema)) body: PetrosSubmitArtifactReviewInput) {
    return this.service.review(this.principal(raw), artifactId, body);
  }

  @Post('review/rebuild')
  @Header('Cache-Control', 'private, no-store')
  rebuild(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.rebuildSchedule(this.principal(raw));
  }

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  export(@CurrentStudent() raw: StudentPrincipal, @Query('forTransfer') forTransfer?: string) {
    return this.service.export(this.principal(raw), forTransfer === 'true');
  }

  @Get(':artifactId/sources/:sourceIndex')
  @Header('Cache-Control', 'private, no-store')
  source(@CurrentStudent() raw: StudentPrincipal, @Param('artifactId') artifactId: string, @Param('sourceIndex') rawIndex: string) {
    const sourceIndex = Number(rawIndex);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex > 100) throw new BadRequestException({ code: 'PETROS_SOURCE_INDEX_INVALID', message: 'Invalid source index.' });
    return this.service.source(this.principal(raw), artifactId, sourceIndex);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentStudent() raw: StudentPrincipal, @Query(zodBody(petrosArtifactQuerySchema)) query: PetrosArtifactQuery) {
    return this.service.list(this.principal(raw), query);
  }

  @Put(':artifactId')
  @Header('Cache-Control', 'private, no-store')
  updateSaved(@CurrentStudent() raw: StudentPrincipal, @Param('artifactId') artifactId: string, @Body(zodBody(petrosUpdateSavedArtifactSchema)) body: PetrosUpdateSavedArtifactInput) {
    return this.service.updateSaved(this.principal(raw), artifactId, body);
  }

  @Post(':artifactId/lifecycle')
  @Header('Cache-Control', 'private, no-store')
  lifecycle(@CurrentStudent() raw: StudentPrincipal, @Param('artifactId') artifactId: string, @Body(zodBody(petrosArtifactLifecycleSchema)) body: PetrosArtifactLifecycleInput) {
    return this.service.lifecycle(this.principal(raw), artifactId, body);
  }

  @Delete(':artifactId')
  @Header('Cache-Control', 'private, no-store')
  deleteSaved(@CurrentStudent() raw: StudentPrincipal, @Param('artifactId') artifactId: string) {
    return this.service.deleteSaved(this.principal(raw), artifactId);
  }
}

@ApiTags('petros-artifacts-dashboard')
@Controller('petros-artifacts')
export class PetrosArtifactsDashboardController {
  constructor(private readonly dashboard: PetrosArtifactsDashboardService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  read(
    @Query(zodBody(petrosArtifactDashboardQuerySchema)) query: PetrosArtifactDashboardQuery,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.dashboard.read(query, { principalContext: pc, request });
  }
}
