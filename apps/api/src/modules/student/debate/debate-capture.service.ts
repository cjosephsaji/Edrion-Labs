import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { audioSeamSchema } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import type { StudentPrincipal } from '../student.types';
import { StudentStorageService } from '../storage/student-storage.service';
import { DebateConsentService } from './debate-consent.service';
import { DebateRoundService } from './debate-round.service';
import { DEBATE_STT_JOB } from './debate.constants';

@Injectable()
export class DebateCaptureService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
    private readonly consent: DebateConsentService,
    private readonly storage: StudentStorageService,
    private readonly jobs: JobsService,
  ) {}

  async uploadChunk(
    principal: StudentPrincipal,
    debateId: string,
    turnId: string,
    chunkIdx: number,
    mimeType: string,
    buffer: Buffer,
    idempotencyKey?: string,
  ) {
    void idempotencyKey;
    const debate = await this.rounds.requireDebate(principal, debateId);
    const turn = await this.rounds.requireTurn(debateId, turnId);
    if (debate.currentTurnIndex !== turn.turnIndex) {
      throw new BadRequestException({ code: 'WRONG_TURN', message: 'Not the active turn.' });
    }
    const participants = await this.db
      .select()
      .from(schema.debateParticipants)
      .where(
        and(
          eq(schema.debateParticipants.debateId, debateId),
          eq(schema.debateParticipants.participantKind, 'human'),
        ),
      );
    const participant = participants[0];
    if (!participant) throw new BadRequestException({ code: 'NO_HUMAN', message: 'No human seat.' });
    await this.consent.assertCaptureConsent(debateId, participant.id);

    const stored = await this.storage.upload(
      principal,
      'debate_turn_chunk',
      `chunk-${chunkIdx}.webm`,
      mimeType,
      buffer,
    );

    const seam = audioSeamSchema.parse(turn.audioSeam ?? { chunks: [] });
    const existing = seam.chunks.find((c) => c.idx === chunkIdx);
    if (existing) {
      return { chunkIdx, storageRef: existing.storage_ref, deduped: true };
    }
    const nextSeam = {
      ...seam,
      chunks: [
        ...seam.chunks,
        {
          idx: chunkIdx,
          storage_ref: stored.id,
          bytes: buffer.length,
          started_ms: chunkIdx * 5000,
          duration_ms: 5000,
        },
      ],
    };
    await this.db
      .update(schema.debateTurns)
      .set({
        captureState: 'uploading',
        audioSeam: nextSeam,
      })
      .where(eq(schema.debateTurns.id, turnId));

    return { chunkIdx, storageRef: stored.id, deduped: false };
  }

  async finaliseTurn(principal: StudentPrincipal, debateId: string, turnId: string) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    const turn = await this.rounds.requireTurn(debateId, turnId);
    if (turn.captureState === 'stored') {
      throw new ConflictException({ code: 'ALREADY_FINALISED', message: 'Turn already finalised.' });
    }
    if (debate.currentTurnIndex !== turn.turnIndex) {
      throw new BadRequestException({ code: 'WRONG_TURN', message: 'Not the active turn.' });
    }
    const seam = audioSeamSchema.parse(turn.audioSeam ?? { chunks: [] });
    if (seam.chunks.length === 0) {
      throw new BadRequestException({ code: 'NO_AUDIO', message: 'No audio chunks uploaded.' });
    }
    const lastChunk = seam.chunks[seam.chunks.length - 1]!;
    const [audioObject] = await this.db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, lastChunk.storage_ref))
      .limit(1);

    const durationMs = seam.chunks.reduce((sum, c) => sum + c.duration_ms, 0);
    await this.db
      .update(schema.debateTurns)
      .set({
        captureState: 'stored',
        sttState: 'queued',
        audioObjectId: audioObject?.id ?? lastChunk.storage_ref,
        actualDurationMs: durationMs,
        endedAt: new Date(),
        audioSeam: { ...seam, total_duration_ms: durationMs },
      })
      .where(eq(schema.debateTurns.id, turnId));

    await this.jobs.enqueue('ai', DEBATE_STT_JOB, {
      debateId,
      turnId,
      principalKind: principal.kind,
      institutionId: principal.kind === 'institutional' ? principal.institutionId : null,
      studentId: principal.kind === 'institutional' ? principal.studentId : null,
      independentUserId: principal.kind === 'independent' ? principal.independentUserId : null,
    });

    await this.db
      .update(schema.debates)
      .set({
        status: 'speaking',
        updatedAt: new Date(),
      })
      .where(eq(schema.debates.id, debateId));

    return { turnId, sttState: 'queued', debateStatus: debate.status };
  }
}
