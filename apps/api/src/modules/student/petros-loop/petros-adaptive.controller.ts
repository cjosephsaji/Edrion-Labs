import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import { petrosAdaptiveBindCommandSchema, type PetrosAdaptiveBindCommand } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosAdaptiveService } from './petros-adaptive.service';

@Controller('student/petros/sessions/:sessionId/adaptive')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosAdaptiveController {
  constructor(private readonly service: PetrosAdaptiveService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  availability(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') sessionId: string) {
    requireInstitutional(principal);
    return this.service.availability(principal,sessionId);
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  bind(@CurrentStudent() principal: StudentPrincipal, @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosAdaptiveBindCommandSchema)) body: PetrosAdaptiveBindCommand) {
    requireInstitutional(principal);
    return this.service.bind(principal, sessionId, body);
  }
}
