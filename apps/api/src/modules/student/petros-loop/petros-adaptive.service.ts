import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  compatibilityCanonicalJson, petrosAdaptiveBindCommandSchema, petrosAdaptiveSnapshotSchema,
  petrosAssessmentSchema, petrosKnowledgePolicySchema, petrosLearningTaskBindingSchema,
  proposePetrosAdaptiveMove, type PetrosAdaptivePolicyInput, type PetrosSessionState,
} from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { PetrosTeachingPackService } from '../knowledge/petros-teaching-pack.service';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import type { PetrosOwnerScope } from './petros-loop.repository';
import { adaptiveLegacyDecision, renderAdaptiveContent } from './petros-adaptive.renderer';

const hash = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });
const bindingSchema = z.object({
  schemaVersion: z.literal('petros.adaptive-session.v1'),
  initiatingUserId: z.string().uuid(),
  pack: z.object({ id: z.string().uuid(), version: z.number().int().positive() }).strict(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewId: z.string().uuid(), policy: petrosKnowledgePolicySchema,
}).strict();

/** Called within the existing short tenant request transaction; never calls a provider. */
@Injectable()
export class PetrosAdaptiveService {
  constructor(@Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService) {}

  private async row(scope: PetrosOwnerScope, sessionId: string) {
    const t = schema.petrosAdaptiveBindings;
    return (await this.db.select().from(t).where(and(eq(t.institutionId, scope.institutionId),
      eq(t.studentId, scope.studentId), eq(t.sessionId, sessionId))).limit(1))[0];
  }
  private async principal(scope: PetrosOwnerScope, userId: string) {
    const principal = await this.auth.resolveInstitutionalWorker(userId);
    if (principal.institutionId !== scope.institutionId || principal.studentId !== scope.studentId ||
      !principal.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(principal))
      throw new ForbiddenException();
    return principal;
  }
  private enabled() {
    if (!this.env.PETROS_ADAPTIVE_TEACHING_ENABLED) throw conflict('PETROS_ADAPTIVE_TEACHING_DISABLED');
  }

  async availability(principal: InstitutionalStudentPrincipal, sessionId: string) {
    await this.principal(principal, principal.institutionUserId);
    const t = schema.petrosLearningSessions;
    const session = (await this.db.select().from(t).where(and(eq(t.id,sessionId),
      eq(t.institutionId,principal.institutionId),eq(t.studentId,principal.studentId))).limit(1))[0];
    if (!session) throw new NotFoundException();
    if (!this.env.PETROS_ADAPTIVE_TEACHING_ENABLED || !this.env.PETROS_ASSESSMENT_CONTRACT_ENABLED)
      return {status:'disabled' as const};
    const current=await this.current(principal,sessionId,true);
    if (current) return {status:'bound' as const,pack:current.approved.candidate.pack,
      objective:{...current.approved.candidate.objective,statement:current.approved.candidate.objectiveStatement}};
    const started=await this.db.select({id:schema.petrosTeachingBlocks.id}).from(schema.petrosTeachingBlocks)
      .where(eq(schema.petrosTeachingBlocks.sessionId,sessionId)).limit(1);
    if (session.status!=='active' || session.sourceContext?.door!=='uploaded_document' || started.length)
      return {status:'legacy_unavailable' as const};
    const result=await this.packs.listApprovedPackSummaries(principal,sessionId);
    return result.status==='disabled' ? {status:'disabled' as const} : {status:'available' as const,packs:result.packs};
  }

  async bind(principal: InstitutionalStudentPrincipal, sessionId: string, raw: unknown) {
    this.enabled();
    if (!this.env.PETROS_ASSESSMENT_CONTRACT_ENABLED) throw conflict('PETROS_ADAPTIVE_ASSESSMENT_REQUIRED');
    const command = petrosAdaptiveBindCommandSchema.parse(raw);
    await this.principal(principal, principal.institutionUserId);
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${principal.institutionId}`},0))`);
    // Serialize competing binds without extending this lock across any provider call.
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-adaptive:${sessionId}`},0))`);
    const policy = await this.policies.documentKnowledgePolicy(principal, sessionId);
    const approved = await this.packs.requireApprovedPack(principal, sessionId,
      { packId: command.pack.id, packVersion: command.pack.version });
    const commandHash = hash(command);
    const prior = await this.row(principal, sessionId);
    if (prior) {
      if (prior.commandHash !== commandHash || prior.commandId !== command.commandId)
        throw conflict('PETROS_ADAPTIVE_SESSION_ALREADY_BOUND');
      await this.current(principal, sessionId);
      return { status: 'bound' as const, pack: command.pack, replayed: true };
    }
    // Serialize against the existing planning lease. A started legacy lesson cannot be rebound.
    const sessions=schema.petrosLearningSessions;
    await this.db.select({id:sessions.id}).from(sessions).where(and(eq(sessions.id,sessionId),
      eq(sessions.institutionId,principal.institutionId),eq(sessions.studentId,principal.studentId))).for('update');
    const started=await this.db.select({id:schema.petrosTeachingBlocks.id}).from(schema.petrosTeachingBlocks)
      .where(eq(schema.petrosTeachingBlocks.sessionId,sessionId)).limit(1);
    if (started.length) throw conflict('PETROS_ADAPTIVE_REQUIRES_NEW_SESSION');
    const binding = bindingSchema.parse({ schemaVersion: 'petros.adaptive-session.v1',
      initiatingUserId: principal.institutionUserId, pack: approved.candidate.pack,
      candidateHash: approved.payloadHash, reviewId: approved.reviewReceipt.receiptId, policy });
    await this.db.insert(schema.petrosAdaptiveBindings).values({ institutionId: principal.institutionId,
      studentId: principal.studentId, sessionId, commandId: command.commandId, commandHash, binding });
    await this.audit.logAudit({ actorType: ActorType.InstitutionUser, actorId: principal.institutionUserId,
      institutionId: principal.institutionId, module: 'petros', action: 'petros.adaptive.session_bound',
      entityType: 'petros_learning_session', entityId: sessionId, correlationId: command.commandId,
      newState: { pack: binding.pack, objective: approved.candidate.objective, sourceVersion: approved.candidate.sourceVersion,
        curriculumRevision: approved.candidate.curriculumRevision, reviewId: binding.reviewId } });
    return { status: 'bound' as const, pack: binding.pack, replayed: false };
  }

  async current(scope: PetrosOwnerScope, sessionId: string, allowInactive = false) {
    const row = await this.row(scope, sessionId);
    if (!row) return null; // Legacy sessions retain their existing behavior.
    this.enabled();
    const binding = bindingSchema.parse(row.binding);
    const principal = await this.principal(scope, binding.initiatingUserId);
    const policy = await this.policies.assertDocumentKnowledgePolicy(principal, sessionId, binding.policy);
    const packRef = { packId: binding.pack.id, packVersion: binding.pack.version };
    const approved = allowInactive
      ? await this.packs.requireApprovedPackForResume(principal, sessionId, packRef)
      : await this.packs.requireApprovedPack(principal, sessionId, packRef);
    if (binding.candidateHash !== approved.payloadHash || binding.reviewId !== approved.reviewReceipt.receiptId)
      throw conflict('PETROS_ADAPTIVE_APPROVAL_CHANGED');
    return { binding, principal, policy, approved };
  }

  async plan(scope: PetrosOwnerScope, state: PetrosSessionState) {
    const current = await this.current(scope, state.sessionId);
    if (!current) return null;
    const pack = current.approved.candidate;
    const observations = schema.petrosObservations;
    const evaluations = schema.petrosAnswerEvaluations;
    const questions = schema.petrosQuestionSpecs;
    const rows = await this.db.select({ assessment: evaluations.assessment, eventId: observations.id,
      confidence: observations.confidence, rawAnswer: observations.rawAnswer, learningTask: questions.learningTask })
      .from(evaluations).innerJoin(observations, eq(observations.id, evaluations.observationId))
      .innerJoin(questions, eq(questions.id, evaluations.questionId))
      .where(and(eq(evaluations.institutionId, scope.institutionId), eq(evaluations.studentId, scope.studentId),
        eq(evaluations.sessionId, state.sessionId), eq(observations.institutionId, scope.institutionId),
        eq(observations.studentId, scope.studentId), eq(questions.institutionId, scope.institutionId),
        eq(questions.studentId, scope.studentId)))
      .orderBy(desc(evaluations.createdAt)).limit(100);
    const relevant = rows.flatMap(row => {
      const task = petrosLearningTaskBindingSchema.safeParse(row.learningTask);
      const assessment = petrosAssessmentSchema.safeParse(row.assessment);
      if (!task.success || !assessment.success || task.data.pack.id !== pack.pack.id ||
        task.data.pack.version !== pack.pack.version || task.data.sourceVersion !== pack.sourceVersion ||
        assessment.data.conditions.policyVersion !== current.policy.authorityHash) return [];
      return [{ ...row, task: task.data, assessment: assessment.data }];
    });
    const prior = await this.db.select({ snapshot: schema.petrosPlanningDecisions.adaptiveSnapshot,
      type: schema.petrosTeachingBlocks.type, status: schema.petrosTeachingBlocks.status })
      .from(schema.petrosPlanningDecisions).innerJoin(schema.petrosTeachingBlocks,
        eq(schema.petrosTeachingBlocks.decisionId, schema.petrosPlanningDecisions.id))
      .where(and(eq(schema.petrosPlanningDecisions.sessionId, state.sessionId),
        eq(schema.petrosPlanningDecisions.institutionId, scope.institutionId),
        eq(schema.petrosPlanningDecisions.studentId, scope.studentId)));
    const explanationPresented = prior.some(row => row.snapshot && row.status === 'completed' &&
      ['layered_explanation', 'contrast_case', 'worked_example', 'diagram'].includes(row.type));
    let signal: PetrosAdaptivePolicyInput['signal'] = { kind: explanationPresented ? 'explanation_seen' : 'new_topic' };
    const latest = relevant[0];
    if (latest) {
      const assessment = latest.assessment;
      const result = assessment.result;
      const fact = <T>(items: Array<{basis:string;value:T}>) => items.filter(item => item.basis !== 'required');
      if (result.kind !== 'objective' || result.judgment.status !== 'evaluated' ||
        ['high', 'unknown'].includes(result.provenance.uncertainty))
        signal = { kind: 'ambiguous', evidenceEventId: latest.eventId };
      else if (fact(assessment.conditions.petrosAssistance).some(c => c.value.suppliedAnswer) ||
        fact(assessment.conditions.answerExposure).some(c => c.value === 'exposed'))
        signal = { kind: 'assisted_success', evidenceEventId: latest.eventId };
      else if (fact(assessment.conditions.petrosAssistance).some(c => c.value.hintCount > 0))
        signal = { kind: 'hint_exposed', evidenceEventId: latest.eventId };
      else if (result.judgment.outcome === 'correct' && latest.confidence !== 'sure')
        signal = { kind: 'correct_uncertain', evidenceEventId: latest.eventId };
      else if (result.judgment.outcome === 'wrong' && relevant.slice(0, 2).length === 2 &&
        relevant.slice(0, 2).every(row => row.assessment.result.kind === 'objective' &&
          row.assessment.result.judgment.status === 'evaluated' && row.assessment.result.judgment.outcome === 'wrong'))
        signal = { kind: 'repeated_confusion', evidenceEventIds: relevant.slice(0, 2).map(row => row.eventId) };
      else if (result.judgment.outcome === 'wrong' && latest.confidence === 'sure')
        signal = { kind: 'wrong_confident', evidenceEventId: latest.eventId };
      else signal = { kind: 'ambiguous', evidenceEventId: latest.eventId };
      const task = pack.assessments.find(item => item.id === latest.task.task.id && item.variant === latest.task.task.variant);
      const discriminator = task?.misconceptionDiscriminators.find(item => item.exactResponses.some(response =>
        response.trim().toLocaleLowerCase('en-US') === latest.rawAnswer?.trim().toLocaleLowerCase('en-US')));
      if (discriminator && result.kind === 'objective' && result.judgment.status === 'evaluated' &&
        result.judgment.outcome === 'wrong' && result.provenance.uncertainty === 'low')
        signal = { kind:'misconception', misconceptionId:discriminator.misconceptionId,
          diagnosis:'supported', evidenceEventIds:[latest.eventId] };
      // Only an active, eligible, correct unseen-task ledger event can support transfer.
      const e = schema.petrosObjectiveEvidenceEvents;
      const events = await this.db.select().from(e).where(and(eq(e.institutionId,scope.institutionId),
        eq(e.studentId,scope.studentId),eq(e.sessionId,state.sessionId),eq(e.packId,pack.pack.id),eq(e.packVersion,pack.pack.version)));
      const superseded = new Set(events.map(event => event.correctsEventId));
      const demonstrated = events.find(event => !superseded.has(event.id) && event.classification.projectionEligible &&
        event.evidence.task.unseenContext && event.evidence.policyVersion === current.policy.authorityHash &&
        event.evidence.assessment.result.kind === 'objective' && event.evidence.assessment.result.judgment.status === 'evaluated' &&
        event.evidence.assessment.result.judgment.outcome === 'correct');
      if (demonstrated) signal = {kind:'independent_transfer',evidenceEventId:demonstrated.id};
      // A completed intervention consumes this signal; it must not repeat indefinitely.
      const handled = prior.some(row => {
        const snapshot = petrosAdaptiveSnapshotSchema.safeParse(row.snapshot);
        return row.status === 'completed' && snapshot.success && hash(snapshot.data.input.signal) === hash(signal);
      });
      if (handled) signal = signal.kind === 'independent_transfer'
        ? {kind:'synthesis_seen'} : {kind:'explanation_seen'};
    }
    const selections = await this.db.select({snapshot:schema.petrosPlanningDecisions.adaptiveSnapshot})
      .from(schema.petrosPlanningDecisions).where(and(eq(schema.petrosPlanningDecisions.institutionId,scope.institutionId),
        eq(schema.petrosPlanningDecisions.studentId,scope.studentId)));
    // Stable task identity survives a pack revision; republishing cannot erase exposure.
    const usedTasks = new Set(selections.flatMap(row => {
      const snapshot = petrosAdaptiveSnapshotSchema.safeParse(row.snapshot);
      return snapshot.success && snapshot.data.output.pack.id===pack.pack.id && snapshot.data.output.selectedTask
        ? [`${snapshot.data.output.selectedTask.id}:${snapshot.data.output.selectedTask.variant}`] : [];
    }));
    const input: PetrosAdaptivePolicyInput = {
      schemaVersion: 'petros.adaptive-policy.v1', objective: pack.objective, pack: pack.pack,
      policyVersion: current.policy.authorityHash, sourceVersion: pack.sourceVersion,
      curriculumRevision: pack.curriculumRevision,
      assignmentVersions: current.policy.assignmentRestrictions.map(({ id, version }) => ({ id, version })),
      signal, availableTasks: pack.assessments.filter(task => !usedTasks.has(`${task.id}:${task.variant}`))
        .map(({ id, variant, unseenContext }) => ({ id, variant, unseenContext })),
      constraints: { sourceReady: true, sourceGrounding: pack.validation.unresolvedIssues.length ? 'uncertain' : 'supported',
        explanationPresented, remainingSeconds: state.time.remainingSeconds,
        diagramAvailable: true, assistance: 'ordinary_study' },
    };
    const snapshot = petrosAdaptiveSnapshotSchema.parse({ schemaVersion: 'petros.adaptive-snapshot.v1',
      candidateHash: current.approved.payloadHash, reviewId: current.binding.reviewId,
      policy: current.policy, input, output: proposePetrosAdaptiveMove(input) });
    return { snapshot, decision: adaptiveLegacyDecision(snapshot, state) };
  }

  async render(scope: PetrosOwnerScope, sessionId: string, raw: unknown) {
    const snapshot = petrosAdaptiveSnapshotSchema.parse(raw);
    const current = await this.current(scope, sessionId);
    if (!current) throw new NotFoundException();
    if (snapshot.candidateHash !== current.approved.payloadHash || snapshot.reviewId !== current.binding.reviewId ||
      hash(snapshot.policy) !== hash(current.policy) || hash(snapshot.output) !== hash(proposePetrosAdaptiveMove(snapshot.input)))
      throw conflict('PETROS_ADAPTIVE_DECISION_CHANGED');
    return { content: renderAdaptiveContent(current.approved.candidate, snapshot),
      candidate: current.approved.candidate, snapshot };
  }

  async evaluate(scope: PetrosOwnerScope, sessionId: string, bindingRaw: unknown, answer: string) {
    const binding = petrosLearningTaskBindingSchema.parse(bindingRaw);
    const current = await this.current(scope, sessionId);
    if (!current || hash(current.approved.candidate.pack) !== hash(binding.pack) ||
      hash(current.approved.candidate.objective) !== hash(binding.objective) ||
      current.approved.candidate.sourceVersion !== binding.sourceVersion)
      throw conflict('PETROS_ADAPTIVE_TASK_CHANGED');
    const task = current.approved.candidate.assessments.find(item => item.id === binding.task.id && item.variant === binding.task.variant);
    const evaluator = task?.evaluator;
    if (!evaluator) return null;
    let correct = false;
    if (evaluator.kind === 'exact_text') {
      const normalize = (text: string) => evaluator.caseSensitive ? text.trim() : text.trim().toLocaleLowerCase('en-US');
      correct = [evaluator.answerKey, ...evaluator.aliases].some(key => normalize(key) === normalize(answer));
    } else {
      // Full-string parse; never strip an unsupported unit or execute an expression.
      const parsed = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)\s*$/.exec(answer);
      if (parsed) {
        const value = Number(parsed[1]);
        const unit = parsed[2]!;
        const unitAllowed = unit ? evaluator.acceptedUnits.includes(unit) : !evaluator.requireUnits;
        correct = Number.isFinite(value) && unitAllowed && Math.abs(value - evaluator.value) <= evaluator.tolerance;
      }
    }
    return {
      schemaVersion: 'petros.answer-evaluation.v1' as const,
      correctness: correct ? 'correct' as const : 'incorrect' as const,
      credit: correct ? 1 : 0,
      evidence: ['The response was compared with this task’s qualified-reviewed answer contract.'],
      errorClass: correct ? 'none' as const : 'unknown' as const,
      misconception: null,
      feedback: correct ? 'Your response matches the reviewed answer contract.' : 'Your response differs from the reviewed answer contract. This alone does not establish why.',
      safeNextHint: null,
    };
  }
}
