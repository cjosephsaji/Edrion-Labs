import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, schema, type Database } from '@edrion/database';
import type { PetrosQualityRunQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

@Injectable()
export class PetrosQualityRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(query: PetrosQualityRunQuery) {
    const filters = [
      query.status ? eq(schema.petrosQualityRuns.status, query.status) : undefined,
      query.mode ? eq(schema.petrosQualityRuns.mode, query.mode) : undefined,
      query.gate ? eq(schema.petrosQualityRuns.gate, query.gate) : undefined,
    ].filter(Boolean) as Parameters<typeof and>;
    return this.db.select().from(schema.petrosQualityRuns).where(filters.length ? and(...filters) : undefined).orderBy(desc(schema.petrosQualityRuns.createdAt)).limit(query.limit);
  }

  find(id: string) {
    return this.db.select().from(schema.petrosQualityRuns).where(eq(schema.petrosQualityRuns.id, id)).limit(1).then((rows) => rows[0]);
  }

  findByExternalId(id: string) {
    return this.db.select().from(schema.petrosQualityRuns).where(eq(schema.petrosQualityRuns.externalRunId, id)).limit(1).then((rows) => rows[0]);
  }

  async detail(id: string) {
    const run = await this.find(id);
    if (!run) return undefined;
    const [sessions, scores, events, baseline, audit] = await Promise.all([
      this.db.select().from(schema.petrosQualitySessions).where(eq(schema.petrosQualitySessions.runId, id)).orderBy(schema.petrosQualitySessions.topicKey, schema.petrosQualitySessions.personaId),
      this.db.select().from(schema.petrosQualityScores).where(eq(schema.petrosQualityScores.runId, id)),
      this.db.select().from(schema.petrosQualityEvents).where(eq(schema.petrosQualityEvents.runId, id)).orderBy(schema.petrosQualityEvents.occurredAt),
      this.db.select().from(schema.petrosQualityBaselines).where(eq(schema.petrosQualityBaselines.runId, id)).limit(1).then((rows) => rows[0] ?? null),
      this.db.select().from(schema.petrosQualityAudit).where(eq(schema.petrosQualityAudit.runId, id)).orderBy(desc(schema.petrosQualityAudit.createdAt)),
    ]);
    return { ...run, sessions, scores, events, baseline, audit };
  }

  async importReport(values: typeof schema.petrosQualityRuns.$inferInsert, sessions: Array<Record<string, unknown>>, actorId: string, reason: string) {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.insert(schema.petrosQualityRuns).values(values).onConflictDoNothing({ target: schema.petrosQualityRuns.externalRunId }).returning();
      if (!run) return undefined;
      for (const item of sessions) {
        const transcript = record(item.transcript);
        const [session] = await tx.insert(schema.petrosQualitySessions).values({
          runId: run.id,
          externalSessionId: textValue(transcript.id), caseId: textValue(transcript.caseId), topicKey: textValue(transcript.topicKey),
          topicTitle: textValue(transcript.topicTitle), subject: textValue(transcript.subject), personaId: textValue(transcript.personaId),
          goal: textValue(transcript.goal), seed: numberValue(transcript.seed), totalScoreBasisPoints: Math.round(numberValue(item.totalScore) * 100),
          status: array(item.blockingFailures).length ? 'failed' : array(item.warnings).length ? 'warning' : 'completed',
          blockingFailures: array(item.blockingFailures).map(String), warnings: array(item.warnings).map(String), transcript,
        }).returning();
        if (!session) continue;
        const moves = array(transcript.moves).map(record);
        const observations = array(transcript.observations).map(record);
        const usage = array(transcript.usage).map(record);
        const errors = array(transcript.errors).map(record);
        const events = [
          ...moves.map((payload) => ({ id: textValue(payload.id), type: 'move', moveType: textValue(payload.type) })),
          ...observations.map((payload) => ({ id: textValue(payload.id), type: 'observation', moveType: null })),
          ...usage.map((payload) => ({ id: textValue(payload.requestId), type: 'usage', moveType: null })),
          ...errors.map((_payload, index) => ({ id: `${textValue(transcript.id)}:error:${index}`, type: 'error', moveType: null })),
        ];
        if (events.length) await tx.insert(schema.petrosQualityEvents).values(events.map((event, index) => {
          const observationIndex = index - moves.length;
          const usageIndex = observationIndex - observations.length;
          const errorIndex = usageIndex - usage.length;
          const payload = event.type === 'move' ? moves[index] ?? {}
            : event.type === 'observation' ? observations[observationIndex] ?? {}
              : event.type === 'usage' ? usage[usageIndex] ?? {}
                : errors[errorIndex] ?? {};
          return { runId: run.id, sessionId: session.id, externalEventId: event.id || `${session.id}:${index}`, eventType: event.type, moveType: event.moveType, functionKey: event.type === 'usage' ? textValue(usage[usageIndex]?.functionKey) || null : null, payload };
        }));
        const scores = array(item.scores).map(record);
        if (scores.length) await tx.insert(schema.petrosQualityScores).values(scores.map((score) => ({ runId: run.id, sessionId: session.id, dimension: textValue(score.dimension), scoreBasisPoints: Math.round(numberValue(score.score) * 100), maxScoreBasisPoints: 500, evaluator: textValue(score.evaluator), uncertaintyBasisPoints: Math.round(numberValue(score.uncertainty) * 10_000), rationale: textValue(score.rationale), evidence: array(score.evidence).map(record), rubricVersion: values.rubricVersion })));
      }
      await tx.insert(schema.petrosQualityAudit).values({ runId: run.id, action: 'report_imported', actorRef: actorId, reason, metadata: { externalRunId: values.externalRunId, source: 'evaluation' } });
      return run;
    });
  }

  async promote(runId: string, actorId: string, reason: string) {
    return this.db.transaction(async (tx) => {
      await tx.update(schema.petrosQualityBaselines).set({ selected: false, retiredAt: new Date(), updatedAt: new Date() }).where(eq(schema.petrosQualityBaselines.selected, true));
      const [baseline] = await tx.insert(schema.petrosQualityBaselines).values({ runId, selected: true, reason, promotedBy: actorId }).onConflictDoUpdate({ target: schema.petrosQualityBaselines.runId, set: { selected: true, reason, promotedBy: actorId, promotedAt: new Date(), retiredAt: null, updatedAt: new Date() } }).returning();
      await tx.insert(schema.petrosQualityAudit).values({ runId, action: 'baseline_promoted', actorRef: actorId, reason, metadata: { confirmation: 'PROMOTE BASELINE' } });
      return baseline;
    });
  }

  audit(runId: string, action: string, actorId: string, reason: string, metadata: Record<string, unknown> = {}) {
    return this.db.insert(schema.petrosQualityAudit).values({ runId, action, actorRef: actorId, reason, metadata }).returning().then((rows) => rows[0]!);
  }
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function textValue(value: unknown): string { return typeof value === 'string' ? value : String(value ?? ''); }
function numberValue(value: unknown): number { const number = Number(value); return Number.isFinite(number) ? number : 0; }
