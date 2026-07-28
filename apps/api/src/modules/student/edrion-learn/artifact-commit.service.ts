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
  ): Promise<{ deckId: string; cardCount: number; evidenceEventIds: string[] }> {
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

    // DEC-8: append evidence-event ids (not raw card markdown) so the learner
    // model and memory-diff substrate can consume Learn evidence.
    const ownerIds =
      principal.kind === 'institutional'
        ? {
            studentId: principal.studentId,
            independentUserId: null,
          }
        : {
            studentId: null,
            independentUserId: principal.independentUserId,
          };

    const evidenceEventIds: string[] = [];
    for (const card of cards) {
      const tag = await this.repo.insertEvidenceTag({
        ...ownerIds,
        tagKey: `learn:artifact:${sessionId}:${card.source_block_id}:${evidenceEventIds.length}`,
        label: 'Learn artifact commit',
        polarity: 'neutral',
        note: card.front_md.slice(0, 200),
        evidenceEventIds: [card.source_block_id],
      });
      evidenceEventIds.push(tag.id);
    }

    const session = await this.repo.getSession(principal, sessionId);
    const evidence = [...((session?.evidence as string[]) ?? []), ...evidenceEventIds];
    await this.repo.updateSession(sessionId, { evidence });

    return { deckId: deck.id, cardCount: cards.length, evidenceEventIds };
  }
}
