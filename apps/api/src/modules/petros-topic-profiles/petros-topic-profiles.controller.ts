import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { PrincipalContext } from '@edrion/auth';
import {
  petrosGenerateTopicProfileSchema,
  petrosPublishTopicProfileSchema,
  petrosRollbackTopicProfileSchema,
  petrosTopicProfileListQuerySchema,
  petrosUpdateTopicProfileSchema,
  petrosUpsertTopicProfileOverrideSchema,
  type PetrosGenerateTopicProfileInput,
  type PetrosPublishTopicProfileInput,
  type PetrosRollbackTopicProfileInput,
  type PetrosTopicProfileListQuery,
  type PetrosUpdateTopicProfileInput,
  type PetrosUpsertTopicProfileOverrideInput,
} from '@edrion/schemas';
import { z } from 'zod';
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  RequireRecentAuth,
} from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { PetrosTopicProfilesService } from './petros-topic-profiles.service';

const resolvedQuerySchema = z.object({ institutionId: z.string().uuid() });
const compareQuerySchema = z.object({
  left: z.coerce.number().int().positive(),
  right: z.coerce.number().int().positive(),
});

@ApiTags('petros-topic-profiles')
@Controller('petros-topic-profiles')
export class PetrosTopicProfilesController {
  constructor(private readonly service: PetrosTopicProfilesService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('ai.view')
  list(@Query(zodBody(petrosTopicProfileListQuerySchema)) query: PetrosTopicProfileListQuery) {
    return this.service.list(query);
  }

  @Post('generate')
  @RequirePermissions('ai.configure')
  generate(
    @Body(zodBody(petrosGenerateTopicProfileSchema)) body: PetrosGenerateTopicProfileInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.generate(body, this.ctx(pc, request));
  }

  @Post('validate')
  @RequirePermissions('ai.configure')
  validate(@Body() body: { profile?: unknown }) {
    return this.service.validate(body.profile);
  }

  @Get(':profileId')
  @RequirePermissions('ai.view')
  read(
    @Param('profileId') profileId: string,
    @Query('institutionId') institutionId?: string,
  ) {
    return this.service.read(profileId, institutionId);
  }

  @Put(':profileId')
  @RequirePermissions('ai.configure')
  update(
    @Param('profileId') profileId: string,
    @Body(zodBody(petrosUpdateTopicProfileSchema)) body: PetrosUpdateTopicProfileInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(profileId, body, this.ctx(pc, request));
  }

  @Post(':profileId/publish')
  @RequirePermissions('ai.configure')
  @RequireRecentAuth()
  publish(
    @Param('profileId') profileId: string,
    @Body(zodBody(petrosPublishTopicProfileSchema)) body: PetrosPublishTopicProfileInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.publish(profileId, body, this.ctx(pc, request));
  }

  @Post(':profileId/rollback')
  @RequirePermissions('ai.configure')
  @RequireRecentAuth()
  rollback(
    @Param('profileId') profileId: string,
    @Body(zodBody(petrosRollbackTopicProfileSchema)) body: PetrosRollbackTopicProfileInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.rollback(profileId, body, this.ctx(pc, request));
  }

  @Put(':profileId/override')
  @RequirePermissions('ai.configure')
  @RequireRecentAuth()
  publishOverride(
    @Param('profileId') profileId: string,
    @Body(zodBody(petrosUpsertTopicProfileOverrideSchema))
    body: PetrosUpsertTopicProfileOverrideInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.publishOverride(profileId, body, this.ctx(pc, request));
  }

  @Get(':profileId/resolved')
  @RequirePermissions('ai.view')
  resolved(
    @Param('profileId') profileId: string,
    @Query(zodBody(resolvedQuerySchema)) query: z.infer<typeof resolvedQuerySchema>,
  ) {
    return this.service.resolve(profileId, query.institutionId);
  }

  @Get(':profileId/compare')
  @RequirePermissions('ai.view')
  async compare(
    @Param('profileId') profileId: string,
    @Query(zodBody(compareQuerySchema)) query: z.infer<typeof compareQuerySchema>,
  ) {
    const profile = await this.service.read(profileId);
    const left = profile.versions.find((version) => version.version === query.left);
    const right = profile.versions.find((version) => version.version === query.right);
    if (!left || !right) return { changed: false, changes: [], missingVersion: true };
    return this.service.compareVersions(left.profile, right.profile);
  }
}
