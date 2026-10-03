import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import { StudentOwnsTransactions } from '../core/student-owned-transactions';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosContinuityService } from '../petros-continuity/petros-continuity.service';
import { PetrosWorkspaceService } from './petros-workspace.service';

@Controller('student/petros/continuity')
@Public() @SkipRateLimit()
@UseGuards(StudentAuthGuard,StudentPermissionsGuard,StudentPortalGuard,StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use') @StudentRateLimit(30,60) @StudentOwnsTransactions()
export class StudentPetrosReconciliationController {
 constructor(private readonly continuity:PetrosContinuityService,private readonly workspace:PetrosWorkspaceService){}
 @Post('reconcile') @Header('Cache-Control','private, no-store')
 reconcile(@CurrentStudent() p:StudentPrincipal,@Body() raw:unknown){requireInstitutional(p);return this.continuity.reconcile(p,raw,
  input=>this.workspace.command(p,input.payload.sessionId,input.payload.blockId,{schemaVersion:'petros.engine-command.v1',programId:input.payload.blockId,
   operationId:input.commandId,expectedRevision:input.programRevision,expectedExperimentVersion:input.expectedExperimentVersion,expectedDraftVersion:input.expectedDraftVersion,target:'workspace',purpose:'Save an explicitly chosen private note after reconnection',action:{type:'annotate',text:input.payload.text}}));}
}
