import { publicPetrosSessionColumns } from '../../common/petros-session-projection';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, lt, schema, sql, type Database } from '@edrion/database';
import type {
  PetrosObjectiveEvidence,
  PetrosObjectiveEvidenceClassification,
  PetrosObjectiveEvidenceProjection,
  PetrosObjectiveEvidenceReceipt,
} from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

export interface ObjectiveEvidenceScope { institutionId: string; studentId: string }

@Injectable()
export class PetrosObjectiveEvidenceRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  lock(key: string) {
    return this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  assignmentBindings(scope: ObjectiveEvidenceScope, sessionId: string) {
    const t = schema.petrosAssignmentLearningRecipients;
    return this.db.select().from(t).where(and(eq(t.institutionId,scope.institutionId),
      eq(t.studentId,scope.studentId),eq(t.sessionId,sessionId))).limit(2);
  }

  previousTaskExposure(scope:ObjectiveEvidenceScope,question:typeof schema.petrosQuestionSpecs.$inferSelect) {
    const q=schema.petrosQuestionSpecs;
    // Rendering persists the question, so even a seen-but-unanswered item is retained.
    // Pack revisions do not reset the stable task identity or its exposure history.
    return this.db.select({id:q.id}).from(q).where(and(eq(q.institutionId,scope.institutionId),eq(q.studentId,scope.studentId),
      sql`${q.id} <> ${question.id}`,lt(q.createdAt,question.createdAt),sql`${q.learningTask}->'pack'->>'id' = ${JSON.stringify(question.learningTask?.pack)}::jsonb->>'id'`,
      sql`${q.learningTask}->'task' = ${JSON.stringify(question.learningTask?.task)}::jsonb`)).limit(1);
  }

  canonicalAnswer(scope: ObjectiveEvidenceScope, evaluationId: string) {
    return this.db.select({
      evaluation: schema.petrosAnswerEvaluations,
      observation: schema.petrosObservations,
      question: schema.petrosQuestionSpecs,
      session: publicPetrosSessionColumns,
    }).from(schema.petrosAnswerEvaluations)
      .innerJoin(schema.petrosObservations, eq(schema.petrosObservations.id, schema.petrosAnswerEvaluations.observationId))
      .innerJoin(schema.petrosQuestionSpecs, eq(schema.petrosQuestionSpecs.id, schema.petrosAnswerEvaluations.questionId))
      .innerJoin(schema.petrosLearningSessions, eq(schema.petrosLearningSessions.id, schema.petrosAnswerEvaluations.sessionId))
      .where(and(
        eq(schema.petrosAnswerEvaluations.id, evaluationId),
        eq(schema.petrosAnswerEvaluations.institutionId, scope.institutionId),
        eq(schema.petrosAnswerEvaluations.studentId, scope.studentId),
        eq(schema.petrosObservations.institutionId, scope.institutionId),
        eq(schema.petrosObservations.studentId, scope.studentId),
        eq(schema.petrosQuestionSpecs.institutionId, scope.institutionId),
        eq(schema.petrosQuestionSpecs.studentId, scope.studentId),
      )).limit(1).then((rows) => rows[0] ?? null);
  }

