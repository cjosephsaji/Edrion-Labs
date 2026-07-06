import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { NotesService } from './notes.service';

@ApiTags('student-learn-notes')
@Controller('student/learn/notes')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.analytics.view')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@CurrentStudent() principal: StudentPrincipal) {
    return this.notes.list(principal);
  }
}
