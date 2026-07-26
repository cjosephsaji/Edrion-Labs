import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { quickAnswerInputSchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { QuickService } from './quick.service';

@ApiTags('student-learn-quick')
@Controller('student/learn/quick')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class QuickController {
  constructor(private readonly quick: QuickService) {}

  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.quick.create(principal, quickAnswerInputSchema.parse(body));
  }

  @Get(':id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.quick.get(principal, id);
  }

  @Post(':id/learning-list')
  learningList(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.quick.toggleLearningList(principal, id, true);
  }
}
