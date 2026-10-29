import { and, eq, schema, type Database } from '@edrion/database';
import type { TeachingManifest } from '@edrion/schemas';
import type { M4Publication } from '../student/petros-v2/petros-v2-contracts.server';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import {
  BELIEF_ALGORITHM,
  reduceConceptBelief,
  type BeliefEvent,
} from './petros-concept-belief.engine';

/** Reads the existing evidence ledger, not a second history. Caller holds current authority and owner scope. */
export class PetrosConceptBeliefRepository {
  constructor(private readonly db: Database) {}
  async rebuild(
    p: InstitutionalStudentPrincipal,
    pub: M4Publication,
    manifest: TeachingManifest,
    publicationHash: string,
    currentAuthority: boolean,
  ) {
    const t = schema.petrosObjectiveEvidenceEvents;
    const rows = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.institutionId, p.institutionId),
          eq(t.studentId, p.studentId),
          eq(t.objectiveId, pub.lesson.objective.id),
          eq(t.engineVersion, 'v2'),
        ),
      )
      .orderBy(t.occurredAt);
    const observations: BeliefEvent[] = [];
    for (const row of rows) {
      const e = row.evidence as unknown as {
        responseId: string;
        publicationHash: string;
        criteria: Array<{ criterionId: string; status: string; eligible: boolean }>;
        exposure: { assisted: boolean; repeated: boolean };
      };
      const [response] = await this.db
        .select()
        .from(schema.petrosV2Responses)
        .where(
          and(
            eq(schema.petrosV2Responses.id, e.responseId),
            eq(schema.petrosV2Responses.studentId, p.studentId),
          ),
        );
      if (!response) continue;
      const [task] = await this.db
        .select()
        .from(schema.petrosV2Tasks)
        .where(eq(schema.petrosV2Tasks.id, response.taskId));
      if (!task) continue;
      for (const c of e.criteria) {
        const mapping = manifest.criteria.find((m) => m.id === c.criterionId);
        if (!mapping) continue;
        observations.push({
          id: row.id,
          corrects: row.correctsEventId,
          criterionId: c.criterionId,
          status: c.status,
          eligible: c.eligible,
          family: task.equivalenceKey,
          role: mapping.role,
          category: mapping.category,
          distinguishes: mapping.distinguishes,
          occurredAt: row.occurredAt.toISOString(),
          evaluationValid: currentAuthority && e.publicationHash === publicationHash,
          assisted: e.exposure.assisted,
          repeated: e.exposure.repeated,
          retentionCheck: false,
        });
      }
    }
    const projections = [];
    for (const conceptId of new Set(manifest.criteria.map((c) => c.conceptId))) {
      const criteria = manifest.criteria.filter((c) => c.conceptId === conceptId).map((c) => c.id);
      const result = reduceConceptBelief(
        observations.filter((e) => criteria.includes(e.criterionId)),
        criteria,
        new Date().toISOString(),
        manifest.graphVersion,
      );
      const values = {
        institutionId: p.institutionId,
        studentId: p.studentId,
        objectiveId: pub.lesson.objective.id,
        conceptId,
        conceptVersion: manifest.criteria.find((c) => c.conceptId === conceptId)!.conceptVersion,
        graphVersion: manifest.graphVersion,
        algorithmVersion: BELIEF_ALGORITHM,
        publicationHash,
        projection: result,
        projectionHash: result.hash,
        updatedAt: new Date(),
      };
      await this.db
        .insert(schema.petrosConceptBeliefs)
        .values(values)
        .onConflictDoUpdate({
          target: [
            schema.petrosConceptBeliefs.institutionId,
            schema.petrosConceptBeliefs.studentId,
            schema.petrosConceptBeliefs.objectiveId,
            schema.petrosConceptBeliefs.conceptId,
            schema.petrosConceptBeliefs.conceptVersion,
            schema.petrosConceptBeliefs.graphVersion,
            schema.petrosConceptBeliefs.algorithmVersion,
          ],
          set: {
            projection: result,
            projectionHash: result.hash,
            publicationHash,
            updatedAt: new Date(),
          },
        });
      projections.push(result);
    }
    return projections;
  }
}
