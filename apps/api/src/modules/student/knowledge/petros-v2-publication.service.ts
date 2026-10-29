import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { m3ReviewReceiptSchema, type M3Proposal } from '@edrion/schemas';
import { randomUUID } from 'node:crypto';
import { API_ENV, DATABASE } from '../../../common/tokens';
import type { PortalActionContext } from '../../portal/portal-action-context';
import { PetrosTeachingPackRepository } from './petros-teaching-pack.repository';
import { PetrosTeachingPackService } from './petros-teaching-pack.service';
import { PetrosContentUnitRepository } from './petros-content-unit.repository';
import {
  m4Hash,
  m4InstrumentSchema,
  m4PublicationSchema,
  type M4Publication,
} from '../petros-v2/petros-v2-contracts.server';
import { validatePrerequisites } from '../petros-v2/petros-v2-context';

/** Publication and instrument registration stay with the existing teaching-pack owner.
 * No public controller enables this writer; real publication remains operationally gated.
 * Disposable tests invoke the same current qualification, permission and source checks.
 */
@Injectable()
export class PetrosV2PublicationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly packs: PetrosTeachingPackService,
    private readonly repo: PetrosTeachingPackRepository,
  ) {}
  private async current(ctx: PortalActionContext, p: M3Proposal) {
    if (!this.env.PETROS_V2_SESSIONS_ENABLED) throw new ConflictException('M4_ADMISSION_DISABLED');
    await this.packs.requireActionPermissions(ctx.principal, [
      'class_content.manage',
      'academics.alignments.approve',
    ]);
    const c = await this.repo.candidateByRef(p.institutionId, p.id, p.version);
    if (!c || c.payloadHash !== m4Hash(p) || !p.courseId)
      throw new ConflictException('M4_EXACT_REVIEWED_PROPOSAL_REQUIRED');
    const t = schema.petrosDocumentPreparations;
    const newer = await this.db
      .select({ document: t.documentMap })
      .from(t)
      .where(
        and(
          eq(t.institutionId, p.institutionId),
          eq(t.requestedConceptId, p.id),
          eq(t.generatorVersion, 'petros.m3.proposal.v1'),
        ),
      );
    if (newer.some((r) => Number(r.document?.version) > p.version))
      throw new ConflictException('M4_STALE_PROPOSAL');
    return c;
  }
  async registerInstrument(
    ctx: PortalActionContext,
    p: M3Proposal,
    raw: unknown,
    qualificationId: string,
    qualificationVersion = 1,
  ) {
    await this.current(ctx, p);
    await this.packs.requireReviewerAuthority(ctx.principal, {
      institutionId: p.institutionId,
      courseId: p.courseId!,
      subjectKey: p.subjectId,
      qualificationId,
      expectedQualificationVersion: qualificationVersion,
    });
    const v = m4InstrumentSchema.parse(raw);
    if (v.teaching) {
      validatePrerequisites(v.teaching);
      const concepts = new Set(p.concepts.map((c) => c.id));
      if (
        v.teaching.criteria.some(
          (c) =>
            !p.concepts.some((pin) => pin.id === c.conceptId && pin.version === c.conceptVersion),
        ) ||
        v.teaching.prerequisites.some((e) => !concepts.has(e.from) || !concepts.has(e.to))
      )
        throw new ConflictException('M5_UNAPPROVED_CONCEPT_MAPPING');
      for (const fragment of v.teaching.fragments) {
        const sources = [
          { reference: fragment.reference, quote: fragment.quote },
          ...(fragment.additionalSources ?? []),
        ];
        if (
          sources.some(
            (s) =>
              !p.claims
                .flatMap((c) => c.support)
                .some(
                  (support) =>
                    m4Hash(support.reference) === m4Hash(s.reference) &&
                    support.quote.includes(s.quote),
                ),
          )
        )
          throw new ConflictException('M5_UNAPPROVED_INSTRUCTION_SOURCE');
      }
      const publicInstruction = JSON.stringify(v.teaching);
      if (
        v.privateDiscriminators.some(
          (secret) => secret.length > 0 && publicInstruction.includes(secret),
        ) ||
        v.criteria.some(
          (c) => c.checker.kind === 'qualitative' && publicInstruction.includes(c.checker.rubric),
        )
      )
        throw new ConflictException('M5_PRIVATE_INSTRUCTION_LEAK');
    }
    if (
      v.proposalId !== p.id ||
      v.proposalVersion !== p.version ||
      v.proposalHash !== m4Hash(p) ||
      v.sourceRevisionId !== p.source.revisionId ||
      v.sourceHash !== p.source.originalHash ||
      !p.objectives.some((o) => o.id === v.objectiveId && o.version === v.objectiveVersion)
    )
      throw new ConflictException('M4_INSTRUMENT_PINS_INVALID');
    return this.db
      .insert(schema.petrosTeachingPackCandidates)
      .values({
        institutionId: p.institutionId,
        courseId: p.courseId!,
        sourceFormat: 'v2',
        sourceItemId: null,
        sourceRevisionId: p.source.revisionId,
        sourceVersion: p.source.originalHash,
        curriculumRevision: p.curriculumRevision,
        packId: v.id,
        packVersion: v.version,
        compilerVersion: 'petros.m4.instrument.v1',
        schemaVersion: v.schemaVersion,
        payloadHash: m4Hash(v),
        payload: v as never,
        commandId: randomUUID(),
        requestHash: m4Hash(v),
        createdByUserId: ctx.principal.institutionUserId,
      })
      .returning()
      .then((r) => r[0]!);
  }
  async reviewInstrument(
    ctx: PortalActionContext,
    p: M3Proposal,
    candidateId: string,
    qualificationId: string,
    qualificationVersion = 1,
  ) {
    await this.current(ctx, p);
    const c = await this.repo.candidateById(p.institutionId, candidateId);
    if (!c || c.createdByUserId === ctx.principal.institutionUserId)
      throw new ConflictException('M4_INDEPENDENT_REVIEW_REQUIRED');
    const v = m4InstrumentSchema.parse(c.payload);
    if (v.proposalHash !== m4Hash(p) || m4Hash(v) !== c.payloadHash)
      throw new ConflictException('M4_INSTRUMENT_PINS_INVALID');
    const authority = await this.packs.requireReviewerAuthority(ctx.principal, {
      institutionId: p.institutionId,
      courseId: p.courseId!,
      subjectKey: p.subjectId,
      qualificationId,
      expectedQualificationVersion: qualificationVersion,
    });
    const prior = await this.repo.latestReview(p.institutionId, c.id);
    const receipt = m3ReviewReceiptSchema.parse({
      schemaVersion: 'petros.v2.scope-review.v1',
      id: randomUUID(),
      proposalId: p.id,
      proposalVersion: p.version,
      sourceRevisionId: p.source.revisionId,
      payloadHash: m4Hash(p),
      dimension: 'assessment_instrument',
      decision: 'approved',
      reviewerUserId: ctx.principal.institutionUserId,
      qualificationId,
      qualificationVersion,
      taskFamily: { id: v.id, version: v.version, hash: c.payloadHash },
      nonEquivalenceDecision: 'distinct',
      reason: 'Exact instrument, criteria, deterministic capability and equivalence reviewed.',
      reviewedAt: new Date().toISOString(),
    });
    return this.repo.insertM3Review(
      c,
      receipt,
      authority,
      randomUUID(),
      m4Hash(receipt),
      (prior?.reviewVersion ?? 0) + 1,
    );
  }
  async publish(
    ctx: PortalActionContext,
    p: M3Proposal,
    instrumentIds: string[],
    canvas: M4Publication['canvas'] = null,
  ) {
    await this.current(ctx, p);
    const states = await this.packs.learningProposalReviewState(p);
    if (['teaching_scope', 'concepts', 'activities'].some((k) => states[k]?.status !== 'approved'))
      throw new ConflictException('M4_SCOPE_REVIEW_REQUIRED');
    const activity = p.activities.find((a) => a.id === p.objectives[0]!.selectedActivityId);
    if (
      !activity ||
      activity.reviewStatus === 'rejected' ||
      activity.capabilityStatus !== 'structural_preview' ||
      activity.renderer !== 'teaching_block'
    )
      throw new ConflictException('M4_ACTIVITY_UNSUPPORTED');
    const instruments = [];
    for (const id of instrumentIds) {
      const c = await this.repo.candidateById(p.institutionId, id),
        r = c && (await this.repo.latestReview(p.institutionId, c.id));
      if (
        !c ||
        !r ||
        r.decision !== 'approved' ||
        (await this.repo.reviewRevocation(p.institutionId, r.id))
      )
        throw new ConflictException('M4_INSTRUMENT_REVIEW_REQUIRED');
      await this.packs.requireStoredReviewerAuthority(p.courseId!, r.authoritySnapshot, [
        'academics.alignments.approve',
      ]);
      const v = m4InstrumentSchema.parse(c.payload);
      if (
        v.proposalHash !== m4Hash(p) ||
        v.objectiveId !== p.objectives[0]!.id ||
        c.payloadHash !== m4Hash(v)
      )
        throw new ConflictException('M4_OBJECTIVE_PINS_INVALID');
      if (m4Hash(v.publicCanvas) !== m4Hash(canvas))
        throw new ConflictException('M4_REVIEWED_CANVAS_REQUIRED');
      instruments.push({
        candidateId: c.id,
        reviewId: r.id,
        familyId: v.id,
        version: v.version,
        hash: c.payloadHash,
        ...(v.teaching ? { teaching: v.teaching } : {}),
      });
    }
    const recipients = await this.db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.institutionId, p.institutionId),
          eq(schema.students.classId, p.classId),
          eq(schema.students.status, 'enrolled'),
        ),
      );
    let recipientIds = recipients.map((r) => r.id);
    if (p.source.binding.kind === 'guidance_attachment') {
      const aa = await this.db
        .select({ id: schema.assignmentAssignees.studentId })
        .from(schema.assignmentAssignees)
        .where(eq(schema.assignmentAssignees.assignmentId, p.source.binding.assignmentId));
      recipientIds = recipientIds.filter((id) => aa.some((a) => a.id === id));
    }
    const [subject] = await this.db
      .select({ name: schema.subjects.name })
      .from(schema.subjects)
      .where(eq(schema.subjects.id, p.subjectId));
    const excerpts = await Promise.all(
      p.claims
        .filter((c) => c.classification !== 'rejected')
        .flatMap((c) => c.support)
        .filter((s, i, all) => all.findIndex((v) => v.quote === s.quote) === i)
        .slice(0, 16)
        .map(async (support) => {
          const lookup = await new PetrosContentUnitRepository(this.db).lookup(
            p.source.revisionId,
            { unitId: support.reference.unitId, visibleOnly: true },
          );
          const unit =
            lookup.status === 'available'
              ? lookup.units.find(
                  (u) =>
                    u.id === support.reference.unitId &&
                    u.contentHash === support.reference.unitHash,
                )
              : null;
          const table =
            unit?.payload.kind === 'table' &&
            unit.capabilities.display.status === 'supported' &&
            unit.capabilities.cite.status === 'supported' &&
            unit.payload.cells.length <= 64 &&
            unit.payload.cells.every((cell) => !cell.unresolved) &&
            unit.payload.cells.reduce((size, cell) => size + cell.value.length, 0) <= 12000
              ? unit.payload
              : undefined;
          return { text: support.quote, reference: support.reference, ...(table ? { table } : {}) };
        }),
    );
    const publication = m4PublicationSchema.parse({
      schemaVersion: 'petros.v2.student-publication.v1',
      proposalId: p.id,
      proposalVersion: p.version,
      proposalHash: m4Hash(p),
      courseId: p.courseId,
      classId: p.classId,
      subjectId: p.subjectId,
      curriculumRevision: p.curriculumRevision,
      activityId: activity.id,
      activityVersion: p.version,
      sourceRevisionId: p.source.revisionId,
      sourceHash: p.source.originalHash,
      binding: p.source.binding,
      recipientIds,
      reviews: ['teaching_scope', 'concepts', 'activities'].map((k) => states[k]!.receiptId),
      instruments,
      canvas,
      lesson: {
        title: subject?.name ?? 'Learning session',
        subject: subject?.name ?? 'Lesson',
        objective: {
          id: p.objectives[0]!.id,
          version: p.objectives[0]!.version,
          label: p.objectives[0]!.wording,
        },
        explanation:
          p.claims
            .filter(
              (c) => p.objectives[0]!.claimIds.includes(c.id) && c.classification !== 'rejected',
            )
            .map((c) => c.statement)
            .join('\n\n') || p.objectives[0]!.support.map((s) => s.quote).join('\n\n'),
        citation: 'Teacher-reviewed source excerpt',
        references: p.source.references,
        excerpts,
        limitations: p.uncertainties,
      },
    });
    const [row] = await this.db
      .insert(schema.courseCurriculumRecords)
      .values({
        institutionId: p.institutionId,
        courseId: p.courseId!,
        kind: 'student_session_release_v2',
        recordId: p.id,
        recordVersion: p.version,
        contentHash: m4Hash(publication),
        content: publication,
        actorId: ctx.principal.institutionUserId,
      })
      .returning();
    return row!;
  }
}
