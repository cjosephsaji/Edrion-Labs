import { Body, Controller, Get, Header, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  petrosObjectiveEvidenceAppendCommandSchema,
  type PetrosObjectiveEvidenceAppendCommand,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../student/core/student.decorators';
import { StudentOwnsTransactions } from '../student/core/student-owned-transactions';
import { requireInstitutional } from '../student/surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student/student.types';
import { PetrosObjectiveEvidenceService } from './petros-objective-evidence.service';

const packQuery = z.object({
  packId: z.string().uuid(),
  packVersion: z.coerce.number().int().positive().max(100_000),
}).strict();

@Controller('student/petros/sessions/:sessionId/objective-evidence')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosObjectiveEvidenceController {
  constructor(private readonly service: PetrosObjectiveEvidenceService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  append(
    @CurrentStudent() rawPrincipal: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(petrosObjectiveEvidenceAppendCommandSchema)) body: PetrosObjectiveEvidenceAppendCommand,
  ) {
    requireInstitutional(rawPrincipal);
    return this.service.append(rawPrincipal, sessionId, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  read(
    @CurrentStudent() rawPrincipal: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Query(zodBody(packQuery)) query: z.infer<typeof packQuery>,
  ) {
    requireInstitutional(rawPrincipal);
    return this.service.readCurrentEvidence(rawPrincipal, sessionId, query);
  }

  @Post('rebuild')
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  rebuild(
    @CurrentStudent() rawPrincipal: StudentPrincipal,
    @Param('sessionId') sessionId: string,
    @Body(zodBody(packQuery)) body: z.infer<typeof packQuery>,
  ) {
    requireInstitutional(rawPrincipal);
    return this.service.rebuildProjection(rawPrincipal, sessionId, body);
  }
}