  command(scope: ObjectiveEvidenceScope, commandId: string) {
    return this.db.select().from(schema.petrosObjectiveEvidenceCommands).where(and(
      eq(schema.petrosObjectiveEvidenceCommands.commandId, commandId),
      eq(schema.petrosObjectiveEvidenceCommands.institutionId, scope.institutionId),
      eq(schema.petrosObjectiveEvidenceCommands.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  event(scope: ObjectiveEvidenceScope, eventId: string) {
    return this.db.select().from(schema.petrosObjectiveEvidenceEvents).where(and(
      eq(schema.petrosObjectiveEvidenceEvents.id, eventId),
      eq(schema.petrosObjectiveEvidenceEvents.institutionId, scope.institutionId),
      eq(schema.petrosObjectiveEvidenceEvents.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  eventForEvaluation(scope: ObjectiveEvidenceScope, evaluationId: string) {
    return this.db.select().from(schema.petrosObjectiveEvidenceEvents).where(and(
      eq(schema.petrosObjectiveEvidenceEvents.evaluationId, evaluationId),
      eq(schema.petrosObjectiveEvidenceEvents.institutionId, scope.institutionId),
      eq(schema.petrosObjectiveEvidenceEvents.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0] ?? null);
  }

  list(scope: ObjectiveEvidenceScope, input: {
    sessionId?: string;
    objectiveId: string;
    objectiveVersion: number;
    packId?: string;
    packVersion?: number;
  }) {
    const clauses = [
      eq(schema.petrosObjectiveEvidenceEvents.engineVersion, 'v1'),
      eq(schema.petrosObjectiveEvidenceEvents.institutionId, scope.institutionId),
      eq(schema.petrosObjectiveEvidenceEvents.studentId, scope.studentId),
      eq(schema.petrosObjectiveEvidenceEvents.objectiveId, input.objectiveId),
      eq(schema.petrosObjectiveEvidenceEvents.objectiveVersion, input.objectiveVersion),
    ];
    if (input.sessionId) clauses.push(eq(schema.petrosObjectiveEvidenceEvents.sessionId, input.sessionId));
    if (input.packId) clauses.push(eq(schema.petrosObjectiveEvidenceEvents.packId, input.packId));
    if (input.packVersion !== undefined) clauses.push(eq(schema.petrosObjectiveEvidenceEvents.packVersion, input.packVersion));
    return this.db.select().from(schema.petrosObjectiveEvidenceEvents)
      .where(and(...clauses)).orderBy(asc(schema.petrosObjectiveEvidenceEvents.occurredAt), asc(schema.petrosObjectiveEvidenceEvents.id));
  }

  async append(input: {
    scope: ObjectiveEvidenceScope;
    evaluationId: string;
    requestHash: string;
    evidence: PetrosObjectiveEvidence;
    classification: PetrosObjectiveEvidenceClassification;
    correction: { correctsEventId: string; reason: string } | null;
    receipt: PetrosObjectiveEvidenceReceipt;
  }) {
    const { scope, evidence, classification, correction } = input;
    await this.db.insert(schema.petrosObjectiveEvidenceCommands).values({
      commandId: evidence.commandId,
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      sessionId: evidence.sessionId,
      evaluationId: input.evaluationId,
      requestHash: input.requestHash,
      eventId: evidence.eventId,
      response: input.receipt,
    });
    await this.db.insert(schema.petrosObjectiveEvidenceEvents).values({
      id: evidence.eventId,
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      sessionId: evidence.sessionId,
      commandId: evidence.commandId,
      evaluationId: input.evaluationId,
      objectiveId: evidence.objective.id,
      objectiveVersion: evidence.objective.version,
      packId: evidence.pack.id,
      packVersion: evidence.pack.version,
      correctsEventId: correction?.correctsEventId ?? null,
      correctionReason: correction?.reason ?? null,
      evidence,
      classification,
      occurredAt: new Date(evidence.occurredAt),
    });
    await this.db.insert(schema.petrosObjectiveEvidenceOutbox).values({
      id: randomUUID(),
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      eventId: evidence.eventId,
      topic: 'petros.objective-evidence.appended.v1',
      payload: {
        eventId: evidence.eventId,
        sessionId: evidence.sessionId,
        objective: evidence.objective,
        pack: evidence.pack,
        correctionOf: correction?.correctsEventId ?? null,
      },
    });
  }

  upsertProjection(projection: PetrosObjectiveEvidenceProjection, projectionHash: string) {
    return this.db.insert(schema.petrosObjectiveEvidenceProjections).values({
      institutionId: projection.institutionId,
      studentId: projection.studentId,
      objectiveId: projection.objective.id,
      objectiveVersion: projection.objective.version,
      projection,
      projectionHash,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [
        schema.petrosObjectiveEvidenceProjections.institutionId,
        schema.petrosObjectiveEvidenceProjections.studentId,
        schema.petrosObjectiveEvidenceProjections.objectiveId,
        schema.petrosObjectiveEvidenceProjections.objectiveVersion,
      ],
      set: { projection, projectionHash, updatedAt: new Date() },
    });
  }

  pendingOutbox(scope: ObjectiveEvidenceScope, limit: number) {
    return this.db.select().from(schema.petrosObjectiveEvidenceOutbox).where(and(
      eq(schema.petrosObjectiveEvidenceOutbox.institutionId, scope.institutionId),
      eq(schema.petrosObjectiveEvidenceOutbox.studentId, scope.studentId),
      eq(schema.petrosObjectiveEvidenceOutbox.status, 'pending'),
      eq(schema.petrosObjectiveEvidenceOutbox.topic, 'petros.objective-evidence.appended.v1'),
    )).orderBy(asc(schema.petrosObjectiveEvidenceOutbox.availableAt))
      .limit(limit).for('update', { skipLocked: true });
  }

  markOutboxProcessed(id: string) {
    return this.db.update(schema.petrosObjectiveEvidenceOutbox).set({
      status: 'processed', processedAt: new Date(),
      attempts: sql`${schema.petrosObjectiveEvidenceOutbox.attempts} + 1`,
    }).where(eq(schema.petrosObjectiveEvidenceOutbox.id, id));
  }
}
