import { Controller, Get, Inject, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import type { ApiEnv } from '@edrion/config';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { API_ENV } from '../../../common/tokens';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentStorageService } from '../storage/student-storage.service';
import { StudentMaterialsService } from './student-materials.service';

@ApiTags('student-materials')
@Controller('student/materials')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
export class StudentMaterialsController {
  constructor(
    @Inject(StudentMaterialsService) private readonly materials: StudentMaterialsService,
    @Inject(StudentStorageService) private readonly storage: StudentStorageService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Get()
  @RequireStudentPermissions('student.classes.view')
  list(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    return this.materials.list(principal);
  }

  @Get(':id/file')
  @RequireStudentPermissions('student.classes.view')
  async file(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    requireInstitutional(principal);
    return this.deliver(principal, id, response, 'attachment');
  }

  /** Browser-renderable copy for the authenticated Edrion document viewer. */
  @Get(':id/view')
  @RequireStudentPermissions('student.classes.view')
  async view(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    requireInstitutional(principal);
    return this.deliver(principal, id, response, 'inline');
  }

  private async deliver(
    principal: InstitutionalStudentPrincipal,
    id: string,
    response: Response,
    disposition: 'attachment' | 'inline',
  ) {
    const file = await this.materials.file(principal, id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.filename) {
      response.setHeader(
        'Content-Disposition',
        `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      );
    }
    if (disposition === 'inline') {
      // Helmet defaults are intentionally strict. This one authenticated response may be
      // framed only by configured Edrion web origins, never by an arbitrary external site.
      response.removeHeader('X-Frame-Options');
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      response.setHeader(
        'Content-Security-Policy',
        `frame-ancestors 'self' ${this.env.API_CORS_ORIGINS.join(' ')}`,
      );
    }
    this.storage.stream(file.storageKey).pipe(response);
  }
}
