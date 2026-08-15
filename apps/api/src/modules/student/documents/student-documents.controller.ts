import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional, SurfaceGateService } from '../surfaces/surface-gate.service';
import { StudentDocumentsService } from './student-documents.service';

@ApiTags('student-documents')
@Controller('student/documents')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard)
@RequireStudentPermissions('student.surface.documents.view')
export class StudentDocumentsController {
  constructor(
    private readonly documents: StudentDocumentsService,
    private readonly gate: SurfaceGateService,
  ) {}

  @Get()
  async list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'documents');
    return this.documents.list(principal);
  }
}
