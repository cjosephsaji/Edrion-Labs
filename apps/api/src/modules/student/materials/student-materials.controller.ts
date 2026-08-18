import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentStorageService } from '../storage/student-storage.service';
import { StudentMaterialsService } from './student-materials.service';

@ApiTags('student-materials')
@Controller('student/materials')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentMaterialsController {
  constructor(
    private readonly materials: StudentMaterialsService,
    private readonly storage: StudentStorageService,
  ) {}

  @Get()
  @RequireStudentPermissions('student.classes.view')
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.materials.list(principal);
  }

  @Get(':id/file')
  @RequireStudentPermissions('student.classes.view')
  async file(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    requireInstitutional(principal);
    const file = await this.materials.file(principal, id);
    response.setHeader('Content-Type', file.mimeType);
    if (file.filename) {
      response.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
    }
    this.storage.stream(file.storageKey).pipe(response);
  }
}
