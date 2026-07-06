import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from './surface-gate.service';
import { SurfaceGateService } from './surface-gate.service';
import { StudentSurfacesReadService } from './student-surfaces-read.service';

@ApiTags('student-surfaces')
@Controller('student')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentSurfacesController {
  constructor(
    private readonly surfaces: StudentSurfacesReadService,
    private readonly gate: SurfaceGateService,
  ) {}

  @Get('surfaces/fees')
  @RequireStudentPermissions('student.surface.fees.view')
  async fees(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'fees');
    return this.surfaces.fees(principal);
  }

  @Get('surfaces/transport')
  @RequireStudentPermissions('student.surface.transport.view')
  async transport(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'transport');
    return this.surfaces.transport(principal);
  }

  @Get('surfaces/hostel')
  @RequireStudentPermissions('student.surface.hostel.view')
  async hostel(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'hostel');
    return this.surfaces.hostel(principal);
  }

  @Get('surfaces/documents')
  @RequireStudentPermissions('student.surface.documents.view')
  async documents(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'documents');
    return this.surfaces.documents(principal);
  }

  @Get('pages')
  @RequireStudentPermissions('student.surface.content.view')
  async pages(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'content');
    return this.surfaces.pages(principal);
  }

  @Get('pages/:key')
  @RequireStudentPermissions('student.surface.content.view')
  async page(@CurrentStudent() principal: StudentPrincipal, @Param('key') key: string) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'content');
    return this.surfaces.page(principal, key);
  }

  @Get('surfaces/governance-default')
  governanceDefault() {
    return this.surfaces.governanceDefault();
  }
}
