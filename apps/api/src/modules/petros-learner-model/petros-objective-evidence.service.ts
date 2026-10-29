import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import { runInStudentTenant, sql, type Database } from '@edrion/database';
import {
  classifyPetrosObjectiveEvidence,
  compatibilityCanonicalJson,
  petrosAssessmentSchema,
  petrosLearningTaskBindingSchema,
  petrosObjectiveEvidenceAppendCommandSchema,
  petrosObjectiveEvidenceProjectionSchema,
  petrosObjectiveEvidenceReceiptSchema,
  petrosObjectiveEvidenceSchema,
  type PetrosObjectiveEvidenceAppendCommand,
  type PetrosObjectiveEvidenceProjection,
} from '@edrion/schemas';
import { ActorType } from '@edrion/shared-types';
import { createHash, randomUUID } from 'node:crypto';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { SurfacesService } from '../student/surfaces/surfaces.service';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import {
  PetrosObjectiveEvidenceRepository,
  type ObjectiveEvidenceScope,
} from './petros-objective-evidence.repository';

const digest = (value: unknown) => createHash('sha256')
  .update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });

type EvidenceRow = Awaited<ReturnType<PetrosObjectiveEvidenceRepository['list']>>[number];

/** Corrections supersede one prior event; the correction remains part of the active sequence. */
export function activeObjectiveEvidence(rows: EvidenceRow[]) {
  const superseded = new Set(rows.map((row) => row.correctsEventId).filter((id): id is string => Boolean(id)));
  return rows.filter((row) => !superseded.has(row.id)).sort((left, right) =>
    left.occurredAt.getTime() - right.occurredAt.getTime() || left.id.localeCompare(right.id));
}

export function buildObjectiveEvidenceProjection(
  scope: ObjectiveEvidenceScope,
  objective: { id: string; version: number },
  rows: EvidenceRow[],
): PetrosObjectiveEvidenceProjection {
  const active = activeObjectiveEvidence(rows);
  const identities = active.map((row) => ({
    eventId: row.id,
    responseIdentityHash: row.evidence.response.identityHash,
    contentHash: row.evidence.response.contentHash,
    observation: row.classification.observation,
    eligible: row.classification.projectionEligible,
    correctsEventId: row.correctsEventId,
  }));
  return petrosObjectiveEvidenceProjectionSchema.parse({
    schemaVersion: 'petros.objective-evidence.v1',
    algorithmVersion: 'petros.objective-evidence-projection.v1',
    institutionId: scope.institutionId,
    studentId: scope.studentId,
    objective,
    activeEventCount: active.length,
    eligibleEventCount: active.filter((row) => row.classification.projectionEligible).length,
    latestEventId: active.at(-1)?.id ?? null,
    eventSetHash: digest(identities),
  });
}

