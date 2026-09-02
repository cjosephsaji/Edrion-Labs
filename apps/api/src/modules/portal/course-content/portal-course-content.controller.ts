import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  createClassMaterialSchema,
  createClassNoteSchema,
  createStreamPostSchema,
  noteListQuerySchema,
  publishClassNoteSchema,
  streamListQuerySchema,
  updateClassNoteSchema,
  versionedDeleteSchema,
  type CreateClassMaterialInput,
  type CreateClassNoteInput,
  type CreateStreamPostInput,
  type PublishClassNoteInput,
  type UpdateClassNoteInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { CrudListQuery } from '../portal-crud.engine';
import type { PortalActionContext } from '../portal-action-context';
import { canonicalMaterialMimeType } from '../../student/materials/material-file-types';
import { PortalCourseContentService } from './portal-course-content.service';

function readRawBody(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > max) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File exceeds the size limit.' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}

@ApiTags('portal-course-content')
@Controller('portal/course-content')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalCourseContentController {
  constructor(private readonly svc: PortalCourseContentService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get('stream')
  @RequireInstitutionPermissions('class_content.manage')
  listStream(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(streamListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('stream', this.ctx(p, s, r), q);
  }

  @Post('stream')
  @RequireInstitutionPermissions('class_content.manage')
  createStream(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createStreamPostSchema)) body: CreateStreamPostInput,
  ) {
    return this.svc.createStream(this.ctx(p, s, r), body);
  }

  @Patch('stream/:id')
  @RequireInstitutionPermissions('class_content.manage')
  updateStream(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.update('stream', this.ctx(p, s, r), id, body);
  }

  @Delete('stream/:id')
  @RequireInstitutionPermissions('class_content.manage')
  deleteStream(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('stream', this.ctx(p, s, r), id, body.version);
  }

  @Get('materials')
  @RequireInstitutionPermissions('class_content.manage')
  listMaterials(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(streamListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('materials', this.ctx(p, s, r), q);
  }

  @Post('materials/upload')
  @RequireInstitutionPermissions('class_content.manage')
  async uploadMaterial(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query('filename') filename: string | undefined,
    @Req() req: Request,
  ) {
    const name = (filename ?? headerFilename(req) ?? 'material.pdf').split(/[/\\]/).pop()!.slice(0, 255);
    const mimeType = requestMaterialMimeType(req, name);
    const buffer = await readRawBody(req, 50 * 1024 * 1024);
    return this.svc.uploadMaterialFile(this.ctx(p, s, r), name, mimeType, buffer);
  }

  /** Upload and publish in one request — see PortalCourseContentService.publishMaterialFile. */
  @Post('materials/publish')
  @RequireInstitutionPermissions('class_content.manage')
  async publishMaterial(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query('filename') filename: string | undefined,
    @Query('contextType') contextType: 'class' | 'course' | undefined,
    @Query('contextId') contextId: string | undefined,
    @Query('subjectId') subjectId: string | undefined,
    @Query('title') title: string | undefined,
    @Req() req: Request,
  ) {
    if (!contextId || !contextType) {
      throw new BadRequestException({
        code: 'CONTEXT_REQUIRED',
        message: 'Choose the class and subject to publish this to.',
      });
    }
    const name = (filename ?? headerFilename(req) ?? 'material').split(/[/\\]/).pop()!.slice(0, 255);
    const mimeType = requestMaterialMimeType(req, name);
    const buffer = await readRawBody(req, 50 * 1024 * 1024);
    return this.svc.publishMaterialFile(
      this.ctx(p, s, r),
      { contextType, contextId, subjectId: subjectId ?? null, title: title ?? null },
      name,
      mimeType,
      buffer,
    );
  }

  @Post('materials')
  @RequireInstitutionPermissions('class_content.manage')
  createMaterial(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createClassMaterialSchema)) body: CreateClassMaterialInput,
  ) {
    return this.svc.createMaterial(this.ctx(p, s, r), body);
  }

  @Delete('materials/:id')
  @RequireInstitutionPermissions('class_content.manage')
  deleteMaterial(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('materials', this.ctx(p, s, r), id, body.version);
  }

  @Get('notes')
  @RequireInstitutionPermissions('class_content.manage')
  listNotes(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(noteListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('notes', this.ctx(p, s, r), q);
  }

  @Get('notes/:id')
  @RequireInstitutionPermissions('class_content.manage')
  getNote(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.get('notes', this.ctx(p, s, r), id);
  }

  @Get('notes/:id/readers')
  @RequireInstitutionPermissions('class_content.manage')
  noteReaders(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.noteReaders(this.ctx(p, s, r), id);
  }

  @Post('notes')
  @RequireInstitutionPermissions('class_content.manage')
  createNote(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createClassNoteSchema)) body: CreateClassNoteInput,
  ) {
    return this.svc.createNote(this.ctx(p, s, r), body);
  }

  @Patch('notes/:id')
  @RequireInstitutionPermissions('class_content.manage')
  updateNote(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateClassNoteSchema)) body: UpdateClassNoteInput,
  ) {
    return this.svc.updateNote(this.ctx(p, s, r), id, body);
  }

  /** Publish / unpublish / archive. Separate from the content edit so the act is auditable on its own. */
  @Post('notes/:id/status')
  // Changes an existing note; it creates nothing, so 200 rather than Nest's default 201.
  @HttpCode(200)
  @RequireInstitutionPermissions('class_content.manage')
  setNoteStatus(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(publishClassNoteSchema)) body: PublishClassNoteInput,
  ) {
    return this.svc.setNoteStatus(this.ctx(p, s, r), id, body);
  }

  @Delete('notes/:id')
  @RequireInstitutionPermissions('class_content.manage')
  deleteNote(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('notes', this.ctx(p, s, r), id, body.version);
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function headerFilename(req: Request): string | undefined {
  const value = firstHeader(req.headers['x-file-name']);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function requestMaterialMimeType(req: Request, filename: string): string {
  const fileType = firstHeader(req.headers['x-file-type']);
  const transportType = firstHeader(req.headers['content-type']);
  return canonicalMaterialMimeType(filename, fileType || transportType || 'application/octet-stream');
}
