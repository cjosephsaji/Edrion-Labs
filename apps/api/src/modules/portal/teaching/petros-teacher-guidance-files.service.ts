import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, inArray, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { PETROS_GUIDANCE_FILE_ACCEPT, PETROS_GUIDANCE_MAX_FILE_BYTES } from '@edrion/schemas';
import { API_ENV, DATABASE } from '../../../common/tokens';
import type { PortalActionContext } from '../portal-action-context';
import { LocalDiskDriver } from '../../student/storage/drivers/local-disk.driver';
import { MaterialDocumentPreviewService } from '../../student/materials/material-document-preview.service';
import { canonicalMaterialMimeType, materialFileExtension } from '../../student/materials/material-file-types';
import { KnowledgePdfProcess, PdfPreparationError } from '../../student/knowledge/knowledge-pdf-process';
import { guidanceFileMetadata, PETROS_GUIDANCE_FILE_KIND } from '../../student/assignments/petros-guidance-files';

@Injectable()
export class PetrosTeacherGuidanceFilesService {
  private readonly driver: LocalDiskDriver;
  constructor(@Inject(DATABASE) private readonly db: Database, @Inject(API_ENV) env: ApiEnv,
    @Inject(MaterialDocumentPreviewService) private readonly preview: MaterialDocumentPreviewService,
    @Inject(KnowledgePdfProcess) private readonly pdf: KnowledgePdfProcess) {
    this.driver = new LocalDiskDriver(env);
  }

  async upload(ctx: PortalActionContext, classId: string, subjectId: string, rawName: string, suppliedMime: string, buffer: Buffer) {
    const filename = Array.from(rawName.split(/[/\\]/).pop()!).filter((character) =>
      character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').slice(0, 255);
    if (!buffer.length) throw new BadRequestException('The file is empty.');
    if (buffer.length > PETROS_GUIDANCE_MAX_FILE_BYTES) throw new PayloadTooLargeException('Choose a file up to 20 MiB.');
    const extension = materialFileExtension(filename);
    if (!extension || !PETROS_GUIDANCE_FILE_ACCEPT.split(',').includes(`.${extension}`)) {
      throw new BadRequestException('Choose a PDF, document, presentation, spreadsheet, text file, or image.');
    }
    const mimeType = canonicalMaterialMimeType(filename, suppliedMime);
    let text = '', truncated = false;
    if (extension === 'pdf') {
      try {
        const result = await this.pdf.extract(buffer, new AbortController().signal);
        text = result.pages.join('\n\n');
      } catch (error) {
        if (!(error instanceof PdfPreparationError)) throw error;
        // The original remains available. Never claim unreadable/scanned PDFs were grounded.
      }
    } else if (!mimeType.startsWith('image/')) {
      const result = await this.preview.create({ filename, mimeType, buffer });
      text = result.readable ? result.sections.map((section) => [section.title, section.text,
        section.rows?.map((row) => row.join(' | ')).join('\n')].filter(Boolean).join('\n')).join('\n\n') : '';
      truncated = result.truncated;
    }
    text = text.replaceAll(String.fromCharCode(0), '');
    truncated ||= text.length > 40_000;
    const storageKey = await this.driver.put(`inst/${ctx.principal.institutionId}/staff/${ctx.principal.institutionUserId}`, buffer);
    try {
      const [file] = await this.db.insert(schema.storageObjects).values({ institutionId: ctx.principal.institutionId,
        ownerStaffUserId: ctx.principal.institutionUserId, kind: PETROS_GUIDANCE_FILE_KIND, driver: 'local', storageKey,
        filename, mimeType, sizeBytes: buffer.length, checksumSha256: createHash('sha256').update(buffer).digest('hex'),
        processingStatus: 'ready', derived: { guidanceBinding: { classId, subjectId },
          guidanceText: { text: text.slice(0, 40_000), truncated, extractionVersion: 'document-preview.v2' } } }).returning();
      if (!file) throw new Error('File could not be stored.');
      return guidanceFileMetadata(file);
    } catch (error) { await this.driver.remove(storageKey); throw error; }
  }

  async resolve(ctx: PortalActionContext, classId: string, subjectId: string, ids: string[], ownOnly = true) {
    if (!ids.length) return [];
    const files = await this.db.select().from(schema.storageObjects).where(and(
      inArray(schema.storageObjects.id, ids), eq(schema.storageObjects.institutionId, ctx.principal.institutionId),
      eq(schema.storageObjects.kind, PETROS_GUIDANCE_FILE_KIND), eq(schema.storageObjects.processingStatus, 'ready'),
      ownOnly ? eq(schema.storageObjects.ownerStaffUserId, ctx.principal.institutionUserId) : undefined,
      sql`${schema.storageObjects.derived}->'guidanceBinding'->>'classId' = ${classId}`,
      sql`${schema.storageObjects.derived}->'guidanceBinding'->>'subjectId' = ${subjectId}`,
    ));
    if (files.length !== ids.length) throw new NotFoundException('An attached file is unavailable for this class and subject.');
    return ids.map((id) => files.find((file) => file.id === id)!);
  }

  stream(key: string) { return this.driver.stream(key); }
}