@Injectable()
export class PetrosObjectiveEvidenceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly repo: PetrosObjectiveEvidenceRepository,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
  ) {}

  private transaction<T>(principal: InstitutionalStudentPrincipal, work: () => Promise<T>) {
    return runInStudentTenant(this.db, principal, async () => {
      await this.db.execute(sql`set local statement_timeout='10s'`);
      await this.db.execute(sql`set local lock_timeout='2s'`);
      return work();
    });
  }

  private enabled() {
    if (!this.env.PETROS_OBJECTIVE_EVIDENCE_ENABLED)
      throw conflict('PETROS_OBJECTIVE_EVIDENCE_DISABLED');
  }

  private async currentPrincipal(principal: InstitutionalStudentPrincipal) {
    const current = await this.auth.resolveInstitutionalWorker(principal.institutionUserId);
    if (current.institutionId !== principal.institutionId || current.studentId !== principal.studentId ||
      !current.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(current))
      throw new ForbiddenException();
    return current;
  }

  async append(principal: InstitutionalStudentPrincipal, sessionId: string, raw: unknown) {
    this.enabled();
    const command = petrosObjectiveEvidenceAppendCommandSchema.parse(raw);
    const requestHash = digest(command);
    return this.transaction(principal, async () => {
      this.enabled();
      await this.currentPrincipal(principal);
      let replay = await this.repo.command(principal, command.commandId);
      if (replay && replay.requestHash !== requestHash)
        throw conflict('PETROS_OBJECTIVE_EVIDENCE_REPLAY_CONFLICT');
      const answer = await this.repo.canonicalAnswer(principal, command.evaluationId);
      if (!answer) throw new NotFoundException({ code: 'PETROS_EVIDENCE_EVALUATION_NOT_FOUND' });
      if (answer.session.id !== sessionId) throw conflict('PETROS_EVIDENCE_SESSION_SCOPE_INVALID');
      if (answer.session.status !== 'active') throw conflict('PETROS_EVIDENCE_SESSION_STALE');
      if (answer.evaluation.observationId !== answer.observation.id ||
        answer.evaluation.questionId !== answer.question.id ||
        answer.observation.questionId !== answer.question.id ||
        answer.evaluation.sessionId !== answer.session.id || answer.observation.sessionId !== answer.session.id ||
        answer.question.sessionId !== answer.session.id)
        throw conflict('PETROS_EVIDENCE_RESPONSE_LINEAGE_INVALID');

      // The authority order is policy/course/source/pack before evidence lineage and append.
      const policy = await this.policies.documentKnowledgePolicy(principal, answer.session.id);
      const approved = await this.packs.requireApprovedPack(principal, answer.session.id, {
        packId: command.pack.id,
        packVersion: command.pack.version,
      });
      const candidate = approved.candidate;
      const binding = petrosLearningTaskBindingSchema.safeParse(
        (answer.question as typeof answer.question & { learningTask?: unknown }).learningTask,
      );
      if (!binding.success) throw conflict('PETROS_EVIDENCE_TASK_BINDING_MISSING');
      const task = candidate.assessments.find((item) => item.id === command.task.id && item.variant === command.task.variant);
      if (!task || binding.data.pack.id !== candidate.pack.id || binding.data.pack.version !== candidate.pack.version ||
        binding.data.pack.id !== command.pack.id || binding.data.pack.version !== command.pack.version ||
        binding.data.task.id !== command.task.id || binding.data.task.variant !== command.task.variant ||
        binding.data.objective.id !== candidate.objective.id || binding.data.objective.version !== candidate.objective.version ||
        binding.data.sourceVersion !== candidate.sourceVersion ||
        binding.data.rubric.id !== candidate.rubric.id || binding.data.rubric.version !== candidate.rubric.version)
        throw conflict('PETROS_EVIDENCE_TASK_BINDING_CHANGED');
      if (answer.session.sourceContext?.sourceFingerprint !== candidate.sourceVersion ||
        policy.sourceFingerprint !== candidate.sourceVersion)
        throw conflict('PETROS_EVIDENCE_SOURCE_CHANGED');

      const assessment = petrosAssessmentSchema.safeParse(answer.evaluation.assessment);
      if (!assessment.success) throw conflict('PETROS_EVIDENCE_ASSESSMENT_MISSING');
      if (assessment.data.conditions.policyVersion !== policy.authorityHash)
        throw conflict('PETROS_EVIDENCE_POLICY_CHANGED');
      // Policy/course/source locks above precede stable response and command serialization.
      await this.repo.lock(`petros-objective-evidence:evaluation:${principal.institutionId}:${principal.studentId}:${command.evaluationId}`);
      await this.repo.lock(`petros-objective-evidence:command:${principal.institutionId}:${principal.studentId}:${command.commandId}`);
      replay = await this.repo.command(principal, command.commandId);
      if (replay && replay.requestHash !== requestHash)
        throw conflict('PETROS_OBJECTIVE_EVIDENCE_REPLAY_CONFLICT');
      // Replays pass all current owner/policy/source/pack/binding/assessment checks above.
      if (replay) return petrosObjectiveEvidenceReceiptSchema.parse({ ...replay.response, replayed: true });
      if (!command.correction && await this.repo.eventForEvaluation(principal, command.evaluationId))
        throw conflict('PETROS_EVIDENCE_RESPONSE_ALREADY_APPENDED');
      const correction = await this.correction(principal, command, candidate.objective, answer);
      if ((await this.repo.previousTaskExposure(principal,answer.question)).length) {
        assessment.data.conditions.attempt=[{value:'repeat_equivalent',basis:'system_observed',
          actor:{kind:'system',id:'petros.objective-evidence'},method:'owner_task_display_history',
          recordedAt:assessment.data.conditions.collectedAt}];
      }
      if (correction) {
        const now=new Date().toISOString();
        assessment.data.conditions.collectedAt=now;
        assessment.data.conditions.externalAssistance=[{value:'declared',basis:'self_reported',
          actor:{kind:'learner',id:principal.studentId},method:'explicit_assistance_correction',recordedAt:now}];
      }
      const assignments = await this.repo.assignmentBindings(principal, sessionId);
      if (assignments.length > 1) throw conflict('PETROS_EVIDENCE_ASSIGNMENT_AMBIGUOUS');
      const assignment = assignments[0];
      if (assignment && !policy.assignmentRestrictions.some(item =>
        item.id === assignment.binding.assignmentId && item.version === assignment.binding.assignmentVersion))
        throw conflict('PETROS_EVIDENCE_ASSIGNMENT_CHANGED');
      const eventId = randomUUID();
      const content = {
        rawAnswer: answer.observation.rawAnswer ?? null,
        payload: answer.observation.payload,
      };
      const evidence = petrosObjectiveEvidenceSchema.parse({
        schemaVersion: 'petros.objective-evidence.v1',
        eventId,
        occurredAt: correction ? new Date().toISOString() : answer.observation.occurredAt.toISOString(),
        owner: { institutionId: principal.institutionId, studentId: principal.studentId },
        sessionId: answer.session.id,
        commandId: command.commandId,
        objective: candidate.objective,
        subjectKey: candidate.subject,
        conceptIds: candidate.concepts.map((concept) => concept.id),
        task: { id: task.id, variant: task.variant, unseenContext: task.unseenContext },
        rubric: { id: candidate.rubric.id, version: candidate.rubric.version },
        pack: candidate.pack,
        sourceVersion: candidate.sourceVersion,
        policyVersion: policy.authorityHash,
        assignment: assignment ? { id: assignment.binding.assignmentId,
          assignmentVersion: assignment.binding.assignmentVersion, releaseId: assignment.releaseId } : null,
        assignmentRestrictions: policy.assignmentRestrictions.map(({id,version}) => ({id,version})),
        response: {
          modality: responseModality(answer.question.responseType),
          identityHash: digest({
            evaluationId: answer.evaluation.id,
            observationId: answer.observation.id,
            questionId: answer.question.id,
            pack: candidate.pack,
            task: { id: task.id, variant: task.variant },
            objective: candidate.objective,
            evaluationSchemaVersion: answer.evaluation.schemaVersion,
            observationSchemaVersion: answer.observation.schemaVersion,
          }),
          contentHash: digest(content),
          workId: null,
          revisionId: null,
        },
        assessment: assessment.data,
      });
      const classification = classifyPetrosObjectiveEvidence(evidence);
      if (!classification.appendable) throw conflict(classification.appendDenial ?? 'PETROS_EVIDENCE_NOT_APPENDABLE');
      const receipt = petrosObjectiveEvidenceReceiptSchema.parse({
        schemaVersion: 'petros.objective-evidence.v1', commandId: command.commandId,
        requestHash, event: evidence, classification, correction, replayed: false,
      });
      await this.repo.append({
        scope: principal, evaluationId: command.evaluationId, requestHash,
        evidence, classification, correction, receipt,
      });
      await this.rebuild(principal, candidate.objective);
      await this.audit.logAudit({
        actorType: ActorType.InstitutionUser,
        actorId: principal.institutionUserId,
        institutionId: principal.institutionId,
        module: 'petros',
        action: correction ? 'petros.objective_evidence.corrected' : 'petros.objective_evidence.appended',
        entityType: 'petros_objective_evidence_event',
        entityId: eventId,
        correlationId: command.commandId,
        newState: {
          sessionId: answer.session.id,
          objective: candidate.objective,
          pack: candidate.pack,
          classification: classification.observation,
          projectionEligible: classification.projectionEligible,
          correctsEventId: correction?.correctsEventId ?? null,
        },
      });
      return receipt;
    });
  }

  /** Joins the existing answer transaction through tenant ALS; response and outbox roll back together. */
  async observeAnswer(principal: InstitutionalStudentPrincipal, sessionId: string, evaluationId: string, bindingRaw: unknown) {
    if (!this.env.PETROS_OBJECTIVE_EVIDENCE_ENABLED) return null;
    const binding=petrosLearningTaskBindingSchema.parse(bindingRaw);
    return this.append(principal,sessionId,{schemaVersion:'petros.objective-evidence.v1',commandId:evaluationId,
      evaluationId,pack:binding.pack,task:binding.task,correction:null});
  }

  async readCurrentEvidence(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    pack: { packId: string; packVersion: number },
  ) {
    this.enabled();
    return this.transaction(principal, async () => {
      await this.currentPrincipal(principal);
      const policy = await this.policies.documentKnowledgePolicy(principal, sessionId);
      const approved = await this.packs.requireApprovedPack(principal, sessionId, pack);
      if (approved.candidate.sourceVersion !== policy.sourceFingerprint)
        throw conflict('PETROS_EVIDENCE_SOURCE_CHANGED');
      // Normal authorized reads recover a bounded batch of pending projection work.
      // The canonical append already commits its projection atomically; this drains
      // replay/recovery receipts without a privileged background learner scan.
      await this.consumePending(principal);
      const rows = await this.repo.list(principal, {
        sessionId, objectiveId: approved.candidate.objective.id,
        objectiveVersion: approved.candidate.objective.version,
        packId: approved.candidate.pack.id, packVersion: approved.candidate.pack.version,
      });
      const active = activeObjectiveEvidence(rows);
      return {
        schemaVersion: 'petros.objective-evidence.v1' as const,
        objective: approved.candidate.objective,
        events: active.map((row) => ({
          event: petrosObjectiveEvidenceSchema.parse(row.evidence),
          classification: row.classification,
          correction: row.correctsEventId
            ? { correctsEventId: row.correctsEventId, reason: row.correctionReason!, declaration:'external_assistance_received' as const } : null,
        })),
        projection: buildObjectiveEvidenceProjection(principal, approved.candidate.objective, rows),
      };
    });
  }

  async rebuildProjection(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    pack: { packId: string; packVersion: number },
  ) {
    this.enabled();
    return this.transaction(principal, async () => {
      await this.currentPrincipal(principal);
      const policy = await this.policies.documentKnowledgePolicy(principal, sessionId);
      const approved = await this.packs.requireApprovedPack(principal, sessionId, pack);
      if (approved.candidate.sourceVersion !== policy.sourceFingerprint)
        throw conflict('PETROS_EVIDENCE_SOURCE_CHANGED');
      return this.rebuild(principal, approved.candidate.objective);
    });
  }

  /** Bounded idempotent outbox consumer; every delivery rebuilds from immutable owner events. */
  async consumePending(principal: InstitutionalStudentPrincipal, rawLimit = 25) {
    this.enabled();
    const limit = Math.max(1, Math.min(50, Math.trunc(rawLimit)));
    return this.transaction(principal, async () => {
      await this.currentPrincipal(principal);
      const pending = await this.repo.pendingOutbox(principal, limit);
      const rebuilt = new Set<string>();
      for (const item of pending) {
        const event = await this.repo.event(principal, item.eventId);
        if (!event) throw conflict('PETROS_EVIDENCE_OUTBOX_EVENT_MISSING');
        const key = `${event.objectiveId}:${event.objectiveVersion}`;
        if (!rebuilt.has(key)) {
          await this.rebuild(principal, { id: event.objectiveId, version: event.objectiveVersion });
          rebuilt.add(key);
        }
        await this.repo.markOutboxProcessed(item.id);
      }
      return { processed: pending.length, rebuiltObjectives: rebuilt.size };
    });
  }

  private async rebuild(scope: ObjectiveEvidenceScope, objective: { id: string; version: number }) {
    // Every append, rebuild and delivery uses the same lock before reading its event set.
    await this.repo.lock(`petros-objective-projection:${scope.institutionId}:${scope.studentId}:${objective.id}:${objective.version}`);
    const rows = await this.repo.list(scope, { objectiveId: objective.id, objectiveVersion: objective.version });
    const projection = buildObjectiveEvidenceProjection(scope, objective, rows);
    const projectionHash = digest(projection);
    await this.repo.upsertProjection(projection, projectionHash);
    return { projection, projectionHash };
  }

  private async correction(
    scope: ObjectiveEvidenceScope,
    command: PetrosObjectiveEvidenceAppendCommand,
    objective: { id: string; version: number },
    answer: NonNullable<Awaited<ReturnType<PetrosObjectiveEvidenceRepository['canonicalAnswer']>>>,
  ) {
    if (!command.correction) return null;
    const prior = await this.repo.event(scope, command.correction.correctsEventId);
    if (!prior || prior.objectiveId !== objective.id || prior.objectiveVersion !== objective.version)
      throw conflict('PETROS_EVIDENCE_CORRECTION_SCOPE_INVALID');
    const previousAnswer = await this.repo.canonicalAnswer(scope, prior.evaluationId!);
    // Learners may add a help disclosure to the SAME response; they cannot replace its judgment.
    if (!previousAnswer || previousAnswer.observation.id !== answer.observation.id ||
      previousAnswer.question.id !== answer.question.id || prior.sessionId !== answer.session.id ||
      digest(previousAnswer.question.learningTask) !== digest(answer.question.learningTask) ||
      prior.evaluationId !== command.evaluationId || prior.classification.externalAssistance === 'declared')
      throw conflict('PETROS_EVIDENCE_CORRECTION_RESPONSE_MISMATCH');
    const rows = await this.repo.list(scope, { objectiveId: objective.id, objectiveVersion: objective.version });
    if (rows.some((row) => row.correctsEventId === prior.id))
      throw conflict('PETROS_EVIDENCE_ALREADY_CORRECTED');
    return command.correction;
  }
}

function responseModality(responseType: string): 'written' | 'oral' | 'interactive' {
  if (/voice|oral|speech/i.test(responseType)) return 'oral';
  if (/choice|select|interactive/i.test(responseType)) return 'interactive';
  return 'written';
}
