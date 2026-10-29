import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { and, closeDatabase, createDatabase, eq, schema as s, sql } from '@edrion/database';
import { LocalDiskDriver } from '../src/modules/student/storage/drivers/local-disk.driver';
import { MaterialDocumentPreviewService } from '../src/modules/student/materials/material-document-preview.service';
import { isPresentationMaterial } from '../src/modules/student/materials/material-file-types';
import { guidanceFileExcerpts } from '../src/modules/student/assignments/petros-guidance-files';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true, quiet: true });

async function main() {
  const apply = process.argv.includes('--apply');
  const db = createDatabase({ url: process.env.DATABASE_URL });
  const driver = new LocalDiskDriver({ STUDENT_STORAGE_DIR: resolve(repoRoot, 'apps/api', process.env.STUDENT_STORAGE_DIR ?? './var/student-storage') } as never);
  const preview = new MaterialDocumentPreviewService();
  try {
    const files = await db.select().from(s.storageObjects).where(eq(s.storageObjects.kind, 'petros_guidance_attachment'));
    let repaired = 0;
    for (const file of files) {
      if (!isPresentationMaterial(file.filename, file.mimeType)) continue;
      const result = await preview.create({ filename: file.filename, mimeType: file.mimeType, buffer: await driver.read(file.storageKey) });
      if (!result.readable) throw new Error(`Presentation ${file.id} could not be read; existing data was preserved.`);
      const extracted = result.sections.map((section) => [section.title, section.text].filter(Boolean).join('\n')).join('\n\n');
      const derived = { ...file.derived, guidanceText: { text: extracted.slice(0, 40_000),
        truncated: result.truncated || extracted.length > 40_000, extractionVersion: 'presentation-slides.v2' } };
      if (apply) await db.transaction(async (tx) => {
        const [updated] = await tx.update(s.storageObjects).set({ derived, version: file.version + 1, updatedAt: new Date() })
          .where(and(eq(s.storageObjects.id, file.id), eq(s.storageObjects.version, file.version))).returning({ id: s.storageObjects.id });
        if (!updated) throw new Error('Attachment changed while being repaired. Retry.');
        const assignments = await tx.select({ id: s.assignments.id }).from(s.assignments).where(and(
          eq(s.assignments.institutionId, file.institutionId),
          sql`${s.assignments.petrosGuidance}->'attachmentObjectIds' @> ${JSON.stringify([file.id])}::jsonb`,
        ));
        for (const assignment of assignments) await tx.update(s.petrosSessionIntents)
          .set({ status: 'invalidated', invalidatedAt: new Date(), updatedAt: new Date() }).where(and(
            eq(s.petrosSessionIntents.institutionId, file.institutionId), eq(s.petrosSessionIntents.status, 'resolved'),
            sql`${s.petrosSessionIntents.sourceEntityIds} @> ${JSON.stringify([assignment.id])}::jsonb`,
          ));
        await tx.insert(s.auditEvents).values({ actorType: 'system', actorName: 'Presentation text repair',
          institutionId: file.institutionId, action: 'petros.guidance.text_repaired', module: 'portal-teaching',
          entityType: 'storage_object', entityId: file.id,
          newState: { extractionVersion: 'presentation-slides.v2', slideCount: result.sections.length, readable: true } });
      });
      repaired++;
      console.log(JSON.stringify({ applied: apply, fileId: file.id, slides: result.sections.length,
        excerpt: guidanceFileExcerpts([{ ...file, derived }], 'Various Cloud Computing Models', 1)[0] }));
    }
    console.log(JSON.stringify({ applied: apply, repaired }));
  } finally { await closeDatabase(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Repair failed'); process.exitCode = 1; });
