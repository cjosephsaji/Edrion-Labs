import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../../common/decorators';
import { StudentAuthGuard } from '../../core/student-auth.guard';
import { StudentPermissionsGuard } from '../../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../../core/student.decorators';
import type { StudentPrincipal } from '../../student.types';
import { SessionLifecycleService } from './loop/session-lifecycle.service';

const createBodySchema = z.object({
  topicTitle: z.string().min(1).max(200),
  goal: z.string().optional(),
  timeBudgetMinutes: z.number().int().min(5).max(90).optional(),
  /** Requires LEARN_SESSION_GENERATE=true on the API. Default true when the flag is on. */
  useAi: z.boolean().optional(),
});

const answerBodySchema = z.object({
  blockId: z.string().min(1),
  selectedOptionId: z.string().optional(),
  kind: z.string().optional(),
});

@ApiTags('student-learn-sessions')
@Controller('student/learn/sessions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class LearnSessionsV2Controller {
  constructor(private readonly lifecycle: SessionLifecycleService) {}

  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    const input = createBodySchema.parse(body ?? {});
    return this.lifecycle.create(principal, input);
  }

  @Get(':id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.lifecycle.get(principal, id);
  }

  @Post(':id/answer')
  answer(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = answerBodySchema.parse(body ?? {});
    return this.lifecycle.answer(principal, id, input);
  }

  @Post(':id/complete')
  complete(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.lifecycle.complete(principal, id);
  }
}
