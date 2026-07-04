import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, schema, sql, type Database } from '@edrion/database';
import {
  PETROS_DECLINE_CATEGORIES,
  petrosTopicalityResultSchema,
  type PetrosTopicalityResult,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { PetrosOpenAiService } from './openai-client.service';
import { basePortalAudit, type PortalActionContext } from '../portal-action-context';

const CONFIDENCE_FLOOR = 0.7;

/** Cheap pattern gate: obviously tool-ish/data-ish prompts skip the classifier entirely. */
const OBVIOUS_WORK = /\b(student|attendance|exam|assignment|grade|fee|invoice|class|timetable|teacher|staff|library|hostel|circular|announce|report|counsel|admission|school|syllabus|lesson|homework|parent)\b/i;

const CLASSIFIER_INSTRUCTIONS = `You classify messages sent by SCHOOL/COLLEGE STAFF to their institution's work assistant.

on_topic=true for anything plausibly related to their work, INCLUDING these explicitly allowed areas:
- subject-matter/academic explanations, teaching help
- the user's OWN work/HR letters (leave application, resignation letter)
- student recommendation letters
- school event planning, including purchase suggestions and budgets for school events

on_topic=false only for clearly personal/unrelated requests. Categories:
personal_shopping, entertainment_media, social_personal, unrelated_professional, politics_controversy, harmful_or_unsafe, academic_dishonesty, other_offtopic.
When on_topic=true, category must be null.`;

const DECLINE_MESSAGE =
  "I'm here to help with your work at the institution — lookups, drafting, planning, documents and the like — so I'll pass on that one. If this actually is work-related, just say so and I'll help. What can I do for your school work?";

/**
 * Topicality guardrail v2 (Phase 6), cheapest-first layer 3: a nano pre-screen classifier with
 * strict structured output. High-confidence off-topic → templated decline WITHOUT invoking the
 * main model; low confidence → let the main model + charter decide. Declines log the FULL prompt
 * to the append-only audit stream (audit.view) and bump aggregate counters (admins see counts by
 * category only, never prompts). One-retry escape: the turn right after a decline skips the
 * classifier (flagged, logged).
 */
@Injectable()
export class PetrosTopicalityService {
  private readonly logger = new Logger(PetrosTopicalityService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly openai: PetrosOpenAiService,
  ) {}

  get declineMessage(): string {
    return DECLINE_MESSAGE;
  }

  /** True when this turn should be declined without the main model. */
  async shouldDecline(_ctx: PortalActionContext, prompt: string): Promise<{ decline: boolean; category: string | null }> {
    if (OBVIOUS_WORK.test(prompt) || prompt.length < 8) return { decline: false, category: null };
    let result: PetrosTopicalityResult;
    try {
      const { result: raw } = await this.openai.structured<PetrosTopicalityResult>('small', {
        instructions: CLASSIFIER_INSTRUCTIONS,
        input: prompt.slice(0, 2000),
        schemaName: 'topicality',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['on_topic', 'category', 'confidence'],
          properties: {
            on_topic: { type: 'boolean' },
            category: { type: ['string', 'null'], enum: [...PETROS_DECLINE_CATEGORIES, null] },
            confidence: { type: 'number' },
          },
        },
        maxOutputTokens: 100,
      });
      result = petrosTopicalityResultSchema.parse(raw);
    } catch (e) {
      // Classifier failure never blocks work — fall through to the main model + charter.
      this.logger.warn(`topicality classifier failed: ${e instanceof Error ? e.message : e}`);
      return { decline: false, category: null };
    }
    if (result.on_topic || result.confidence < CONFIDENCE_FLOOR || !result.category) {
      return { decline: false, category: null };
    }
    return { decline: true, category: result.category };
  }

  /** Record a decline: full prompt to the audit stream + aggregate counter upsert. */
  async recordDecline(ctx: PortalActionContext, prompt: string, category: string): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action: 'petros.topic_declined',
      module: 'portal-petros',
      entityType: 'petros_decline',
      entityId: ctx.principal.institutionUserId,
      institutionId: ctx.principal.institutionId,
      newState: { category, prompt }, // full prompt — append-only, gated audit.view
    } as AuditEventInput);
    await this.db.execute(sql`
      insert into petros_decline_stats (institution_id, category, day, count)
      values (${ctx.principal.institutionId}, ${category}, current_date, 1)
      on conflict (institution_id, category, day)
      do update set count = petros_decline_stats.count + 1, updated_at = now()
    `);
  }

  /** Aggregate counters for the admin card (last N days). Categories only — never prompts. */
  async stats(ctx: PortalActionContext, days = 30) {
    const d = schema.petrosDeclineStats;
    const rows = await this.db
      .select({ category: d.category, total: sql<number>`sum(${d.count})` })
      .from(d)
      .where(
        and(
          eq(d.institutionId, ctx.principal.institutionId),
          gte(d.day, sql`current_date - ${days}::int`),
        ),
      )
      .groupBy(d.category);
    return { days, byCategory: rows.map((r) => ({ category: r.category, count: Number(r.total) })) };
  }
}
