import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { StudentStorageService } from '../storage/student-storage.service';
import { STT_PROVIDER, type SttProvider } from './stt/stt-provider';
import { DebateTranscriptService } from './debate-transcript.service';
import { DebateOrchestrationService } from './debate-orchestration.service';

@Injectable()
export class DebateSttService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STT_PROVIDER) private readonly stt: SttProvider,
    private readonly storage: StudentStorageService,
    private readonly transcripts: DebateTranscriptService,
    private readonly orchestration: DebateOrchestrationService,
  ) {}

  async transcribeTurn(debateId: string, turnId: string) {
    const [turn] = await this.db
      .select()
      .from(schema.debateTurns)
      .where(eq(schema.debateTurns.id, turnId))
      .limit(1);
    if (!turn?.audioObjectId) {
      throw new Error('Turn has no audio object');
    }
    const [debate] = await this.db
      .select()
      .from(schema.debates)
      .where(eq(schema.debates.id, debateId))
      .limit(1);
    if (!debate) throw new Error('Debate not found');

    const [obj] = await this.db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, turn.audioObjectId))
      .limit(1);
    if (!obj) throw new Error('Storage object missing');

    const buffer = await this.storage.readBuffer(obj.storageKey);
    const keyterms = this.keytermsForMotion(debate.motionText ?? debate.motion);
    const result = await this.stt.transcribe({
      audioBuffer: buffer,
      objectRef: obj.storageKey,
      languageHint: 'en-IN',
      keyterms,
      diarize: false,
    });
    void buffer;
    const transcript = await this.transcripts.createCanonical({
      debate,
      turn,
      provider: 'deepgram',
      providerModel: result.providerModel,
      language: 'en-IN',
      text: result.text,
      words: result.words,
      durationMs: turn.actualDurationMs ?? 0,
      meanConfidence: result.confidence,
      metrics: this.transcripts.computeMetrics(result.words, result.fillers),
    });

    await this.db
      .update(schema.debateTurns)
      .set({
        transcriptId: transcript.id,
        sttState: 'done',
      })
      .where(eq(schema.debateTurns.id, turnId));

    await this.orchestration.onSttCompleted(debateId, turnId);
    return transcript;
  }

  private keytermsForMotion(motion: string): string[] {
    const base = ['rebuttal', 'motion', 'mechanism', 'comparative', 'impact', 'claim'];
    const words = motion
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 12);
    return [...new Set([...base, ...words])];
  }
}
