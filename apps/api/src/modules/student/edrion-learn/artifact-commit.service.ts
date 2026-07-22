import { Injectable } from '@nestjs/common';
import type { StudentPrincipal } from '../student.types';
import { LibraryRepository } from '../library/library.repository';
import { EdrionLearnRepository } from './edrion-learn.repository';
@Injectable()
export class ArtifactCommitService {
  constructor(
    private readonly library: LibraryRepository,
    private readonly repo: EdrionLearnRepository,
  ) {}

  async commitCards(
    principal: StudentPrincipal,
    sessionId: string,
    cards: Array<{ front_md: string; back_md: string; source_block_id: string }>,
    title: string,
  ): Promise<{ deckId: string; cardCount: number }> {
    const owner = this.library.owner(principal);
    const deck = await this.library.insertDeck({
      ...owner,
      sourceSessionId: sessionId,
      title: title.slice(0, 120),
      fromLabel: 'From Edrion Learn',
    });
    await this.library.insertCards(
      cards.map((c, i) => ({
        deckId: deck.id,
        sequence: i + 1,
        prompt: c.front_md,
        answer: c.back_md,
        sourcePage: null,
        nextDueAt: new Date(),
        intervalDays: '0',
        ease: '2.50',
        reps: 0,
        lapses: 0,
      })),
    );

    const session = await this.repo.getSession(principal, sessionId);
    const evidence = [...((session?.evidence as string[]) ?? []), ...cards.map((c) => c.front_md)];
    await this.repo.updateSession(sessionId, { evidence });

    return { deckId: deck.id, cardCount: cards.length };
  }
}
