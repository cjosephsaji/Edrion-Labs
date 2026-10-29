import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, schema, sql } from '@edrion/database';
import { petrosGuidanceVisibility } from './petros-guidance-visibility';
import { readGuidanceFiles } from './petros-guidance-files';

// An explicit local test URL is required. Temporary tables shadow the production names and
// disappear at commit; no institution, student or assignment fixtures are written to real tables.
const url = process.env.PETROS_GUIDANCE_TEST_DB_URL;
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const client = url ? postgres(url, { max: 1 }) : null;
afterAll(async () => { await client?.end(); });

describe.skipIf(!url)('personal teacher goal visibility in PostgreSQL', () => {
  it('keeps an individual goal out of classmates and another institution while preserving general classwork', async () => {
    if (!client || !url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) {
      throw new Error('Use a local test database.');
    }
    const db = drizzle(client, { schema });
    await db.transaction(async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE assignments (id uuid, institution_id uuid, class_id uuid, petros_guidance jsonb) ON COMMIT DROP`);
      await tx.execute(sql`CREATE TEMP TABLE assignment_assignees (assignment_id uuid, student_id uuid) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO assignments VALUES (${id(1)}, ${id(10)}, ${id(20)}, ${JSON.stringify({ focus: 'Fractions for Ananya' })}::jsonb), (${id(2)}, ${id(10)}, ${id(20)}, NULL), (${id(3)}, ${id(11)}, ${id(20)}, ${JSON.stringify({ focus: 'Other institution' })}::jsonb)`);
      await tx.execute(sql`INSERT INTO assignment_assignees VALUES (${id(1)}, ${id(30)}), (${id(3)}, ${id(30)})`);
      const visibleTo = (student: string) => tx.select({ id: schema.assignments.id }).from(schema.assignments)
        .where(and(eq(schema.assignments.institutionId, id(10)), eq(schema.assignments.classId, id(20)), petrosGuidanceVisibility(student)));
      expect((await visibleTo(id(30))).map((row) => row.id).sort()).toEqual([id(1), id(2)]);
      expect((await visibleTo(id(31))).map((row) => row.id)).toEqual([id(2)]);
    });
  });

  it('reads only files bound to the goal’s institution, class, subject, and selected attachment IDs', async () => {
    if (!client || !url || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Use a local test database.');
    const db = drizzle(client, { schema });
    await db.transaction(async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE storage_objects (LIKE public.storage_objects INCLUDING DEFAULTS) ON COMMIT DROP`);
      for (const [number, institution, classId, subjectId, kind] of [
        [1, 10, 20, 30, 'petros_guidance_attachment'], [2, 11, 20, 30, 'petros_guidance_attachment'],
        [3, 10, 21, 30, 'petros_guidance_attachment'], [4, 10, 20, 31, 'petros_guidance_attachment'],
        [5, 10, 20, 30, 'class_material'], [6, 10, 20, 30, 'petros_guidance_attachment'],
      ] as const) {
        await tx.insert(schema.storageObjects).values({ id: id(number), institutionId: id(institution), kind,
          driver: 'local', storageKey: 'synthetic-test', mimeType: 'text/plain', sizeBytes: 10, processingStatus: 'ready',
          derived: { guidanceBinding: { classId: id(classId), subjectId: id(subjectId) } } });
      }
      const files = await readGuidanceFiles(tx as never, { institutionId: id(10), classId: id(20), subjectId: id(30),
        petrosGuidance: { attachmentObjectIds: [1, 2, 3, 4, 5].map(id) } } as never);
      expect(files.map((file) => file.id)).toEqual([id(1)]);
    });
  });
});
