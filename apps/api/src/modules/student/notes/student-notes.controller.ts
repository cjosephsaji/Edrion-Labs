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
import { StudentNotesService } from './student-notes.service';

@ApiTags('student-notes')
@Controller('student/notes')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentNotesController {
  constructor(
    private readonly notes: StudentNotesService,
    private readonly storage: StudentStorageService,
  ) {}

  @Get()
  @RequireStudentPermissions('student.classes.view')
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.notes.list(principal);
  }

  @Get(':id')
  @RequireStudentPermissions('student.classes.view')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    return this.notes.get(principal, id);
  }

  @Get(':id/attachments/:objectId')
  @RequireStudentPermissions('student.classes.view')
  async attachment(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('objectId') objectId: string,
    @Res() response: Response,
  ) {
    requireInstitutional(principal);
    const file = await this.notes.attachment(principal, id, objectId);
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
