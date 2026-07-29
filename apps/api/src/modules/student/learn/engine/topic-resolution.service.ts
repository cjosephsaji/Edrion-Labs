import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import type { CreateLearnSessionInput, EntryPoint, EntryRef, SessionGoal } from '@edrion/schemas';
import { DATABASE } from '../../../../common/tokens';
import type { StudentPrincipal } from '../../student.types';
import { LearnSessionsRepository } from './learn-sessions.repository';
import {
  topicKeyForFree,
  topicKeyForLearnTopic,
  topicKeyForMaterial,
  parseTopicKey,
} from './topic-keys';

export type ResolvedTopic = {
  learnTopicId: string | null;
  topicKey: string;
  title: string;
  subjectLabel: string;
  syllabusContext?: string | null;
  materialOutline?: string | null;
  materialFirstChunk?: string | null;
  entryPoint?: EntryPoint;
  entryRef?: EntryRef;
  goal?: SessionGoal;
  emotionalContext?: 'neutral' | 'setback' | 'curious' | 'anxious';
  timeBudgetMinutes?: number;
  sessionContextExtras?: Record<string, unknown>;
};

/**
 * Resolves session topic identity (DEC-14). Canonical keys only; ad-hoc topics
 * keep learn_topic_id null and do NOT upsert learn_topics garbage rows.
 */
@Injectable()
export class TopicResolutionService {
  constructor(
    private readonly repo: LearnSessionsRepository,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  async resolve(principal: StudentPrincipal, input: CreateLearnSessionInput): Promise<ResolvedTopic> {
    if (input.pathItemId) {
      return this.fromPathItem(input.pathItemId);
    }
    if (input.knowledgeItemId) {
      return this.fromMaterial(principal, input.knowledgeItemId);
    }
    if (input.topicKey) {
      return this.fromTopicKey(principal, input.topicKey, input);
    }
    // Last resort free key from a truncated idempotency key — still free:, never session:
    const title = 'Untitled lesson';
    return {
      learnTopicId: null,
      topicKey: topicKeyForFree(`${title}-${input.idempotencyKey.slice(0, 8)}`),
      title,
      subjectLabel: 'General',
    };
  }

  private async fromPathItem(pathItemId: string): Promise<ResolvedTopic> {
    const item = await this.repo.getPathItem(pathItemId);
    if (!item) throw new NotFoundException({ code: 'PATH_ITEM_NOT_FOUND', message: 'Path item not found.' });
    const topic = await this.repo.getTopic(item.topicId);
    if (!topic) throw new NotFoundException({ code: 'TOPIC_NOT_FOUND', message: 'Path topic not found.' });
    return {
      learnTopicId: topic.id,
      topicKey: topicKeyForLearnTopic(topic.id),
      title: topic.title,
      subjectLabel: topic.subjectLabel,
      entryPoint: 'learning_path',
      entryRef: { learning_path_id: item.pathId, learning_path_item_id: item.id },
      syllabusContext: topic.subjectLabel,
    };
  }

  private async fromMaterial(
    principal: StudentPrincipal,
    knowledgeItemId: string,
  ): Promise<ResolvedTopic> {
    const item = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(eq(schema.knowledgeItems.id, knowledgeItemId))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (!item) {
      throw new NotFoundException({ code: 'MATERIAL_NOT_FOUND', message: 'Library item not found.' });
    }
    // Owner check
    if (principal.kind === 'institutional') {
      if (item.studentId !== principal.studentId) {
        throw new NotFoundException({ code: 'MATERIAL_NOT_FOUND', message: 'Library item not found.' });
      }
    } else if (item.independentUserId !== principal.independentUserId) {
      throw new NotFoundException({ code: 'MATERIAL_NOT_FOUND', message: 'Library item not found.' });
    }

    const pages = await this.db
      .select({ text: schema.knowledgeItemPages.text, pageIndex: schema.knowledgeItemPages.pageIndex })
      .from(schema.knowledgeItemPages)
      .where(eq(schema.knowledgeItemPages.itemId, knowledgeItemId))
      .orderBy(schema.knowledgeItemPages.pageIndex)
      .limit(3);

    const firstChunk = pages[0]?.text?.slice(0, 2000) ?? null;
    const outline = pages
      .map((p) => (p.text ?? '').slice(0, 200))
      .filter(Boolean)
      .join('\n')
      .slice(0, 1500);

    const title = item.title || 'Library document';
    return {
      learnTopicId: null,
      topicKey: topicKeyForMaterial(knowledgeItemId),
      title,
      subjectLabel: 'General',
      materialOutline: outline || null,
      materialFirstChunk: firstChunk,
      entryPoint: 'library_document',
      entryRef: { material_id: knowledgeItemId },
    };
  }

  private async fromTopicKey(
    principal: StudentPrincipal,
    topicKey: string,
    input: CreateLearnSessionInput,
  ): Promise<ResolvedTopic> {
    const parsed = parseTopicKey(topicKey);

    if (parsed.kind === 'topic') {
      const topic = await this.repo.getTopic(parsed.learnTopicId);
      if (topic) {
        return {
          learnTopicId: topic.id,
          topicKey: topicKeyForLearnTopic(topic.id),
          title: topic.title,
          subjectLabel: topic.subjectLabel,
          syllabusContext: topic.subjectLabel,
        };
      }
    }

    if (parsed.kind === 'material') {
      return this.fromMaterial(principal, parsed.materialId);
    }

    // Existing learn_topics row keyed the old way (subject:/raw)? Prefer it if found.
    const existing = await this.repo.findTopicByKey(
      topicKey,
      principal.kind === 'institutional' ? 'institution' : 'generic',
    );
    if (existing) {
      return {
        learnTopicId: existing.id,
        topicKey: topicKeyForLearnTopic(existing.id),
        title: existing.title,
        subjectLabel: existing.subjectLabel,
        syllabusContext: existing.subjectLabel,
      };
    }

    // Also try looking up by UUID if the client passed a bare learn_topic id.
    const uuidLike = /^[0-9a-f-]{36}$/i.test(topicKey);
    if (uuidLike) {
      const byId = await this.repo.getTopic(topicKey);
      if (byId) {
        return {
          learnTopicId: byId.id,
          topicKey: topicKeyForLearnTopic(byId.id),
          title: byId.title,
          subjectLabel: byId.subjectLabel,
          syllabusContext: byId.subjectLabel,
        };
      }
    }

    const title = input.topicKey && !topicKey.startsWith('free:') ? topicKey : topicKey.replace(/^free:/, '');
    const displayTitle = title.replace(/-/g, ' ').slice(0, 120) || 'Untitled lesson';
    return {
      learnTopicId: null,
      topicKey: parsed.kind === 'free' ? topicKey : topicKeyForFree(displayTitle),
      title: displayTitle,
      subjectLabel: 'General',
    };
  }
}
