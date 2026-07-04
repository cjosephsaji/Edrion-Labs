import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  createDocumentRenderSchema,
  createDocumentTemplateSchema,
  documentTemplatesListQuerySchema,
  formatCaptureResultSchema,
  previewDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  versionedDeleteSchema,
  type CreateDocumentRenderInput,
  type CreateDocumentTemplateInput,
  type DocumentTemplatesListQuery,
  type PreviewDocumentTemplateInput,
  type UpdateDocumentTemplateInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import { PetrosOpenAiService } from '../portal/petros/openai-client.service';
import { DocumentsGenService } from './documents-gen.service';
import { DocumentRenderProcessor } from './document-render.processor';
import { buildDocumentHtml } from './document-renderer';

/**
 * Document-generation API (Petros Phase 4). Template editing is gated by the sensitive
 * `documents.templates.manage`; requesting renders by `documents.generate`. Circular renders
 * additionally require `circulars.issue` (checked in-handler).
 */
@ApiTags('portal-documents-gen')
@Controller('portal/document-templates')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class DocumentsGenController {
  constructor(
    private readonly svc: DocumentsGenService,
    private readonly processor: DocumentRenderProcessor,
    private readonly storage: AttachmentStorageService,
    private readonly openai: PetrosOpenAiService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('documents.generate')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(documentTemplatesListQuerySchema)) q: DocumentTemplatesListQuery,
  ) {
    return this.svc.listTemplates(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('documents.templates.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createDocumentTemplateSchema)) body: CreateDocumentTemplateInput,
  ) {
    return this.svc.createTemplate(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('documents.templates.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateDocumentTemplateSchema)) body: UpdateDocumentTemplateInput,
  ) {
    return this.svc.updateTemplate(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('documents.templates.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.deleteTemplate(this.ctx(p, s, r), id, body.version);
  }

  /** Live HTML preview for the template editor (no persistence, no PDF). */
  @Post('preview')
  @RequireInstitutionPermissions('documents.templates.manage')
  async preview(
    @Body(zodBody(previewDocumentTemplateSchema)) body: PreviewDocumentTemplateInput,
    @Res() res: Response,
  ) {
    const html = buildDocumentHtml({
      html: body.html,
      css: body.css,
      headerConfig: body.headerConfig,
      branding: { institutionName: 'Preview Institution', logoUrl: null },
      payload: body.payload,
      title: String(body.payload.title ?? 'Preview'),
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /**
   * Vision format-capture: upload a sample paper (image/pdf, raw body) → the big model proposes a
   * header_config (strict structured output) that prefills the template form.
   */
  @Post('format-capture')
  @RequireInstitutionPermissions('documents.templates.manage')
  async formatCapture(@Req() req: Request) {
    const buffer = await readBody(req);
    const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isImage = buffer[0] === 0xff || buffer[0] === 0x89;
    if (!isPdf && !isImage) {
      throw new BadRequestException({ code: 'UNSUPPORTED_FILE_TYPE', message: 'Attach a sample paper as an image or PDF.' });
    }
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['headerConfig', 'suggestedName', 'notes'],
      properties: {
        headerConfig: {
          type: 'object',
          additionalProperties: false,
          required: ['logoPosition', 'showInstitutionName', 'showDate', 'showTime', 'showDuration', 'showExaminer', 'showMaxMarks', 'showRollNumberBoxes', 'rollNumberBoxCount', 'instructions', 'subtitle'],
          properties: {
            logoPosition: { type: 'string', enum: ['left', 'center', 'right', 'none'] },
            showInstitutionName: { type: 'boolean' },
            showDate: { type: 'boolean' },
            showTime: { type: 'boolean' },
            showDuration: { type: 'boolean' },
            showExaminer: { type: 'boolean' },
            showMaxMarks: { type: 'boolean' },
            showRollNumberBoxes: { type: 'boolean' },
            rollNumberBoxCount: { type: 'integer' },
            instructions: { type: ['string', 'null'] },
            subtitle: { type: ['string', 'null'] },
          },
        },
        suggestedName: { type: 'string' },
        notes: { type: ['string', 'null'] },
      },
    };
    const mime = isPdf ? 'application/pdf' : 'image/jpeg';
    const content: unknown[] = [
      { type: 'input_text', text: 'Analyse this sample document header/format and propose the header configuration.' },
      isPdf
        ? { type: 'input_file', filename: 'sample.pdf', file_data: `data:${mime};base64,${buffer.toString('base64')}` }
        : { type: 'input_image', detail: 'auto', image_url: `data:${mime};base64,${buffer.toString('base64')}` },
    ];
    const response = (await this.openai.sdk().responses.create({
      model: this.openai.modelFor('big'),
      instructions: 'You extract document header layout configuration from sample school documents. Output strictly the JSON schema.',
      input: [{ role: 'user', content }],
      max_output_tokens: 800,
      text: { format: { type: 'json_schema', name: 'format_capture', strict: true, schema } },
    } as never)) as { output_text?: string };
    return formatCaptureResultSchema.parse(JSON.parse(response.output_text ?? '{}'));
  }

  // ── Renders ──────────────────────────────────────────────────────────────────

  @Post('renders')
  @RequireInstitutionPermissions('documents.generate')
  async createRender(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createDocumentRenderSchema)) body: CreateDocumentRenderInput,
  ) {
    if (body.docType === 'circular' && !p.permissions.keys.has('circulars.issue') && !p.permissions.hasWildcard) {
      throw new BadRequestException({ code: 'FORBIDDEN', message: 'Issuing circulars requires the circulars.issue permission.' });
    }
    const render = await this.svc.createRender(this.ctx(p, s, r), body);
    if (!this.svc.queueEnabled) void this.processor.process(render.id);
    return render;
  }

  @Get('renders/:id')
  @RequireInstitutionPermissions('documents.generate')
  getRender(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.getRender(this.ctx(p, s, r), id);
  }

  @Get('renders/:id/download')
  @RequireInstitutionPermissions('documents.generate')
  async download(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Res() res: Response,
  ) {
    const render = await this.svc.getRender(this.ctx(p, s, r), id);
    if (render.status !== 'done' || !render.storagePath) {
      return void res.status(409).json({ code: 'NOT_READY', message: `Render is ${render.status}.` });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${render.title.replace(/[^\w. -]/g, '')}.pdf"`);
    this.storage.stream(render.storagePath).pipe(res);
  }
}

const MAX_SAMPLE_BYTES = 15 * 1024 * 1024;

function readBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > MAX_SAMPLE_BYTES) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Sample files must be 15 MB or smaller.' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}
