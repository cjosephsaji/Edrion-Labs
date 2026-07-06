import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { LabVisualService } from './lab-visual.service';

@ApiTags('student-lab-visual')
@Controller('student/lab/visuals')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class LabVisualController {
  constructor(private readonly visual: LabVisualService) {}

  @Post()
  generate(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.visual.generate(principal, body);
  }

  @Post('regenerate')
  regenerate(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.visual.regenerate(principal, body);
  }

  @Post('save')
  save(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.visual.save(principal, body);
  }
}
