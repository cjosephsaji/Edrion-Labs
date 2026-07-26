import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { CampusLifeService } from './campus-life.service';

@ApiTags('student-diary')
@Controller('student/diary')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class CampusDiaryController {
  constructor(private readonly life: CampusLifeService) {}

  @Get(':date')
  page(@CurrentStudent() p: StudentPrincipal, @Param('date') date: string) {
    return this.life.diaryForDate(p, date);
  }

  @Post(':date/sync-today')
  sync(@CurrentStudent() p: StudentPrincipal, @Param('date') date: string) {
    return this.life.syncDiaryToToday(p, date);
  }
}
