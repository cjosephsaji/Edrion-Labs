import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { askInputSchema, pinAskInputSchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { AskService } from './ask.service';

@ApiTags('student-learn-ask')
@Controller('student/learn/ask')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.learn.use')
export class AskController {
  constructor(private readonly ask: AskService) {}

  @Post()
  askQuestion(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.ask.ask(principal, askInputSchema.parse(body));
  }

  @Post('pin')
  pin(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.ask.pin(principal, pinAskInputSchema.parse(body));
  }
}
