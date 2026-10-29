/** Existing V1 owners for an isolated saved-session regression and browser demonstration. */
import { randomUUID } from 'node:crypto';
import { schema } from '@edrion/database';
import { PETROS_RENDER_SCHEMA_VERSION, PETROS_SESSION_STATE_VERSION } from '@edrion/schemas';
import { KnowledgeDocumentService } from '../knowledge/knowledge-document.service';
import { StudentMaterialsService } from '../materials/student-materials.service';
import { PetrosLoopRepository } from '../petros-loop/petros-loop.repository';
import { PetrosLoopService } from '../petros-loop/petros-loop.service';
import { stage4ProfileFixture } from '../petros-loop/petros-stage4.fixture';
import { PetrosLearnerModelService } from '../../petros-learner-model/petros-learner-model.service';
import { PetrosLearnerModelRepository } from '../../petros-learner-model/petros-learner-model.repository';
import type { M4Fixture } from './petros-v2.fixture';
export function m4V1Owners(f: M4Fixture) {
  const db = f.f.f.db,
    audit = f.f.f.auditWriter;
  const documents = new KnowledgeDocumentService(db, new StudentMaterialsService(db), f.env);
  const loop = new PetrosLoopService(
    new PetrosLoopRepository(db, documents),
    {
      execute: async () => {
        throw new Error('No inference authorized in isolated V1 regression');
      },
    } as never,
    null as never,
    new PetrosLearnerModelService(new PetrosLearnerModelRepository(db), audit),
    audit,
    undefined,
    { ...f.env, PETROS_ADAPTIVE_TEACHING_ENABLED: false },
  );
  async function seed() {
    const sessionId = randomUUID(),
      decisionId = randomUUID(),
      blockId = randomUUID(),
      scope = { institutionId: f.student.institutionId, studentId: f.student.studentId };
    const title = 'Saved V1 learning session';
    await f.f.admin
      .insert(schema.petrosLearningSessions)
      .values({
        ...scope,
        id: sessionId,
        clientRequestId: randomUUID(),
        stateVersion: PETROS_SESSION_STATE_VERSION,
        sessionType: 'learn',
        status: 'paused',
        topic: title,
        currentGoal: 'Return to an existing V1 lesson and preserve its saved work.',
        timeBudgetSeconds: 1200,
        maxMoves: 1,
        checkpoints: [{ id: 'source', label: 'Read the saved idea', status: 'current' }],
        currentCheckpointId: 'source',
        resolvedTopicProfile: stage4ProfileFixture(title, scope.institutionId),
        promptVersion: 'v1.saved-fixture',
        outputSchemaVersion: PETROS_RENDER_SCHEMA_VERSION,
      });
    await f.f.admin
      .insert(schema.petrosPlanningDecisions)
      .values({
        ...scope,
        id: decisionId,
        sessionId,
        sequence: 1,
        status: 'rendered',
        selectedMoveType: 'layered_explanation',
        targetConcept: title,
        studentSafeReason: 'Resume the original V1 learning session.',
        decisionFactors: [],
        moveParameters: {},
        expectedEvidence: 'No grade for viewing.',
        progressEffect: {},
        termination: {},
        guessFirst: {},
        observationResponse: {},
        source: 'deterministic_fallback',
        functionKey: 'v1.fixture',
        promptVersion: 'v1.fixture',
        schemaVersion: 'v1.fixture',
        correlationId: randomUUID(),
      });
    await f.f.admin
      .insert(schema.petrosTeachingBlocks)
      .values({
        ...scope,
        id: blockId,
        sessionId,
        decisionId,
        sequence: 1,
        type: 'layered_explanation',
        content: {
          schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
          type: 'layered_explanation',
          title: 'Your original lesson is still here',
          firstLayer:
            'This saved V1 session uses its original learning and assessment owners. Pausing or resuming keeps the same session and content.',
          deeperLayers: [],
          keyIdea: 'A saved lesson can be paused and resumed.',
          sourceGrounding: [{ label: 'Synthetic V1 compatibility fixture' }],
        },
        delivery: 'deterministic_fallback',
        functionKey: 'v1.fixture',
        promptVersion: 'v1.fixture',
        schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
        correlationId: randomUUID(),
      });
    return sessionId;
  }
  return { loop, seed };
}
