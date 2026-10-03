import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  petrosComposerQuestionSchema,
  petrosQuestionExecutionCommandSchema,
  type PetrosComposerQuestionInput,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../core/student.decorators';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosQuestionExecutionService } from './petros-question-execution.service';

@Controller('student/petros/sessions/:sessionId/document-questions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(120, 60)
export class StudentPetrosQuestionExecutionController {
  constructor(private readonly service: PetrosQuestionExecutionService) {}
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-knowledge-policy')
  @StudentRateLimit(10, 60)
  async admit(
    @Headers('x-petros-knowledge-policy') contract: string | undefined,
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body(zodBody(petrosComposerQuestionSchema)) input: PetrosComposerQuestionInput,
  ) {
    requireInstitutional(raw);
    return wire(await this.service.admit(raw, sessionId, input), contract);
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-knowledge-policy')
  async latest(
    @Headers('x-petros-knowledge-policy') contract: string | undefined,
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    requireInstitutional(raw);
    return wire(await this.service.read(raw, sessionId), contract);
  }
  @Get(':key')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-knowledge-policy')
  async read(
    @Headers('x-petros-knowledge-policy') contract: string | undefined,
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('key', new ParseUUIDPipe()) key: string,
  ) {
    requireInstitutional(raw);
    return wire(await this.service.read(raw, sessionId, key), contract);
  }
  @Post(':key/commands')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-knowledge-policy')
  @StudentRateLimit(20, 60)
  async command(
    @Headers('x-petros-knowledge-policy') contract: string | undefined,
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Param('key', new ParseUUIDPipe()) key: string,
    @Body(zodBody(petrosQuestionExecutionCommandSchema))
    input: { version: number; action: 'cancel' | 'retry' },
  ) {
    requireInstitutional(raw);
    return wire(await this.service.command(raw, sessionId, key, input.version, input.action), contract);
  }
}

function wire(value: Awaited<ReturnType<PetrosQuestionExecutionService['read']>>, contract?: string) {
  if (!value || contract === 'petros.knowledge-policy.v1') return value;
  const { knowledgePolicy: _policy, admission: _admission, ...legacy } = value;
  return legacy;
}
