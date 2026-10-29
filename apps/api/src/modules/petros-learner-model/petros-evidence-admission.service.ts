import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, sql, type Database } from '@edrion/database';
import { randomUUID } from 'node:crypto';
import { m4EvaluationSchema } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { PetrosConceptBeliefRepository } from './petros-concept-belief.repository';
import {
  m4Hash,
  m4EvaluationMatchesManifest,
  m4PublicationSchema,
  type M4Publication,
} from '../student/petros-v2/petros-v2-contracts.server';
import type { InstitutionalStudentPrincipal } from '../student/student.types';

/** Admission into the existing objective-evidence owner. No belief store, grade or mastery writes.
 * Caller holds the session lock and current publication/source authority in the same transaction.
 */
@Injectable()
export class PetrosEvidenceAdmissionService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async admit(
    p: InstitutionalStudentPrincipal,
    sessionId: string,
    publication: M4Publication,
    evaluationId: string,
    correctsEventId: string | null = null,
  ) {
    const [e] = await this.db
      .select()
      .from(schema.petrosV2Evaluations)
      .where(
        and(
          eq(schema.petrosV2Evaluations.id, evaluationId),
          eq(schema.petrosV2Evaluations.sessionId, sessionId),
          eq(schema.petrosV2Evaluations.studentId, p.studentId),
          eq(schema.petrosV2Evaluations.institutionId, p.institutionId),
        ),
      );
    if (!e) throw new Error('M4_CANONICAL_EVALUATION_REQUIRED');
    const evaluation = m4EvaluationSchema.parse(e.result);
    const [response] = await this.db
      .select()
      .from(schema.petrosV2Responses)
      .where(eq(schema.petrosV2Responses.id, e.responseId));
    if (!response || response.responseHash !== m4Hash(response.response))
      throw new Error('M4_CANONICAL_RESPONSE_REQUIRED');
    const [session] = await this.db
      .select({ state: schema.petrosLearningSessions.v2State })
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, p.institutionId),
          eq(schema.petrosLearningSessions.studentId, p.studentId),
          eq(schema.petrosLearningSessions.engineVersion, 'v2'),
        ),
      );
    const publicationId = String(session?.state?.publicationId ?? '');
    const current = publicationId
      ? await this.db.execute<{ content: unknown; content_hash: string }>(
          sql`select content,content_hash from m4_publication(${publicationId}::uuid)`,
        )
      : [];
    let authority = false;
    if (
      current[0] &&
      current[0].content_hash === e.publicationHash &&
      m4Hash(publication) === e.publicationHash
    ) {
      const canonical = m4PublicationSchema.parse(current[0].content);
      const [source] = await this.db.execute<{ live: boolean }>(
        sql`select edrion_petros_v2_source_live(${p.institutionId}::uuid,${JSON.stringify(canonical.binding)}::jsonb,${canonical.sourceHash},false) as live`,
      );
      authority = source?.live === true;
    }
    const assisted = response.exposure.assisted,
      repeated = response.exposure.repeated;
    let mapped = false;
    if (authority && ['evaluated', 'review_required'].includes(evaluation.status)) {
      const [task] = await this.db
        .select()
        .from(schema.petrosV2Tasks)
        .where(eq(schema.petrosV2Tasks.id, response.taskId));
      const [manifest] = await this.db.execute<{ manifest: unknown }>(
        sql`select m4_criterion_manifest(${publicationId}::uuid,${task!.candidateId}::uuid) as manifest`,
      );
      mapped =
        task?.contractHash === e.contractHash &&
        m4EvaluationMatchesManifest(evaluation, manifest?.manifest);
    }
    const independent =
      authority &&
      mapped &&
      !assisted &&
      !repeated &&
      evaluation.status !== 'invalidated' &&
      evaluation.status !== 'unavailable';
    const criteria = evaluation.criteria.map((c) => ({
      ...c,
      eligible: independent && c.status === 'satisfied' && c.origin === 'trusted_kernel',
    }));
    const classification = {
      schemaVersion: 'petros.v2.criterion-admission.v1',
      observation:
        evaluation.status === 'invalidated'
          ? 'unsupported_unverified'
          : repeated
            ? 'equivalent_repeat'
            : assisted
              ? 'assisted_practice'
              : criteria.some((c) => c.eligible)
                ? 'unassisted_criterion_observation'
                : 'formative_observation',
      projectionEligible: criteria.some((c) => c.eligible),
      mastery: false,
      retention: false,
      externalHelp: 'unknown',
    };
    const eventId = randomUUID(),
      commandId = e.id;
    const evidence = {
      schemaVersion: 'petros.v2.criterion-evidence.v1',
      eventId,
      sessionId,
      responseId: response.id,
      responseHash: response.responseHash,
      evaluationId: e.id,
      objective: publication.lesson.objective,
      sourceRevisionId: publication.sourceRevisionId,
      sourceHash: publication.sourceHash,
      publicationHash: e.publicationHash,
      contractHash: e.contractHash,
      criteria,
      exposure: response.exposure,
    };
    const scope = { institutionId: p.institutionId, studentId: p.studentId };
    const existing = await this.db
      .select({ id: schema.petrosObjectiveEvidenceCommands.id })
      .from(schema.petrosObjectiveEvidenceCommands)
      .where(
        and(
          eq(schema.petrosObjectiveEvidenceCommands.institutionId, p.institutionId),
          eq(schema.petrosObjectiveEvidenceCommands.studentId, p.studentId),
          eq(schema.petrosObjectiveEvidenceCommands.commandId, commandId),
        ),
      );
    if (existing.length) return;
    await this.db.insert(schema.petrosObjectiveEvidenceCommands).values({
      ...scope,
      commandId,
      sessionId,
      evaluationId: null,
      v2EvaluationId: e.id,
      requestHash: m4Hash(evidence),
      eventId,
      response: { eventId, classification },
    });
    await this.db.insert(schema.petrosObjectiveEvidenceEvents).values({
      ...scope,
      id: eventId,
      sessionId,
      commandId,
      evaluationId: null,
      v2EvaluationId: e.id,
      engineVersion: 'v2',
      objectiveId: publication.lesson.objective.id,
      objectiveVersion: publication.lesson.objective.version,
      packId: publication.proposalId,
      packVersion: publication.proposalVersion,
      correctsEventId,
      correctionReason: correctsEventId ? 'Current authority or assessment invalidated.' : null,
      evidence: evidence as never,
      classification: classification as never,
      occurredAt: new Date(),
    });
    await this.db.insert(schema.petrosObjectiveEvidenceOutbox).values({
      ...scope,
      id: randomUUID(),
      eventId,
      topic: 'petros.v2.criterion-evidence.appended.v1',
      payload: { eventId, sessionId },
    });
    const teaching = publication.instruments.find((i) => i.hash === e.contractHash)?.teaching;
    if (teaching)
      await new PetrosConceptBeliefRepository(this.db).rebuild(
        p,
        publication,
        teaching,
        e.publicationHash,
        authority,
      );
  }
  async current(p: InstitutionalStudentPrincipal, sessionId: string) {
    const t = schema.petrosObjectiveEvidenceEvents;
    const rows = await this.db
      .select({ id: t.id, correctsEventId: t.correctsEventId, evidence: t.evidence })
      .from(t)
      .where(
        and(
          eq(t.institutionId, p.institutionId),
          eq(t.studentId, p.studentId),
          eq(t.sessionId, sessionId),
          eq(t.engineVersion, 'v2'),
        ),
      );
    const superseded = new Set(rows.map((r) => r.correctsEventId));
    // JSON is a bounded typed V2 branch in this existing ledger. V1 readers filter engine_version.
    const criteria = new Set<string>();
    for (const r of rows.filter((r) => !superseded.has(r.id))) {
      const evidence = r.evidence as unknown as {
        criteria: Array<{ criterionId: string; eligible: boolean }>;
      };
      for (const c of evidence.criteria) if (c.eligible) criteria.add(c.criterionId);
    }
    return criteria.size;
  }
  async latestEvent(p: InstitutionalStudentPrincipal, sessionId: string) {
    const t = schema.petrosObjectiveEvidenceEvents;
    return (
      (
        await this.db
          .select({ id: t.id })
          .from(t)
          .where(
            and(
              eq(t.institutionId, p.institutionId),
              eq(t.studentId, p.studentId),
              eq(t.sessionId, sessionId),
              eq(t.engineVersion, 'v2'),
            ),
          )
          .orderBy(sql`${t.createdAt} desc`)
          .limit(1)
      )[0]?.id ?? null
    );
  }
}
