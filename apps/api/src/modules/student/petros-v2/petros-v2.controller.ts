import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { m4AdmissionSchema, m4CommandSchema, m4CommitSchema } from '@edrion/schemas';
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
import { StudentOwnsTransactions } from '../core/student-owned-transactions';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosV2SessionService } from './petros-v2-session.service';
import { PetrosV2CommandWorker } from './petros-v2-command.worker';
import { PetrosV2OriginGuard } from './petros-v2-origin.guard';
import { PetrosTimingInterceptor } from './petros-performance';
@Controller('student/petros/v2')
@Public()
@SkipRateLimit()
@StudentOwnsTransactions()
@UseInterceptors(PetrosTimingInterceptor)
@UseGuards(
  PetrosV2OriginGuard,
  StudentAuthGuard,
  StudentPermissionsGuard,
  StudentPortalGuard,
  StudentRateLimitGuard,
)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(60, 60)
export class PetrosV2Controller {
  constructor(
    private readonly sessions: PetrosV2SessionService,
    private readonly worker: PetrosV2CommandWorker,
  ) {}
  private owner(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }
  @Get('lessons')
  @Header('Cache-Control', 'private, no-store')
  entry(@CurrentStudent() p: StudentPrincipal) {
    return this.sessions.entry(this.owner(p));
  }
  @Get('sessions/:id/engine')
  @Header('Cache-Control', 'private, no-store')
  engine(@CurrentStudent() p: StudentPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sessions.engine(this.owner(p), id);
  }
  @Post('sessions')
  @Header('Cache-Control', 'private, no-store')
  admit(@CurrentStudent() p: StudentPrincipal, @Body(zodBody(m4AdmissionSchema)) body: unknown) {
    return this.sessions.admit(this.owner(p), body);
  }
  @Get('sessions/:id')
  @Header('Cache-Control', 'private, no-store')
  get(@CurrentStudent() p: StudentPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sessions.get(this.owner(p), id);
  }
  @Post('sessions/:id/commands')
  @Header('Cache-Control', 'private, no-store')
  async command(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(zodBody(m4CommandSchema)) body: unknown,
  ) {
    const p = this.owner(raw),
      r = await this.sessions.command(p, id, body);
    if (r.status === 'pending')
      void this.worker.dispatch(id, p.institutionUserId).catch(() => undefined);
    return r;
  }
  @Post('sessions/:id/tasks/:taskId/responses')
  @Header('Cache-Control', 'private, no-store')
  async commit(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(zodBody(m4CommitSchema)) body: unknown,
  ) {
    const p = this.owner(raw),
      r = await this.sessions.commit(p, id, taskId, body);
    if (r.status === 'pending')
      void this.worker.dispatch(id, p.institutionUserId).catch(() => undefined);
    return r;
  }
  @Get('sessions/:id/operations/:commandId')
  @Header('Cache-Control', 'private, no-store')
  operation(
    @CurrentStudent() p: StudentPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commandId', new ParseUUIDPipe()) commandId: string,
  ) {
    return this.sessions.operation(this.owner(p), id, commandId);
  }
}
