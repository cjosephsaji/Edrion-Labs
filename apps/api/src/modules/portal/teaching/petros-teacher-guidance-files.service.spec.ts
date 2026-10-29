import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PETROS_GUIDANCE_MAX_FILE_BYTES } from '@edrion/schemas';
import { PetrosTeacherGuidanceFilesService } from './petros-teacher-guidance-files.service';
import { MaterialDocumentPreviewService } from '../../student/materials/material-document-preview.service';
import { PdfPreparationError } from '../../student/knowledge/knowledge-pdf-process';
import { LocalDiskDriver } from '../../student/storage/drivers/local-disk.driver';
import { guidanceFileExcerpts } from '../../student/assignments/petros-guidance-files';
import type { PortalActionContext } from '../portal-action-context';

const roots: string[] = [];
const ctx = { principal: { institutionId: 'institution', institutionUserId: 'teacher' } } as PortalActionContext;
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'petros-guidance-test-')); roots.push(root);
  let stored: Record<string, unknown> | undefined;
  const db = { insert: vi.fn(() => ({ values: (value: Record<string, unknown>) => {
    stored = value; return { returning: async () => [{ id: 'file', version: 1, ...value }] };
  } })), select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })) };
  const env = { STUDENT_STORAGE_DIR: root };
  const pdf = { extract: vi.fn().mockResolvedValue({ pages: ['Equivalent fractions have equal values.'], fileSha256: 'a'.repeat(64) }) };
  return { service: new PetrosTeacherGuidanceFilesService(db as never, env as never,
    new MaterialDocumentPreviewService(), pdf as never), db, pdf, driver: new LocalDiskDriver(env as never), stored: () => stored };
}

describe('teacher goal attachment storage and grounding', () => {
  it('stores the original privately and extracts real text for the learning goal', async () => {
    const { service, stored, driver } = await harness();
    const bytes = Buffer.from('Equivalent fractions\n\nOne half equals two quarters.');
    const file = await service.upload(ctx, 'class', 'subject', '../fractions.txt', 'application/octet-stream', bytes);
    expect(file).toMatchObject({ filename: 'fractions.txt', mimeType: 'text/plain', sizeBytes: bytes.length, textStatus: 'readable' });
    expect(stored()).toMatchObject({ institutionId: 'institution', ownerStaffUserId: 'teacher', kind: 'petros_guidance_attachment',
      derived: { guidanceBinding: { classId: 'class', subjectId: 'subject' }, guidanceText: { text: expect.stringContaining('two quarters') } } });
    expect(await driver.read(stored()!.storageKey as string)).toEqual(bytes);
    expect(guidanceFileExcerpts([{ ...stored(), id: 'file' } as never], 'Equivalent fractions', 1)[0]).toContain('One half equals two quarters');
  });
  it('uses the restricted PDF worker rather than binary strings as PDF text', async () => {
    const { service, pdf } = await harness();
    const bytes = Buffer.from('%PDF-source');
    expect(await service.upload(ctx, 'class', 'subject', 'fractions.pdf', 'application/pdf', bytes)).toMatchObject({ textStatus: 'readable' });
    expect(pdf.extract).toHaveBeenCalledWith(bytes, expect.any(AbortSignal));
  });
  it('makes unreadable PDFs available as references without claiming text grounding', async () => {
    const { service, pdf, stored } = await harness();
    pdf.extract.mockRejectedValueOnce(new PdfPreparationError('PETROS_PDF_INVALID'));
    expect(await service.upload(ctx, 'class', 'subject', 'scan.pdf', 'application/pdf', Buffer.from('%PDF'))).toMatchObject({ textStatus: 'unavailable' });
    expect(guidanceFileExcerpts([{ ...stored(), id: 'file' } as never], 'Fractions', 1)[0]).toContain('do not invent its contents');
  });
  it('keeps image bytes out of the document text extractor', async () => {
    const { service, stored } = await harness();
    expect(await service.upload(ctx, 'class', 'subject', 'diagram.png', 'image/png', Buffer.from('diagram bytes'))).toMatchObject({ textStatus: 'unavailable' });
    expect(stored()).toMatchObject({ derived: { guidanceText: { text: '' } } });
  });
  it('rejects empty, oversized, and unsupported files before storing them', async () => {
    const { service, db } = await harness();
    await expect(service.upload(ctx, 'class', 'subject', 'empty.txt', 'text/plain', Buffer.alloc(0))).rejects.toMatchObject({ status: 400 });
    await expect(service.upload(ctx, 'class', 'subject', 'large.pdf', 'application/pdf', Buffer.alloc(PETROS_GUIDANCE_MAX_FILE_BYTES + 1))).rejects.toMatchObject({ status: 413 });
    await expect(service.upload(ctx, 'class', 'subject', 'page.html', 'text/html', Buffer.from('<script>'))).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('refuses attachment IDs outside the uploader, institution, class, or subject binding', async () => {
    const { service } = await harness();
    await expect(service.resolve(ctx, 'class', 'subject', ['unknown'])).rejects.toMatchObject({ status: 404 });
  });
});
