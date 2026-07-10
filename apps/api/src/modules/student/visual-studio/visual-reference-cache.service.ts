import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  completeCanvasGraphSchema,
  type CompleteCanvasGraph,
  type VisualArchetype,
} from '@edrion/schemas';
import { schema, type Database } from '@edrion/database';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../../../common/tokens';
import { VISUAL_PROMPT_VERSION } from './visual-prompts';

@Injectable()
export class VisualReferenceCacheService {
  private readonly logger = new Logger(VisualReferenceCacheService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(topicId: string, archetype: VisualArchetype): Promise<CompleteCanvasGraph | null> {
    const [row] = await this.db
      .select({ content: schema.conceptAtoms.content })
      .from(schema.conceptAtoms)
      .where(
        and(
          eq(schema.conceptAtoms.topicId, topicId),
          eq(schema.conceptAtoms.atomKind, 'visual_reference_graph'),
          eq(schema.conceptAtoms.variantKey, archetype),
          eq(schema.conceptAtoms.promptVersion, VISUAL_PROMPT_VERSION),
        ),
      )
      .limit(1);

    if (!row?.content) return null;
    const parsed = completeCanvasGraphSchema.safeParse(row.content);
    if (!parsed.success) {
      this.logger.warn(`Invalid reference cache for topic ${topicId}/${archetype} — ignoring`);
      await this.db
        .delete(schema.conceptAtoms)
        .where(
          and(
            eq(schema.conceptAtoms.topicId, topicId),
            eq(schema.conceptAtoms.atomKind, 'visual_reference_graph'),
            eq(schema.conceptAtoms.variantKey, archetype),
            eq(schema.conceptAtoms.promptVersion, VISUAL_PROMPT_VERSION),
          ),
        );
      return null;
    }
    return parsed.data;
  }

  async put(topicId: string, archetype: VisualArchetype, graph: CompleteCanvasGraph, model: string) {
    await this.db
      .insert(schema.conceptAtoms)
      .values({
        topicId,
        atomKind: 'visual_reference_graph',
        variantKey: archetype,
        content: graph,
        model,
        promptVersion: VISUAL_PROMPT_VERSION,
      })
      .onConflictDoUpdate({
        target: [
          schema.conceptAtoms.topicId,
          schema.conceptAtoms.atomKind,
          schema.conceptAtoms.variantKey,
          schema.conceptAtoms.promptVersion,
        ],
        set: { content: graph, model },
      });
  }
}
