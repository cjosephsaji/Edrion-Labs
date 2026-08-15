import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentMaterialsService } from './student-materials.service';

@ApiTags('student-materials')
@Controller('student/materials')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentMaterialsController {
  constructor(private readonly materials: StudentMaterialsService) {}

  @Get()
  @RequireStudentPermissions('student.classes.view')
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.materials.list(principal);
  }
}
