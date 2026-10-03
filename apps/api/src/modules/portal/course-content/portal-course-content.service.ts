import { AuditWriter } from '@edrion/audit';
import { basePortalAudit } from '../portal-action-context';
import { KnowledgePreparationRepository } from '../../student/knowledge/knowledge-preparation.repository';
import { publishKnowledgeExtraction } from '../../student/knowledge/knowledge-document.service';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  PETROS_DOCUMENT_MAX_FILE_BYTES,
  PETROS_DOCUMENT_SOURCE_VERSION, PETROS_PDF_EXTRACTOR_VERSION, petrosDocumentExtractionSchema, type PetrosDocumentExtraction, type PetrosPdfWorkerResult,
} from '@edrion/schemas';
import { and, desc, eq, inArray, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type {
  CreateClassMaterialInput,
  RepublishClassMaterialInput,
  CreateClassNoteInput,
  CreateStreamPostInput,
  PublishClassNoteInput,
  UpdateClassNoteInput,
  PetrosMaterialCorrectionPreviewInput,
  PetrosMaterialCorrectionReviewInput,
} from '@edrion/schemas';
import { DATABASE, API_ENV, AUDIT_WRITER } from '../../../common/tokens';
import { LocalDiskDriver } from '../../student/storage/drivers/local-disk.driver';
import { MaterialDocumentPreviewService } from '../../student/materials/material-document-preview.service';
import { MaterialVisualPreviewService } from '../../student/materials/material-visual-preview.service';
import { hasUsableDocumentText } from '../../student/petros-session-intent/petros-document-source';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import { resolveCurrentStaffId } from '../current-staff';
import type { PortalActionContext } from '../portal-action-context';
import {
  buildSectionSourceStructure,
  PETROS_DOCUMENT_PARSER_VERSION,
} from './petros-document-extraction';

@Injectable()
export class PortalCourseContentService extends PortalResourceService {
  private readonly driver: LocalDiskDriver;

  constructor(
    crud: PortalCrudEngine,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly documentPreview: MaterialDocumentPreviewService,
    private readonly visualPreviews: MaterialVisualPreviewService,
    private readonly preparations: KnowledgePreparationRepository,
    @Optional() @Inject(AUDIT_WRITER) private readonly correctionAudit?:AuditWriter,
  ) {
    super(crud);
    this.driver = new LocalDiskDriver(env);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    stream: resourceConfig(schema.classStreamPosts, {
      module: 'portal-course-content',
      entityType: 'class_stream_post',
      actionPrefix: 'class_stream',
      search: [schema.classStreamPosts.title, schema.classStreamPosts.body],
      sortable: { postedAt: schema.classStreamPosts.postedAt, createdAt: schema.classStreamPosts.createdAt },
      context: { contextType: schema.classStreamPosts.contextType, contextId: schema.classStreamPosts.contextId },
      subjectId: schema.classStreamPosts.subjectId,
      snapshot: (r) => ({ kind: r.kind, title: r.title }),
    }),
    materials: resourceConfig(schema.classMaterials, {
      module: 'portal-course-content',
      entityType: 'class_material',
      actionPrefix: 'class_material',
      search: [schema.classMaterials.title],
      sortable: { createdAt: schema.classMaterials.createdAt },
      context: { contextType: schema.classMaterials.contextType, contextId: schema.classMaterials.contextId },
      subjectId: schema.classMaterials.subjectId,
      snapshot: (r) => ({ title: r.title, kindLabel: r.kindLabel }),
    }),
    notes: resourceConfig(schema.classNotes, {
      module: 'portal-course-content',
      entityType: 'class_note',
      actionPrefix: 'class_note',
      search: [schema.classNotes.title, schema.classNotes.summary, schema.classNotes.body],
      sortable: {
        createdAt: schema.classNotes.createdAt,
        updatedAt: schema.classNotes.updatedAt,
        publishedAt: schema.classNotes.publishedAt,
      },
      context: { contextType: schema.classNotes.contextType, contextId: schema.classNotes.contextId },
      subjectId: schema.classNotes.subjectId,
      snapshot: (r) => ({ title: r.title, status: r.status }),
    }),
  };

  /**
   * `posted_by` / `author_staff_id` are FKs to `staff`, not to the login row. Passing the
   * institution_user id straight through violates the constraint, which is why nothing
   * authored in the portal UI ever reached the database.
   */
  private staffId(ctx: PortalActionContext): Promise<string | null> {
    return resolveCurrentStaffId(this.db, ctx.principal);
  }

  async createStream(ctx: PortalActionContext, input: CreateStreamPostInput) {
    return this.create('stream', ctx, {
      institutionId: ctx.principal.institutionId,
      contextType: input.contextType,
      contextId: input.contextId,
      subjectId: input.subjectId ?? null,
      kind: input.kind,
      title: input.title ?? null,
      body: input.body ?? null,
      topicKey: input.topicKey ?? null,
      requiresAck: input.requiresAck,
      postedBy: await this.staffId(ctx),
    });
  }

  async createMaterial(ctx: PortalActionContext, input: CreateClassMaterialInput) {
    return this.create('materials', ctx, {
      institutionId: ctx.principal.institutionId,
      contextType: input.contextType,
      contextId: input.contextId,
      subjectId: input.subjectId ?? null,
      title: input.title,
      description: input.description ?? null,
      kindLabel: input.kindLabel,
      objectId: input.objectId,
      weekNo: input.weekNo ?? null,
      postedBy: await this.staffId(ctx),
    });
  }

  /** A new note always starts as a draft; publishing is a separate, explicit action. */
  async createNote(ctx: PortalActionContext, input: CreateClassNoteInput) {
    const staffId = await this.staffId(ctx);
    const row = await this.crud.create<typeof schema.classNotes.$inferSelect>(this.configs.notes!, ctx, {
      institutionId: ctx.principal.institutionId,
      contextType: input.contextType,
      contextId: input.contextId,
      subjectId: input.subjectId ?? null,
      title: input.title,
      summary: input.summary ?? null,
      body: input.body,
      topicKey: input.topicKey ?? null,
      weekNo: input.weekNo ?? null,
      attachmentObjectIds: input.attachmentObjectIds,
      authorStaffId: staffId,
      status: 'draft',
      publishedAt: null,
    });
    await this.recordRevision(row, staffId);
    return row;
  }

  async updateNote(ctx: PortalActionContext, id: string, input: UpdateClassNoteInput) {
    const { version, ...patch } = input;
    const row = await this.crud.update<typeof schema.classNotes.$inferSelect>(
      this.configs.notes!,
      ctx,
      id,
      version,
      patch as Record<string, unknown>,
    );
    await this.recordRevision(row, await this.staffId(ctx));
    return row;
  }

  /**
   * Status transitions carry the published_at stamp with them, because the table's
   * check constraint refuses a published note with no publish time (and vice versa).
   */
  async setNoteStatus(ctx: PortalActionContext, id: string, input: PublishClassNoteInput) {
    return this.crud.update<typeof schema.classNotes.$inferSelect>(this.configs.notes!, ctx, id, input.version, {
      status: input.status,
      publishedAt: input.status === 'published' ? new Date() : null,
    });
  }

  /** Who has opened a published note — the teacher-facing half of the read receipt. */
  async noteReaders(ctx: PortalActionContext, id: string) {
    const note = await this.get('notes', ctx, id);
    if (!note) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Note not found.' });
    const rows = await this.db
      .select({
        studentId: schema.classNoteReads.studentId,
        readAt: schema.classNoteReads.readAt,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        admissionNo: schema.students.admissionNo,
      })
      .from(schema.classNoteReads)
      .innerJoin(schema.students, eq(schema.students.id, schema.classNoteReads.studentId))
      .where(eq(schema.classNoteReads.noteId, id));
    return { items: rows, total: rows.length };
  }

  private async recordRevision(row: typeof schema.classNotes.$inferSelect, staffId: string | null) {
    await this.db
      .insert(schema.classNoteRevisions)
      .values({
        noteId: row.id,
        version: row.version,
        title: row.title,
        summary: row.summary,
        body: row.body,
        editedBy: staffId,
      })
      .onConflictDoNothing();
  }

  /**
   * Upload the file and publish it as a material in one call.
   *
   * The two-step version (upload, then a separate "Add material") let a teacher upload a file,
   * see the filename appear, press the nearest button and walk away believing it was published
   * when no material row had been created. One action, one outcome.
   */
  async publishMaterialFile(
    ctx: PortalActionContext,
    input: {
      contextType: 'class' | 'course';
      contextId: string;
      subjectId?: string | null;
      title?: string | null;
      kindLabel?: string | null;
    },
    filename: string,
    mimeType: string,
    buffer: Buffer,
  ) {
    if (buffer.length > PETROS_DOCUMENT_MAX_FILE_BYTES) {
      throw new BadRequestException({ code: 'PETROS_DOCUMENT_LIMIT', message: 'The file exceeds the 20 MiB text-preparation limit.' });
    }
    if (knowledgeKind(filename, mimeType) === 'pdf') await this.preparations.admitNewPublication(ctx);
    let stage = 'storing the uploaded file';
    try {
      const file = await this.uploadMaterialFile(ctx, filename, mimeType, buffer);
      stage = 'publishing the class material';
      const title = input.title?.trim() || filename.replace(/\.[^.]+$/, '');
      const material = await this.createMaterial(ctx, {
        contextType: input.contextType,
        contextId: input.contextId,
        subjectId: input.subjectId ?? null,
        title,
        description: null,
        kindLabel: input.kindLabel?.trim() || kindLabelFor(filename, mimeType),
        objectId: file.id,
        weekNo: null,
      }) as typeof schema.classMaterials.$inferSelect;
      stage = 'queuing preparation for Petros';
      if (knowledgeKind(filename, mimeType) === 'pdf') await this.preparations.enqueue(ctx, material);
      else await this.prepareForPetros(material, { ...file, filename: file.filename ?? filename }, buffer);
      return material;
    } catch (error) {
      if (!(error instanceof HttpException) && this.env.NODE_ENV !== 'production' && error instanceof Error) {
        throw new BadRequestException({
          code: 'MATERIAL_PUBLISH_FAILED',
          message: `Material preparation failed while ${stage}: ${error.message}`,
        });
      }
      throw error;
    }
  }

  /** Existing portal permission/scope/audit owner; request tenant transaction includes every write. */
  async republishMaterial(ctx: PortalActionContext, id: string, input: RepublishClassMaterialInput) {
    return this.republishAuthorizedMaterial(ctx,id,input,ctx.principal.institutionUserId);
  }
  private async republishAuthorizedMaterial(ctx:PortalActionContext,id:string,input:RepublishClassMaterialInput,uploaderId:string){
    // Scope check before the lock. Recheck the row after waiting for a concurrent publisher.
    await this.get('materials', ctx, id);
    const [material] = await this.db.select().from(schema.classMaterials).where(and(
      eq(schema.classMaterials.id, id), eq(schema.classMaterials.institutionId, ctx.principal.institutionId),
    )).for('update').limit(1);
    if (!material) throw new NotFoundException('Material unavailable');
    const replay = material.objectId === input.objectId && material.version === input.version + 1;
    if (material.version !== input.version && !replay) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Reload the material before republishing.' });
    const [file] = await this.db.select().from(schema.storageObjects).where(and(
      eq(schema.storageObjects.id, input.objectId), eq(schema.storageObjects.institutionId, ctx.principal.institutionId),
      eq(schema.storageObjects.ownerStaffUserId, uploaderId),
    )).limit(1);
    if (!file || file.driver !== 'local' || file.processingStatus !== 'ready') throw new NotFoundException('Original file unavailable');
    if (file.sizeBytes > PETROS_DOCUMENT_MAX_FILE_BYTES || await this.driver.size(file.storageKey) > PETROS_DOCUMENT_MAX_FILE_BYTES) {
      throw new BadRequestException({ code: 'PETROS_DOCUMENT_LIMIT', message: 'The file exceeds the 20 MiB text-preparation limit.' });
    }
    const buffer = await this.driver.read(file.storageKey);
    if (createHash('sha256').update(buffer).digest('hex') !== file.checksumSha256) throw new ConflictException('The original file changed in storage');
    const updated = material.objectId === file.id ? material : await this.update('materials', ctx, id, {
      version: input.version, objectId: file.id, kindLabel: kindLabelFor(file.filename ?? '', file.mimeType),
    }) as typeof material;
    if (knowledgeKind(file.filename ?? '', file.mimeType) === 'pdf') await this.preparations.enqueue(ctx, updated);
    else await this.prepareForPetros(updated, { ...file, filename: file.filename ?? 'material' }, buffer);
    return updated;
  }

  private async requireCorrectionStaff(ctx:PortalActionContext) {
    const [user]=await this.db.select({id:schema.institutionUsers.id}).from(schema.institutionUsers).where(and(
      eq(schema.institutionUsers.id,ctx.principal.institutionUserId),eq(schema.institutionUsers.institutionId,ctx.principal.institutionId),eq(schema.institutionUsers.status,'active'))).limit(1);
    if(!user||!await resolveCurrentStaffId(this.db,ctx.principal))throw new ForbiddenException({code:'PETROS_CORRECTION_REVIEWER_REQUIRED'});
  }

  async listMaterialCorrections(ctx: PortalActionContext, id: string) {
    if (!this.env.PETROS_CONTINUITY_ENABLED) throw new ForbiddenException({ code: 'PETROS_PHASE4_DISABLED' });
    await this.requireCorrectionStaff(ctx);
    await this.get('materials', ctx, id);
    const items = await this.db.select().from(schema.petrosMaterialCorrections).where(and(
      eq(schema.petrosMaterialCorrections.institutionId, ctx.principal.institutionId),
      eq(schema.petrosMaterialCorrections.materialId, id),
    )).orderBy(desc(schema.petrosMaterialCorrections.createdAt)).limit(50);
    return { items };
  }

  /** Preview a teacher correction without exposing learner content or changing the live material. */
  async previewMaterialCorrection(ctx: PortalActionContext, id: string, input: PetrosMaterialCorrectionPreviewInput) {
    if (!this.env.PETROS_CONTINUITY_ENABLED) throw new ForbiddenException({ code: 'PETROS_PHASE4_DISABLED' });
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${ctx.principal.institutionId}`},0))`);
    await this.requireCorrectionStaff(ctx);
    const material = await this.get('materials', ctx, id) as typeof schema.classMaterials.$inferSelect;

    const [file] = await this.db.select({ id: schema.storageObjects.id }).from(schema.storageObjects).where(and(
      eq(schema.storageObjects.id, input.objectId), eq(schema.storageObjects.institutionId, ctx.principal.institutionId),
      eq(schema.storageObjects.ownerStaffUserId, ctx.principal.institutionUserId), eq(schema.storageObjects.processingStatus, 'ready'),
    )).limit(1);
    if (!file) throw new NotFoundException({ code: 'CORRECTION_SOURCE_UNAVAILABLE' });
    const sources = await this.db.select({ id: schema.knowledgeItems.id, studentId: schema.knowledgeItems.studentId }).from(schema.knowledgeItems)
      .where(and(eq(schema.knowledgeItems.institutionId, ctx.principal.institutionId),
        sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${id}`));
    const versions = sources.length ? await this.db.select({id:schema.knowledgeItemVersions.id,fingerprint:schema.knowledgeItemVersions.fingerprint}).from(schema.knowledgeItemVersions)
      .where(inArray(schema.knowledgeItemVersions.itemId,sources.map(source=>source.id))) : [];
    const fingerprints=versions.map(version=>version.fingerprint);
    const impactedPacks = fingerprints.length ? await this.db.select({id:schema.petrosTeachingPackCandidates.id}).from(schema.petrosTeachingPackCandidates)
      .where(and(eq(schema.petrosTeachingPackCandidates.institutionId,ctx.principal.institutionId),inArray(schema.petrosTeachingPackCandidates.sourceVersion,fingerprints))) : [];
    const impacts = await this.db.execute(sql`select
      (select count(*)::int from knowledge_item_version_pages p where p.version_id in (select v.id from knowledge_item_versions v join knowledge_items k on k.id=v.item_id where k.institution_id=${ctx.principal.institutionId} and k.origin->>'classMaterialId'=${id})) as locators,
      (select count(*)::int from petros_learning_sessions s where s.institution_id=${ctx.principal.institutionId} and s.source_context->>'referenceId' in (select k.id::text from knowledge_items k where k.institution_id=${ctx.principal.institutionId} and k.origin->>'classMaterialId'=${id})) as sessions`);
    const idempotent = await this.db.select().from(schema.petrosMaterialCorrections).where(and(
      eq(schema.petrosMaterialCorrections.institutionId, ctx.principal.institutionId),
      eq(schema.petrosMaterialCorrections.commandId, input.commandId),
    )).limit(1);
    const requestHash = createHash('sha256').update(JSON.stringify({materialId:id,...input})).digest('hex');
    if (idempotent[0]) {
      if (idempotent[0].requestHash !== requestHash) throw new ConflictException({ code: 'MATERIAL_CORRECTION_COMMAND_REUSED' });
      return idempotent[0];
    }
    if(material.version!==input.expectedMaterialVersion)throw new ConflictException({code:'MATERIAL_VERSION_CONFLICT'});
    const correctionId = randomUUID();
    const preview = { materialId: id, currentVersion: material.version, proposedObjectId: input.objectId,
      affectedLearners: new Set(sources.map((source) => source.studentId)).size, affectedSourceRecords: sources.length,
      historicalCitationPolicy: 'preserve_and_invalidate_current_authority', privateContentInspected: false,
      meaningChanged: input.meaningChanged, affectedSourceVersions:versions, affectedPacks:impactedPacks.length,
      affectedLocators:Number(impacts[0]?.locators??0), affectedSessionRecommendations:Number(impacts[0]?.sessions??0),
      evaluationPolicy:'Historical evaluations retain their original version; current source-dependent assessment requires revalidation.' };
    const [row] = await this.db.insert(schema.petrosMaterialCorrections).values({
      id: correctionId, institutionId: ctx.principal.institutionId, materialId: id, proposedObjectId: input.objectId,
      expectedMaterialVersion: input.expectedMaterialVersion, proposedBy: ctx.principal.institutionUserId,
      reason: input.reason, meaningChanged: input.meaningChanged, status: 'preview', version: 1,
      preview, commandId: input.commandId, requestHash,
    }).returning();
    await this.logCorrection(ctx,correctionId,'preview',{version:1,...preview});
    return row;
  }

  private logCorrection(ctx:PortalActionContext,id:string,action:string,state:Record<string,unknown>){return (this.correctionAudit??new AuditWriter(this.db)).logAudit({...basePortalAudit(ctx),module:'petros',action:`petros.material_correction.${action}`,entityType:'petros_material_correction',entityId:id,newState:state} as Parameters<AuditWriter['logAudit']>[0]);}

  /** A second staff account reviews; approval publishes through the existing material owner. */
  async reviewMaterialCorrection(ctx: PortalActionContext, id: string, correctionId: string, input: PetrosMaterialCorrectionReviewInput) {
    if (!this.env.PETROS_CONTINUITY_ENABLED) throw new ForbiddenException({ code: 'PETROS_PHASE4_DISABLED' });
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`petros-knowledge:${ctx.principal.institutionId}`},0))`);
    await this.get('materials',ctx,id);
    await this.requireCorrectionStaff(ctx);
    const [correction] = await this.db.select().from(schema.petrosMaterialCorrections).where(and(
      eq(schema.petrosMaterialCorrections.id, correctionId), eq(schema.petrosMaterialCorrections.institutionId, ctx.principal.institutionId),
      eq(schema.petrosMaterialCorrections.materialId, id),
    )).for('update').limit(1);
    if (!correction) throw new NotFoundException({ code: 'MATERIAL_CORRECTION_NOT_FOUND' });
    if(correction.status==='published'||correction.status==='rejected'){if(correction.reviewedBy!==ctx.principal.institutionUserId||correction.reviewReason!==input.reviewReason||(correction.status==='published')!==(input.decision==='approve'))throw new ConflictException({code:'MATERIAL_CORRECTION_REPLAY_CONFLICT'});return correction;}
    if (correction.version !== input.expectedVersion) throw new ConflictException({ code: 'MATERIAL_CORRECTION_VERSION_CONFLICT' });
    if (correction.status !== 'preview') throw new ConflictException({ code: 'MATERIAL_CORRECTION_NOT_REVIEWABLE' });
    if (correction.proposedBy === ctx.principal.institutionUserId) throw new ForbiddenException({ code: 'MATERIAL_CORRECTION_AUTHOR_CANNOT_REVIEW' });
    if (input.decision === 'reject') {
      const [rejected] = await this.db.update(schema.petrosMaterialCorrections).set({ status: 'rejected', reviewedBy: ctx.principal.institutionUserId,
        reviewReason: input.reviewReason, reviewedAt: new Date(), version: correction.version + 1 }).where(and(
          eq(schema.petrosMaterialCorrections.id, correction.id), eq(schema.petrosMaterialCorrections.version, input.expectedVersion),
        )).returning();
      await this.logCorrection(ctx,correction.id,'reject',{materialId:id,version:rejected!.version});
      return rejected;
    }
    const [material] = await this.db.select().from(schema.classMaterials).where(and(eq(schema.classMaterials.id, id),
      eq(schema.classMaterials.institutionId, ctx.principal.institutionId))).limit(1);
    if (!material || material.version !== correction.expectedMaterialVersion) throw new ConflictException({ code: 'MATERIAL_VERSION_CONFLICT' });
    // Lock is acquired by republishMaterial. Keep old extraction versions as evidence, but deny their use as current sources.
    const oldSources = await this.db.select({ id: schema.knowledgeItemVersions.id }).from(schema.knowledgeItemVersions).innerJoin(schema.knowledgeItems,eq(schema.knowledgeItems.id,schema.knowledgeItemVersions.itemId)).where(and(
      eq(schema.knowledgeItems.institutionId, ctx.principal.institutionId), sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${id}`));
    await this.db.update(schema.petrosMaterialCorrections).set({ status: 'publishing', reviewedBy: ctx.principal.institutionUserId,
      reviewReason: input.reviewReason, reviewedAt: new Date(), version: correction.version + 1 }).where(and(
        eq(schema.petrosMaterialCorrections.id, correction.id), eq(schema.petrosMaterialCorrections.version, input.expectedVersion),
      ));
    try {
      const materialAfter = await this.republishAuthorizedMaterial(ctx, id, { objectId: correction.proposedObjectId, version: correction.expectedMaterialVersion },correction.proposedBy);
      if (oldSources.length) await this.db.update(schema.knowledgeItemVersions).set({ invalidatedAt: new Date(),
        invalidationReason: correction.reason.slice(0, 1000) }).where(inArray(schema.knowledgeItemVersions.id, oldSources.map((source) => source.id)));
      const [published] = await this.db.update(schema.petrosMaterialCorrections).set({ status: 'published', publishedMaterialVersion: materialAfter.version,
        version: correction.version + 2 }).where(eq(schema.petrosMaterialCorrections.id, correction.id)).returning();
      await this.logCorrection(ctx,correction.id,'publish',{materialId:id,version:published!.version,publishedMaterialVersion:materialAfter.version,invalidatedSources:oldSources.length});
      return published;
    } catch (error) {
      await this.db.update(schema.petrosMaterialCorrections).set({ status: 'preview', version: correction.version + 2 }).where(eq(schema.petrosMaterialCorrections.id, correction.id));
      throw error;
    }
  }

  /**
   * A published teacher file is also a Petros source for every student who can see it. This is
   * intentionally part of the normal publish path: teachers should never have to run a seed or a
   * second ingestion tool before a student can learn from a real class document.
   */
  private async prepareForPetros(
    material: typeof schema.classMaterials.$inferSelect,
    file: { id: string; filename: string; mimeType: string },
    buffer: Buffer,
  ) {
    const prepared = await this.extractPages(file.filename, file.mimeType, buffer);
    return this.persistPreparedMaterial(material, file, buffer.length, prepared);
  }

  /** Called only after a durable claim and current permission/source validation, in the commit transaction. */
  async publishPreparedPdf(material: typeof schema.classMaterials.$inferSelect,
    file: typeof schema.storageObjects.$inferSelect, result: PetrosPdfWorkerResult,
  ) {
    if (result.fileSha256 !== file.checksumSha256) throw new ConflictException('Original checksum changed');
    const extraction = petrosDocumentExtractionSchema.parse({
      schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION, fileSha256: result.fileSha256,
      indexing: 'not_built', representation: 'pdf_text', extractorVersion: PETROS_PDF_EXTRACTOR_VERSION,
      truncated: false, readable: result.pages.some((text) => text.trim()),
    });
    await this.persistPreparedMaterial(material, { ...file, filename: file.filename ?? 'material.pdf' },
      file.sizeBytes, { pages: result.pages, extraction });
  }

  private async persistPreparedMaterial(material: typeof schema.classMaterials.$inferSelect,
    file: { id: string; filename: string; mimeType: string }, sizeBytes: number,
    { pages, extraction }: { pages: string[]; extraction: PetrosDocumentExtraction },
  ) {
    const recipients = material.contextType === 'course'
      ? await this.db
          .select({ id: schema.courseEnrollments.studentId })
          .from(schema.courseEnrollments)
          .where(and(
            eq(schema.courseEnrollments.institutionId, material.institutionId),
            eq(schema.courseEnrollments.courseId, material.contextId),
          )).limit(101)
      : await this.db
          .select({ id: schema.students.id })
          .from(schema.students)
          .where(and(
            eq(schema.students.institutionId, material.institutionId),
            eq(schema.students.classId, material.contextId),
            eq(schema.students.status, 'enrolled'),
          )).limit(101);
    if (recipients.length > 100 || recipients.length * pages.reduce((n, page) => n + page.length, 0) > 20_000_000) {
      throw new BadRequestException({ code: 'PETROS_PREPARATION_FANOUT_LIMIT', message: 'This material exceeds the bounded preparation capacity.' });
    }

    // Build the shared text structure from the bounded extraction. Geometry and
    // visual coverage remain unknown until a separate reviewed mapping exists.
    const structure = buildSectionSourceStructure(extraction.fileSha256, pages.map((text) => ({ text })));
    const now = new Date();
    const [revision] = await this.db.insert(schema.petrosDocumentSourceRevisions).values({
      institutionId: material.institutionId,
      classMaterialId: material.id,
      sourceKey: `material:${material.id}`,
      title: material.title,
      mimeType: file.mimeType,
      documentVersion: material.version,
      checksum: structure.checksum,
      parserVersion: PETROS_DOCUMENT_PARSER_VERSION,
      extractionStatus: structure.extractionComplete ? 'ready' : 'needs_attention',
      structure: structure as unknown as Record<string, unknown>,
      warnings: structure.warnings,
    }).onConflictDoUpdate({
      target: [
        schema.petrosDocumentSourceRevisions.institutionId,
        schema.petrosDocumentSourceRevisions.sourceKey,
        schema.petrosDocumentSourceRevisions.documentVersion,
        schema.petrosDocumentSourceRevisions.checksum,
        schema.petrosDocumentSourceRevisions.parserVersion,
      ],
      set: { structure: structure as unknown as Record<string, unknown>, warnings: structure.warnings, extractionStatus: structure.extractionComplete ? 'ready' : 'needs_attention', updatedAt: now },
    }).returning();
    let canonicalLinked = Boolean(revision?.canonicalKnowledgeItemId);
    // Keep the shared extraction even when nobody is enrolled yet. A later
    // enrollment can be mapped without asking the teacher to upload again.
    if (!recipients.length) return;
    for (const recipient of recipients) {
      await this.db.transaction(async (tx) => {
        // Serialize both first publication and retries before looking up the canonical owner.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${material.institutionId}:${recipient.id}:${material.id}`}, 0))`);
        const [currentMaterial] = await tx.select().from(schema.classMaterials)
          .where(and(eq(schema.classMaterials.id, material.id), eq(schema.classMaterials.institutionId, material.institutionId))).limit(1);
        if (!currentMaterial || currentMaterial.objectId !== file.id || currentMaterial.version !== material.version) throw new Error('Material was removed or replaced before extraction publication');
        const [deleted] = await tx.select().from(schema.knowledgeItemTombstones).where(and(
          eq(schema.knowledgeItemTombstones.institutionId, material.institutionId),
          eq(schema.knowledgeItemTombstones.studentId, recipient.id),
          eq(schema.knowledgeItemTombstones.materialId, material.id),
        )).limit(1);
        if (deleted) throw new NotFoundException({ code: 'PETROS_SOURCE_DELETED', message: 'This student knowledge source was removed. Publication retries cannot restore it.' });
        const [existing] = await tx
          .select()
          .from(schema.knowledgeItems)
          .where(and(
            eq(schema.knowledgeItems.institutionId, material.institutionId),
            eq(schema.knowledgeItems.studentId, recipient.id),
            sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${material.id}`,
          ))
          .limit(1);
        if (existing?.sourceRevokedAt) throw new Error('This knowledge source was revoked');
        const source: typeof schema.knowledgeItems.$inferInsert = {
          institutionId: material.institutionId,
          studentId: recipient.id,
          kind: knowledgeKind(file.filename, file.mimeType),
          title: material.title,
          objectIds: [file.id],
          origin: {
            source: 'teacher_class_material',
            classMaterialId: material.id,
            materialVersion: material.version,
            teacherStaffId: material.postedBy,
            subjectId: material.subjectId,
            extractionMethod: extraction.representation === 'pdf_text' ? 'digital_text' : 'preview_text',
            petrosExtraction: extraction,
            sourceFile: { filename: file.filename, mimeType: file.mimeType, sizeBytes },
          },
          pageCount: pages.length,
          pagesDone: pages.length,
          extractedTextReady: pages.some(hasUsableDocumentText),
          // Page lookup exists; a lexical/semantic retrieval index has not been built.
          indexReady: false,
          aiRead: false,
          status: extraction.representation === 'pdf_text' && !extraction.truncated && pages.length > 0 && pages.every(hasUsableDocumentText)
            ? 'ready' : 'needs_ocr_confirm',
          ingestStage: 'finalizing',
          ingestHeartbeatAt: now,
          errorMessage: null,
          ingestErrorDetail: null,
          version: (existing?.version ?? 0) + 1,
          updatedAt: now,
        };
        let item: typeof schema.knowledgeItems.$inferSelect;
        if (existing) {
          if (extraction.representation === 'pdf_text') {
            const version = await publishKnowledgeExtraction(tx, { ...existing, ...source } as typeof existing, pages);
            if (version.replayed) {
              if (revision && !canonicalLinked) {
                await tx.update(schema.petrosDocumentSourceRevisions).set({ canonicalKnowledgeItemId: existing.id, updatedAt: now })
                  .where(eq(schema.petrosDocumentSourceRevisions.id, revision.id));
                canonicalLinked = true;
              }
              return; // identical replay
            }
          }
          [item] = await tx.update(schema.knowledgeItems).set(source).where(eq(schema.knowledgeItems.id, existing.id)).returning() as [typeof existing];
        } else {
          [item] = await tx.insert(schema.knowledgeItems).values(source).returning() as [typeof schema.knowledgeItems.$inferSelect];
          if (extraction.representation === 'pdf_text') await publishKnowledgeExtraction(tx, item, pages);
        }
        if (!item) throw new Error('Could not prepare the teacher material for Petros');

        if (revision && !canonicalLinked) {
          await tx.update(schema.petrosDocumentSourceRevisions).set({ canonicalKnowledgeItemId: item.id, updatedAt: now })
            .where(eq(schema.petrosDocumentSourceRevisions.id, revision.id));
          canonicalLinked = true;
        }

        await tx.delete(schema.knowledgeItemPages).where(eq(schema.knowledgeItemPages.itemId, item.id));
        if (pages.length) {
          await tx.insert(schema.knowledgeItemPages).values(pages.map((text, pageIndex) => ({
            itemId: item.id,
            pageIndex,
            objectId: file.id,
            text,
            needsConfirm: !hasUsableDocumentText(text),
            // Parsing is not human confirmation of transcription quality.
            confirmedAt: null,
          })));
        }
      });
    }
  }

  private async extractPages(filename: string, mimeType: string, buffer: Buffer): Promise<{ pages: string[]; extraction: PetrosDocumentExtraction }> {
    if (buffer.length > PETROS_DOCUMENT_MAX_FILE_BYTES) {
      throw new BadRequestException({ code: 'PETROS_DOCUMENT_LIMIT', message: 'The file exceeds the 20 MiB text-preparation limit.' });
    }
    const metadata = {
      schemaVersion: PETROS_DOCUMENT_SOURCE_VERSION,
      fileSha256: createHash('sha256').update(buffer).digest('hex'),
      indexing: 'not_built' as const,
    };
    if (knowledgeKind(filename, mimeType) === 'pdf') {
      throw new ConflictException({ code: 'PETROS_PREPARATION_REQUIRED', message: 'PDF preparation requires the restricted worker.' });
    }
    const preview = await this.documentPreview.create({ filename, mimeType, buffer });
    const pages = preview.readable ? preview.sections.map((section) => {
      const table = section.rows?.map((row) => row.join(' | ')).join('\n') ?? '';
      return [section.title, section.text, table]
        .filter(Boolean)
        .join('\n')
        .trim()
        .replaceAll(String.fromCharCode(0), '');
    }) : [];
    return { pages, extraction: petrosDocumentExtractionSchema.parse({
      ...metadata, representation: 'preview_text', extractorVersion: 'material-preview-v1',
      truncated: preview.truncated, readable: preview.readable,
    }) };
  }

  async uploadMaterialFile(ctx: PortalActionContext, filename: string, mimeType: string, buffer: Buffer) {
    if (!buffer.length) throw new BadRequestException({ code: 'EMPTY_FILE', message: 'The file is empty.' });
    const scopeKey = `inst/${ctx.principal.institutionId}/staff/${ctx.principal.institutionUserId}`;
    const storageKey = await this.driver.put(scopeKey, buffer);
    const [row] = await this.db
      .insert(schema.storageObjects)
      .values({
        institutionId: ctx.principal.institutionId,
        ownerStaffUserId: ctx.principal.institutionUserId,
        kind: 'class_material',
        driver: 'local',
        storageKey,
        filename: filename.slice(0, 255),
        mimeType,
        sizeBytes: buffer.length,
        checksumSha256: createHash('sha256').update(buffer).digest('hex'),
        processingStatus: 'ready',
        derived: {},
      })
      .returning();
    if (!row) throw new Error('Failed to store file');
    await this.visualPreviews.resolve({
      objectId: row.id,
      storageKey: row.storageKey,
      filename: row.filename,
      mimeType: row.mimeType,
      derived: row.derived,
    }, buffer);
    return { id: row.id, filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
  }
}

/** A readable type label from the file itself, so nobody has to type "PDF" by hand. */
function kindLabelFor(filename: string, mimeType: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'PDF', doc: 'Doc', docx: 'Doc', ppt: 'Slides', pptx: 'Slides',
    xls: 'Sheet', xlsx: 'Sheet', csv: 'Sheet', txt: 'Notes', md: 'Notes',
    png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image', webp: 'Image',
    zip: 'Archive',
  };
  if (byExt[ext]) return byExt[ext];
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  return 'File';
}

function knowledgeKind(filename: string, mimeType: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || mimeType.toLowerCase().includes('pdf')) return 'pdf';
  if (['ppt', 'pptx', 'odp'].includes(ext) || /presentation|powerpoint/i.test(mimeType)) return 'slides';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || /word|document/i.test(mimeType)) return 'document';
  if (['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(ext) || /sheet|excel|csv/i.test(mimeType)) return 'spreadsheet';
  if (mimeType.startsWith('image/')) return 'image';
  return 'document';
}
