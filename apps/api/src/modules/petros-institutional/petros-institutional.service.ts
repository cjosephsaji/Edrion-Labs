import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import type { InstitutionPrincipal } from '@edrion/auth';
import {
  PETROS_INSTITUTIONAL_FUNCTIONS,
  PETROS_INSTITUTIONAL_POLICY_SCHEMA_VERSION,
  petrosInstitutionalReleaseGateSchema,
  petrosParentDigestCommandSchema,
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
} from '@edrion/schemas';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { PetrosAiGatewayService, type PetrosAiExecuteResult } from '../petros-ai-routing/petros-ai-gateway.service';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import type { GuardianContext } from '../parent-portal/guardian-context';
import { assertWard } from '../parent-portal/guardian-scope.guard';
import type { InstitutionalStudentPrincipal } from '../student/student.types';
import {
  buildClassSignal,
  decideHomework,
  decideSyllabus,
  defaultInstitutionPolicy,
  resolveInstitutionPolicy,
  sanitizeParentDigest,
  sanitizeTeacherSummary,
  stablePolicyHash,
  type PolicyVersionRecord,
} from './petros-institutional.engine';
import { PetrosInstitutionalRepository } from './petros-institutional.repository';

const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000000';
const CLASS_SIGNAL_ALGORITHM = 'petros.institutional.class-signals.v1';

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
    const teacherId = await this.requireTeacher(ctx.principal);
    const rows = await this.repo.listTeacherSignals(ctx.principal.institutionId, teacherId);
    const versions = await this.ensurePolicy(ctx.principal.institutionId, SYSTEM_ACTOR);
    const visible = [];
    for (const row of rows) {
      const fixture = await this.repo.classPolicyFixture(ctx.principal.institutionId, row.classId);
      if (!fixture) continue;
      const policy = resolveInstitutionPolicy({ institutionId: ctx.principal.institutionId, versions, fixture: { ...fixture, subjectId: row.subjectId, studentId: null, language: 'en', accessibility: [] } });
      if (policy.config.classSignals.enabled) visible.push(row);
    }
    await this.portalAudit(ctx, 'petros.class_signals.view', teacherId, { signalCount: visible.length, hiddenByPolicy: rows.length - visible.length, learnerContentInspected: false });
    return visible.map((row) => ({
      id: row.id,
      concept: row.suppressed ? 'Suppressed until cohort threshold' : row.conceptKey,
      curriculumArea: row.curriculumArea,
      cohortSize: row.cohortSize,
      threshold: row.threshold,
      evidenceCount: row.evidenceCount,
      uncertaintyBasisPoints: row.uncertaintyBasisPoints,
      freshness: row.freshestAt.toISOString(),
      suppressed: row.suppressed,
      suggestedNextStep: row.suggestedNextStep,
      rankingIncluded: false,
      rawAnswersIncluded: false,
      learnerIdentifiersIncluded: false,
    }));
  }

  async refreshSignals(ctx: PortalActionContext, classId: string, subjectId: string) {
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
    const evidence = await this.repo.classEvidence(ctx.principal.institutionId, classId, subjectId, since);
    const groups = new Map<string, typeof evidence>();
    for (const row of evidence.filter((item) => item.outcome !== 'correct')) groups.set(row.conceptId, [...(groups.get(row.conceptId) ?? []), row]);
    const output = [];
    for (const [concept, rows] of groups) {
      const signal = buildClassSignal({
        concept,
        curriculumArea: subjectId,
        learnerHashes: rows.map((row) => stablePolicyHash(`${ctx.principal.institutionId}:${row.studentId}`)),
        evidenceCount: rows.length,
        uncertaintyBasisPoints: Math.max(1_000, 10_000 - rows.length * 500),
        freshestAt: new Date(Math.max(...rows.map((row) => row.occurredAt.getTime()))).toISOString(),
        suggestedNextStep: `Revisit ${concept} with one worked contrast and a short check before moving on.`,
        policy,
      });
      const stored = await this.repo.upsertClassSignal({
        institutionId: ctx.principal.institutionId,
        campusId: classFixture.campusId,
        classId,
        subjectId,
        conceptKey: concept,
        curriculumArea: subjectId,
        sourceHash: stablePolicyHash(rows.map((row) => [row.studentId, row.occurredAt.toISOString(), row.outcome])),
        cohortSize: signal.cohortSize,
        threshold: signal.threshold,
        evidenceCount: signal.evidenceCount,
        uncertaintyBasisPoints: signal.uncertaintyBasisPoints,
        freshestAt: new Date(signal.freshness),
        suppressed: signal.suppressed,
        suggestedNextStep: signal.suggestedNextStep,
        algorithmVersion: CLASS_SIGNAL_ALGORITHM,
      });
      output.push({ id: stored?.id ?? null, ...signal });
    }
    await this.portalAudit(ctx, 'petros.class_signals.refresh', classId, { subjectId, signals: output.length, suppressed: output.filter((row) => row.suppressed).length, learnerContentInspected: false });
    return output;
  }

  async parentPreferences(guardian: GuardianContext, input: PetrosParentDigestPreferenceInput) {
    assertWard(guardian, input.studentId, 'petros_digest');
    const row = await this.repo.upsertPreference(guardian.institutionId, guardian.guardianUserId, input);
    await this.event(guardian.institutionId, guardian.guardianUserId, 'parent', 'digest_preference', row!.id, input.optedOut ? 'parent_digest_opted_out' : 'parent_digest_preference_updated', { language: input.language, channels: input.deliveryChannels });
    return row;
  }

  async parentPreference(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'petros_digest');
    const row = await this.repo.preference(guardian.institutionId, guardian.guardianUserId, studentId);
    await this.event(guardian.institutionId, guardian.guardianUserId, 'parent', 'digest_preference', row?.id ?? studentId, 'privileged_digest_preference_access', { purpose: 'Manage own linked child digest settings' });
    return row ?? { studentId, optedOut: false, language: 'en', deliveryChannels: ['portal'] };
  }

  async parentDigestHistory(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'petros_digest');
    const rows = await this.repo.listDigests(guardian.institutionId, guardian.guardianUserId, studentId);
    for (const row of rows) await this.event(guardian.institutionId, guardian.guardianUserId, 'parent', 'digest', row.id, 'privileged_digest_access', { purpose: 'View own linked child learning digest', rawContentInEvent: false });
    return rows.map(publicDigest);
  }

  async parentDigestCommand(guardian: GuardianContext, raw: PetrosParentDigestCommandInput) {
    const input = petrosParentDigestCommandSchema.parse(raw);
    assertWard(guardian, input.studentId, 'petros_digest');
    const preference = await this.repo.preference(guardian.institutionId, guardian.guardianUserId, input.studentId);
    if (preference?.optedOut && ['preview', 'send'].includes(input.action)) {
      return { status: 'opted_out', message: 'Parent digests are turned off for this child.' };
    }
    if (input.action === 'retry' || input.action === 'cancel') {
      if (!input.digestId) throw new BadRequestException({ code: 'PETROS_DIGEST_ID_REQUIRED', message: 'Choose a digest first.' });
      const row = await this.repo.findDigest(guardian.institutionId, guardian.guardianUserId, input.digestId);
      if (!row || row.studentId !== input.studentId) throw notFound('PETROS_DIGEST_NOT_FOUND');
      if (input.action === 'cancel') {
        if (!['preview', 'queued', 'failed'].includes(row.status)) throw invalidTransition();
        const cancelled = await this.repo.updateDigest(guardian.institutionId, guardian.guardianUserId, row.id, { status: 'cancelled', cancelledAt: new Date() });
        return publicDigest(cancelled!);
      }
      if (row.status !== 'failed') throw invalidTransition();
      if (row.attemptCount > row.maxRetryCount) throw new ConflictException({ code: 'PETROS_DIGEST_RETRIES_EXHAUSTED', message: 'This delivery has exhausted its configured retries. Preview a new digest after correcting the delivery setup.' });
      const retried = await this.repo.updateDigest(guardian.institutionId, guardian.guardianUserId, row.id, { status: 'queued', errorCode: null, nextRetryAt: null });
      return publicDigest(retried!);
    }
    const [versions, student, evidence] = await Promise.all([
      this.ensurePolicy(guardian.institutionId, SYSTEM_ACTOR),
      this.repo.studentPolicyFixture(guardian.institutionId, input.studentId),
      this.repo.digestEvidence(guardian.institutionId, input.studentId, new Date(input.periodStart), new Date(input.periodEnd)),
    ]);
    if (!student) throw notFound('PETROS_STUDENT_NOT_FOUND');
    const policy = resolveInstitutionPolicy({ institutionId: guardian.institutionId, versions, fixture: { ...student, subjectId: null, studentId: input.studentId, language: input.language, accessibility: [] } });
    if (!policy.config.digest.enabled) throw new BadRequestException({ code: 'PETROS_DIGEST_DISABLED', message: 'Parent digests are not enabled by the disclosed institution policy.' });
    if (!policy.config.visibility.parent.categories.includes('concept_and_goal')) {
      throw new ForbiddenException({ code: 'PETROS_DIGEST_VISIBILITY_DISABLED', message: 'The disclosed policy does not permit concept-level parent digest content.' });
    }
    if (input.action === 'send') {
      const history = await this.repo.listDigests(guardian.institutionId, guardian.guardianUserId, input.studentId);
      const latest = history.find((row) => ['queued', 'delivered'].includes(row.status));
      const minimumGapDays = policy.config.digest.cadence === 'weekly' ? 7 : policy.config.digest.cadence === 'fortnightly' ? 14 : 28;
      if (latest && new Date(input.periodEnd).getTime() - latest.periodEnd.getTime() < minimumGapDays * 86_400_000) {
        throw new ConflictException({ code: 'PETROS_DIGEST_CADENCE_NOT_DUE', message: `The ${policy.config.digest.cadence} digest cadence is not due yet.` });
      }
    }
    const deterministic = deterministicDigest(input, evidence, policy);
    const enhanced = await this.generateParentDigest(guardian, input.studentId, deterministic);
    const id = input.digestId ?? randomUUID();
    const row = await this.repo.createDigest({
      id,
      institutionId: guardian.institutionId,
      guardianUserId: guardian.guardianUserId,
      studentId: input.studentId,
      policyVersionIds: policy.policyVersionIds,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      language: input.language,
      content: enhanced.value,
      status: input.action === 'send' ? 'queued' : 'preview',
      deliveryChannels: preference?.deliveryChannels ?? policy.config.digest.deliveryChannels,
      maxRetryCount: policy.config.digest.maxRetries,
      idempotencyKey: input.idempotencyKey,
      functionKey: PETROS_INSTITUTIONAL_FUNCTIONS.parentDigest,
      validationPassed: enhanced.validationPassed,
    });
    const resolved = row ?? (await this.repo.listDigests(guardian.institutionId, guardian.guardianUserId, input.studentId)).find((item) => item.idempotencyKey === input.idempotencyKey);
    if (!resolved) throw new Error('Parent digest could not be created.');
    await this.functionEvent(guardian.institutionId, input.studentId, 'digest', resolved.id, input.action === 'send' ? 'parent_digest_queued' : 'parent_digest_previewed', input.idempotencyKey, enhanced);
    return publicDigest(resolved);
  }

  async processJobs(now = new Date()) {
    const [handoffs, digests] = await Promise.all([this.repo.queuedHandoffs(), this.repo.queuedDigests()]);
    let handoffsDelivered = 0;
    let digestsDelivered = 0;
    let digestsFailed = 0;
    let digestsExhausted = 0;
    for (const { handoff, snapshot } of handoffs) {
      const delay = snapshot.resolvedPolicy.config.escalation.cancellationMinutes * 60_000;
      if (handoff.updatedAt.getTime() + delay > now.getTime()) continue;
      await this.repo.updateStudentHandoff(handoff.institutionId, handoff.studentId, handoff.id, { status: 'delivered', deliveredAt: now });
      await this.event(handoff.institutionId, SYSTEM_ACTOR, 'job', 'handoff', handoff.id, 'teacher_handoff_delivered', { attempt: handoff.retryCount + 1 });
      handoffsDelivered += 1;
    }
    for (const digest of digests) {
      const attempt = digest.attemptCount + 1;
      if (digest.deliveryChannels.some((channel) => channel !== 'portal')) {
        const exhausted = attempt > digest.maxRetryCount;
        const retryDelayMinutes = Math.min(1_440, 5 * 2 ** Math.max(0, attempt - 1));
        await this.repo.updateDigest(digest.institutionId, digest.guardianUserId, digest.id, {
          status: 'failed',
          attemptCount: attempt,
          errorCode: 'PETROS_DIGEST_EMAIL_DELIVERY_UNCONFIGURED',
          nextRetryAt: exhausted ? null : new Date(now.getTime() + retryDelayMinutes * 60_000),
        });
        await this.event(digest.institutionId, SYSTEM_ACTOR, 'job', 'digest', digest.id, exhausted ? 'parent_digest_delivery_exhausted' : 'parent_digest_delivery_failed', { attempt, retryScheduled: !exhausted, providerDetailsIncluded: false });
        digestsFailed += 1;
        if (exhausted) digestsExhausted += 1;
        continue;
      }
      await this.repo.updateDigest(digest.institutionId, digest.guardianUserId, digest.id, { status: 'delivered', deliveredAt: now, attemptCount: attempt, nextRetryAt: null, errorCode: null });
      await this.event(digest.institutionId, SYSTEM_ACTOR, 'job', 'digest', digest.id, 'parent_digest_delivered', { attempt, channel: 'portal' });
      digestsDelivered += 1;
    }
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

  private async generateParentDigest(guardian: GuardianContext, studentId: string, deterministic: z.infer<typeof parentDigestContentSchema>) {
    const fallback = sanitizeParentDigest(parentDigestContentSchema.parse(deterministic));
    const started = Date.now();
    try {
      const result = await this.gateway.execute({
        context: { functionKey: PETROS_INSTITUTIONAL_FUNCTIONS.parentDigest, topic: 'bounded parent learning digest', sessionType: 'learn', inputModality: 'text', language: deterministic.language, institutionId: guardian.institutionId, studentId, estimatedTokens: 800, currentCostMicros: 0, previousFailures: 0, requiredReasoningQuality: 0.5 },
        system: 'Rewrite only the bounded aggregate sections supplied. Preserve source period, language and uncertainty. Never expose raw sessions, private questions, calibration, ability labels, teacher-only notes, answers, provider/model details, voice or images.',
        input: [{ type: 'text', text: JSON.stringify(fallback) }],
        responseSchema: zodToJsonSchema(parentDigestContentSchema, { $refStrategy: 'none' }) as Record<string, unknown>,
        metadata: { parentDigest: true, rawStudentContentIncluded: false },
      });
      return { value: sanitizeParentDigest(parentDigestContentSchema.parse(result.content)), result, validationPassed: true, durationMs: Date.now() - started };
    } catch (error) {
      return { value: fallback, result: null, validationPassed: !isValidationError(error), durationMs: Date.now() - started, errorCode: providerNeutral(error) };
    }
  }

  private async portalAudit(ctx: PortalActionContext, action: string, id: string, state: Record<string, unknown>) {
    await this.audit.logAudit({ ...basePortalAudit(ctx), action, module: 'petros', entityType: 'petros_institutional', entityId: id, newState: state } as Parameters<AuditWriter['logAudit']>[0]);
  }

  private persistHomeworkDecision(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    snapshotId: string,
    assignmentId: string,
    relationBasisPoints: number,
    decision: ReturnType<typeof decideHomework>,
  ) {
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

function deterministicDigest(input: PetrosParentDigestCommandInput, evidence: Array<{ conceptId: string; outcome: string; errorCategory: string; occurredAt: Date }>, policy: PetrosResolvedPolicy) {
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

function publicDigest(row: any) {
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
