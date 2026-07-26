import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { StudentStorageService } from '../storage/student-storage.service';
import type { StudentPrincipal } from '../student.types';
import { TTS_PROVIDER, type TtsProvider } from './tts/tts-provider';

@Injectable()
export class DebateTtsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TTS_PROVIDER) private readonly tts: TtsProvider,
    private readonly storage: StudentStorageService,
  ) {}

  async attachTtsToScript(
    principal: StudentPrincipal,
    debateId: string,
    scriptId: string,
    voiceKey: string,
  ) {
    const [scriptRow] = await this.db
      .select()
      .from(schema.debateAiOpponentScripts)
      .where(eq(schema.debateAiOpponentScripts.id, scriptId))
      .limit(1);
    if (!scriptRow || scriptRow.debateId !== debateId) return null;

    const synth = await this.tts.synthesize({ text: scriptRow.script, voiceKey, language: 'en-IN' });
    const stored = await this.storage.upload(
      principal,
      'debate_turn_chunk',
      `tts-${scriptRow.turnId}.webm`,
      synth.mimeType,
      synth.audioBuffer,
    );

    await this.db
      .update(schema.debateAiOpponentScripts)
      .set({
        ttsObjectId: stored.id,
        ttsProvider: synth.provider,
        ttsVoiceKey: synth.voiceKey,
        ttsDurationMs: synth.durationMs,
      })
      .where(eq(schema.debateAiOpponentScripts.id, scriptId));

    return { objectId: stored.id, durationMs: synth.durationMs };
  }
}
