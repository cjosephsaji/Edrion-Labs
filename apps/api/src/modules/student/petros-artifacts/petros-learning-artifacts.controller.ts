import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosLearningArtifactsService } from './petros-learning-artifacts.service';

@Controller('student/petros/artifacts')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard,StudentPermissionsGuard,StudentPortalGuard,StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30,60)
export class StudentPetrosLearningArtifactsController {
  constructor(private readonly learning:PetrosLearningArtifactsService) {}
  @Get(':artifactId/learning-resume')
  @Header('Cache-Control','private, no-store')
  resume(@CurrentStudent() principal:StudentPrincipal,@Param('artifactId') artifactId:string) {
    requireInstitutional(principal);
    return this.learning.resume(principal,artifactId);
  }
}
