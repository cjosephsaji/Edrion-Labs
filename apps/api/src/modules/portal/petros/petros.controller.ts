import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  petrosAnswerSchema,
  petrosCreateConversationSchema,
  petrosListConversationsQuerySchema,
  petrosTurnSchema,
  petrosUpdateConversationSchema,
  type PetrosAnswerInput,
  type PetrosCapabilities,
  type PetrosCreateConversationInput,
  type PetrosListConversationsQuery,
  type PetrosStreamEvent,
  type PetrosTurnInput,
  type PetrosUpdateConversationInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { can } from '@edrion/permissions';
import { ALL_INSTITUTION_PERMISSION_KEYS, getDefaultRolesForInstitutionType } from '@edrion/permissions/institution';
import { z } from 'zod';

const suggestPermissionsSchema = z.object({ description: z.string().trim().min(4).max(1000) });
type SuggestPermissionsInput = z.infer<typeof suggestPermissionsSchema>;
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { PortalActionContext } from '../portal-action-context';
import { PetrosConversationsService } from './petros-conversations.service';
import { PetrosAgentService, type Emit } from './petros-agent.service';
import { PetrosToolRegistry } from './tools/registry';
import { PetrosRepository } from './petros.repository';
import { PetrosAttachmentService } from './petros-attachment.service';
import { PetrosTopicalityService } from './petros-topicality.service';
import { PetrosOpenAiService } from './openai-client.service';
import { AttachmentStorageService } from '../attachment-storage.service';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Collect a raw request body into a Buffer, rejecting anything over the cap. */
function readRawBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > MAX_UPLOAD_BYTES) {
        done = true;
        req.destroy();
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Files must be 20 MB or smaller.' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}

/**
 * Petros chat API. Turns stream as SSE frames over a fetch-streamed POST (EventSource cannot send
 * auth headers). Guards: institution auth + `ai.use` + tenant interceptor. Mutations pause on a
 * confirmation card backed by portal_ai_runs — confirm/reject resume the SAME response stream of
 * a new request. THE invariant: no state change without human confirmation.
 */
@ApiTags('portal-petros')
@Controller('portal/petros')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PetrosController {
  constructor(
    private readonly conversations: PetrosConversationsService,
    private readonly agent: PetrosAgentService,
    private readonly registry: PetrosToolRegistry,
    private readonly repo: PetrosRepository,
    private readonly attachmentsSvc: PetrosAttachmentService,
    private readonly storage: AttachmentStorageService,
    private readonly topicality: PetrosTopicalityService,
    private readonly openai: PetrosOpenAiService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // ── Conversations ────────────────────────────────────────────────────────────

  @Get('conversations')
  @RequireInstitutionPermissions('ai.use')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(petrosListConversationsQuerySchema)) q: PetrosListConversationsQuery,
  ) {
    return this.conversations.list(this.ctx(p, s, r), q);
  }

  @Post('conversations')
  @RequireInstitutionPermissions('ai.use')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(petrosCreateConversationSchema)) body: PetrosCreateConversationInput,
  ) {
    return this.conversations.create(this.ctx(p, s, r), body);
  }

  @Get('conversations/:id')
  @RequireInstitutionPermissions('ai.use')
  detail(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.conversations.detail(this.ctx(p, s, r), id);
  }

  @Patch('conversations/:id')
  @RequireInstitutionPermissions('ai.use')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(petrosUpdateConversationSchema)) body: PetrosUpdateConversationInput,
  ) {
    return this.conversations.update(this.ctx(p, s, r), id, body);
  }

  // ── Streaming turns ──────────────────────────────────────────────────────────

  @Post('conversations/:id/turns')
  @RequireInstitutionPermissions('ai.use')
  async turn(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(petrosTurnSchema)) body: PetrosTurnInput,
    @Res() res: Response,
  ) {
    const ctx = this.ctx(p, s, r);
    const conversation = await this.conversations.requireOwned(ctx, id);
    await this.stream(res, (emit) => this.agent.startTurn(ctx, conversation, body.message, emit, body.attachmentIds));
  }

  // ── Uploads (Phase 3) ────────────────────────────────────────────────────────

  /** Attach a file to a conversation. Raw binary body; name in `x-file-name`. */
  @Post('conversations/:id/uploads')
  @RequireInstitutionPermissions('ai.use', 'ai.files.upload')
  async upload(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Req() req: Request,
  ) {
    const ctx = this.ctx(p, s, r);
    await this.conversations.requireOwned(ctx, id);
    const buffer = await readRawBody(req);
    const rawName = req.header('x-file-name');
    const filename = (rawName ? decodeURIComponent(rawName) : 'upload').split(/[/\\]/).pop()!.slice(0, 255);
    const a = await this.attachmentsSvc.upload(ctx, id, filename, buffer);
    return { id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, parseStatus: a.parseStatus };
  }

  /** Artifact metadata (kind/title + inline meta such as chart SVG). Owner-gated. */
  @Get('artifacts/:id')
  @RequireInstitutionPermissions('ai.use')
  async getArtifact(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    const ctx = this.ctx(p, s, r);
    const artifact = await this.repo.findArtifact(id, p.institutionId);
    if (!artifact) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Artifact not found' });
    await this.conversations.requireOwned(ctx, artifact.conversationId);
    return {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      docType: artifact.docType,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      hasFile: Boolean(artifact.storagePath),
      meta: artifact.meta ?? {},
    };
  }

  /** Download an artifact (owner-gated via its conversation). */
  @Get('artifacts/:id/download')
  @RequireInstitutionPermissions('ai.use')
  async downloadArtifact(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Res() res: Response,
  ) {
    const ctx = this.ctx(p, s, r);
    const artifact = await this.repo.findArtifact(id, p.institutionId);
    if (!artifact) return void res.status(404).json({ code: 'NOT_FOUND', message: 'Artifact not found' });
    await this.conversations.requireOwned(ctx, artifact.conversationId);
    if (!artifact.storagePath) {
      res.setHeader('Content-Type', 'application/json');
      return void res.json({ meta: artifact.meta });
    }
    res.setHeader('Content-Type', artifact.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.title.replace(/[^\w. -]/g, '')}.${artifact.kind === 'document_pdf' ? 'pdf' : 'bin'}"`);
    this.storage.stream(artifact.storagePath).pipe(res);
  }

  @Post('turns/:pendingTurnId/answer')
  @RequireInstitutionPermissions('ai.use')
  async answer(
    @Param('pendingTurnId') pendingTurnId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(petrosAnswerSchema)) body: PetrosAnswerInput,
    @Res() res: Response,
  ) {
    const ctx = this.ctx(p, s, r);
    await this.stream(res, (emit) => this.agent.answer(ctx, pendingTurnId, body.optionId, emit));
  }

  @Post('runs/:runId/confirm')
  @RequireInstitutionPermissions('ai.use')
  async confirm(
    @Param('runId') runId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Res() res: Response,
  ) {
    const ctx = this.ctx(p, s, r);
    await this.stream(res, (emit) => this.agent.confirmRun(ctx, runId, emit));
  }

  @Post('runs/:runId/reject')
  @RequireInstitutionPermissions('ai.use')
  async reject(
    @Param('runId') runId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Res() res: Response,
  ) {
    const ctx = this.ctx(p, s, r);
    await this.stream(res, (emit) => this.agent.rejectRun(ctx, runId, emit));
  }

  // ── Capabilities (role-aware empty state) ────────────────────────────────────

  @Get('capabilities')
  @RequireInstitutionPermissions('ai.use')
  async capabilities(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
  ): Promise<PetrosCapabilities> {
    const institution = await this.repo.institutionBasics(p.institutionId);
    const tools = this.registry.availableFor(p.permissions, institution?.type ?? 'school');
    const names = new Set(tools.map((t) => t.name));
    const suggestions: string[] = [];
    if (names.has('student_get_basic_profile')) suggestions.push('Look up a student');
    if (names.has('attendance_list_sessions')) suggestions.push("Summarise this week's attendance");
    if (names.has('announcement_draft')) suggestions.push('Draft an announcement for parents');
    if (can(p.permissions, 'documents.generate')) suggestions.push('Prepare a letter on school letterhead');
    if (can(p.permissions, 'counseling.refer')) suggestions.push('Refer a student to counseling');
    suggestions.push('Help me plan a school event');
    return {
      canUploadFiles: can(p.permissions, 'ai.files.upload'),
      canGenerateDocuments: can(p.permissions, 'documents.generate'),
      canGenerateAssessments: can(p.permissions, 'ai.assessments.generate'),
      suggestions: suggestions.slice(0, 5),
      toolNames: [...names],
    };
  }

  /**
   * Manual-flow roles-editor assist (Phase 7): nano proposes catalogue-constrained permissions
   * for a described role. Read-only advice — the normal editor save applies it; no run.
   */
  @Post('suggest-permissions')
  @RequireInstitutionPermissions('roles.view')
  async suggestPermissions(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body(zodBody(suggestPermissionsSchema)) body: SuggestPermissionsInput,
  ) {
    const institution = await this.repo.institutionBasics(p.institutionId);
    const presets = getDefaultRolesForInstitutionType(institution?.type ?? 'school')
      .map((r) => `${r.key}: ${r.permissions.join(', ')}`)
      .join('\n');
    const { result } = await this.openai.structured<{ permissions: string[]; rationale: string }>('small', {
      instructions: `You suggest institution permission keys for a new staff role. Only use keys from this catalogue:\n${ALL_INSTITUTION_PERMISSION_KEYS.join(', ')}\n\nExisting presets for reference:\n${presets}\n\nSuggest a minimal, sensible set.`,
      input: `Role description: ${body.description}`,
      schemaName: 'permission_suggestions',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['permissions', 'rationale'],
        properties: {
          permissions: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
        },
      },
      maxOutputTokens: 600,
    });
    const valid = new Set<string>(ALL_INSTITUTION_PERMISSION_KEYS);
    return {
      permissions: result.permissions.filter((k) => valid.has(k)),
      rationale: result.rationale,
    };
  }

  /** Decline aggregates for the portal AI admin card — counters by category, never prompts. */
  @Get('decline-stats')
  @RequireInstitutionPermissions('ai.configure')
  declineStats(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.topicality.stats(this.ctx(p, s, r));
  }

  // ── SSE plumbing ─────────────────────────────────────────────────────────────

  private async stream(res: Response, work: (emit: Emit) => Promise<void>): Promise<void> {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const emit: Emit = (event: PetrosStreamEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await work(emit);
    } catch (e) {
      const err = e as { response?: { code?: string; message?: string }; message?: string };
      emit({
        type: 'error',
        code: err.response?.code ?? 'TURN_FAILED',
        message: err.response?.message ?? err.message ?? 'The turn failed.',
      });
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
