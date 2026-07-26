import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { debatePrepNotesPutSchema } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';
import { DebateRoundService } from './debate-round.service';

@Injectable()
export class DebatePrepService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rounds: DebateRoundService,
  ) {}

  async getNotes(principal: StudentPrincipal, debateId: string) {
    await this.rounds.requireDebate(principal, debateId);
    const owner = ownerColumns(principal);
    const [row] = await this.db
      .select()
      .from(schema.debatePrepNotes)
      .where(
        and(
          eq(schema.debatePrepNotes.debateId, debateId),
          owner.studentId
            ? eq(schema.debatePrepNotes.studentId, owner.studentId)
            : eq(schema.debatePrepNotes.independentUserId, owner.independentUserId!),
        ),
      )
      .limit(1);
    if (!row) {
      return {
        blocks: [
          { key: 'claim', text: '' },
          { key: 'mechanism', text: '' },
          { key: 'example', text: '' },
          { key: 'impact', text: '' },
          { key: 'comparative', text: '' },
        ],
        version: 1,
        aiAssistUsed: false,
      };
    }
    return row;
  }

  async putNotes(principal: StudentPrincipal, debateId: string, body: unknown) {
    const debate = await this.rounds.requireDebate(principal, debateId);
    if (debate.status !== 'prep' && debate.status !== 'speaking') {
      throw new BadRequestException({ code: 'INVALID_STATE', message: 'Prep pad not editable now.' });
    }
    const parsed = debatePrepNotesPutSchema.parse(body);
    const owner = ownerColumns(principal);
    const [existing] = await this.db
      .select()
      .from(schema.debatePrepNotes)
      .where(
        and(
          eq(schema.debatePrepNotes.debateId, debateId),
          owner.studentId
            ? eq(schema.debatePrepNotes.studentId, owner.studentId)
            : eq(schema.debatePrepNotes.independentUserId, owner.independentUserId!),
        ),
      )
      .limit(1);

    if (existing && existing.version !== parsed.version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Prep notes changed — refresh.' });
    }

    if (existing) {
      const [row] = await this.db
        .update(schema.debatePrepNotes)
        .set({
          blocks: parsed.blocks,
          scaffoldTemplateKey: parsed.scaffoldTemplateKey ?? existing.scaffoldTemplateKey,
          version: parsed.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.debatePrepNotes.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await this.db
      .insert(schema.debatePrepNotes)
      .values({
        debateId,
        ...owner,
        blocks: parsed.blocks,
        scaffoldTemplateKey: parsed.scaffoldTemplateKey ?? 'wudc_five',
        version: 2,
      })
      .returning();
    return row;
  }
}
