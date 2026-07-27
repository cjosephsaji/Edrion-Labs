import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';

/** Narrow Petros → Edrion Learn artifact port (pin notes into active sessions). */
@Injectable()
export class LearnArtifactService {
  constructor(private readonly repo: EdrionLearnRepository) {}

  async pinNote(
    principal: StudentPrincipal,
    sessionId: string,
    question: string,
    answer: string,
    blockAfterId?: string,
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    if (session.orchestratorStatus === 'closed') {
      throw new ConflictException({ code: 'SESSION_CLOSED', message: 'Session is closed.' });
    }

    const seq = await this.repo.nextBlockSequence(sessionId);
    await this.repo.insertBlock({
      sessionId,
      sequence: seq,
      blockType: 'note_card',
      content: { question, answer },
      interactionState: blockAfterId ? { afterBlockId: blockAfterId } : {},
    });
    return { ok: true };
  }
}
