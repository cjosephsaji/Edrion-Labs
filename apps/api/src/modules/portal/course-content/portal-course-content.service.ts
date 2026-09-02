import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type {
  CreateClassMaterialInput,
  CreateClassNoteInput,
  CreateStreamPostInput,
  PublishClassNoteInput,
  UpdateClassNoteInput,
} from '@edrion/schemas';
import { DATABASE, API_ENV } from '../../../common/tokens';
import { LocalDiskDriver } from '../../student/storage/drivers/local-disk.driver';
import { MaterialDocumentPreviewService } from '../../student/materials/material-document-preview.service';
import { MaterialVisualPreviewService } from '../../student/materials/material-visual-preview.service';
import { PortalCrudEngine, type CrudConfig } from '../portal-crud.engine';
import { PortalResourceService, resourceConfig } from '../portal-resource.service';
import { resolveCurrentStaffId } from '../current-staff';
import type { PortalActionContext } from '../portal-action-context';

@Injectable()
export class PortalCourseContentService extends PortalResourceService {
  private readonly driver: LocalDiskDriver;

  constructor(
    crud: PortalCrudEngine,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly documentPreview: MaterialDocumentPreviewService,
    private readonly visualPreviews: MaterialVisualPreviewService,
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
      stage = 'extracting pages for Petros';
      await this.prepareForPetros(material, { ...file, filename: file.filename ?? filename }, buffer);
      return material;
    } catch (error) {
      if (this.env.NODE_ENV !== 'production' && error instanceof Error) {
        throw new BadRequestException({
          code: 'MATERIAL_PUBLISH_FAILED',
          message: `Material preparation failed while ${stage}: ${error.message}`,
        });
      }
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
    const recipients = material.contextType === 'course'
      ? await this.db
          .select({ id: schema.courseEnrollments.studentId })
          .from(schema.courseEnrollments)
          .where(and(
            eq(schema.courseEnrollments.institutionId, material.institutionId),
            eq(schema.courseEnrollments.courseId, material.contextId),
          ))
      : await this.db
          .select({ id: schema.students.id })
          .from(schema.students)
          .where(and(
            eq(schema.students.institutionId, material.institutionId),
            eq(schema.students.classId, material.contextId),
            eq(schema.students.status, 'enrolled'),
          ));
    if (!recipients.length) return;

    const pages = await this.extractPages(file.filename, file.mimeType, buffer);
    const now = new Date();
    for (const recipient of recipients) {
      const [existing] = await this.db
        .select()
        .from(schema.knowledgeItems)
        .where(and(
          eq(schema.knowledgeItems.institutionId, material.institutionId),
          eq(schema.knowledgeItems.studentId, recipient.id),
          sql`${schema.knowledgeItems.origin}->>'classMaterialId' = ${material.id}`,
        ))
        .limit(1);
      const source: typeof schema.knowledgeItems.$inferInsert = {
        institutionId: material.institutionId,
        studentId: recipient.id,
        kind: knowledgeKind(file.filename, file.mimeType),
        title: material.title,
        objectIds: [file.id],
        origin: {
          source: 'teacher_class_material',
          classMaterialId: material.id,
          teacherStaffId: material.postedBy,
          subjectId: material.subjectId,
          extractionMethod: 'digital_text',
        },
        pageCount: pages.length,
        pagesDone: pages.length,
        extractedTextReady: true,
        indexReady: true,
        aiRead: true,
        status: 'ready',
        ingestStage: 'finalizing',
        ingestHeartbeatAt: now,
        errorMessage: null,
        ingestErrorDetail: null,
        version: (existing?.version ?? 0) + 1,
        updatedAt: now,
      };
      const [item] = existing
        ? await this.db.update(schema.knowledgeItems).set(source).where(eq(schema.knowledgeItems.id, existing.id)).returning()
        : await this.db.insert(schema.knowledgeItems).values(source).returning();
      if (!item) throw new Error('Could not prepare the teacher material for Petros');

      await this.db.delete(schema.knowledgeItemPages).where(eq(schema.knowledgeItemPages.itemId, item.id));
      if (pages.length) {
        await this.db.insert(schema.knowledgeItemPages).values(pages.map((text, pageIndex) => ({
          itemId: item.id,
          pageIndex,
          objectId: file.id,
          text,
          needsConfirm: false,
          confirmedAt: now,
        })));
      }
    }
  }

  private async extractPages(filename: string, mimeType: string, buffer: Buffer): Promise<string[]> {
    if (knowledgeKind(filename, mimeType) === 'pdf') {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const document = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false }).promise;
      try {
        const pages: string[] = [];
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
          const page = await document.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items
            .map((item) => ('str' in item ? item.str : ''))
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replaceAll(String.fromCharCode(0), ''));
        }
        return pages;
      } finally {
        await document.destroy();
      }
    }
    const preview = await this.documentPreview.create({ filename, mimeType, buffer });
    return preview.sections.map((section) => {
      const table = section.rows?.map((row) => row.join(' | ')).join('\n') ?? '';
      return [section.title, section.text, table]
        .filter(Boolean)
        .join('\n')
        .trim()
        .replaceAll(String.fromCharCode(0), '');
    });
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
