import { Body, Controller, Header, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { petrosAssignmentLearningPreviewCommandSchema, petrosAssignmentLearningCommitCommandSchema,
  type PetrosAssignmentLearningPreviewCommand, type PetrosAssignmentLearningCommitCommand } from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { PetrosAssignmentLearningService } from './petros-assignment-learning.service';

@Controller('portal/assignments')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
@RequireInstitutionPermissions('assignments.manage')
export class PetrosAssignmentLearningController {
  constructor(private readonly service: PetrosAssignmentLearningService) {}

  @Post(':id/learning-release/preview')
  @Header('Cache-Control','private, no-store')
  preview(@CurrentInstitutionPrincipal() principal:InstitutionPrincipal,
    @CurrentScope() scope:InstitutionScope, @ReqContext() request:EdrionRequestContext,
    @Param('id',ParseUUIDPipe) id:string,
    @Body(zodBody(petrosAssignmentLearningPreviewCommandSchema)) body:PetrosAssignmentLearningPreviewCommand) {
    return this.service.preview({principal,scope,request},id,body);
  }

  @Post(':id/learning-release')
  @Header('Cache-Control','private, no-store')
  commit(@CurrentInstitutionPrincipal() principal:InstitutionPrincipal,
    @CurrentScope() scope:InstitutionScope, @ReqContext() request:EdrionRequestContext,
    @Param('id',ParseUUIDPipe) id:string,
    @Body(zodBody(petrosAssignmentLearningCommitCommandSchema)) body:PetrosAssignmentLearningCommitCommand) {
    return this.service.commit({principal,scope,request},id,body);
  }
}
