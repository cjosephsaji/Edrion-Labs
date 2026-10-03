import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, schema, sql, runInStudentTenant, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { compatibilityCanonicalJson, petrosLearningArtifactReceiptSchema,
  type PetrosSubmitArtifactReviewInput } from '@edrion/schemas';
import { createHash } from 'node:crypto';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { PetrosTeachingPackService } from '../knowledge/petros-teaching-pack.service';
import { PetrosInstitutionalService } from '../../petros-institutional/petros-institutional.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { activeObjectiveEvidence } from '../../petros-learner-model/petros-objective-evidence.service';

const digest = (value: unknown) => createHash('sha256').update(compatibilityCanonicalJson(value)).digest('hex');
const conflict = (code: string) => new ConflictException({ code });
type Artifact = typeof schema.petrosSavedArtifacts.$inferSelect;

/** Adds provenance inside existing save/review transactions; never upgrades self-recall to evidence. */
@Injectable()
export class PetrosLearningArtifactsService {
  constructor(@Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly auth: StudentAuthService,
    private readonly surfaces: SurfacesService,
    private readonly packs: PetrosTeachingPackService,
    private readonly policies: PetrosInstitutionalService) {}

  private async currentStudent(principal: InstitutionalStudentPrincipal) {
    const current = await this.auth.resolveInstitutionalWorker(principal.institutionUserId);
    if (current.institutionId !== principal.institutionId || current.studentId !== principal.studentId ||
      !current.permissions.includes('student.learn.use') || !await this.surfaces.isPortalEnabled(current))
      throw new ForbiddenException();
    if (!this.env.PETROS_ADAPTIVE_TEACHING_ENABLED) throw conflict('PETROS_ADAPTIVE_TEACHING_DISABLED');
  }

  async save<T extends { artifact?: Artifact }>(principal: InstitutionalStudentPrincipal,
    commandId: string, write: () => Promise<T>): Promise<T> {
    return runInStudentTenant(this.db, principal, async () => {
      const result = await write();
      if (result.artifact) await this.captureSave(principal,result.artifact,commandId);
      return result;
    });
  }

  async captureSave(principal: InstitutionalStudentPrincipal, artifact: Artifact, commandId: string) {
    if (!artifact.sessionId) return null;
    const current = await this.requireSession(principal, artifact.sessionId);
    if (!current) return null;
    const { policy, approved } = current;
    const r = schema.petrosLearningArtifactReceipts;
    const [prior] = await this.db.select().from(r).where(and(eq(r.artifactId, artifact.id),
      eq(r.institutionId, principal.institutionId), eq(r.studentId, principal.studentId), eq(r.revision, artifact.revision))).limit(1);
    if (prior) {
      if (prior.contentHash !== digest(artifact.content)) throw conflict('PETROS_ARTIFACT_CONTENT_CHANGED');
      return prior;
    }
    const events = schema.petrosArtifactEvents;
    const [saved] = await this.db.select().from(events).where(and(eq(events.artifactId, artifact.id),
      eq(events.institutionId, principal.institutionId), eq(events.studentId, principal.studentId),
      eq(events.type, 'artifact.saved'))).limit(1);
    if (!saved) throw conflict('PETROS_ARTIFACT_SELECTED_SAVE_MISSING');
    const evidence = schema.petrosObjectiveEvidenceEvents;
    const lineage = await this.db.select({id:evidence.id}).from(evidence).where(and(eq(evidence.institutionId, principal.institutionId),
      eq(evidence.studentId, principal.studentId), eq(evidence.sessionId, artifact.sessionId),
      eq(evidence.packId, approved.candidate.pack.id), eq(evidence.packVersion, approved.candidate.pack.version)))
      .orderBy(evidence.occurredAt, evidence.id).limit(1001);
    if (lineage.length > 1000) throw conflict('PETROS_ARTIFACT_EVIDENCE_LIMIT');
    const pack = approved.candidate;
    const receipt = petrosLearningArtifactReceiptSchema.parse({ schemaVersion: 'petros.learning-artifact-receipt.v1',
      scope: { institutionId: principal.institutionId, studentId: principal.studentId },
      artifact: { id: artifact.id, revision: artifact.revision }, contentHash: digest(artifact.content),
      sessionId: artifact.sessionId, objective: pack.objective, pack: pack.pack, candidateHash: approved.payloadHash,
      packReviewId: approved.reviewReceipt.receiptId, curriculumRevision: pack.curriculumRevision,
      source: pack.concepts[0]!.anchors[0]!.locator, conceptIds: pack.concepts.map(c => c.id), rubric: pack.rubric,
      policy, selectedSave: { commandId, eventId: saved.id, proposalId: artifact.sourceProposalId,
        meaning: 'explicit_student_selection' }, evidenceLineage: lineage.map(e => e.id),
      schedule: { dueAt: artifact.dueAt?.toISOString() ?? null, schedulerVersion: artifact.schedulerVersion },
      createsObjectiveEvidence: false });
    const [row] = await this.db.insert(r).values({ institutionId: principal.institutionId, studentId: principal.studentId,
      artifactId: artifact.id, revision: artifact.revision, commandId, contentHash: receipt.contentHash, receipt }).returning();
    await this.audit.logAudit({ actorType: ActorType.InstitutionUser, actorId: principal.institutionUserId,
      institutionId: principal.institutionId, module:'petros', action:'petros.artifact.learning_binding_saved',
      entityType:'petros_saved_artifact', entityId:artifact.id, correlationId:commandId,
      newState:{revision:artifact.revision, pack:pack.pack, objective:pack.objective, selectedSaveEventId:saved.id} });
    return row!;
  }

