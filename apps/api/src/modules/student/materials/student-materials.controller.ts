import { Controller, Get, Inject, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import type { ApiEnv } from '@edrion/config';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { API_ENV } from '../../../common/tokens';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { StudentStorageService } from '../storage/student-storage.service';
import { MaterialDocumentPreviewService } from './material-document-preview.service';
import { MaterialVisualPreviewService } from './material-visual-preview.service';
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
    @Inject(MaterialDocumentPreviewService) private readonly previews: MaterialDocumentPreviewService,
    @Inject(MaterialVisualPreviewService) private readonly visualPreviews: MaterialVisualPreviewService,
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
    const file = await this.materials.file(principal, id);
    return this.deliver(file, response, 'attachment');
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
    const original = await this.materials.file(principal, id);
    const rendered = await this.visualPreviews.resolve(original);
    return this.deliver(rendered ?? original, response, 'inline');
  }

  /** Page count for the built-in image renderer (does not rely on a browser PDF plugin). */
  @Get(':id/view/metadata')
  @RequireStudentPermissions('student.classes.view')
  async viewMetadata(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
  ) {
    requireInstitutional(principal);
    const file = await this.materials.file(principal, id);
    const metadata = await this.visualPreviews.metadata(file);
    if (!metadata) throw new NotFoundException({ code: 'PREVIEW_UNAVAILABLE', message: 'Visual preview is unavailable.' });
    return metadata;
  }

  /** One faithful PDF page rendered as an image for the private in-app reader. */
  @Get(':id/view/pages/:page')
  @RequireStudentPermissions('student.classes.view')
  async viewPage(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('page') page: string,
    @Res() response: Response,
  ) {
    requireInstitutional(principal);
    const file = await this.materials.file(principal, id);
    const image = await this.visualPreviews.renderPage(file, Number(page));
    if (!image) throw new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'Document page not found.' });
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(image.length));
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.send(image);
  }

  /** Safe JSON representation for Word, slide, spreadsheet, and text documents. */
  @Get(':id/preview')
  @RequireStudentPermissions('student.classes.view')
  async preview(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
  ) {
    requireInstitutional(principal);
    const file = await this.materials.file(principal, id);
    const [buffer, extractedPages] = await Promise.all([
      this.storage.readBuffer(file.storageKey),
      this.materials.previewPages(principal, id),
    ]);
    return this.previews.create({
      filename: file.filename,
      mimeType: file.mimeType,
      buffer,
      extractedPages,
    });
  }

  private async deliver(
    file: { storageKey: string; filename: string | null; mimeType: string },
    response: Response,
    disposition: 'attachment' | 'inline',
  ) {
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
