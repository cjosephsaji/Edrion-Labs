import {
  Delete,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { schema, type Database } from '@edrion/database';
import { z } from 'zod';
import { debateChunkUploadSchema } from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { DATABASE } from '../../../common/tokens';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { CanvasGraphService } from '../visual-studio/canvas-graph.service';
import { DebateRoundService } from './debate-round.service';
import { DebateConsentService } from './debate-consent.service';
import { DebateCaptureService } from './debate-capture.service';
import { DebateAdjudicationService } from './debate-adjudication.service';
import { DebatePrepService } from './debate-prep.service';
import { DebateLifecycleService } from './debate-lifecycle.service';
import { DebateShareService } from './debate-share.service';
import { DebateSparService } from './debate-spar.service';
import { DebateMotionSuggestService } from './debate-motion-suggest.service';

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
        reject(new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Chunk too large.' }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => !done && resolve(Buffer.concat(chunks)));
    req.on('error', (e) => !done && reject(e));
  });
}

@ApiTags('student-debate')
@Controller('student/debate/rounds')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.lab.use')
export class DebateController {
  constructor(
    private readonly rounds: DebateRoundService,
    private readonly consent: DebateConsentService,
    private readonly capture: DebateCaptureService,
    private readonly adjudication: DebateAdjudicationService,
    private readonly prep: DebatePrepService,
    private readonly lifecycle: DebateLifecycleService,
    private readonly share: DebateShareService,
    private readonly spar: DebateSparService,
    private readonly motionAssist: DebateMotionSuggestService,
    private readonly clash: CanvasGraphService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  @Post()
  create(@CurrentStudent() principal: StudentPrincipal, @Body() body: unknown) {
    return this.rounds.createRound(principal, body);
  }

  @Get(':id')
  get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.rounds.getRound(principal, id);
  }

  @Post(':id/consent')
  consentRoute(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.consent.recordConsent(principal, id, body);
  }

  @Post(':id/start-prep')
  startPrep(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.lifecycle.startPrep(principal, id);
  }

  @Post(':id/advance')
  advance(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.lifecycle.advanceToSpeaking(principal, id);
  }

  @Get(':id/prep-notes')
  getPrep(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.prep.getNotes(principal, id);
  }

  @Put(':id/prep-notes')
  putPrep(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.prep.putNotes(principal, id, body);
  }

  @Post(':id/prep-notes/assist')
  prepAssist(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.motionAssist.prepAssist(principal, id, body);
  }

  @Post(':id/spar/invite')
  sparInvite(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.spar.createInvite(principal, id);
  }

  @Post('spar/join/:token')
  sparJoin(@CurrentStudent() principal: StudentPrincipal, @Param('token') token: string) {
    return this.spar.joinByToken(principal, token);
  }

  @Get(':id/turns/:turnId/opponent')
  async opponentScript(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
  ) {
    await this.rounds.requireDebate(principal, id);
    const [script] = await this.db
      .select()
      .from(schema.debateAiOpponentScripts)
      .where(eq(schema.debateAiOpponentScripts.turnId, turnId))
      .limit(1);
    return script ?? { status: 'pending' };
  }

  @Post(':id/turns/:turnId/chunks')
  async chunk(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
    @Req() req: Request,
    @Body() jsonBody?: unknown,
  ) {
    if (jsonBody && typeof jsonBody === 'object' && jsonBody !== null && 'dataBase64' in jsonBody) {
      const body = jsonBody as { dataBase64: string } & z.infer<typeof debateChunkUploadSchema>;
      const parsed = debateChunkUploadSchema.parse(body);
      const buffer = Buffer.from(body.dataBase64, 'base64');
      return this.capture.uploadChunk(
        principal,
        id,
        turnId,
        parsed.chunkIdx,
        parsed.mimeType,
        buffer,
        req.headers['idempotency-key'] as string | undefined,
      );
    }
    const chunkIdx = Number(req.headers['x-chunk-idx'] ?? 0);
    const mimeType = String(req.headers['content-type'] ?? 'audio/webm');
    const buffer = await readRawBody(req, 8 * 1024 * 1024);
    return this.capture.uploadChunk(
      principal,
      id,
      turnId,
      chunkIdx,
      mimeType,
      buffer,
      req.headers['idempotency-key'] as string | undefined,
    );
  }

  @Post(':id/turns/:turnId/finalise')
  finalise(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
  ) {
    return this.capture.finaliseTurn(principal, id, turnId);
  }

  @Get(':id/turns/:turnId/transcript')
  async transcript(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
  ) {
    await this.rounds.requireDebate(principal, id);
    const [row] = await this.db
      .select()
      .from(schema.debateTranscripts)
      .where(eq(schema.debateTranscripts.turnId, turnId))
      .limit(1);
    return row ?? { status: 'pending' };
  }

  @Post(':id/adjudicate')
  adjudicate(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.adjudication.adjudicate(principal, id);
  }

  @Post(':id/rejudge')
  rejudge(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.adjudication.rejudge(principal, id);
  }

  @Get(':id/report')
  report(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.adjudication.getReport(principal, id);
  }

  @Post(':id/share')
  shareReport(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.share.createShare(principal, id, body);
  }

  @Delete(':id/share')
  revokeShare(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.share.revokeShare(principal, id);
  }

  @Delete(':id')
  deleteRound(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    return this.share.deleteRound(principal, id);
  }

  @Get(':id/clash-map')
  async clashMap(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    const { debate } = await this.rounds.getRound(principal, id);
    const [canvas] = await this.db
      .select()
      .from(schema.visualCanvases)
      .where(eq(schema.visualCanvases.debateId, id))
      .limit(1);
    return {
      canvasId: canvas?.id ?? null,
      graph: canvas?.graph ?? this.clash.buildClashMap({ owner: principal, debateRoundId: id }),
      beta: true,
      motion: debate.motionText ?? debate.motion,
    };
  }
}