  async requireSession(principal: InstitutionalStudentPrincipal, sessionId: string) {
    const t = schema.petrosAdaptiveBindings;
    const [sessionBinding] = await this.db.select().from(t).where(and(eq(t.sessionId, sessionId),
      eq(t.institutionId, principal.institutionId), eq(t.studentId, principal.studentId))).limit(1);
    if (!sessionBinding) return null;
    await this.currentStudent(principal);
    const binding = sessionBinding.binding as { pack: {id:string;version:number}; candidateHash:string; reviewId:string; policy:unknown };
    const policy = await this.policies.assertDocumentKnowledgePolicy(principal, sessionId, binding.policy);
    const approved = await this.packs.requireApprovedPackForResume(principal, sessionId,
      { packId: binding.pack.id, packVersion: binding.pack.version });
    if (approved.payloadHash !== binding.candidateHash || approved.reviewReceipt.receiptId !== binding.reviewId)
      throw conflict('PETROS_ARTIFACT_APPROVAL_CHANGED');
    return {policy,approved};
  }

  async requireCurrent(principal: InstitutionalStudentPrincipal, artifact: Artifact) {
    const t = schema.petrosLearningArtifactReceipts;
    const [row] = await this.db.select().from(t).where(and(eq(t.artifactId, artifact.id),
      eq(t.institutionId, principal.institutionId), eq(t.studentId, principal.studentId)))
      .orderBy(desc(t.revision)).limit(1);
    if (!row) return null;
    await this.currentStudent(principal);
    const receipt = petrosLearningArtifactReceiptSchema.parse(row.receipt);
    if (receipt.artifact.revision !== artifact.revision || receipt.contentHash !== digest(artifact.content) || artifact.lifecycle !== 'saved')
      throw conflict('PETROS_ARTIFACT_LEARNING_REVISION_STALE');
    await this.policies.assertDocumentKnowledgePolicy(principal, receipt.sessionId, receipt.policy);
    const approved = await this.packs.requireApprovedPackForResume(principal, receipt.sessionId,
      {packId:receipt.pack.id,packVersion:receipt.pack.version});
    if (approved.payloadHash !== receipt.candidateHash || approved.reviewReceipt.receiptId !== receipt.packReviewId ||
      digest(approved.candidate.rubric) !== digest(receipt.rubric)) throw conflict('PETROS_ARTIFACT_LEARNING_STALE');
    return {row, receipt, approved};
  }

