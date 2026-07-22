import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, schema, sql, type Database } from '@edrion/database';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { computeTermAggregate, type ReportCardValidateInput } from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { basePortalAudit, type PortalActionContext } from '../portal/portal-action-context';
import { DocumentBatchService } from './document-batch.service';
import { DocumentsGenService } from './documents-gen.service';
import { resolveMergePayload } from './document-merge-resolver.registry';
import { randomUUID } from 'node:crypto';
import {
  DOCUMENT_VERIFY_CODE_VERSION,
  mintDocumentVerifyCode,
} from '../../common/crypto/document-verify-signer';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { TodayNotifyService } from '../student/today/today-notify.service';

/**
 * Report-card orchestration on top of document_batches (kind=report_card).
 * Marks binding: mark_release_batches.entry_ids ∩ grade_entries.published=true only.
 */
@Injectable()
export class ReportCardIssuanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly batches: DocumentBatchService,
    private readonly documents: DocumentsGenService,
    private readonly todayNotify: TodayNotifyService,
  ) {}

  async validate(ctx: PortalActionContext, input: ReportCardValidateInput) {
    const blockers: Array<{ code: string; message: string; link?: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];

    const released = await this.releasedEntryIds(ctx.principal.institutionId, input.termId);
    if (!released.size) {
      blockers.push({
        code: 'NO_RELEASES',
        message: 'No released mark batches for this term.',
        link: '/academics/marks/releases',
      });
    }

    const entries = await this.db
      .select()
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.institutionId, ctx.principal.institutionId),
          eq(schema.gradeEntries.termId, input.termId),
          inArray(schema.gradeEntries.classId, input.sectionIds),
        ),
      );

    for (const e of entries) {
      if (!e.published || !released.has(e.id)) {
        blockers.push({
          code: 'UNRELEASED_MARK',
          message: `${e.assessmentName} · student ${e.studentId} — not released`,
          link: '/academics/marks/releases',
        });
      }
    }

    const remarks = await this.db
      .select({ studentId: schema.reportCardRemarks.studentId })
      .from(schema.reportCardRemarks)
      .where(
        and(
          eq(schema.reportCardRemarks.institutionId, ctx.principal.institutionId),
          eq(schema.reportCardRemarks.termId, input.termId),
        ),
      );
    const remarkSet = new Set(remarks.map((r) => r.studentId));
    const students = await this.db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.institutionId, ctx.principal.institutionId),
          inArray(schema.students.classId, input.sectionIds),
        ),
      );
    const missingRemarks = students.filter((s) => !remarkSet.has(s.id)).length;
    if (missingRemarks > 0) {
      warnings.push({
        code: 'MISSING_REMARKS',
        message: `${missingRemarks} students missing remarks`,
      });
    }

    return { blockers, warnings, canGenerate: blockers.length === 0 };
  }

  async createRun(
    ctx: PortalActionContext,
    input: ReportCardValidateInput & { templateId: string; campusId?: string },
  ) {
    const validation = await this.validate(ctx, input);
    if (!validation.canGenerate) {
      throw new ConflictException({
        code: 'RELEASE_BLOCKERS',
        message: 'Cannot generate while marks are unreleased.',
        blockers: validation.blockers,
      });
    }
    return this.batches.create(ctx, {
      kind: 'report_card',
      templateId: input.templateId,
      campusId: input.campusId,
      scope: { termId: input.termId, sectionIds: input.sectionIds },
    });
  }

  /** Build immutable per-item source+merge snapshots from released marks only. */
  async buildItemSnapshot(
    institutionId: string,
    termId: string,
    studentId: string,
    batchId: string,
  ) {
    const released = await this.releasedEntryIds(institutionId, termId);
    const entries = await this.db
      .select()
      .from(schema.gradeEntries)
      .where(
        and(
          eq(schema.gradeEntries.institutionId, institutionId),
          eq(schema.gradeEntries.termId, termId),
          eq(schema.gradeEntries.studentId, studentId),
          eq(schema.gradeEntries.published, true),
        ),
      );

    const allowed = entries.filter((e) => released.has(e.id));
    if (allowed.length !== entries.length) {
      throw new ConflictException({
        code: 'UNRELEASED_MARK',
        message: 'Unreleased marks cannot enter a report-card snapshot.',
      });
    }

    const releaseBatchIds = await this.releaseBatchIdsForEntries(institutionId, termId, allowed.map((e) => e.id));

    const aggregate = computeTermAggregate({
      entries: allowed.map((e) => ({
        subjectId: e.subjectId,
        marksObtained: e.marksObtained,
        maxMarks: e.maxMarks,
        credits: null,
      })),
      formula: 'percentage',
    });

    const [remark] = await this.db
      .select()
      .from(schema.reportCardRemarks)
      .where(
        and(
          eq(schema.reportCardRemarks.institutionId, institutionId),
          eq(schema.reportCardRemarks.termId, termId),
          eq(schema.reportCardRemarks.studentId, studentId),
        ),
      )
      .limit(1);

    const [term] = await this.db
      .select({ name: schema.academicTerms.name })
      .from(schema.academicTerms)
      .where(eq(schema.academicTerms.id, termId))
      .limit(1);

    const [student] = await this.db
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);

    const sourceSnapshot = {
      releaseBatchIds,
      entryIds: allowed.map((e) => e.id),
      entries: allowed.map((e) => ({
        id: e.id,
        subjectId: e.subjectId,
        marksObtained: e.marksObtained,
        maxMarks: e.maxMarks,
        assessmentName: e.assessmentName,
      })),
      aggregate,
      capturedAt: new Date().toISOString(),
    };

    const merge = resolveMergePayload('report_card', {
      institution: { name: 'Institution' },
      student: {
        name: `${student?.firstName ?? ''} ${student?.lastName ?? ''}`.trim(),
        regNo: student?.admissionNo ?? undefined,
      },
      verifyCode: 'PENDING',
      term: { name: term?.name ?? 'Term' },
      marks: {
        scholasticTable: allowed.map((e) => ({
          subject: e.assessmentName,
          obtained: e.marksObtained,
          max: e.maxMarks,
          grade: e.letterGrade,
        })),
        entries: allowed.map((e) => ({
          subjectId: e.subjectId,
          marksObtained: e.marksObtained,
          maxMarks: e.maxMarks,
        })),
      },
      remarks: { classTeacher: remark?.remark ?? '—' },
      attendance: {},
    });

    return { sourceSnapshot, merge, batchId };
  }

  async flagCard(
    ctx: PortalActionContext,
    batchId: string,
    itemId: string,
    note: string,
    version: number,
  ) {
    const batch = await this.requireReportBatch(ctx, batchId);
    const [item] = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(
        and(eq(schema.documentBatchItems.id, itemId), eq(schema.documentBatchItems.batchId, batchId)),
      )
      .limit(1);
    if (!item) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Card not found.' });

    await this.assertTeacherSection(ctx, batch, item.studentId);

    const [updated] = await this.db
      .update(schema.documentBatchItems)
      .set({
        reviewFlag: {
          note,
          flaggedBy: ctx.principal.institutionUserId,
          flaggedAt: new Date().toISOString(),
        },
        version: version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.documentBatchItems.id, itemId), eq(schema.documentBatchItems.version, version)),
      )
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Card changed.' });

    const sectionId = await this.sectionForStudent(item.studentId);
    if (sectionId) {
      await this.db
        .update(schema.reportCardReviews)
        .set({ status: 'flagged', updatedAt: new Date() })
        .where(
          and(
            eq(schema.reportCardReviews.batchId, batchId),
            eq(schema.reportCardReviews.sectionId, sectionId),
          ),
        );
    }

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'report_card.flag',
      module: 'documents-issuance',
      entityType: 'document_batch_item',
      entityId: itemId,
      reason: note,
    });
    return updated;
  }

  async markSectionReviewed(ctx: PortalActionContext, batchId: string, sectionId: string, version: number) {
    const batch = await this.requireReportBatch(ctx, batchId);
    await this.assertTeacherOwnsSection(ctx, sectionId);

    const openFlags = await this.openFlagsForSection(batchId, sectionId);
    if (openFlags > 0) {
      throw new ConflictException({
        code: 'OPEN_FLAGS',
        message: 'Resolve all flags before marking section reviewed.',
      });
    }

    const [updated] = await this.db
      .update(schema.reportCardReviews)
      .set({
        status: 'reviewed',
        reviewedBy: ctx.principal.institutionUserId,
        reviewedAt: new Date(),
        version: version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.reportCardReviews.batchId, batchId),
          eq(schema.reportCardReviews.sectionId, sectionId),
          eq(schema.reportCardReviews.version, version),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Review changed.' });

    await this.maybeAdvanceToSigning(batch);
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'report_card.section_reviewed',
      module: 'documents-issuance',
      entityType: 'report_card_review',
      entityId: updated.id,
    });
    return updated;
  }

  async regenerateFlagged(ctx: PortalActionContext, batchId: string, version: number) {
    const batch = await this.requireReportBatch(ctx, batchId, version);
    if (batch.lockedAt) {
      throw new ConflictException({ code: 'ALREADY_LOCKED', message: 'Batch is locked.' });
    }
    const flagged = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(
        and(
          eq(schema.documentBatchItems.batchId, batchId),
          sql`${schema.documentBatchItems.reviewFlag} IS NOT NULL`,
        ),
      );

    const termId = (batch.scope as { termId?: string }).termId!;
    for (const item of flagged) {
      const snap = await this.buildItemSnapshot(
        ctx.principal.institutionId,
        termId,
        item.studentId,
        batchId,
      );
      const render = await this.documents.createRender(ctx, {
        docType: 'report_card',
        family: 'report_card',
        title: `Report card · regenerated`,
        payload: snap.merge,
        templateId: batch.templateId ?? undefined,
        purpose: 'batch',
        studentId: item.studentId,
        batchItemId: item.id,
        refType: 'document_batch',
        refId: batch.id,
        templateFingerprint: batch.templateFingerprint ?? undefined,
        idempotencyKey: `batch:${batch.id}:item:${item.id}:regen:${Date.now()}`,
      });

      // Abandon undelivered prior vault for this item
      if (item.vaultDocumentId) {
        await this.db
          .update(schema.studentDocumentVault)
          .set({ abandonedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(schema.studentDocumentVault.id, item.vaultDocumentId),
              isNull(schema.studentDocumentVault.deliveredAt),
            ),
          );
      }

      await this.db
        .update(schema.documentBatchItems)
        .set({
          status: 'rendering',
          renderId: render.id,
          reviewFlag: null,
          signState: [],
          sourceSnapshot: snap.sourceSnapshot,
          mergeSnapshot: snap.merge,
          vaultDocumentId: null,
          version: item.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.documentBatchItems.id, item.id));

      const sectionId = await this.sectionForStudent(item.studentId);
      if (sectionId) {
        await this.db
          .update(schema.reportCardReviews)
          .set({ status: 'pending', reviewedAt: null, reviewedBy: null, updatedAt: new Date() })
          .where(
            and(
              eq(schema.reportCardReviews.batchId, batchId),
              eq(schema.reportCardReviews.sectionId, sectionId),
            ),
          );
      }
    }

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'report_card.regenerate_flagged',
      module: 'documents-issuance',
      entityType: 'document_batch',
      entityId: batchId,
      newState: { count: flagged.length },
    });
    return { regenerated: flagged.length };
  }

  async publish(ctx: PortalActionContext, batchId: string, version: number) {
    const batch = await this.requireReportBatch(ctx, batchId, version);
    if (batch.status !== 'signing' && batch.status !== 'delivering') {
      throw new ConflictException({
        code: 'SIGN_INCOMPLETE',
        message: 'Publish only after signing.',
      });
    }
    if (batch.lockedAt) {
      throw new ConflictException({ code: 'ALREADY_LOCKED', message: 'Already published.' });
    }

    const [locked] = await this.db
      .update(schema.documentBatches)
      .set({
        status: 'delivering',
        lockedAt: new Date(),
        version: version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.documentBatches.id, batchId),
          eq(schema.documentBatches.version, version),
          isNull(schema.documentBatches.lockedAt),
        ),
      )
      .returning();
    if (!locked) {
      throw new ConflictException({ code: 'ALREADY_LOCKED', message: 'Already published.' });
    }

    const items = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(
        and(
          eq(schema.documentBatchItems.batchId, batchId),
          inArray(schema.documentBatchItems.status, ['rendered', 'delivered']),
        ),
      );

    for (const item of items) {
      if (!item.vaultDocumentId) continue;
      await this.db
        .update(schema.studentDocumentVault)
        .set({ deliveredAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.studentDocumentVault.id, item.vaultDocumentId),
            isNull(schema.studentDocumentVault.deliveredAt),
            isNull(schema.studentDocumentVault.abandonedAt),
          ),
        );
      await this.db
        .update(schema.documentBatchItems)
        .set({ status: 'delivered', updatedAt: new Date() })
        .where(eq(schema.documentBatchItems.id, item.id));
    }

    const [done] = await this.db
      .update(schema.documentBatches)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(schema.documentBatches.id, batchId))
      .returning();

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'report_card.publish',
      module: 'documents-issuance',
      entityType: 'document_batch',
      entityId: batchId,
    });

    const studentIds = items.map((item) => item.studentId);
    if (studentIds.length) {
      await this.todayNotify.fanoutInstitutionStudents(ctx.principal.institutionId, studentIds, {
        eventKey: `report-card-publish:${batchId}`,
        type: 'marks_released',
        sourceModule: 'report_cards',
        title: 'Report card published',
        body: 'Your report card is ready to view.',
        deepLink: '/report-cards',
      });
    }
    return done;
  }

  async listTeacherReviews(ctx: PortalActionContext) {
    const sections = await this.teacherSectionIds(ctx);
    if (!sections.length) return { items: [] };
    const rows = await this.db
      .select({
        review: schema.reportCardReviews,
        batch: schema.documentBatches,
      })
      .from(schema.reportCardReviews)
      .innerJoin(schema.documentBatches, eq(schema.documentBatches.id, schema.reportCardReviews.batchId))
      .where(
        and(
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
          inArray(schema.reportCardReviews.sectionId, sections),
          eq(schema.reportCardReviews.status, 'pending'),
        ),
      )
      .orderBy(schema.reportCardReviews.updatedAt);
    return { items: rows };
  }

  async reissueCard(
    ctx: PortalActionContext,
    batchId: string,
    itemId: string,
    reason: string,
    version: number,
  ) {
    const batch = await this.requireReportBatch(ctx, batchId);
    if (!batch.lockedAt) {
      throw new ConflictException({
        code: 'NOT_LOCKED',
        message: 'Reissue is only for published batches.',
      });
    }
    const [item] = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(
        and(eq(schema.documentBatchItems.id, itemId), eq(schema.documentBatchItems.batchId, batchId)),
      )
      .limit(1);
    if (!item?.vaultDocumentId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Card not found.' });
    }

    const termId = (batch.scope as { termId?: string }).termId!;
    const snap = await this.buildItemSnapshot(
      ctx.principal.institutionId,
      termId,
      item.studentId,
      batchId,
    );

    const render = await this.documents.createRender(ctx, {
      docType: 'report_card',
      family: 'report_card',
      title: 'Report card · reissue',
      payload: snap.merge,
      templateId: batch.templateId ?? undefined,
      purpose: 'reissue',
      studentId: item.studentId,
      batchItemId: item.id,
      refType: 'document_batch',
      refId: batch.id,
      templateFingerprint: batch.templateFingerprint ?? undefined,
      idempotencyKey: `reissue:${item.id}:${version}`,
    });

    // New vault reserved; delivery after sign. Old remains until supersede on deliver.
    const newVaultId = randomUUID();
    const secret = this.env.DOCUMENT_VERIFY_SECRET ?? this.env.SESSION_COOKIE_SECRET;
    const verifyCode = mintDocumentVerifyCode(newVaultId, secret, DOCUMENT_VERIFY_CODE_VERSION);
    const [newVault] = await this.db
      .insert(schema.studentDocumentVault)
      .values({
        id: newVaultId,
        institutionId: batch.institutionId,
        studentId: item.studentId,
        documentRenderId: render.id,
        title: render.title,
        docType: 'report_card',
        family: 'report_card',
        source: 'batch',
        templateId: batch.templateId,
        templateFingerprint: batch.templateFingerprint,
        batchId: batch.id,
        batchItemId: item.id,
        verifyCode,
        verifyCodeVersion: DOCUMENT_VERIFY_CODE_VERSION,
        issuedBy: ctx.principal.institutionUserId,
        supersedes: item.vaultDocumentId,
        reissueReason: reason,
        deliveredAt: null,
      })
      .returning();

    await this.db
      .update(schema.documentBatchItems)
      .set({
        renderId: render.id,
        vaultDocumentId: newVault!.id,
        signState: [],
        sourceSnapshot: snap.sourceSnapshot,
        mergeSnapshot: snap.merge,
        version: version + 1,
        status: 'rendered',
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.documentBatchItems.id, itemId), eq(schema.documentBatchItems.version, version)),
      );

    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      actorType: ActorType.InstitutionUser,
      action: 'report_card.reissue',
      module: 'documents-issuance',
      entityType: 'document_batch_item',
      entityId: itemId,
      reason,
      newState: { newVaultId: newVault!.id, oldVaultId: item.vaultDocumentId },
    });

    return { render, vault: newVault };
  }

  /** Final sign delivers reissue and supersedes old vault. */
  async completeReissueDelivery(itemId: string) {
    const [item] = await this.db
      .select()
      .from(schema.documentBatchItems)
      .where(eq(schema.documentBatchItems.id, itemId))
      .limit(1);
    if (!item?.vaultDocumentId) return;

    const [vault] = await this.db
      .select()
      .from(schema.studentDocumentVault)
      .where(eq(schema.studentDocumentVault.id, item.vaultDocumentId))
      .limit(1);
    if (!vault?.supersedes) return;

    await this.db
      .update(schema.studentDocumentVault)
      .set({
        supersededBy: vault.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.studentDocumentVault.id, vault.supersedes));

    await this.db
      .update(schema.studentDocumentVault)
      .set({ deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.studentDocumentVault.id, vault.id));

    await this.db
      .update(schema.documentBatchItems)
      .set({ status: 'delivered', updatedAt: new Date() })
      .where(eq(schema.documentBatchItems.id, itemId));
  }

  private async releasedEntryIds(institutionId: string, termId: string): Promise<Set<string>> {
    const batches = await this.db
      .select()
      .from(schema.markReleaseBatches)
      .where(
        and(
          eq(schema.markReleaseBatches.institutionId, institutionId),
          eq(schema.markReleaseBatches.status, 'released'),
          isNull(schema.markReleaseBatches.retractedAt),
          eq(schema.markReleaseBatches.termId, termId),
        ),
      );
    const ids = new Set<string>();
    for (const b of batches) {
      for (const id of b.entryIds ?? []) ids.add(id);
    }
    return ids;
  }

  private async releaseBatchIdsForEntries(
    institutionId: string,
    termId: string,
    entryIds: string[],
  ): Promise<string[]> {
    const batches = await this.db
      .select({ id: schema.markReleaseBatches.id, entryIds: schema.markReleaseBatches.entryIds })
      .from(schema.markReleaseBatches)
      .where(
        and(
          eq(schema.markReleaseBatches.institutionId, institutionId),
          eq(schema.markReleaseBatches.termId, termId),
          eq(schema.markReleaseBatches.status, 'released'),
        ),
      );
    const set = new Set(entryIds);
    return batches.filter((b) => (b.entryIds ?? []).some((id) => set.has(id))).map((b) => b.id);
  }

  private async requireReportBatch(ctx: PortalActionContext, id: string, version?: number) {
    const [batch] = await this.db
      .select()
      .from(schema.documentBatches)
      .where(
        and(
          eq(schema.documentBatches.id, id),
          eq(schema.documentBatches.institutionId, ctx.principal.institutionId),
          eq(schema.documentBatches.kind, 'report_card'),
        ),
      )
      .limit(1);
    if (!batch) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Report-card batch not found.' });
    if (version != null && batch.version !== version) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Batch changed.' });
    }
    return batch;
  }

  private async maybeAdvanceToSigning(batch: typeof schema.documentBatches.$inferSelect) {
    const reviews = await this.db
      .select()
      .from(schema.reportCardReviews)
      .where(eq(schema.reportCardReviews.batchId, batch.id));
    if (reviews.length && reviews.every((r) => r.status === 'reviewed')) {
      await this.db
        .update(schema.documentBatches)
        .set({ status: 'signing', updatedAt: new Date() })
        .where(
          and(eq(schema.documentBatches.id, batch.id), eq(schema.documentBatches.status, 'review')),
        );
    }
  }

  private async openFlagsForSection(batchId: string, sectionId: string) {
    const students = await this.db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.classId, sectionId));
    const ids = students.map((s) => s.id);
    if (!ids.length) return 0;
    const flagged = await this.db
      .select({ id: schema.documentBatchItems.id })
      .from(schema.documentBatchItems)
      .where(
        and(
          eq(schema.documentBatchItems.batchId, batchId),
          inArray(schema.documentBatchItems.studentId, ids),
          sql`${schema.documentBatchItems.reviewFlag} IS NOT NULL`,
        ),
      );
    return flagged.length;
  }

  private async sectionForStudent(studentId: string) {
    const [s] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    return s?.classId ?? null;
  }

  private async assertTeacherSection(
    ctx: PortalActionContext,
    batch: typeof schema.documentBatches.$inferSelect,
    studentId: string,
  ) {
    const sectionId = await this.sectionForStudent(studentId);
    const allowed = (batch.scope as { sectionIds?: string[] }).sectionIds ?? [];
    if (!sectionId || !allowed.includes(sectionId)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your section.' });
    }
    await this.assertTeacherOwnsSection(ctx, sectionId);
  }

  private async teacherSectionIds(ctx: PortalActionContext): Promise<string[]> {
    const rows = await this.db
      .select({ id: schema.classes.id })
      .from(schema.classes)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.classes.classTeacherId))
      .where(
        and(
          eq(schema.classes.institutionId, ctx.principal.institutionId),
          eq(schema.staff.institutionUserId, ctx.principal.institutionUserId),
        ),
      );
    return rows.map((row) => row.id);
  }

  private async assertTeacherOwnsSection(ctx: PortalActionContext, sectionId: string) {
    const [klass] = await this.db
      .select({ classTeacherId: schema.classes.classTeacherId })
      .from(schema.classes)
      .where(eq(schema.classes.id, sectionId))
      .limit(1);
    if (!klass) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Section not found.' });
    // Soft check: if class_teacher_id is set, require match via staff→institution_user
    if (!klass.classTeacherId) return;
    const [staff] = await this.db
      .select({ institutionUserId: schema.staff.institutionUserId })
      .from(schema.staff)
      .where(eq(schema.staff.id, klass.classTeacherId))
      .limit(1);
    if (staff?.institutionUserId && staff.institutionUserId !== ctx.principal.institutionUserId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not class teacher for this section.' });
    }
  }
}
