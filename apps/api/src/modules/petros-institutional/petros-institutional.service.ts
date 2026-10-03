import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import type { ApiEnv } from '@edrion/config';
import type { InstitutionPrincipal } from '@edrion/auth';
import {
  PETROS_INSTITUTIONAL_FUNCTIONS,
  PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  petrosInstitutionalReleaseGateSchema,
  petrosPolicyVersionSchema,
  petrosTeacherHandoffDraftSchema,
  type PetrosHomeworkMatchInput,
  type PetrosHomeworkCorrectionInput,
  type PetrosInstitutionalDashboardQuery,
  type PetrosParentDigestCommandInput,
  type PetrosParentDigestPreferenceInput,
  type PetrosPolicyDraftInput,
  type PetrosPolicyDraftUpdateInput,
  type PetrosPolicyFixture,
  type PetrosPolicyPublishInput,
  type PetrosPolicyRollbackInput,
  type PetrosResolvedPolicy,
  type PetrosTeacherHandoffCreateInput,
  type PetrosTeacherHandoffUpdateInput,
  type PetrosInterventionPreviewInput,
  type PetrosInterventionActionInput,
  petrosKnowledgePolicySchema,
  createAssignmentSchema,
  type PetrosKnowledgeMode,
  type PetrosKnowledgePolicy,
} from '@edrion/schemas';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { API_ENV, AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { PetrosAiGatewayService, type PetrosAiExecuteResult } from '../petros-ai-routing/petros-ai-gateway.service';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import type { GuardianContext } from '../parent-portal/guardian-context';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import {
  buildClassSignal,
  decideHomework,
  decideSyllabus,
  defaultInstitutionPolicy,
  resolveInstitutionPolicy,
  sanitizeTeacherSummary,
  stablePolicyHash,
  knowledgePolicyHash,
  narrowKnowledgeMode,
  syllabusKnowledgeMode,
  type PolicyVersionRecord,
} from './petros-institutional.engine';
import { PetrosInstitutionalRepository } from './petros-institutional.repository';
import { knowledgeDenied } from './petros-admission';
import { AssignmentsService } from '../portal/assignments.service';
import { PetrosCohortEvidenceAuthority } from './petros-cohort-evidence-authority';

const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000000';
const CLASS_SIGNAL_ALGORITHM = 'petros.institutional.class-signals.v2';


const parentDigestContentSchema = z.object({
  sourcePeriod: z.object({ start: z.string().datetime(), end: z.string().datetime() }).strict(),
  language: z.string().min(2).max(35),
  uncertainty: z.string().min(2).max(300),
  sections: z.array(z.object({ key: z.enum(['work_completed', 'concepts_building', 'support_ideas', 'upcoming_review', 'effort_and_strategy']), heading: z.string().min(2).max(100), body: z.string().min(2).max(700) }).strict()).max(5),
  privacyNotice: z.string().min(8).max(500),
}).strict();

@Injectable()
export class PetrosInstitutionalService {
  constructor(
    private readonly repo: PetrosInstitutionalRepository,
    private readonly gateway: PetrosAiGatewayService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Optional() @Inject(API_ENV) private readonly env?: ApiEnv,
    @Optional() private readonly assignments?: AssignmentsService,
    @Optional() private readonly cohortEvidence?: PetrosCohortEvidenceAuthority,
  ) {}

  async policyDashboard(ctx: PortalActionContext) {
    const versions = await this.ensurePolicy(ctx.principal.institutionId, ctx.principal.institutionUserId);
    const fixture: PetrosPolicyFixture = {
      campusId: ctx.scope.mode === 'campus' ? ctx.scope.campusId : null,
      programmeId: null,
      gradeId: null,
      subjectId: null,
      studentId: null,
      language: 'en',
      accessibility: [],
    };
    const resolved = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions, fixture });
    await this.portalAudit(ctx, 'petros.policy.dashboard.view', ctx.principal.institutionId, { scope: ctx.scope, contentInspected: false });
    return {
      versions: versions.map(serializePolicy),
      effective: resolved,
      disclosurePreview: resolved.disclosure,
      platformLimits: resolved.disclosure.excludedByPlatform,
      voiceRequired: false,
      productionReady: false,
    };
  }

  async createDraft(ctx: PortalActionContext, input: PetrosPolicyDraftInput) {
    this.assertPolicyScope(ctx.principal, input.scope);
    await this.validatePolicyScope(ctx.principal.institutionId, input.scope);
    const rows = await this.ensurePolicy(ctx.principal.institutionId, ctx.principal.institutionUserId);
    const scoped = rows.filter((row) => sameScope(row, input.scope));
    const version = Math.max(0, ...scoped.map((row) => row.version)) + 1;
    const row = await this.repo.createPolicy({
      institutionId: ctx.principal.institutionId,
      campusId: input.scope.campusId,
      programmeId: input.scope.programmeId,
      gradeId: input.scope.gradeId,
      subjectId: input.scope.subjectId,
      scopeLevel: input.scope.level,
      version,
      status: 'draft',
      schemaVersion: PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
      config: input.config,
      reason: input.reason,
      authorId: ctx.principal.institutionUserId,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
    });
    await this.portalAudit(ctx, 'petros.policy.draft.create', row!.id, { scope: input.scope, version, reason: input.reason });
    await this.event(ctx.principal.institutionId, ctx.principal.institutionUserId, 'institution_user', 'policy', row!.id, 'policy_drafted', { scope: input.scope, version });
    return serializePolicy(row!);
  }

  async updateDraft(ctx: PortalActionContext, id: string, input: PetrosPolicyDraftUpdateInput) {
    this.assertPolicyScope(ctx.principal, input.scope);
    await this.validatePolicyScope(ctx.principal.institutionId, input.scope);
    const existing = await this.repo.findPolicy(ctx.principal.institutionId, id);
    if (!existing) throw notFound('PETROS_POLICY_NOT_FOUND');
    this.assertPolicyScope(ctx.principal, policyScope(existing));
    const row = await this.repo.updateDraft(ctx.principal.institutionId, id, input.expectedVersion, {
      campusId: input.scope.campusId,
      programmeId: input.scope.programmeId,
      gradeId: input.scope.gradeId,
      subjectId: input.scope.subjectId,
      scopeLevel: input.scope.level,
      config: input.config,
      reason: input.reason,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
    });
    if (!row) throw new ConflictException({ code: 'PETROS_POLICY_VERSION_CONFLICT', message: 'The draft changed or is no longer editable.' });
    await this.portalAudit(ctx, 'petros.policy.draft.update', row.id, { scope: input.scope, version: row.version, reason: input.reason });
    await this.event(ctx.principal.institutionId, ctx.principal.institutionUserId, 'institution_user', 'policy', row.id, 'policy_draft_updated', { scope: input.scope, version: row.version });
    return serializePolicy(row);
  }

  async previewPolicy(ctx: PortalActionContext, id: string, fixture: PetrosPolicyFixture) {
    const rows = await this.ensurePolicy(ctx.principal.institutionId, ctx.principal.institutionUserId);
    const target = rows.find((row) => row.id === id);
    if (!target) throw notFound('PETROS_POLICY_NOT_FOUND');
    this.assertPolicyScope(ctx.principal, {
      level: target.scopeLevel,
      campusId: target.campusId,
      programmeId: target.programmeId,
      gradeId: target.gradeId,
      subjectId: target.subjectId,
    });
    await this.assertFixtureScope(ctx.principal, fixture);
    const previewRows = rows
      .filter((row) => row.id === id || !sameScope(row, policyScope(target)))
      .map((row) => row.id === id ? { ...row, status: 'published', effectiveFrom: new Date(0), effectiveUntil: null } : row) as PolicyVersionRecord[];
    const preview = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions: previewRows, fixture });
    const current = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions: rows, fixture });
    await this.portalAudit(ctx, 'petros.policy.preview', id, { fixture: { ...fixture, studentId: fixture.studentId ? 'present' : null }, contentInspected: false });
    return {
      preview,
      current,
      changedSections: Object.keys(target.config).filter((key) => JSON.stringify(target.config[key as keyof typeof target.config]) !== JSON.stringify(current.config[key as keyof typeof current.config])),
      studentDisclosureChanged: stablePolicyHash(preview.disclosure) !== stablePolicyHash(current.disclosure),
      testCases: {
        syllabus: [
          decideSyllabus({ policy: preview, topicKey: preview.config.syllabus.topicKeys[0] ?? 'fixture.in-bound', requestedTopic: 'In-bound fixture', requestedDepth: Math.max(0, preview.config.syllabus.maxDepth - 1) }),
          decideSyllabus({ policy: preview, topicKey: preview.config.syllabus.topicKeys[0] ?? 'fixture.in-bound', requestedTopic: 'Deeper fixture', requestedDepth: preview.config.syllabus.maxDepth + 1 }),
          decideSyllabus({ policy: preview, topicKey: '__outside_fixture__', requestedTopic: 'Outside fixture', requestedDepth: 1 }),
        ],
      },
    };
  }

  async publishPolicy(ctx: PortalActionContext, id: string, input: PetrosPolicyPublishInput) {
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const existing = await this.repo.findPolicy(ctx.principal.institutionId, id);
    if (!existing) throw notFound('PETROS_POLICY_NOT_FOUND');
    this.assertPolicyScope(ctx.principal, policyScope(existing));
    const scheduled = Boolean(existing.effectiveFrom && existing.effectiveFrom > new Date());
    const row = await this.repo.publishPolicy(ctx.principal.institutionId, id, input.expectedVersion, scheduled);
    if (!row) throw new ConflictException({ code: 'PETROS_POLICY_VERSION_CONFLICT', message: 'The draft changed or is no longer publishable.' });
    await this.portalAudit(ctx, 'petros.policy.publish', row.id, { version: row.version, reason: input.reason, scheduled, disclosureReviewed: true });
    await this.event(ctx.principal.institutionId, ctx.principal.institutionUserId, 'institution_user', 'policy', row.id, scheduled ? 'policy_scheduled' : 'policy_published', { version: row.version, disclosureReviewed: true });
    return serializePolicy(row);
  }

  async rollbackPolicy(ctx: PortalActionContext, input: PetrosPolicyRollbackInput) {
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const target = await this.repo.findPolicy(ctx.principal.institutionId, input.targetVersionId);
    if (!target) throw notFound('PETROS_POLICY_NOT_FOUND');
    this.assertPolicyScope(ctx.principal, policyScope(target));
    const row = await this.repo.rollbackPolicy(ctx.principal.institutionId, target.id, randomUUID(), ctx.principal.institutionUserId, input.reason);
    if (!row) throw notFound('PETROS_POLICY_NOT_FOUND');
    await this.portalAudit(ctx, 'petros.policy.rollback', row.id, { restoredFrom: target.id, version: row.version, reason: input.reason });
    await this.event(ctx.principal.institutionId, ctx.principal.institutionUserId, 'institution_user', 'policy', row.id, 'policy_rolled_back', { restoredFrom: target.id, version: row.version });
    return serializePolicy(row);
  }

  async resolveForStudentSession(principal: InstitutionalStudentPrincipal, sessionId: string, subjectId: string | null = null, language = 'en') {
    const existing = await this.repo.findSessionSnapshot(principal.institutionId, principal.studentId, sessionId);
    if (existing) return { snapshotId: existing.id, ...existing.resolvedPolicy, midSessionPolicyChangesDeferred: true };
    if (!(await this.repo.ownsSession(principal.institutionId, principal.studentId, sessionId))) {
      throw notFound('PETROS_SESSION_NOT_FOUND');
    }
    const [versions, student] = await Promise.all([
      this.ensurePolicy(principal.institutionId, SYSTEM_ACTOR),
      this.repo.studentPolicyFixture(principal.institutionId, principal.studentId),
    ]);
    if (!student) throw notFound('PETROS_STUDENT_NOT_FOUND');
    const fixture: PetrosPolicyFixture = {
      campusId: student.campusId,
      programmeId: student.programmeId,
      gradeId: student.gradeId,
      subjectId,
      studentId: principal.studentId,
      language,
      accessibility: [],
    };
    const resolved = resolveInstitutionPolicy({ institutionId: principal.institutionId, versions, fixture });
    const policyHash = stablePolicyHash(resolved);
    const snapshot = await this.repo.createSessionSnapshot({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      sessionId,
      policyVersionIds: resolved.policyVersionIds,
      resolvedPolicy: resolved,
      policyHash,
      stableForSession: true,
    }, language, stablePolicyHash(resolved.disclosure));
    if (!snapshot) throw new Error('Policy snapshot could not be created.');
    await this.event(principal.institutionId, principal.studentId, 'student', 'policy_snapshot', snapshot.id, 'disclosure_shown', { policyHash, contentIncluded: false });
    return { snapshotId: snapshot.id, ...resolved, midSessionPolicyChangesDeferred: true };
  }

  /** Document commands revalidate current binding rules; the older teaching disclosure stays historical. */
  async documentKnowledgePolicy(scope: { institutionId: string; studentId: string }, sessionId: string, requestedMode?: PetrosKnowledgeMode): Promise<PetrosKnowledgePolicy> {
    await this.repo.lockKnowledgeAuthority(scope.institutionId);
    const context = await this.repo.documentKnowledgeContext(scope, sessionId);
    if (!context || context.missingBinding) throw knowledgeDenied('PETROS_KNOWLEDGE_AUTHORITY_UNAVAILABLE');
    if (context.learning) {
      if (!this.env?.PETROS_ASSIGNMENT_LEARNING_ENABLED) throw knowledgeDenied('PETROS_ASSIGNMENT_LEARNING_DISABLED');
      if (requestedMode && requestedMode !== context.learning.policy.resourceMode)
        throw knowledgeDenied('PETROS_ASSIGNMENT_RESOURCE_RESTRICTED');
      requestedMode = context.learning.policy.resourceMode;
    }
    const [versions, student, historical] = await Promise.all([
      this.ensurePolicy(scope.institutionId, SYSTEM_ACTOR), this.repo.studentPolicyFixture(scope.institutionId, scope.studentId),
      this.repo.findSessionSnapshot(scope.institutionId, scope.studentId, sessionId),
    ]);
    if (!student) throw knowledgeDenied('PETROS_KNOWLEDGE_AUTHORITY_UNAVAILABLE');
    let policy: PetrosResolvedPolicy | null = null;
    if (versions.length) {
      try { policy = resolveInstitutionPolicy({ institutionId: scope.institutionId, versions: versions as PolicyVersionRecord[], restrictKnowledge: true, fixture: {
        ...student, subjectId: context.subjectId, studentId: scope.studentId, language: 'en', accessibility: [],
      } }); } catch { throw knowledgeDenied('PETROS_KNOWLEDGE_AUTHORITY_UNAVAILABLE'); }
    }
    const config = policy?.config ?? defaultInstitutionPolicy();
    const historicalMode = historical ? syllabusKnowledgeMode(historical.resolvedPolicy.config.syllabus) : syllabusKnowledgeMode(config.syllabus);
    const ceiling = narrowKnowledgeMode([syllabusKnowledgeMode(config.syllabus), ...(historicalMode ? [historicalMode] : [])]);
    if (requestedMode && narrowKnowledgeMode([ceiling, requestedMode]) !== requestedMode)
      throw knowledgeDenied('PETROS_KNOWLEDGE_MODE_DENIED');
    // No generated answer can safely guarantee hints-only disclosure in this bounded increment.
    if (context.answerRestricted || context.restrictions.some(row => row.aiPolicy !== 'full')) throw knowledgeDenied('PETROS_ASSIGNMENT_ANSWER_RESTRICTED');
    const source = context.session.sourceContext!;
    const historicalSyllabus = historical?.resolvedPolicy.config.syllabus;
    if (config.syllabus.maxDepth === 0 || historicalSyllabus?.maxDepth === 0) throw knowledgeDenied('PETROS_KNOWLEDGE_DEPTH_RESTRICTED');
    if (historicalSyllabus?.approvedSourceIds.length && !historicalSyllabus.approvedSourceIds.includes(context.sourceId))
      throw knowledgeDenied('PETROS_KNOWLEDGE_SOURCE_RESTRICTED');
    const approved = config.syllabus.approvedSourceIds;
    if (approved.length && !approved.includes(context.sourceId)) throw knowledgeDenied('PETROS_KNOWLEDGE_SOURCE_RESTRICTED');
    const topicKey = (context.session.topicContext as { topicKey?: string } | null)?.topicKey;
    if ([config.syllabus.topicKeys, historicalSyllabus?.topicKeys ?? []].some(keys => keys.length && (!topicKey || !keys.includes(topicKey))))
      throw knowledgeDenied('PETROS_KNOWLEDGE_TOPIC_RESTRICTED');
    const mode = requestedMode ?? ceiling;
    const explanation = mode === 'source_bound'
      ? 'Source-bound: exact passages from the selected material only. Missing evidence does not permit outside knowledge.'
      : mode === 'source_primary'
        ? 'Source-primary: material passages are labelled separately from general knowledge, analogy and inference. Outside content is not verified by your document.'
        : 'General learning: outside knowledge is permitted and labelled; it is not verified by your document. No external search is enabled.';
    const result = petrosKnowledgePolicySchema.parse({ schemaVersion: 'petros.knowledge-policy.v1', mode, requestedMode: requestedMode ?? null,
      policyVersionIds: policy?.policyVersionIds ?? [],
      authorityHash: knowledgePolicyHash({ versions: policy?.policyVersionIds ?? [], syllabus: config.syllabus, homework: config.homework,
        historicalMode, restrictions: context.restrictions, subjectId: context.subjectId }),
      sourceId: context.sourceId, sourceFingerprint: source.sourceFingerprint,
      pages: [...new Set((source.citations as Array<{ page: number }>).map(citation => citation.page))].sort((a, b) => a - b),
      maximumDepth: Math.min(config.syllabus.maxDepth, historicalSyllabus?.maxDepth ?? config.syllabus.maxDepth),
      subjectId: context.subjectId, assignmentRestrictions: context.restrictions,
      retrieval: { designatedSource: true, external: false }, authority: 'designated_material_with_institution_restrictions', explanation });
    if (context.learning && knowledgePolicyHash(result) !== knowledgePolicyHash(context.learning.institutionalPolicySnapshot))
      throw knowledgeDenied('PETROS_ASSIGNMENT_POLICY_CHANGED');
    return result;
  }

  async assertDocumentKnowledgePolicy(scope: { institutionId: string; studentId: string }, sessionId: string, raw: unknown) {
    const parsed = petrosKnowledgePolicySchema.safeParse(raw);
    if (!parsed.success) throw knowledgeDenied('PETROS_KNOWLEDGE_POLICY_INVALID');
    const pinned = parsed.data;
    const current = await this.documentKnowledgePolicy(scope, sessionId, pinned.requestedMode ?? undefined);
    if (knowledgePolicyHash(current) !== knowledgePolicyHash(pinned)) throw knowledgeDenied('PETROS_KNOWLEDGE_POLICY_CHANGED');
    return pinned;
  }

  async acknowledgeDisclosure(principal: InstitutionalStudentPrincipal, sessionId: string) {
    const policy = await this.resolveForStudentSession(principal, sessionId);
    const receipt = await this.repo.acknowledgeDisclosure(principal.institutionId, principal.studentId, policy.snapshotId);
    if (!receipt) throw notFound('PETROS_DISCLOSURE_NOT_FOUND');
    await this.event(principal.institutionId, principal.studentId, 'student', 'policy_snapshot', policy.snapshotId, 'disclosure_acknowledged', {});
    return { acknowledged: true, acknowledgedAt: receipt.acknowledgedAt?.toISOString() ?? new Date().toISOString() };
  }

  async readSessionPolicy(institutionId: string, studentId: string, sessionId: string) {
    const row = await this.repo.findSessionSnapshot(institutionId, studentId, sessionId);
    return row ? { snapshotId: row.id, ...row.resolvedPolicy, midSessionPolicyChangesDeferred: true as const } : null;
  }

  async syllabusDecision(principal: InstitutionalStudentPrincipal, sessionId: string, input: { topicKey: string; requestedTopic: string; requestedDepth: number; subjectId?: string | null }) {
    const policy = await this.resolveForStudentSession(principal, sessionId, input.subjectId ?? null);
    const decision = decideSyllabus({ policy, topicKey: input.topicKey, requestedTopic: input.requestedTopic, requestedDepth: input.requestedDepth });
    await this.event(principal.institutionId, principal.studentId, 'student', 'policy_snapshot', policy.snapshotId, 'syllabus_decision', { decision: decision.decision, sourceCount: decision.sourceBoundary.approvedSourceIds.length, externalSourcesAllowed: decision.sourceBoundary.externalSourcesAllowed });
    return decision;
  }

  async homeworkDecision(principal: InstitutionalStudentPrincipal, sessionId: string, input: PetrosHomeworkMatchInput) {
    const policy = await this.resolveForStudentSession(principal, sessionId, input.subjectId);
    const decision = decideHomework(policy, input);
    await this.persistHomeworkDecision(principal, sessionId, policy.snapshotId, input.assignmentId, input.relationBasisPoints, decision);
    await this.event(principal.institutionId, principal.studentId, 'student', 'homework_match', input.assignmentId, 'homework_policy_decision', { related: decision.related, active: decision.active, reasonCode: decision.reasonCode, finalAnswerAllowed: decision.finalAnswerAllowed });
    return decision;
  }

  async correctHomeworkMatch(principal: InstitutionalStudentPrincipal, sessionId: string, input: PetrosHomeworkCorrectionInput) {
    await this.repo.lockKnowledgeAuthority(principal.institutionId);
    const policy = await this.resolveForStudentSession(principal, sessionId);
    if (!policy.config.homework.studentCorrectionAllowed) {
      throw new ForbiddenException({ code: 'PETROS_HOMEWORK_CORRECTION_DISABLED', message: 'False-match correction is unavailable under the disclosed policy.' });
    }
    const row = await this.repo.correctHomeworkMatch(principal.institutionId, principal.studentId, sessionId, input.assignmentId, input.correctionReason);
    if (!row) throw notFound('PETROS_HOMEWORK_MATCH_NOT_FOUND');
    const message = 'Thanks—this session will not treat the question as related homework. Normal teaching now applies.';
    await this.repo.applyHomeworkCorrectionToSession(principal.institutionId, principal.studentId, sessionId, message);
    await this.event(principal.institutionId, principal.studentId, 'student', 'homework_match', row.id, 'homework_false_match_corrected', { assignmentId: input.assignmentId, contentIncluded: false }, input.idempotencyKey);
    return { assignmentId: input.assignmentId, active: false, mode: 'normal' as const, reasonCode: 'STUDENT_FALSE_MATCH_CORRECTION', studentMessage: message };
  }

  async sessionDecisions(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: {
      topicKey: string;
      requestedTopic: string;
      requestedDepth: number;
      subjectId: string | null;
      homework: Omit<PetrosHomeworkMatchInput, 'topic' | 'subjectId' | 'now'> | null;
    },
  ) {
    const policy = await this.resolveForStudentSession(principal, sessionId, input.subjectId);
    const syllabus = decideSyllabus({
      policy,
      topicKey: input.topicKey,
      requestedTopic: input.requestedTopic,
      requestedDepth: input.requestedDepth,
    });
    const homework = input.homework
      ? decideHomework(policy, {
          ...input.homework,
          topic: input.requestedTopic,
          subjectId: input.subjectId,
          now: new Date().toISOString(),
        })
      : null;
    if (homework && input.homework) {
      await this.persistHomeworkDecision(principal, sessionId, policy.snapshotId, input.homework.assignmentId, input.homework.relationBasisPoints, homework);
    }
    await this.event(
      principal.institutionId,
      principal.studentId,
      'student',
      'policy_snapshot',
      policy.snapshotId,
      'session_policy_enforced',
      {
        syllabusDecision: syllabus.decision,
        homeworkMode: homework?.mode ?? 'not_applicable',
        finalAnswerAllowed: homework?.finalAnswerAllowed ?? true,
        contentIncluded: false,
      },
    );
    return { syllabus, homework };
  }

  listStudentHandoffs(principal: InstitutionalStudentPrincipal) {
    return this.repo.listStudentHandoffs(principal.institutionId, principal.studentId).then((rows) => rows.map(publicHandoff));
  }

  async createHandoff(principal: InstitutionalStudentPrincipal, input: PetrosTeacherHandoffCreateInput) {
    const policy = await this.resolveForStudentSession(principal, input.sessionId, input.subjectId);
    if (!policy.config.escalation.enabled) throw new BadRequestException({ code: 'PETROS_HANDOFF_DISABLED', message: 'Teacher handoff is not enabled under the current disclosed policy.' });
    if (!policy.config.visibility.teacher.categories.includes('teacher_handoff')) {
      throw new ForbiddenException({ code: 'PETROS_HANDOFF_VISIBILITY_DISABLED', message: 'The disclosed policy does not permit sharing a teacher handoff.' });
    }
    const [student, eligible] = await Promise.all([
      this.repo.studentPolicyFixture(principal.institutionId, principal.studentId),
      this.repo.handoffEligible(principal.institutionId, principal.studentId, input.sessionId, policy.config.escalation.offerAfterFailedRepairCount),
    ]);
    if (!student || student.classId !== input.classId) throw new ForbiddenException({ code: 'PETROS_HANDOFF_CLASS_OUT_OF_SCOPE', message: 'The handoff class does not match this learner.' });
    if (!eligible) throw new ConflictException({ code: 'PETROS_HANDOFF_NOT_YET_ELIGIBLE', message: 'A teacher handoff is offered only after the repair ladder is exhausted.' });
    const teacherId = await this.repo.teacherFor(principal.institutionId, input.classId, input.subjectId);
    if (!teacherId) throw new BadRequestException({ code: 'PETROS_HANDOFF_ROUTE_UNAVAILABLE', message: 'No assigned teacher is available for this class and subject.' });
    const enhanced = await this.generateTeacherSummary(principal, input.sessionId, input.summary);
    const row = await this.repo.createHandoff({
      institutionId: principal.institutionId,
      campusId: principal.campusId,
      studentId: principal.studentId,
      sessionId: input.sessionId,
      classId: input.classId,
      subjectId: input.subjectId,
      teacherId,
      policySnapshotId: policy.snapshotId,
      summary: enhanced.value,
      status: 'preview',
      idempotencyKey: input.idempotencyKey,
      functionKey: PETROS_INSTITUTIONAL_FUNCTIONS.teacherEscalation,
      validationPassed: enhanced.validationPassed,
      retryCount: enhanced.result?.retryCount ?? 0,
    });
    const resolved = row ?? (await this.repo.listStudentHandoffs(principal.institutionId, principal.studentId)).find((item) => item.idempotencyKey === input.idempotencyKey);
    if (!resolved) throw new Error('Teacher handoff could not be created.');
    await this.functionEvent(principal.institutionId, principal.studentId, 'handoff', resolved.id, 'teacher_handoff_previewed', input.idempotencyKey, enhanced);
    return publicHandoff(resolved);
  }

  async updateHandoff(principal: InstitutionalStudentPrincipal, id: string, input: PetrosTeacherHandoffUpdateInput) {
    const row = await this.repo.findStudentHandoff(principal.institutionId, principal.studentId, id);
    if (!row) throw notFound('PETROS_HANDOFF_NOT_FOUND');
    const policy = (await this.repo.findSessionSnapshot(principal.institutionId, principal.studentId, row.sessionId))?.resolvedPolicy;
    if (!policy) throw notFound('PETROS_POLICY_SNAPSHOT_NOT_FOUND');
    let patch: Partial<typeof row>;
    if (input.action === 'edit') {
      if (!policy.config.escalation.studentCanEdit) throw new ForbiddenException({ code: 'PETROS_HANDOFF_EDIT_DISABLED', message: 'Editing is unavailable under the disclosed policy.' });
      if (!['preview', 'consented'].includes(row.status)) throw invalidTransition();
      patch = { summary: sanitizeTeacherSummary(petrosTeacherHandoffDraftSchema.parse(input.summary)), status: 'preview', consentedAt: null };
    } else if (input.action === 'consent') {
      if (row.status !== 'preview') throw invalidTransition();
      patch = { status: 'consented', consentedAt: new Date() };
    } else if (input.action === 'deliver') {
      if (policy.config.escalation.requireConsent && row.status !== 'consented') throw new ConflictException({ code: 'PETROS_HANDOFF_CONSENT_REQUIRED', message: 'Review and consent to the summary before delivery.' });
      if (!['preview', 'consented'].includes(row.status)) throw invalidTransition();
      patch = { status: 'queued' };
    } else if (input.action === 'cancel' || input.action === 'withdraw') {
      if (!['preview', 'consented', 'queued'].includes(row.status)) throw invalidTransition();
      patch = { status: input.action === 'cancel' ? 'cancelled' : 'withdrawn', cancelledAt: new Date() };
    } else throw invalidTransition();
    const updated = await this.repo.updateStudentHandoff(principal.institutionId, principal.studentId, id, patch);
    if (!updated) throw notFound('PETROS_HANDOFF_NOT_FOUND');
    await this.event(principal.institutionId, principal.studentId, 'student', 'handoff', id, `teacher_handoff_${input.action}`, { status: updated.status }, input.idempotencyKey);
    return publicHandoff(updated);
  }

  async teacherInbox(ctx: PortalActionContext) {
    const teacherId = await this.requireTeacher(ctx.principal);
    const rows = await this.repo.listTeacherHandoffs(ctx.principal.institutionId, teacherId);
    for (const row of rows) await this.event(ctx.principal.institutionId, ctx.principal.institutionUserId, 'teacher', 'handoff', row.id, 'privileged_handoff_access', { purpose: 'Respond to a student-requested learning handoff', contentCategories: ['teacher_handoff'] });
    return rows.map(publicHandoff);
  }

  async readHandoff(ctx: PortalActionContext, id: string) {
    const teacherId = await this.requireTeacher(ctx.principal);
    const row = await this.repo.markHandoffRead(ctx.principal.institutionId, teacherId, id);
    if (!row) throw notFound('PETROS_HANDOFF_NOT_FOUND');
    await this.portalAudit(ctx, 'petros.handoff.read', id, { purpose: 'Teacher learning support', studentConsentRecorded: Boolean(row.consentedAt) });
    await this.event(ctx.principal.institutionId, ctx.principal.institutionUserId, 'teacher', 'handoff', id, 'teacher_handoff_read', { purpose: 'Teacher learning support' });
    return publicHandoff(row);
  }

  async teacherSignals(ctx: PortalActionContext) {
    this.requirePhase4Enabled();
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const teacherId = await this.requireTeacher(ctx.principal);
    const rows = await this.repo.listTeacherSignals(ctx.principal.institutionId, teacherId);
    const seen = new Set<string>();
    const latestRows = rows.filter((row) => {
      const key = `${row.classId}:${row.subjectId}:${row.conceptKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const versions = await this.ensurePolicy(ctx.principal.institutionId, SYSTEM_ACTOR);
    const visible = [];
    const liveByScope = new Map<string, { events: Array<{ eventId: string; conceptId: string; studentId: string; outcome: string; occurredAt: Date }>;
      eligibleCount: number; unavailable: boolean }>();
    for (const row of latestRows) {
      const fixture = await this.repo.classPolicyFixture(ctx.principal.institutionId, row.classId);
      if (!fixture) continue;
      const policy = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions, fixture: { ...fixture, subjectId: row.subjectId, studentId: null, language: 'en', accessibility: [] } });
      if (!policy.config.classSignals.enabled) continue;
      const key = `${row.classId}:${row.subjectId}`;
      let live = liveByScope.get(key);
      if (!live) {
        const windowStart = new Date(Date.now() - policy.config.classSignals.freshnessDays * 86_400_000);
        const authority = this.cohortEvidence ? await this.cohortEvidence.current(ctx.principal.institutionId, row.classId, row.subjectId, windowStart,
          (scope, sessionId) => this.documentKnowledgePolicy(scope, sessionId)) : null;
        live = { events: authority?.events ?? [], eligibleCount: await this.repo.classSubjectEligibleCount(ctx.principal.institutionId, row.classId, row.subjectId),
          unavailable: !authority?.authorityAvailable || Boolean(authority?.truncated) };
        liveByScope.set(key, live);
      }
      const conceptRows = live.events.filter((event) => event.conceptId === row.conceptKey);
      const currentAffected = conceptRows.filter((event) => event.outcome !== 'correct');
      const affectedLearners = new Set(currentAffected.map((event) => event.studentId)).size;
      const coveredLearners = new Set(conceptRows.map((event) => event.studentId)).size;
      const freshestCurrent = currentAffected.length ? Math.max(...currentAffected.map((event) => event.occurredAt.getTime())) : 0;
      const currentWindowStart = Date.now() - policy.config.classSignals.freshnessDays * 86_400_000;
      const currentSuppressed = live.unavailable || live.eligibleCount < policy.config.classSignals.minimumCohortSize ||
        affectedLearners < policy.config.classSignals.minimumCohortSize || currentAffected.length < policy.config.classSignals.minimumIndependentEvidence ||
        freshestCurrent < currentWindowStart || row.suppressed;
      visible.push({ ...row, currentSuppressed, currentThreshold: policy.config.classSignals.minimumCohortSize,
        currentEligibleCount: live.eligibleCount, currentEvidenceCoveredCount: coveredLearners,
        currentAffectedLearnerCount: affectedLearners, currentAttemptCount: conceptRows.length,
        currentSuccessCount: conceptRows.filter((event) => event.outcome === 'correct').length,
        currentFreshestAt: freshestCurrent ? new Date(freshestCurrent) : row.freshestAt });
    }
    const complementarySuppression = new Set(visible.filter((row) => row.currentSuppressed)
      .map((row) => `${row.classId}:${row.subjectId}`));
    for (const row of visible) if (complementarySuppression.has(`${row.classId}:${row.subjectId}`)) row.currentSuppressed = true;
    await this.portalAudit(ctx, 'petros.class_signals.view', teacherId, { signalCount: visible.length, hiddenByPolicy: latestRows.length - visible.length, learnerContentInspected: false });
    return visible.map((row) => ({
      id: row.id,
      classId: row.classId,
      subjectId: row.subjectId,
      concept: row.currentSuppressed || row.suppressed ? 'Suppressed until cohort threshold' : row.conceptKey,
      curriculumArea: row.curriculumArea,
      cohortSize: row.currentSuppressed || row.suppressed ? null : row.currentAffectedLearnerCount,
      affectedLearnerCount: row.currentSuppressed || row.suppressed ? null : row.currentAffectedLearnerCount,
      successfulAttemptCount: row.currentSuppressed || row.suppressed ? null : row.currentSuccessCount,
      eligibleCount: row.currentSuppressed || row.suppressed ? null : row.currentEligibleCount,
      evidenceCoveredCount: row.currentSuppressed || row.suppressed ? null : row.currentEvidenceCoveredCount,
      independentAttemptCount: row.currentSuppressed || row.suppressed ? null : row.currentAttemptCount,
      threshold: row.currentThreshold,
      evidenceCount: row.currentSuppressed || row.suppressed ? 0 : row.currentAttemptCount,
      uncertaintyBasisPoints: row.currentSuppressed || row.suppressed ? 10_000 : Math.max(1_000,10_000-Math.floor(row.currentEvidenceCoveredCount/Math.max(1,row.currentEligibleCount)*5_000)),
      freshness: row.currentSuppressed || row.suppressed
        ? (row.windowEnd ?? row.membershipAsOf ?? row.currentFreshestAt).toISOString()
        : row.currentFreshestAt.toISOString(),
      membershipAsOf: row.membershipAsOf?.toISOString() ?? null,
      evidenceWindow: row.windowStart && row.windowEnd ? { start: row.windowStart.toISOString(), end: row.windowEnd.toISOString() } : null,
      evidenceVersions: row.currentSuppressed || row.suppressed ? null : row.evidenceVersions,
      exclusions: row.currentSuppressed || row.suppressed ? null : row.exclusionCounts,
      suppressed: row.currentSuppressed || row.suppressed,
      suggestedNextStep: row.currentSuppressed || row.suppressed ? 'Current policy or roster requires suppression. Refresh after reviewing eligible membership and evidence coverage.' : row.suggestedNextStep,
      rankingIncluded: false,
      rawAnswersIncluded: false,
      learnerIdentifiersIncluded: false,
    }));
  }

  async refreshSignals(ctx: PortalActionContext, classId: string, subjectId: string) {
    this.requirePhase4Enabled();
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const teacherId = await this.requireTeacher(ctx.principal);
    const assigned = await this.repo.teacherFor(ctx.principal.institutionId, classId, subjectId);
    if (assigned !== teacherId) throw new ForbiddenException({ code: 'PETROS_CLASS_OUT_OF_SCOPE', message: 'This class and subject are not assigned to you.' });
    const classFixture = await this.repo.classPolicyFixture(ctx.principal.institutionId, classId);
    if (!classFixture) throw notFound('PETROS_CLASS_NOT_FOUND');
    const versions = await this.ensurePolicy(ctx.principal.institutionId, SYSTEM_ACTOR);
    const policy = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions, fixture: { ...classFixture, subjectId, studentId: null, language: 'en', accessibility: [] } });
    if (!policy.config.classSignals.enabled) {
      await this.portalAudit(ctx, 'petros.class_signals.refresh', classId, { subjectId, signals: 0, disabledByPolicy: true, learnerContentInspected: false });
      return [];
    }
    const since = new Date(Date.now() - policy.config.classSignals.freshnessDays * 86_400_000);
    if (!this.cohortEvidence) {
      await this.portalAudit(ctx, 'petros.class_signals.refresh', classId, { subjectId, signals: 0, authorityUnavailable: true, learnerContentInspected: false });
      return [];
    }
    const authority = await this.cohortEvidence.current(ctx.principal.institutionId, classId, subjectId, since,
      (scope, sessionId) => this.documentKnowledgePolicy(scope, sessionId));
    if (!authority.authorityAvailable || authority.truncated) {
      await this.portalAudit(ctx, 'petros.class_signals.refresh', classId, { subjectId, signals: 0,
        authorityUnavailable: !authority.authorityAvailable, evidenceWindowTruncated: authority.truncated, learnerContentInspected: false });
      return [];
    }
    const eligibleCount = await this.repo.classSubjectEligibleCount(ctx.principal.institutionId, classId, subjectId);
    const groups = new Map<string, typeof authority.events>();
    for (const row of authority.events) groups.set(row.conceptId, [...(groups.get(row.conceptId) ?? []), row]);
    const output = [];
    for (const [concept, rawRows] of groups) {
      // One learner/objective/pack attempt contributes at most once to a concept.
      const distinct = new Map<string, (typeof rawRows)[number]>();
      for (const row of rawRows) distinct.set(row.eventId, row);
      const rows = [...distinct.values()];
      if (!rows.length) continue;
      const covered = new Set(rows.map((row) => row.studentId)).size;
      const affectedRows = rows.filter((row) => row.outcome !== 'correct');
      if (!affectedRows.length) continue;
      const affectedLearnerCount = new Set(affectedRows.map((row) => row.studentId)).size;
      const successfulAttemptCount = rows.filter((row) => row.outcome === 'correct').length;
      const evidenceVersions = {
        evaluator: [...new Set(rows.map((row) => row.evaluatorVersion))].sort(),
        rubric: [...new Set(rows.map((row) => row.rubricVersion))].sort(),
        source: [...new Set(rows.map((row) => row.sourceVersion))].sort(),
        policy: [...new Set(rows.map((row) => row.policyVersion))].sort(),
        objective: [...new Set(rows.map((row) => `${row.objectiveId}@${row.objectiveVersion}`))].sort(),
        pack: [...new Set(rows.map((row) => `${row.packId}@${row.packVersion}`))].sort(),
      };
      const signal = buildClassSignal({
        concept,
        curriculumArea: subjectId,
        learnerHashes: affectedRows.map((row) => stablePolicyHash(`${ctx.principal.institutionId}:${row.studentId}`)),
        evidenceCount: affectedRows.length,
        uncertaintyBasisPoints: Math.max(1_000, Math.min(10_000, 10_000 - Math.floor(covered / Math.max(1, eligibleCount) * 5_000))),
        freshestAt: new Date(Math.max(...affectedRows.map((row) => row.occurredAt.getTime()))).toISOString(),
        suggestedNextStep: `Review question wording, source material and accessibility for ${concept}; these task-difficulty signals do not establish a specific misconception. Then consider one worked contrast and a short independent check.`,
        policy,
      });
      const stored = await this.repo.upsertClassSignal({
        institutionId: ctx.principal.institutionId,
        campusId: classFixture.campusId,
        classId,
        subjectId,
        conceptKey: concept,
        curriculumArea: subjectId,
        sourceHash: stablePolicyHash(rows.map((row) => [row.studentId, row.objectiveId, row.objectiveVersion, row.packId, row.packVersion, row.occurredAt.toISOString(), row.outcome, evidenceVersions, eligibleCount])),
        cohortSize: signal.cohortSize,
        threshold: signal.threshold,
        evidenceCount: signal.evidenceCount,
        eligibleCount,
        evidenceCoveredCount: covered,
        independentAttemptCount: rows.length,
        affectedLearnerCount,
        successfulAttemptCount,
        exclusionCounts: authority.exclusionCounts,
        membershipAsOf: new Date(),
        windowStart: since,
        windowEnd: new Date(),
        evidenceVersions,
        uncertaintyBasisPoints: signal.uncertaintyBasisPoints,
        freshestAt: new Date(signal.freshness),
        suppressed: signal.suppressed,
        suggestedNextStep: signal.suggestedNextStep,
        algorithmVersion: CLASS_SIGNAL_ALGORITHM,
      });
      output.push({ id: stored?.id ?? null, classId, subjectId, ...signal });
    }
    await this.portalAudit(ctx, 'petros.class_signals.refresh', classId, { subjectId, signals: output.length, suppressed: output.filter((row) => row.suppressed).length, learnerContentInspected: false });
    return output;
  }

  async phase4TeacherCapabilities(ctx: PortalActionContext) {
    await this.requireTeacher(ctx.principal);
    return { enabled: this.env?.PETROS_CONTINUITY_ENABLED === true };
  }

  async listInterventions(ctx: PortalActionContext, classId: string, subjectId: string) {
    this.requirePhase4Enabled();
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const teacherId = await this.requireTeacher(ctx.principal);
    if (await this.repo.teacherFor(ctx.principal.institutionId, classId, subjectId) !== teacherId) {
      throw new ForbiddenException({ code: 'PETROS_CLASS_OUT_OF_SCOPE' });
    }
    const items = [];
    for (const row of await this.repo.listInterventions(ctx.principal.institutionId, classId, subjectId)) {
      if (['preview', 'approved'].includes(row.status) && row.expiresAt <= new Date()) {
        items.push(await this.reviewIntervention(ctx, row.id, { expectedVersion: row.version, reason: 'Expired at the current server time.' }, 'cancel'));
      } else items.push(row);
    }
    return { items };
  }

  async previewIntervention(ctx: PortalActionContext, input: PetrosInterventionPreviewInput) {
    this.requirePhase4Enabled();
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const teacherId = await this.requireTeacher(ctx.principal);
    if (await this.repo.teacherFor(ctx.principal.institutionId, input.classId, input.subjectId) !== teacherId) {
      throw new ForbiddenException({ code: 'PETROS_CLASS_OUT_OF_SCOPE' });
    }
    const fixture = await this.repo.classPolicyFixture(ctx.principal.institutionId, input.classId);
    if (!fixture) throw notFound('PETROS_CLASS_NOT_FOUND');
    const versions = await this.ensurePolicy(ctx.principal.institutionId, SYSTEM_ACTOR);
    const policy = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions,
      fixture: { ...fixture, subjectId: input.subjectId, studentId: null, language: 'en', accessibility: [] } });
    if (!policy.config.classSignals.enabled) throw new ForbiddenException({ code: 'PETROS_INTERVENTION_DISABLED_BY_POLICY' });
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const prior = await this.repo.interventionByCommand(ctx.principal.institutionId, input.commandId);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ConflictException({ code: 'PETROS_INTERVENTION_COMMAND_REUSED' });
      return prior;
    }
    if (!this.assignments) throw new Error('AssignmentsService is unavailable for intervention preview.');
    const targets=await this.interventionTargets(ctx,input.classId,input.subjectId,versions);
    const audience = await this.assignments.previewAudience(ctx, { targets });
    const id = randomUUID();
    const audiencePreview = { classId: input.classId, subjectId: input.subjectId, candidateCount: audience.studentCount,
      suppressed: audience.studentCount < policy.config.classSignals.minimumCohortSize,
      membershipBasis: 'current_enrolled_roster_at_preview', learnerIdsIncluded: false,
      delivery: 'preview_only', recipientOwner: 'portal_assignments_and_audience' };
    const result=await this.repo.createIntervention({ id, institutionId: ctx.principal.institutionId, classId: input.classId,
      subjectId: input.subjectId, createdBy: ctx.principal.institutionUserId, title: input.title, description: input.description,
      conceptKey: input.conceptKey, expiresAt: new Date(input.expiresAt), commandId: input.commandId,
      audiencePreview, requestHash, status: 'preview', deliveryStatus: 'preview', version: 1 });
    await this.portalAudit(ctx,'petros.intervention.preview',id,{candidateCount:audience.studentCount,version:1,externalDelivery:false});return result;
  }

  async reviewIntervention(ctx: PortalActionContext, id: string, input: PetrosInterventionActionInput, action: 'approve' | 'cancel') {
    this.requirePhase4Enabled();
    await this.repo.lockKnowledgeAuthority(ctx.principal.institutionId);
    const teacherId = await this.requireTeacher(ctx.principal);
    const row = await this.repo.intervention(ctx.principal.institutionId, id);
    if (!row) throw notFound('PETROS_INTERVENTION_NOT_FOUND');
    if(await this.repo.teacherFor(row.institutionId,row.classId,row.subjectId)!==teacherId)throw new ForbiddenException({code:'PETROS_CLASS_OUT_OF_SCOPE'});
    const terminalReplay = (action === 'approve' && row.status === 'approved') || (action === 'cancel' && row.status === 'cancelled');
    if (!terminalReplay && row.version !== input.expectedVersion) throw new ConflictException({ code: 'PETROS_INTERVENTION_VERSION_CONFLICT' });
    if (row.status === 'expired') return row;
    if (row.expiresAt <= new Date()) {
      if (row.assignmentId && this.assignments) {
        const assignment = await this.assignments.getFull(ctx, row.assignmentId);
        if (assignment.status === 'published') await this.assignments.update(ctx, assignment.id, { version: assignment.version, status: 'closed' });
      }
      const result=await this.repo.updateIntervention(row.institutionId, row.id, row.version, { status: 'expired', deliveryStatus: 'expired' });
      await this.portalAudit(ctx,'petros.intervention.expire',row.id,{version:result!.version,externalDelivery:false});return result;
    }
    if ((action === 'approve' && row.status === 'approved') || (action === 'cancel' && row.status === 'cancelled')) {if(row.reason!==input.reason)throw new ConflictException({code:'PETROS_INTERVENTION_REPLAY_CONFLICT'});if(row.assignmentId&&this.assignments)await this.assignments.getFull(ctx,row.assignmentId);return row;}
    if (action === 'cancel') {
      if (!['preview', 'approved'].includes(row.status)) throw new ConflictException({ code: 'PETROS_INTERVENTION_NOT_CANCELLABLE' });
      if (row.assignmentId && this.assignments) {
        const assignment = await this.assignments.getFull(ctx, row.assignmentId);
        if (assignment.status === 'published') await this.assignments.update(ctx, assignment.id, { version: assignment.version, status: 'closed' });
      }
      const result=await this.repo.updateIntervention(row.institutionId, row.id, row.version, { status: 'cancelled', deliveryStatus: 'cancelled', reason: input.reason, cancelledAt: new Date() });
      await this.portalAudit(ctx,'petros.intervention.cancel',row.id,{version:result!.version,externalDelivery:false});return result;
    }
    if (row.status !== 'preview') throw new ConflictException({ code: 'PETROS_INTERVENTION_NOT_REVIEWABLE' });
    if (row.createdBy === ctx.principal.institutionUserId) throw new ForbiddenException({ code: 'PETROS_INTERVENTION_AUTHOR_CANNOT_APPROVE' });
    if (await this.repo.teacherFor(row.institutionId, row.classId, row.subjectId) !== teacherId) throw new ForbiddenException({ code: 'PETROS_CLASS_OUT_OF_SCOPE' });
    const fixture = await this.repo.classPolicyFixture(row.institutionId, row.classId);
    if (!fixture) throw notFound('PETROS_CLASS_NOT_FOUND');
    const versions = await this.ensurePolicy(row.institutionId, SYSTEM_ACTOR);
    const policy = resolveInstitutionPolicy({ institutionId: row.institutionId, versions,
      fixture: { ...fixture, subjectId: row.subjectId, studentId: null, language: 'en', accessibility: [] } });
    if (!policy.config.classSignals.enabled) throw new ForbiddenException({ code: 'PETROS_INTERVENTION_DISABLED_BY_POLICY' });
    if (!this.assignments) throw new Error('AssignmentsService is unavailable for intervention approval.');
    const targets=await this.interventionTargets(ctx,row.classId,row.subjectId,versions);
    const currentAudience = await this.assignments.previewAudience(ctx, { targets });
    if (currentAudience.studentCount < policy.config.classSignals.minimumCohortSize) {
      throw new ConflictException({ code: 'PETROS_INTERVENTION_AUDIENCE_SUPPRESSED' });
    }
    const draft = await this.assignments.create(ctx, createAssignmentSchema.parse({
      title: row.title, classId: row.classId, subjectId: row.subjectId, instructions: row.description,
      dueDate: row.expiresAt.toISOString().slice(0, 10), maxPoints: 1, status: 'draft',
      audience: targets, deliveryMode: 'file',
    }));
    const assignment = await this.assignments.update(ctx, draft.id, { version: draft.version, status: 'published' });
    const receiptCount = await this.repo.assignmentRecipientCount(ctx.principal.institutionId, assignment.id);
    const result=await this.repo.updateIntervention(row.institutionId, row.id, row.version, { status: 'approved', approvedBy: ctx.principal.institutionUserId,
      approvedAt: new Date(), reason: input.reason, assignmentId: assignment.id, deliveryStatus: 'published',
      audiencePreview: { classId: row.classId, subjectId: row.subjectId, candidateCount: currentAudience.studentCount,
        suppressed: false, membershipBasis: 'assignment_audience_rechecked_at_approval', learnerIdsIncluded: false,
        assignmentId: assignment.id, assignmentVersion: assignment.version, assigneeReceiptCount: receiptCount, externalDelivery: false, accommodations:'current student policy and canonical assignment rules' } });
    await this.portalAudit(ctx,'petros.intervention.approve',row.id,{version:result!.version,assignmentId:assignment.id,recipientCount:receiptCount,externalDelivery:false});return result;
  }

  private async interventionTargets(ctx:PortalActionContext,classId:string,subjectId:string,versions:PolicyVersionRecord[]){
    const targets: {kind:'student';refId:string}[]=[];
    for(const learner of await this.repo.currentClassLearnerIds(ctx.principal.institutionId,classId)){
      const fixture=await this.repo.studentPolicyFixture(ctx.principal.institutionId,learner.id);if(!fixture)continue;
      const policy=resolveInstitutionPolicy({institutionId:ctx.principal.institutionId,versions,fixture:{campusId:fixture.campusId??null,gradeId:fixture.gradeId??null,programmeId:fixture.programmeId??null,subjectId,studentId:learner.id,language:'en',accessibility:[]}});
      if(policy.config.classSignals.enabled)targets.push({kind:'student',refId:learner.id});
    }return targets;
  }
  private requirePhase4Enabled() {
    if (this.env?.PETROS_CONTINUITY_ENABLED !== true) {
      throw new ForbiddenException({ code: 'PETROS_PHASE4_DISABLED', message: 'Institutional continuity actions are disabled.' });
    }
  }

  private assertPetrosGuardianOutputDisabled(): never {
    throw new ForbiddenException({ code: 'PETROS_GUARDIAN_OUTPUT_DISABLED',
      message: 'Petros guardian summaries are unavailable until guardian relationship and current-policy authority are verified.' });
  }

  async parentPreferences(guardian: GuardianContext, input: PetrosParentDigestPreferenceInput) {
    void guardian; void input;
    this.assertPetrosGuardianOutputDisabled();
  }

  async parentPreference(guardian: GuardianContext, studentId: string) {
    void guardian; void studentId;
    this.assertPetrosGuardianOutputDisabled();
  }

  async parentDigestHistory(guardian: GuardianContext, studentId: string) {
    void guardian; void studentId;
    this.assertPetrosGuardianOutputDisabled();
  }

  async parentDigestCommand(guardian: GuardianContext, raw: PetrosParentDigestCommandInput) {
    void guardian; void raw;
    this.assertPetrosGuardianOutputDisabled();
  }

  async processJobs(now = new Date()) {
    const handoffs = await this.repo.queuedHandoffs();
    let handoffsDelivered = 0;
    const digestsDelivered = 0;
    const digestsFailed = 0;
    const digestsExhausted = 0;
    for (const { handoff, snapshot } of handoffs) {
      const delay = snapshot.resolvedPolicy.config.escalation.cancellationMinutes * 60_000;
      if (handoff.updatedAt.getTime() + delay > now.getTime()) continue;
      await this.repo.updateStudentHandoff(handoff.institutionId, handoff.studentId, handoff.id, { status: 'delivered', deliveredAt: now });
      await this.event(handoff.institutionId, SYSTEM_ACTOR, 'job', 'handoff', handoff.id, 'teacher_handoff_delivered', { attempt: handoff.retryCount + 1 });
      handoffsDelivered += 1;
    }
    // Existing Petros digest rows are retained for historical review, but this Phase4 owner does
    // not deliver or retry any guardian output until relationship authority is closed.
    return { handoffsDelivered, digestsDelivered, digestsFailed, digestsExhausted, idempotent: true };
  }

  async dashboard(query: PetrosInstitutionalDashboardQuery, ctx: ActionContext) {
    const data = await this.repo.dashboard(query);
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'petros.institutional.dashboard.view',
      module: 'petros',
      entityType: 'petros_institutional_aggregate',
      entityId: query.institutionId ?? 'platform',
      newState: { filters: query, contentInspected: false },
    } as Parameters<AuditWriter['logAudit']>[0]);
    const functionMetrics = Object.values(PETROS_INSTITUTIONAL_FUNCTIONS).map((functionKey) => {
      const rows = data.events.filter((row) => row.functionKey === functionKey);
      return {
        functionKey,
        calls: rows.length,
        validationFailures: rows.filter((row) => !row.validationPassed).length,
        retries: rows.reduce((sum, row) => sum + row.retryCount, 0),
        fallbacks: rows.filter((row) => row.fallbackTier != null).length,
        averageLatencyMs: average(rows.map((row) => row.durationMs ?? 0)),
        estimatedCostMicros: rows.reduce((sum, row) => sum + row.estimatedCostMicros, 0),
        actualCostMicros: rows.reduce((sum, row) => sum + (row.actualCostMicros ?? 0), 0),
      };
    });
    const latestPolicies = new Map<string, typeof data.policies[number]>();
    for (const row of data.policies) if (!latestPolicies.has(scopeKey(row))) latestPolicies.set(scopeKey(row), row);
    return {
      privacy: 'aggregate_only',
      contentExposed: false,
      policy: {
        totalVersions: data.policies.length,
        drafts: data.policies.filter((row) => row.status === 'draft').length,
        scheduled: data.policies.filter((row) => row.status === 'scheduled').length,
        activeScopes: [...latestPolicies.values()].filter((row) => ['published', 'scheduled'].includes(row.status)).length,
      },
      disclosure: {
        sessionSnapshots: data.snapshots.length,
        driftDetected: data.snapshots.filter((row) => !row.stableForSession || stablePolicyHash(row.resolvedPolicy.disclosure) === '').length,
        stableMidSession: data.snapshots.filter((row) => row.stableForSession).length,
      },
      handoffs: counts(data.handoffs.map((row) => row.status)),
      classSignals: { shown: data.signals.filter((row) => !row.suppressed).length, suppressed: data.signals.filter((row) => row.suppressed).length },
      digests: { ...counts(data.digests.map((row) => row.status)), retries: data.digests.reduce((sum, row) => sum + Math.max(0, row.attemptCount - 1), 0) },
      functions: functionMetrics,
      releaseGate: petrosInstitutionalReleaseGateSchema.parse({
        stage9PhysicalDeviceAcceptancePassed: false,
        stage10HumanRepeatUsePassed: false,
        stage11HumanReflectionAcceptancePassed: false,
        stage12CrossRoleHumanAcceptancePassed: false,
        voiceRequired: false,
        productionReady: false,
      }),
    };
  }

  async exportStudent(principal: InstitutionalStudentPrincipal) {
    const data = await this.repo.exportStudent(principal.institutionId, principal.studentId);
    return { exportedAt: new Date().toISOString(), policyConfigurationExcluded: true, providerDetailsExcluded: true, data };
  }

  async deleteStudentDerived(principal: InstitutionalStudentPrincipal) {
    await this.repo.deleteStudentDerived(principal.institutionId, principal.studentId);
    return { deleted: true, sourceLearnerEvidenceDeleted: false, institutionPolicyDeleted: false, legalHoldRespectedBySourceSystems: true };
  }

  private async ensurePolicy(institutionId: string, authorId: string): Promise<PolicyVersionRecord[]> {
    let rows = await this.repo.listPolicies(institutionId);
    const now = new Date();
    const hasEffectiveInstitutionBaseline = rows.some((row) => row.scopeLevel === 'institution'
      && ['published', 'scheduled', 'superseded'].includes(row.status)
      && (!row.effectiveFrom || row.effectiveFrom <= now)
      && (!row.effectiveUntil || row.effectiveUntil > now));
    if (!hasEffectiveInstitutionBaseline) {
      await this.repo.createPolicy({
        institutionId,
        campusId: null,
        programmeId: null,
        gradeId: null,
        subjectId: null,
        scopeLevel: 'institution',
        version: Math.max(0, ...rows.map((row) => row.version)) + 1,
        status: 'published',
        schemaVersion: PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
        config: defaultInstitutionPolicy(),
        reason: 'Platform-safe minimum-access institutional baseline.',
        authorId,
        effectiveFrom: new Date(0),
        publishedAt: new Date(),
      });
      rows = await this.repo.listPolicies(institutionId);
    }
    return rows.map((row) => ({ ...row, scopeLevel: row.scopeLevel as PolicyVersionRecord['scopeLevel'] }));
  }

  private async requireTeacher(principal: InstitutionPrincipal) {
    const teacherId = await this.repo.staffForUser(principal.institutionId, principal.institutionUserId);
    if (!teacherId) throw new ForbiddenException({ code: 'PETROS_TEACHER_SCOPE_REQUIRED', message: 'A linked teaching-staff profile is required.' });
    return teacherId;
  }

  private assertPolicyScope(principal: InstitutionPrincipal, scope: { level: string; campusId: string | null; programmeId?: string | null; gradeId?: string | null; subjectId?: string | null }) {
    if (scope.level === 'institution' && !principal.isInstitutionWide) throw new ForbiddenException({ code: 'PETROS_POLICY_SCOPE_FORBIDDEN', message: 'Institution-wide policy requires institution-wide access.' });
    if (scope.campusId && !principal.isInstitutionWide && !principal.allowedCampusIds.includes(scope.campusId)) throw new ForbiddenException({ code: 'PETROS_POLICY_SCOPE_FORBIDDEN', message: 'That campus is outside your assigned scope.' });
  }

  private async validatePolicyScope(institutionId: string, scope: { campusId?: string | null; programmeId?: string | null; gradeId?: string | null; subjectId?: string | null }) {
    const exists = await this.repo.policyScopeEntitiesExist(institutionId, scope);
    const missing = Object.entries(exists).find(([, present]) => !present)?.[0];
    if (missing) throw new BadRequestException({ code: 'PETROS_POLICY_SCOPE_INVALID', message: `The selected ${missing} is unavailable in this institution.` });
  }

  private async assertFixtureScope(principal: InstitutionPrincipal, fixture: PetrosPolicyFixture) {
    await this.validatePolicyScope(principal.institutionId, fixture);
    if (fixture.campusId && !principal.isInstitutionWide && !principal.allowedCampusIds.includes(fixture.campusId)) {
      throw new ForbiddenException({ code: 'PETROS_POLICY_SCOPE_FORBIDDEN', message: 'That fixture campus is outside your assigned scope.' });
    }
    if (fixture.studentId) {
      const student = await this.repo.studentPolicyFixture(principal.institutionId, fixture.studentId);
      if (!student) throw notFound('PETROS_STUDENT_NOT_FOUND');
      if (!principal.isInstitutionWide && student.campusId && !principal.allowedCampusIds.includes(student.campusId)) {
        throw new ForbiddenException({ code: 'PETROS_POLICY_SCOPE_FORBIDDEN', message: 'That fixture student is outside your assigned scope.' });
      }
      const mismatched = (fixture.campusId && student.campusId !== fixture.campusId)
        || (fixture.programmeId && student.programmeId !== fixture.programmeId)
        || (fixture.gradeId && student.gradeId !== fixture.gradeId);
      if (mismatched) throw new BadRequestException({ code: 'PETROS_POLICY_FIXTURE_MISMATCH', message: 'The fixture identifiers do not describe the selected student.' });
    }
  }

  private async generateTeacherSummary(principal: InstitutionalStudentPrincipal, sessionId: string, summary: PetrosTeacherHandoffCreateInput['summary']) {
    const fallback = sanitizeTeacherSummary(petrosTeacherHandoffDraftSchema.parse(summary));
    const started = Date.now();
    try {
      const result = await this.gateway.execute({
        context: { functionKey: PETROS_INSTITUTIONAL_FUNCTIONS.teacherEscalation, topic: summary.concept, sessionType: 'repair', inputModality: 'text', language: 'en', institutionId: principal.institutionId, studentId: principal.studentId, estimatedTokens: 700, currentCostMicros: 0, previousFailures: 0, requiredReasoningQuality: 0.6 },
        system: 'Return only the supplied evidence-grounded teacher handoff fields. Be concise and useful. Never include provider/model details, chain-of-thought, private notes, unrelated history, raw voice/images, or unsaved artifacts.',
        input: [{ type: 'text', text: JSON.stringify(fallback) }],
        responseSchema: zodToJsonSchema(petrosTeacherHandoffDraftSchema, { $refStrategy: 'none' }) as Record<string, unknown>,
        sessionId,
        metadata: { studentPreviewRequired: true, rawPrivateContentIncluded: false },
      });
      return { value: sanitizeTeacherSummary(petrosTeacherHandoffDraftSchema.parse(result.content)), result, validationPassed: true, durationMs: Date.now() - started };
    } catch (error) {
      return { value: fallback, result: null, validationPassed: !isValidationError(error), durationMs: Date.now() - started, errorCode: providerNeutral(error) };
    }
  }

  private async portalAudit(ctx: PortalActionContext, action: string, id: string, state: Record<string, unknown>) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: 'petros', entityType: 'petros_institutional', entityId: id, newState: state } as Parameters<AuditWriter['logAudit']>[0]);
  }

  private async persistHomeworkDecision(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    snapshotId: string,
    assignmentId: string,
    relationBasisPoints: number,
    decision: ReturnType<typeof decideHomework>,
  ) {
    await this.repo.lockKnowledgeAuthority(principal.institutionId);
    return this.repo.upsertHomeworkMatch({
      institutionId: principal.institutionId,
      studentId: principal.studentId,
      sessionId,
      assignmentId,
      snapshotId,
      relationBasisPoints,
      related: decision.related,
      active: decision.active,
      reasonCode: decision.reasonCode,
    });
  }

  private functionEvent(institutionId: string, studentId: string, entityType: string, entityId: string, type: string, idempotencyKey: string, derivation: { result: PetrosAiExecuteResult | null; validationPassed: boolean; durationMs: number; errorCode?: string }) {
    return this.repo.recordEvent({ institutionId, actorId: studentId, actorKind: 'student_or_guardian', studentId, entityType, entityId, type, functionKey: entityType === 'handoff' ? PETROS_INSTITUTIONAL_FUNCTIONS.teacherEscalation : PETROS_INSTITUTIONAL_FUNCTIONS.parentDigest, durationMs: derivation.durationMs, retryCount: derivation.result?.retryCount ?? 0, fallbackTier: derivation.result?.fallbackTier, estimatedCostMicros: derivation.result?.estimatedCostMicros ?? 0, actualCostMicros: derivation.result?.estimatedCostMicros, validationPassed: derivation.validationPassed, errorCode: derivation.errorCode, idempotencyKey, payload: { rawContentStored: false } });
  }

  private event(institutionId: string, actorId: string, actorKind: string, entityType: string, entityId: string, type: string, payload: Record<string, unknown>, idempotencyKey: string = randomUUID()) {
    return this.repo.recordEvent({ institutionId, actorId, actorKind, studentId: actorKind === 'student' ? actorId : null, entityType, entityId, type, idempotencyKey, payload });
  }
}

export function deterministicDigest(input: PetrosParentDigestCommandInput, evidence: Array<{ conceptId: string; outcome: string; errorCategory: string; occurredAt: Date }>, policy: PetrosResolvedPolicy) {
  const concepts = [...new Set(evidence.map((row) => row.conceptId))].slice(0, 6);
  const completed = evidence.filter((row) => row.outcome === 'correct').length;
  const hindi = input.language.toLowerCase().startsWith('hi');
  const headings = hindi ? {
    work_completed: 'पूरा किया गया अभ्यास', concepts_building: 'बनती हुई अवधारणाएँ', support_ideas: 'सहायता के सुझाव', upcoming_review: 'आगामी पुनरावृत्ति', effort_and_strategy: 'प्रयास और रणनीति',
  } : null;
  const sections = policy.config.digest.permittedSections.map((key) => ({
    key,
    heading: headings?.[key] ?? key.replaceAll('_', ' '),
    body: hindi
      ? key === 'work_completed' ? `${evidence.length} जाँचे गए सीखने के क्षण दर्ज हुए; ${completed} में सफल परिणाम दिखा।`
        : key === 'concepts_building' ? (concepts.length ? `अभी इन अवधारणाओं पर काम हो रहा है: ${concepts.join(', ')}।` : 'अभी किसी अवधारणा का नाम लेने के लिए पर्याप्त जाँचे गए प्रमाण नहीं हैं।')
          : key === 'support_ideas' ? 'पूछें कि कौन-सा कदम सबसे कठिन लगा, फिर विद्यार्थी को एक कदम अपने शब्दों में समझाने दें।'
            : key === 'upcoming_review' ? 'अगले जाँचे गए कार्य से पहले वर्तमान अवधारणाओं की छोटी पुनरावृत्ति उपयोगी होगी।'
              : 'यह सार पूरा किया गया काम और रणनीति दर्ज करता है, स्थायी क्षमता का निर्णय नहीं।'
      : key === 'work_completed' ? `${evidence.length} checked learning moments were recorded; ${completed} showed a successful outcome.`
        : key === 'concepts_building' ? (concepts.length ? `Current work includes ${concepts.join(', ')}.` : 'There is not enough checked evidence to name a concept yet.')
          : key === 'support_ideas' ? 'Ask what step felt hardest, then invite the learner to explain one step in their own words.'
            : key === 'upcoming_review' ? 'A short review of the current concepts would be useful before the next checked task.'
              : 'The digest records completed work and strategy; it never makes a fixed judgment about the learner.',
  }));
  return parentDigestContentSchema.parse({
    sourcePeriod: { start: input.periodStart, end: input.periodEnd },
    language: input.language,
    uncertainty: hindi
      ? evidence.length < 3 ? 'इस अवधि के लिए सीमित जाँचे गए प्रमाण उपलब्ध हैं।' : 'यह जाँचे गए प्रमाणों का सीमित सार है, सीखने की पूरी तस्वीर नहीं।'
      : evidence.length < 3 ? 'Limited checked evidence is available for this period.' : 'This is a bounded summary of checked evidence, not a complete view of learning.',
    sections,
    privacyNotice: hindi
      ? 'कच्ची सत्र सामग्री, निजी प्रश्न, कैलिब्रेशन निर्णय, केवल-शिक्षक नोट, आवाज़, चित्र और क्षमता लेबल शामिल नहीं हैं।'
      : 'Raw session content, private questions, calibration judgments, teacher-only notes, voice, images and ability labels are excluded.',
  });
}

function serializePolicy(row: any) {
  return petrosPolicyVersionSchema.parse({
    id: row.id,
    institutionId: row.institutionId,
    scope: policyScope(row),
    version: row.version,
    status: row.status,
    schemaVersion: row.schemaVersion,
    config: row.config,
    reason: row.reason,
    authorId: row.authorId,
    effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
    effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
    supersedesId: row.supersedesId ?? null,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  });
}

function policyScope(row: any) {
  return { level: row.scopeLevel, campusId: row.campusId ?? null, programmeId: row.programmeId ?? null, gradeId: row.gradeId ?? null, subjectId: row.subjectId ?? null };
}

function sameScope(row: PolicyVersionRecord, scope: PetrosPolicyDraftInput['scope']) {
  return row.scopeLevel === scope.level && row.campusId === scope.campusId && row.programmeId === scope.programmeId && row.gradeId === scope.gradeId && row.subjectId === scope.subjectId;
}

function publicHandoff(row: any) {
  return { id: row.id, sessionId: row.sessionId, classId: row.classId, subjectId: row.subjectId, summary: row.summary, status: row.status, consentedAt: row.consentedAt?.toISOString() ?? null, deliveredAt: row.deliveredAt?.toISOString() ?? null, readAt: row.readAt?.toISOString() ?? null, cancelledAt: row.cancelledAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), providerDetailsExcluded: true, privateContentExcluded: true };
}

export function publicDigest(row: any) {
  return { id: row.id, studentId: row.studentId, sourcePeriod: { start: row.periodStart.toISOString(), end: row.periodEnd.toISOString() }, language: row.language, content: row.content, status: row.status, deliveryChannels: row.deliveryChannels, attemptCount: row.attemptCount, maxRetryCount: row.maxRetryCount, nextRetryAt: row.nextRetryAt?.toISOString() ?? null, deliveredAt: row.deliveredAt?.toISOString() ?? null, errorCode: row.errorCode, createdAt: row.createdAt.toISOString(), rawContentExcluded: true };
}

function scopeKey(row: any) {
  return [row.institutionId, row.scopeLevel, row.campusId, row.programmeId, row.gradeId, row.subjectId].join(':');
}

function counts(values: string[]) { return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {}); }
function average(values: number[]) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
function isValidationError(error: unknown) { return error instanceof z.ZodError || (error instanceof Error && /validation|schema/i.test(error.message)); }
function providerNeutral(error: unknown) { return isValidationError(error) ? 'PETROS_STRUCTURED_VALIDATION_FAILED' : 'PETROS_AI_UNAVAILABLE'; }
function notFound(code: string) { return new NotFoundException({ code, message: 'This item is unavailable or you do not have access to it.' }); }
function invalidTransition() { return new ConflictException({ code: 'PETROS_INVALID_STATE_TRANSITION', message: 'That action is not available in the current state.' }); }
