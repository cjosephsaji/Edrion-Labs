import { randomUUID } from 'node:crypto';
import { eq, schema } from '@edrion/database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import type { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import type { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { objectiveAssessment } from '../student/petros-loop/petros-assessment.adapter';
export function phase4EvidenceAttempt(f:Awaited<ReturnType<typeof phase2AuthorityFixture>>,adaptive:PetrosAdaptiveService,objectiveEvidence:PetrosObjectiveEvidenceService,currentPolicy:{authorityHash:string}){
  const binding={schemaVersion:'petros.learning-task-binding.v1' as const,pack:f.candidate.pack,objective:f.candidate.objective,sourceVersion:f.candidate.sourceVersion,rubric:{id:f.candidate.rubric.id,version:f.candidate.rubric.version}};
  const appendAttempt = async (answer: string, sessionId = f.sessionId, taskIndex = 1) => {
      const task = f.candidate.assessments[taskIndex]!;
      const taskBinding = { ...binding, task: { id: task.id, variant: task.variant } };
      const decisionId = randomUUID();
      const blockId = randomUUID();
      const questionId = randomUUID();
      const observationId = randomUUID();
      const evaluationId = randomUUID();
      const sequence = (await f.admin.select().from(schema.petrosPlanningDecisions)
        .where(eq(schema.petrosPlanningDecisions.sessionId, sessionId))).length + 1;
      await f.admin.insert(schema.petrosPlanningDecisions).values({ institutionId: f.institutionId, studentId: f.student.studentId,
        sessionId, id: decisionId, sequence, selectedMoveType: 'recall_check', targetConcept: f.candidate.objective.id,
        studentSafeReason: 'Synthetic reviewed application', decisionFactors: [], moveParameters: {}, expectedEvidence: 'unseen_transfer',
        progressEffect: {}, termination: {}, guessFirst: {}, observationResponse: {}, source: 'deterministic_fallback',
        functionKey: 'synthetic', promptVersion: 'synthetic', schemaVersion: 'synthetic', correlationId: randomUUID() });
      await f.admin.insert(schema.petrosTeachingBlocks).values({ institutionId: f.institutionId, studentId: f.student.studentId,
        sessionId, id: blockId, decisionId, sequence, type: 'recall_check', content: {}, delivery: 'deterministic_fallback',
        functionKey: 'synthetic', promptVersion: 'synthetic', schemaVersion: 'synthetic', correlationId: randomUUID() });
      await f.admin.insert(schema.petrosQuestionSpecs).values({ institutionId: f.institutionId, studentId: f.student.studentId,
        sessionId, id: questionId, blockId, rootQuestionId: questionId, targetId: 'reviewed-task',
        equivalenceKey: `${f.candidate.pack.id}:${task.id}:${sequence}`, learningTask: taskBinding, prompt: task.prompt,
        responseType: 'short_answer', purpose: 'recall', evaluationMode: 'deterministic', hint: 'Read the source',
        missingStep: 'Check units', workedSolution: 'Not supplied', rewordedPrompt: task.prompt });
      const evaluation = await f.owned(() => adaptive.evaluate(f.student, sessionId, taskBinding, answer));
      const assessment = objectiveAssessment({ evaluation: evaluation!, evaluator: 'deterministic',
        evaluatorVersion: f.candidate.compilerVersion, collectedAt: new Date().toISOString(), responseType: 'short_answer', prior: [] });
      assessment.conditions.policyVersion = currentPolicy.authorityHash;
      await f.admin.insert(schema.petrosObservations).values({ institutionId: f.institutionId, studentId: f.student.studentId,
        sessionId, id: observationId, decisionId, blockId, questionId, type: 'answer_submitted', rawAnswer: answer,
        confidence: 'sure', schemaVersion: 'petros.observation.v1', occurredAt: new Date(), correlationId: randomUUID() });
      await f.admin.insert(schema.petrosAnswerEvaluations).values({ institutionId: f.institutionId, studentId: f.student.studentId,
        sessionId, id: evaluationId, observationId, questionId, assessment,
        correctness: evaluation?.correctness ?? 'incorrect', creditBasisPoints: evaluation?.correctness === 'correct' ? 10_000 : 0,
        evidence: ['Synthetic controlled answer contract'], errorClass: evaluation?.errorClass ?? 'unknown',
        feedback: 'Synthetic controlled evaluation', evaluator: 'deterministic', promptVersion: 'synthetic',
        schemaVersion: 'petros.answer-evaluation.v1', correlationId: randomUUID() });
      const result = await objectiveEvidence.append(f.student, sessionId, { schemaVersion: 'petros.objective-evidence.v1',
        commandId: randomUUID(), evaluationId, pack: f.candidate.pack,
        task: taskBinding.task, correction: null });
      return result;
    };
return appendAttempt;
}
