import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { eq, schema, type Database } from '@edrion/database';
import type { StorageObjectDto } from '@edrion/schemas';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';
import { LocalDiskDriver } from './drivers/local-disk.driver';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/ogg',
  'audio/mpeg',
]);
const DOC_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class StudentStorageService {
  private readonly driver: LocalDiskDriver;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {
    if (env.STUDENT_STORAGE_DRIVER !== 'local') {
      throw new Error(`STUDENT_STORAGE_DRIVER "${env.STUDENT_STORAGE_DRIVER}" is not configured yet`);
    }
    this.driver = new LocalDiskDriver(env);
  }

  async upload(
    principal: StudentPrincipal,
    kind: string,
    filename: string | undefined,
    mimeType: string,
    buffer: Buffer,
  ): Promise<StorageObjectDto> {
    if (buffer.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_FILE', message: 'The file is empty.' });
    }
    this.validateKind(kind, mimeType, buffer.length);

    const scopeKey =
      principal.kind === 'institutional'
        ? `inst/${principal.institutionId}/student/${principal.studentId}`
        : `indep/${principal.independentUserId}`;

    const storageKey = await this.driver.put(scopeKey, buffer);
    const [row] = await this.db
      .insert(schema.storageObjects)
      .values({
        institutionId: principal.kind === 'institutional' ? principal.institutionId : null,
        ownerStudentId: principal.kind === 'institutional' ? principal.studentId : null,
        ownerIndependentUserId: principal.kind === 'independent' ? principal.independentUserId : null,
        kind,
        driver: 'local',
        storageKey,
        filename: filename ?? null,
        mimeType,
        sizeBytes: buffer.length,
        processingStatus: 'ready',
        derived: {},
      })
      .returning();

    if (!row) throw new Error('Failed to create storage object');
    return this.toDto(row);
  }

  async getOwned(principal: StudentPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.storageObjects)
      .where(eq(schema.storageObjects.id, id))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
    if (!this.isOwner(principal, row)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not own this file' });
    }
    return row;
  }

  stream(key: string) {
    return this.driver.stream(key);
  }

  /** Read full object bytes (for OCR / PDF extraction). Caller must already own the object. */
  async readBuffer(storageKey: string): Promise<Buffer> {
    return this.driver.read(storageKey);
  }

  /** Remove bytes from disk. Safe if the key is already gone. */
  async removeFile(storageKey: string): Promise<void> {
    await this.driver.remove(storageKey);
  }

  /** Absolute path to a stored object on disk. */
  resolvePath(storageKey: string): string {
    return this.driver.resolvePath(storageKey);
  }

  private isOwner(
    principal: StudentPrincipal,
    row: typeof schema.storageObjects.$inferSelect,
  ): boolean {
    if (principal.kind === 'institutional') {
      return row.ownerStudentId === principal.studentId;
    }
    return row.ownerIndependentUserId === principal.independentUserId;
  }

  private validateKind(kind: string, mimeType: string, size: number): void {
    const allowed = [
      'library_upload',
      'homework_answer',
      'assignment_file',
      'exam_answer',
      'practice_photo',
      'mock_answer',
      'class_material',
      'report_card_pdf',
      'content_page_attachment',
      'request_attachment',
      'debate_exhibit',
      'debate_turn_chunk',
      'avatar',
      'petros_question_photo',
      'petros_handwriting_page',
      'petros_voice_turn',
    ];
    if (!allowed.includes(kind)) {
      throw new BadRequestException({ code: 'INVALID_KIND', message: `Unknown upload kind: ${kind}` });
    }

    if (IMAGE_MIMES.has(mimeType)) {
      if (size > this.env.STUDENT_UPLOAD_MAX_BYTES_IMAGE) {
        throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'Image exceeds size limit.' });
      }
      return;
    }
    if (AUDIO_MIMES.has(mimeType) || mimeType.startsWith('audio/')) {
      if (size > this.env.STUDENT_UPLOAD_MAX_BYTES_DOC) {
        throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'Audio exceeds size limit.' });
      }
      return;
    }
    if (DOC_MIMES.has(mimeType)) {
      if (size > this.env.STUDENT_UPLOAD_MAX_BYTES_DOC) {
        throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: 'Document exceeds size limit.' });
      }
      return;
    }
    throw new BadRequestException({ code: 'INVALID_MIME', message: `MIME type not allowed: ${mimeType}` });
  }

  private toDto(row: typeof schema.storageObjects.$inferSelect): StorageObjectDto {
    return {
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      processingStatus: row.processingStatus as StorageObjectDto['processingStatus'],
      derived: row.derived ?? {},
      createdAt: row.createdAt.toISOString(),
    };
  }
}