  async recordReview(principal: InstitutionalStudentPrincipal, artifact: Artifact,
    input: PetrosSubmitArtifactReviewInput, outcome: typeof schema.petrosArtifactReviewOutcomes.$inferSelect) {
    const binding = await this.requireCurrent(principal, artifact);
    if (!binding) return false;
    const requestHash = digest({artifactId:artifact.id, revision:artifact.revision, input});
    const t = schema.petrosLearningReviewReceipts;
    const [prior] = await this.db.select().from(t).where(and(eq(t.institutionId, principal.institutionId),
      eq(t.studentId, principal.studentId), eq(t.clientReviewId, input.clientReviewId))).limit(1);
    if (prior) {
      if (prior.requestHash !== requestHash || prior.reviewOutcomeId !== outcome.id)
        throw conflict('PETROS_ARTIFACT_LEARNING_REVIEW_CONFLICT');
      return true;
    }
    await this.db.insert(t).values({institutionId:principal.institutionId,studentId:principal.studentId,
      artifactReceiptId:binding.row.id, reviewOutcomeId:outcome.id,clientReviewId:input.clientReviewId,requestHash,
      receipt:{schemaVersion:'petros.learning-review-receipt.v1', artifact:binding.receipt.artifact,
        selectedSaveReceiptId:binding.row.id, outcomeId:outcome.id, clientReviewId:input.clientReviewId,
        scheduleBefore:outcome.stateBefore,scheduleAfter:outcome.stateAfter,schedulerVersion:outcome.schedulerVersion,
        meaning:'self_reported_artifact_recall',createsObjectiveEvidence:false,masteryProjectionEligible:false} });
    await this.audit.logAudit({actorType:ActorType.InstitutionUser,actorId:principal.institutionUserId,
      institutionId:principal.institutionId,module:'petros',action:'petros.artifact.learning_review_recorded',
      entityType:'petros_artifact_review',entityId:outcome.id,correlationId:input.clientReviewId,
      newState:{artifactId:artifact.id,revision:artifact.revision,meaning:'self_reported_artifact_recall',createsObjectiveEvidence:false} });
    return true;
  }

  async resume(principal: InstitutionalStudentPrincipal, artifactId: string) {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${principal.institutionId}`},0))`);
    const t = schema.petrosSavedArtifacts;
    const [artifact] = await this.db.select().from(t).where(and(eq(t.id,artifactId),
      eq(t.institutionId,principal.institutionId),eq(t.studentId,principal.studentId))).for('share').limit(1);
    if (!artifact) throw new NotFoundException();
    const current = await this.requireCurrent(principal,artifact);
    if (!current) return {status:'legacy' as const,objectiveEvidence:'not_established' as const};
    const e=schema.petrosObjectiveEvidenceEvents;
    const rows=await this.db.select().from(e).where(and(eq(e.institutionId,principal.institutionId),
      eq(e.studentId,principal.studentId),eq(e.sessionId,current.receipt.sessionId),
      eq(e.packId,current.receipt.pack.id),eq(e.packVersion,current.receipt.pack.version)));
    const active=activeObjectiveEvidence(rows).filter(row=>row.evidence.sourceVersion===current.receipt.source.sourceVersion &&
      row.evidence.policyVersion===current.receipt.policy.authorityHash);
    const demonstrated=active.filter(row=>row.classification.projectionEligible && row.evidence.task.unseenContext &&
      row.evidence.assessment.result.kind==='objective' && row.evidence.assessment.result.judgment.status==='evaluated' &&
      row.evidence.assessment.result.judgment.outcome==='correct');
    return {status:'available' as const,artifact:current.receipt.artifact,objective:current.receipt.objective,
      objectiveStatement:current.approved.candidate.objectiveStatement,
      pack:current.receipt.pack,source:current.receipt.source,selectedSave:current.receipt.selectedSave,
      historicalEvidenceIds:current.receipt.evidenceLineage,
      dueAt:artifact.dueAt?.toISOString() ?? null,schedulerVersion:artifact.schedulerVersion,
      currentEvidence:{observedResponses:active.length,demonstratedApplications:demonstrated.length,
        assistedResponses:active.filter(row=>row.classification.petrosAssistance==='hinted' || row.classification.petrosAssistance==='solution_exposed').length,
        declaredExternalAssistanceResponses:active.filter(row=>row.classification.externalAssistance==='declared').length,
        uncertainResponses:active.filter(row=>['uncertain','no_evidence'].includes(row.classification.observation)).length,
        externalAssistance:'unknown',coverageIsEvidence:false},
      evidenceMeaning:'Counts describe current recorded responses and observed Petros assistance, not overall mastery or absence of external help.',
      reviewMeaning:'self_reported_artifact_recall',masteryProjectionEligible:false};
  }

  async lockReview(principal: InstitutionalStudentPrincipal, artifactId: string, clientReviewId: string) {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-review:${principal.studentId}:${clientReviewId}`},0))`);
    const t=schema.petrosSavedArtifacts;
    await this.db.select({id:t.id}).from(t).where(and(eq(t.id,artifactId),eq(t.institutionId,principal.institutionId),
      eq(t.studentId,principal.studentId))).for('no key update');
  }
}
