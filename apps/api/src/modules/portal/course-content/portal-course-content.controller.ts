import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
  createStreamPostSchema,
  streamListQuerySchema,
  versionedDeleteSchema,
  type CreateClassMaterialInput,
  type CreateStreamPostInput,
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
    const mimeType = (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]!.trim();
    const buffer = await readRawBody(req, 50 * 1024 * 1024);
    const name = (filename ?? 'material.pdf').split(/[/\\]/).pop()!.slice(0, 255);
    return this.svc.uploadMaterialFile(this.ctx(p, s, r), name, mimeType, buffer);
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
}
