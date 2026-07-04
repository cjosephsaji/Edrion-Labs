import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import mammoth from 'mammoth';
import type { PetrosAttachment } from '@edrion/database';
import { AttachmentStorageService } from '../attachment-storage.service';
import { PetrosRepository } from './petros.repository';
import { PetrosOpenAiService } from './openai-client.service';
import type { PortalActionContext } from '../portal-action-context';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (plan Phase 3)
const MAX_PDF_BYTES = 8 * 1024 * 1024; // provider input ceiling we accept before declining

/** Allowed upload types; membership is decided by MAGIC BYTES, never the client mime header. */
const SNIFFS: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.subarray(0, 3).toString('ascii') === 'GIF' },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    test: (b) => b[0] === 0x50 && b[1] === 0x4b, // zip container; refined by extension below
  },
];

/**
 * Petros conversation attachments (Phase 3): store (path-guarded local disk seam, S3/Supabase
 * swappable), sniff magic bytes against the allowlist, and parse at turn-build time:
 * images → input_image blocks, PDFs → OpenAI Files API (`input_file`), docx → extracted text.
 * AV scanning is a documented hook point (BullMQ job), not v1.
 */
@Injectable()
export class PetrosAttachmentService {
  private readonly logger = new Logger(PetrosAttachmentService.name);

  constructor(
    private readonly storage: AttachmentStorageService,
    private readonly repo: PetrosRepository,
    private readonly openai: PetrosOpenAiService,
  ) {}

  async upload(
    ctx: PortalActionContext,
    conversationId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<PetrosAttachment> {
    if (!buffer.length) throw new BadRequestException({ code: 'EMPTY_FILE', message: 'The file is empty.' });
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Files must be 20 MB or smaller.' });
    }
    const sniffed = SNIFFS.find((s) => s.test(buffer))?.mime;
    const isDocxName = /\.docx$/i.test(filename);
    const mime =
      sniffed === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? isDocxName
          ? sniffed
          : undefined
        : sniffed;
    if (!mime) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Only images (png/jpeg/webp/gif), PDF and Word (.docx) files can be attached.',
      });
    }

    const storagePath = await this.storage.save(ctx.principal.institutionId, buffer);
    const attachment = await this.repo.insertAttachment({
      conversationId,
      institutionId: ctx.principal.institutionId,
      institutionUserId: ctx.principal.institutionUserId,
      filename: filename.slice(0, 255),
      storagePath,
      mimeType: mime,
      sizeBytes: buffer.length,
      parseStatus: 'pending',
    });

    // Parse eagerly so the next turn build is cheap. Failures degrade to a labeled note.
    try {
      if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { value } = await mammoth.extractRawText({ buffer });
        await this.repo.updateAttachment(attachment.id, {
          extractedText: value.slice(0, 100_000),
          parseStatus: 'parsed',
        });
      } else if (mime === 'application/pdf' && this.openai.isConfigured) {
        if (buffer.length > MAX_PDF_BYTES) {
          throw new BadRequestException({
            code: 'PDF_TOO_LARGE',
            message: 'PDFs larger than 8 MB cannot be read by Petros — split it or attach the relevant pages.',
          });
        }
        const file = await this.openai.sdk().files.create({
          file: new File([new Uint8Array(buffer)], attachment.filename, { type: mime }),
          purpose: 'user_data',
        });
        await this.repo.updateAttachment(attachment.id, { openaiFileId: file.id, parseStatus: 'parsed' });
      } else {
        await this.repo.updateAttachment(attachment.id, { parseStatus: 'parsed' });
      }
    } catch (e) {
      if (e instanceof BadRequestException) {
        await this.storage.remove(storagePath);
        throw e;
      }
      this.logger.warn(`attachment parse failed: ${e instanceof Error ? e.message : e}`);
      await this.repo.updateAttachment(attachment.id, { parseStatus: 'failed' });
    }
    return (await this.repo.findAttachment(attachment.id, ctx.principal.institutionId))!;
  }

  /**
   * Model input blocks for a set of attachments on the current turn.
   * images → input_image (base64 data URL); pdf → input_file via openai file id (base64 fallback);
   * docx → labeled text block.
   */
  async toInputBlocks(ctx: PortalActionContext, attachmentIds: string[]): Promise<{ blocks: unknown[]; manifest: string[] }> {
    const blocks: unknown[] = [];
    const manifest: string[] = [];
    for (const id of attachmentIds.slice(0, 5)) {
      const a = await this.repo.findAttachment(id, ctx.principal.institutionId);
      if (!a || a.institutionUserId !== ctx.principal.institutionUserId) continue;
      manifest.push(`${a.filename} (${a.mimeType})`);
      if (a.mimeType.startsWith('image/')) {
        const buffer = await this.read(a.storagePath);
        blocks.push({
          type: 'input_image',
          detail: 'auto',
          image_url: `data:${a.mimeType};base64,${buffer.toString('base64')}`,
        });
      } else if (a.mimeType === 'application/pdf') {
        if (a.openaiFileId) {
          blocks.push({ type: 'input_file', file_id: a.openaiFileId });
        } else {
          const buffer = await this.read(a.storagePath);
          blocks.push({ type: 'input_file', filename: a.filename, file_data: `data:application/pdf;base64,${buffer.toString('base64')}` });
        }
      } else if (a.extractedText) {
        blocks.push({ type: 'input_text', text: `Content of attached file "${a.filename}":\n${a.extractedText}` });
      } else {
        blocks.push({ type: 'input_text', text: `The user attached "${a.filename}" but it could not be read.` });
      }
    }
    return { blocks, manifest };
  }

  private read(storagePath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.storage
        .stream(storagePath)
        .on('data', (c) => chunks.push(c as Buffer))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  }
}
