import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
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
import { PetrosContinuityService } from './petros-continuity.service';
import { PetrosPilotService } from './petros-pilot.service';

@Controller('student/petros/continuity')
@Public() @SkipRateLimit()
@UseGuards(StudentAuthGuard,StudentPermissionsGuard,StudentPortalGuard,StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use') @StudentRateLimit(60,60)
@StudentOwnsTransactions()
export class StudentPetrosContinuityController {
  constructor(private readonly service:PetrosContinuityService,private readonly pilot:PetrosPilotService){}
  @Header('Cache-Control','private, no-store')
  @Get('capabilities') capabilities(){return this.service.capabilities();}
  @Header('Cache-Control','private, no-store')
  @Get('journeys') list(@CurrentStudent() p:StudentPrincipal){requireInstitutional(p);return this.service.list(p);}
  @Header('Cache-Control','private, no-store')
  @Get('journeys/:id') read(@CurrentStudent() p:StudentPrincipal,@Param('id') id:string){requireInstitutional(p);return this.service.read(p,id);}
  @Header('Cache-Control','private, no-store')
  @Get('sessions/:id/journey') ensure(@CurrentStudent() p:StudentPrincipal,@Param('id') id:string){requireInstitutional(p);return this.service.ensure(p,id);}
  @Header('Cache-Control','private, no-store')
  @Post('journeys') save(@CurrentStudent() p:StudentPrincipal,@Body() input:unknown){requireInstitutional(p);return this.service.saveJourney(p,input);}
  @Header('Cache-Control','private, no-store')
  @Get('memory') memory(@CurrentStudent() p:StudentPrincipal){requireInstitutional(p);return this.service.inspectMemory(p);}
  @Header('Cache-Control','private, no-store')
  @Post('memory') change(@CurrentStudent() p:StudentPrincipal,@Body() input:unknown){requireInstitutional(p);return this.service.memoryCommand(p,input);}
  @Header('Cache-Control','private, no-store')
  @Get('recommendations') recommendations(@CurrentStudent() p:StudentPrincipal){requireInstitutional(p);return this.service.recommendations(p);}
  @Header('Cache-Control','private, no-store')
  @Post('recommendations/:id/dismiss') dismiss(@CurrentStudent() p:StudentPrincipal,@Param('id') id:string,@Body() input:unknown){requireInstitutional(p);return this.service.dismiss(p,id,input);}
  @Header('Cache-Control','private, no-store')
  @Get('pilot-admission') pilotAdmission(){return this.pilot.admission();}
  @Post('pilot-events') pilotEvent(@CurrentStudent() p:StudentPrincipal,@Body() input:unknown){requireInstitutional(p);return this.pilot.recordSynthetic(p,input);}
}
