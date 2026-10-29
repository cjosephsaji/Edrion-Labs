import { petrosVerificationOutput } from './petros-verification-output';
import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, runInReadinessScope, schema, assertRestrictedApplicationDatabase, type Database } from '@edrion/database';
import { canonicalContent, contentUnitHashInput, type SourceRevision, type ContentUnit } from '@edrion/schemas';
import { representationFixtures, syntheticFixtureSourceDocument } from '../../../../../packages/schemas/src/petros-v2/m1-fixtures';
import { PetrosContentUnitRepository } from '../student/knowledge/petros-content-unit.repository';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';

const root = resolve(__dirname, '../../../../..');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
describe.runIf(process.env.PETROS_M1_DB_TESTS === '1')('M1 disposable restricted-role persistence and security', () => {
  let f: Phase2TestDatabase, admin: Database, repo: PetrosContentUnitRepository;
  const i = randomUUID(), foreign = randomUUID(), teacher = randomUUID(), staffId = randomUUID(), student = randomUUID(), otherStudent = randomUUID();
  const studentUser = randomUUID(), otherUser = randomUUID(), course = randomUUID(), subject = randomUUID(), material = randomUUID(), object = randomUUID();
  const originalHash = hash(syntheticFixtureSourceDocument());
  let revision: SourceRevision, corrected: SourceRevision, units: ContentUnit[];
  let concept: { id: string; version: number }, saved: string;
  let cloudConceptUnit: ContentUnit, englishConceptUnit: ContentUnit;
  let migrationEvidence: { baselineReceipts: number; finalReceipts: number; rollbackVerified: boolean; v1Preserved: boolean };
  const staffScope = () => ({ institutionId: i, institutionUserId: teacher, courseId: course, sourceItemId: material });
  const asStaff = <T>(fn: (r: PetrosContentUnitRepository, tx: Database) => Promise<T>) => runInReadinessScope(f.db, staffScope(), tx => fn(new PetrosContentUnitRepository(tx), tx));
  const asStudent = <T>(studentId: string, fn: (r: PetrosContentUnitRepository, tx: Database) => Promise<T>) =>
    runInReadinessScope(f.db, { institutionId: i, studentId }, tx => fn(new PetrosContentUnitRepository(tx), tx));
  const preparation = () => ({ binding: { kind: 'material' as const, materialId: material, materialVersion: 1, objectId: object,
    contextKind: 'course' as const, contextId: course, subjectId: subject }, kind: 'synthetic' as const, title: 'Synthetic same filename',
    originalHash, representationHash: hash('representation v1'), extractor: 'synthetic.v1', interpretationVersion: 'interpretation.v1',
    correctionOf: null, model: null, promptHash: null, pageCount: 0, slideCount: 0, conversion: null });
  beforeAll(async () => {
    if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || Object.keys(process.env).some(k => k.startsWith('PG') && process.env[k]))
      throw new Error('M1_CONFIGURED_TARGET_REFUSED');
    f = await startPhase2TestDatabase({ deferM1: true }); admin = drizzle(f.adminSql, { schema }); repo = new PetrosContentUnitRepository(f.db);
    await admin.insert(schema.institutions).values([i, foreign].map(id => ({ id, publicId: randomUUID(), legalName: 'M1 synthetic only',
      displayName: 'M1 disposable fixture', type: 'school', country: 'IN', primaryContact: { name: 'Synthetic', email: 'fixture@example.test' } })));
    await admin.insert(schema.institutionUsers).values([teacher, studentUser, otherUser].map(id => ({ id, institutionId: i,
      fullName: 'M1 synthetic actor', email: `${id}@example.test`, status: 'active' })));
    await admin.insert(schema.institutionUserRoles).values([{ institutionUserId: teacher, roleKey: 'institution_owner' },
      { institutionUserId: studentUser, roleKey: 'student' }, { institutionUserId: otherUser, roleKey: 'student' }]);
    await admin.insert(schema.staff).values({ id: staffId, institutionId: i, institutionUserId: teacher, firstName: 'Synthetic', lastName: 'Educator' });
    await admin.insert(schema.students).values([{ id: student, institutionId: i, institutionUserId: studentUser, admissionNo: randomUUID(), firstName: 'Synthetic', lastName: 'Recipient' },
      { id: otherStudent, institutionId: i, institutionUserId: otherUser, admissionNo: randomUUID(), firstName: 'Synthetic', lastName: 'Nonrecipient' }]);
    await admin.insert(schema.subjects).values({ id: subject, institutionId: i, name: 'M1 synthetic representation', code: randomUUID() });
    await admin.insert(schema.courses).values({ id: course, institutionId: i, subjectId: subject, professorTeacherId: staffId, name: 'M1 synthetic', code: randomUUID() });
    await admin.insert(schema.courseEnrollments).values({ institutionId: i, studentId: student, courseId: course });
    writeFileSync(resolve(f.directory, 'm1-synthetic-only'), syntheticFixtureSourceDocument());
    await admin.insert(schema.storageObjects).values({ id: object, institutionId: i, ownerStaffUserId: teacher, kind: 'pdf', driver: 'local',
      storageKey: 'm1-synthetic-only', sizeBytes: Buffer.byteLength(syntheticFixtureSourceDocument()), mimeType: 'application/pdf', checksumSha256: originalHash, processingStatus: 'ready' });
    await f.adminSql`INSERT INTO class_materials(id,institution_id,context_type,context_id,subject_id,object_id,title,version)
      VALUES(${material},${i},'course',${course},${subject},${object},'Synthetic same filename',1)`;
    // Representative V1 history exists before the additive migration.
    // Deliberately seed the historical columns, before the current additive schema exists.
    for (const status of ['active','paused','closed']) await f.adminSql`INSERT INTO petros_learning_sessions
      (id,institution_id,student_id,client_request_id,state_version,session_type,topic,current_goal,status,time_budget_seconds,max_moves,checkpoints,current_checkpoint_id,prompt_version,output_schema_version)
      VALUES(${randomUUID()},${i},${student},${randomUUID()},'petros.session-state.v3','learn','M1 synthetic V1 history','Preserve existing format',${status},600,8,'[]','synthetic','synthetic.v1','synthetic.v1')`;
    const legacyId = randomUUID();
    await f.adminSql`INSERT INTO petros_document_source_revisions(id,institution_id,class_material_id,source_key,title,document_version,checksum,parser_version,structure)
      VALUES(${legacyId},${i},${material},${`material:${material}`},'Synthetic V1 source',1,${hash('V1 extraction')},'legacy.v1','{"schemaVersion":"petros.document-source.v1"}'::jsonb)`;
    const beforeSessions = await f.adminSql`SELECT to_jsonb(s) AS body FROM petros_learning_sessions s ORDER BY id`;
    const beforeRevision = await f.adminSql`SELECT to_jsonb(r) AS body FROM petros_document_source_revisions r ORDER BY id`;
    const beforeLedger = await f.adminSql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    const migration = readFileSync(resolve(root, 'packages/database/migrations/0235_petros_v2_content_identity.sql'), 'utf8');
    await expect(f.adminSql.begin(async tx => { await tx.unsafe(migration); await tx.unsafe('SELECT 1/0'); })).rejects.toMatchObject({ code: '22012' });
    expect((await f.adminSql`SELECT to_regclass('public.petros_content_units') AS name`)[0]!.name).toBeNull();
    expect(await f.adminSql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(beforeLedger);
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(admin, { migrationsFolder: resolve(root, 'packages/database/migrations') });
    await f.adminSql.unsafe(readFileSync(resolve(root, 'packages/database/migrations/sql/zzzz_petros_m1.sql'), 'utf8'));
    expect(await f.adminSql`SELECT to_jsonb(s)-'engine_version'-'v2_state' AS body FROM petros_learning_sessions s ORDER BY id`).toEqual(beforeSessions);
    expect((await f.adminSql`SELECT count(*)::int n FROM petros_learning_sessions WHERE engine_version='v1' AND v2_state IS NULL`)[0]!.n).toBe(3);
    const afterRevision = await f.adminSql`SELECT to_jsonb(r)-'format_version'-'original_source_id'-'v2_revision' AS body FROM petros_document_source_revisions r ORDER BY id`;
    expect(afterRevision).toEqual(beforeRevision);
    const afterLedger = await f.adminSql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect(afterLedger.slice(0, beforeLedger.length)).toEqual(beforeLedger);
    migrationEvidence = { baselineReceipts: beforeLedger.length, finalReceipts: afterLedger.length, rollbackVerified: true, v1Preserved: true };
  }, 60000);
  afterAll(async () => { await f?.close(); }, 30000);

  it('uses the actual final M0-R baseline and restricted nonowner app role', async () => {
    const currentJournal=JSON.parse(readFileSync(resolve(root,'packages/database/migrations/meta/_journal.json'),'utf8')) as {entries:unknown[]};
    expect(migrationEvidence).toEqual({ baselineReceipts: 157, finalReceipts: currentJournal.entries.length, rollbackVerified: true, v1Preserved: true });
    await assertRestrictedApplicationDatabase(f.db);
    const [row] = await f.adminSql`SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='petros_content_units'`;
    expect(row).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const [acl] = await f.adminSql`SELECT has_table_privilege('edrion_app','petros_content_units','UPDATE') AS mutation,
      has_column_privilege('edrion_app','petros_document_lesson_artifacts','private_plan','SELECT') AS private`;
    expect(acl).toEqual({ mutation: false, private: false });
  });
  it('creates immutable revisions idempotently and rejects changed retry data', async () => {
    revision = await asStaff(r => r.prepareRevision(preparation()));
    expect(await asStaff(r => r.prepareRevision(preparation()))).toEqual(revision);
    await expect(asStaff(r => r.prepareRevision({ ...preparation(), representationHash: hash('conflict') }))).rejects.toThrow('RETRY_CONFLICT');
    await expect(asStaff(r => r.prepareRevision({ ...preparation(), institutionId: foreign }))).rejects.toThrow();
    await expect(asStaff(r => r.prepareRevision({ ...preparation(), originalHash: hash('conflicting bytes') }))).rejects.toThrow();
    const duplicate = await Promise.all([asStaff(r => r.prepareRevision(preparation())), asStaff(r => r.prepareRevision(preparation()))]);
    expect(new Set(duplicate.map(r => r.id)).size).toBe(1);
  });
  it('persists all eleven content families and exact source/hash/locator pins', async () => {
    units = representationFixtures(revision, hash);
    expect(await asStaff(r => r.persist(units))).toEqual(units);
    expect(await asStaff(r => r.persist(units))).toEqual(units);
    const result = await asStudent(student, r => r.lookup(revision.id, { limit: 50 }));
    expect(result.status).toBe('available');
    if (result.status === 'available') { expect(result.units).toEqual(units); expect(result.units.every(u => hash(contentUnitHashInput(u)) === u.contentHash)).toBe(true); }
  });
  it('denies unscoped, cross-institution, nonenrolled, student-write and privileged-bypass access', async () => {
    await expect(repo.lookup(revision.id)).rejects.toThrow('SCOPE_REQUIRED');
    expect(await asStudent(otherStudent, r => r.lookup(revision.id))).toEqual({ status: 'unavailable', reason: 'unauthorized_or_revoked_source' });
    expect(await runInReadinessScope(f.db, { institutionId: foreign, studentId: student }, tx => new PetrosContentUnitRepository(tx).lookup(revision.id)))
      .toEqual({ status: 'unavailable', reason: 'unauthorized_or_revoked_source' });
    await expect(asStudent(student, r => r.persist(units))).rejects.toThrow('SCOPE_REQUIRED');
    await expect(new PetrosContentUnitRepository(admin).lookup(revision.id)).rejects.toThrow('SCOPE_REQUIRED');
    expect(await f.appSql`SELECT id FROM petros_content_units`).toHaveLength(0);
  });
  it('returns bounded source-scoped lexical and adjacent lookup', async () => {
    const result = await asStudent(student, r => r.lookup(revision.id, { query: 'virtualization', limit: 1 }));
    expect(result.status === 'available' && result.units.length).toBe(1);
    const adjacent = await asStudent(student, r => r.lookup(revision.id, { adjacentOrdinal: 6 }));
    expect(adjacent.status === 'available' && adjacent.units.map(u => u.ordinal)).toEqual([4, 5, 6, 7, 8]);
    await expect(asStudent(student, r => r.lookup(revision.id, { limit: 1000 }))).rejects.toThrow();
    const byId = await asStudent(student, r => r.lookup(revision.id, { unitId: units[1]!.id }));
    expect(byId.status === 'available' && byId.units[0]).toEqual(units[1]);
  });
  it('assigns distinct stable concept UUIDs and appends immutable wording versions', async () => {
    const u = units[1]!, provenance = [{ sourceId: u.sourceId, sourceRevisionId: u.sourceRevisionId, sourceHash: u.sourceHash,
      representationHash: u.representationHash, unitId: u.id, unitHash: u.contentHash, locator: u.locator, semanticId: null }];
    const payload = { schemaVersion: 'petros.v2.concept-version.v1', label: 'Virtualization', definition: 'Synthetic definition', provenance, mappings: [] };
    concept = await asStaff(r => r.createConcept(course, payload));
    const sameLabel = await asStaff(r => r.createConcept(course, payload)); expect(concept.id).not.toBe(sameLabel.id);
    const next = await asStaff(r => r.appendConceptVersion(concept.id, 1, { ...payload, label: 'Logical virtualization' }));
    expect(next).toEqual({ id: concept.id, version: 2 });
    await expect(asStaff(r => r.appendConceptVersion(concept.id, 1, payload))).rejects.toThrow('STALE');
    const pinUnit = { ...units[1]!, id: randomUUID(), ordinal: 20, concepts: [next] }; pinUnit.contentHash = hash(contentUnitHashInput(pinUnit));
    await asStaff(r => r.persist([pinUnit]));
    cloudConceptUnit = pinUnit;
    const unknown = { ...pinUnit, id: randomUUID(), ordinal: 21, concepts: [{ id: randomUUID(), version: 1 }] }; unknown.contentHash = hash(contentUnitHashInput(unknown));
    await expect(asStaff(r => r.persist([unknown]))).rejects.toThrow('UNKNOWN_CONCEPT');
  });
  it('keeps different same-filename documents distinct and persists English argument relationships', async () => {
    const original = JSON.parse(syntheticFixtureSourceDocument());
    const englishDocument = canonicalContent({ ...original, sections: { english_argument: original.sections.english_argument } });
    const englishMaterial = randomUUID(), englishObject = randomUUID(), englishHash = hash(englishDocument);
    writeFileSync(resolve(f.directory, 'm1-english-synthetic'), englishDocument);
    await admin.insert(schema.storageObjects).values({ id: englishObject, institutionId: i, ownerStaffUserId: teacher, kind: 'pdf', driver: 'local',
      storageKey: 'm1-english-synthetic', mimeType: 'application/pdf', sizeBytes: Buffer.byteLength(englishDocument), checksumSha256: englishHash, processingStatus: 'ready' });
    await admin.insert(schema.classMaterials).values({ id: englishMaterial, institutionId: i, contextType: 'course', contextId: course, subjectId: subject,
      objectId: englishObject, title: preparation().title });
    const owned = <T>(fn: (r: PetrosContentUnitRepository) => Promise<T>) => runInReadinessScope(f.db,
      { ...staffScope(), sourceItemId: englishMaterial }, tx => fn(new PetrosContentUnitRepository(tx)));
    const english = await owned(r => r.prepareRevision({ ...preparation(), originalHash: englishHash,
      binding: { ...preparation().binding, materialId: englishMaterial, objectId: englishObject } }));
    expect(english.source.title).toBe(revision.source.title); expect(english.source.id).not.toBe(revision.source.id);
    const englishUnits = representationFixtures(english, hash, 200).slice(11);
    await owned(r => r.persist(englishUnits));
    const claim = englishUnits[0]!, evidence = englishUnits[1]!, warrant = englishUnits[2]!;
    const ref = (u: ContentUnit) => ({ sourceId: u.sourceId, sourceRevisionId: u.sourceRevisionId, sourceHash: u.sourceHash,
      representationHash: u.representationHash, unitId: u.id, unitHash: u.contentHash, locator: u.locator, semanticId: null });
    const englishConcept = await owned(r => r.createConcept(course, { schemaVersion: 'petros.v2.concept-version.v1', label: 'Argument claim',
      definition: 'Synthetic proposed claim and supporting argument', provenance: [ref(claim)], mappings: [] }));
    englishConceptUnit = { ...warrant, id: randomUUID(), ordinal: 20, concepts: [englishConcept],
      relationships: [{ id: randomUUID(), fromUnitId: warrant.id, toUnitId: claim.id, kind: 'warrant',
        origin: 'proposed_interpretation', support: [ref(evidence)], review: null }] };
    englishConceptUnit.contentHash = hash(contentUnitHashInput(englishConceptUnit));
    await owned(r => r.persist([englishConceptUnit]));
    const found = await asStudent(student, r => r.lookup(english.id));
    expect(found.status === 'available' && found.units.length).toBe(5);
  });
  it('preserves guidance recipients, exact publication version and withdrawal without fake material IDs', async () => {
    const year = randomUUID(), grade = randomUUID(), classId = randomUUID(), assignment = randomUUID(), file = randomUUID(), fileHash = hash(syntheticFixtureSourceDocument());
    await admin.insert(schema.academicYears).values({ id: year, institutionId: i, name: 'Synthetic 2026', startDate: '2026-01-01', endDate: '2026-12-31' });
    await admin.insert(schema.gradeLevels).values({ id: grade, institutionId: i, name: 'Synthetic level' });
    await admin.insert(schema.classes).values({ id: classId, institutionId: i, academicYearId: year, gradeLevelId: grade, name: 'Synthetic class' });
    await f.adminSql`UPDATE students SET class_id=${classId} WHERE id IN(${student},${otherStudent})`;
    writeFileSync(resolve(f.directory, 'm1-guidance-synthetic'), syntheticFixtureSourceDocument());
    await admin.insert(schema.storageObjects).values({ id: file, institutionId: i, ownerStaffUserId: teacher, kind: 'petros_guidance_attachment', driver: 'local',
      storageKey: 'm1-guidance-synthetic', mimeType: 'text/plain', sizeBytes: Buffer.byteLength(syntheticFixtureSourceDocument()), checksumSha256: fileHash, processingStatus: 'ready', derived: { guidanceBinding: { classId, subjectId: subject } } });
    await admin.insert(schema.assignments).values({ id: assignment, institutionId: i, classId, subjectId: subject, teacherId: staffId, title: 'Synthetic personalized guidance',
      status: 'published', version: 0, petrosGuidance: { schemaVersion: 'petros.teacher-guidance.v1', focus: 'Synthetic source reading', instructions: '',
        approach: 'understand', sessionMinutes: 15, attachmentObjectIds: [file] } });
    await admin.insert(schema.assignmentAssignees).values({ assignmentId: assignment, studentId: student });
    const p = { ...preparation(), originalHash: fileHash, binding: { kind: 'guidance_attachment', objectId: file, assignmentId: assignment,
      publicationVersion: 0, classId, subjectId: subject } };
    const guidance = await asStaff(r => r.prepareRevision(p));
    const guidanceUnits = representationFixtures(guidance, hash, 300).slice(0, 2);
    await asStaff(r => r.persist(guidanceUnits));
    const [row] = await f.adminSql`SELECT source_key,class_material_id FROM petros_document_source_revisions WHERE id=${guidance.id}`;
    expect(row).toEqual({ source_key: `guidance_attachment:${file}:0`, class_material_id: null });
    expect((await asStudent(student, r => r.lookup(guidance.id))).status).toBe('available');
    expect((await asStudent(otherStudent, r => r.lookup(guidance.id))).status).toBe('unavailable');
    await f.adminSql`DELETE FROM assignment_assignees WHERE assignment_id=${assignment} AND student_id=${student}`;
    expect((await asStudent(student, r => r.lookup(guidance.id))).status).toBe('unavailable');
    await admin.insert(schema.assignmentAssignees).values({ assignmentId: assignment, studentId: student });
    await f.adminSql`UPDATE assignments SET status='closed',version=1 WHERE id=${assignment}`;
    expect((await asStudent(student, r => r.lookup(guidance.id))).status).toBe('unavailable');
    await expect(asStaff(r => r.prepareRevision(p))).rejects.toThrow('UNAVAILABLE');
  });
  it('corrects interpretation through a new revision while preserving earlier identities', async () => {
    corrected = await asStaff(r => r.prepareRevision({ ...preparation(), interpretationVersion: 'interpretation.v2',
      representationHash: hash('corrected representation'), correctionOf: revision.id }));
    expect(corrected.source.id).toBe(revision.source.id); expect(corrected.id).not.toBe(revision.id);
    const newer = representationFixtures(corrected, hash, 100); await asStaff(r => r.persist(newer));
    const old = await asStudent(student, r => r.lookup(revision.id));
    expect(old.status === 'available' && old.units[0]!.id).toBe(units[0]!.id);
    expect(old.status === 'available' && old.revision.representationHash).toBe(revision.representationHash);
  });
  it('validates graph versions and cycle bounds in the existing immutable curriculum manifest', async () => {
    const graph = { schemaVersion: 'petros.v2.concept-graph.v1', institutionId: i, courseId: course,
      concepts: [{ id: concept.id, version: 2 }], edges: [], traversalDepth: 2 };
    const payload = { schemaVersion: 'petros.curriculum-alignment.v1', objectives: [], frameworks: [], releases: [], items: [], relationships: [], alignments: [], moduleObjectives: [] };
    const append = (manifest: unknown, revisionNumber: number) => asStaff(async (_r, tx) => tx.insert(schema.courseCurriculumRevisions).values({
      institutionId: i, courseId: course, revision: revisionNumber, schemaVersion: 'petros.curriculum-alignment.v1',
      commandId: randomUUID(), requestHash: hash('synthetic command'), syllabusHash: hash('synthetic syllabus'), payload,
      actorId: teacher, reason: 'Synthetic manifest validation; no teaching release', v2ConceptManifest: manifest as never }));
    await append(graph, 1);
    await expect(append({ ...graph, concepts: [{ id: concept.id, version: 99 }] }, 2)).rejects.toThrow('M1_UNKNOWN_CONCEPT_VERSION');
    await expect(append({ ...graph, traversalDepth: 3 }, 2)).rejects.toMatchObject({ code: '23514' });
    const [other] = await f.adminSql`SELECT id FROM petros_concepts WHERE id<>${concept.id} AND institution_id=${i} ORDER BY id LIMIT 1`;
    const a = { id: concept.id, version: 2 }, b = { id: other!.id, version: 1 }, review = { reviewId: randomUUID(), payloadHash: hash('unapproved review') };
    await expect(append({ ...graph, concepts: [a, b], edges: [{ from: a, to: b, kind: 'hard_prerequisite', review },
      { from: b, to: a, kind: 'hard_prerequisite', review }] }, 2)).rejects.toThrow('M1_GRAPH_CYCLE');
    await expect(append({ ...graph, concepts: [a, b], edges: [{ from: a, to: b, kind: 'recommended', review }] }, 2)).rejects.toThrow('M1_UNAUTHORIZED_CONCEPT_MAPPING');
  });
  it('rechecks account roles and staff permissions from live server records', async () => {
    await f.adminSql`UPDATE institution_users SET disabled_at=now() WHERE id=${studentUser}`;
    expect((await asStudent(student, r => r.lookup(revision.id))).status).toBe('unavailable');
    await f.adminSql`UPDATE institution_users SET disabled_at=NULL WHERE id=${studentUser}`;
    await f.adminSql`DELETE FROM institution_user_roles WHERE institution_user_id=${studentUser}`;
    expect((await asStudent(student, r => r.lookup(revision.id))).status).toBe('unavailable');
    await admin.insert(schema.institutionUserRoles).values({ institutionUserId: studentUser, roleKey: 'student' });
    await f.adminSql`UPDATE institution_users SET direct_denies='["class_content.manage"]'::jsonb WHERE id=${teacher}`;
    await expect(asStaff(r => r.persist(units))).rejects.toThrow('WRITE_PERMISSION_REQUIRED');
    await f.adminSql`UPDATE institution_users SET direct_denies='[]'::jsonb WHERE id=${teacher}`;
  });
  it('keeps original identity across publication changes and denies stale source versions', async () => {
    await f.adminSql`UPDATE class_materials SET version=2 WHERE id=${material}`;
    const updated = await asStaff(r => r.prepareRevision({ ...preparation(), binding: { ...preparation().binding, materialVersion: 2 } }));
    expect(updated.source.id).toBe(revision.source.id); expect(updated.id).not.toBe(revision.id);
    expect((await asStudent(student, r => r.lookup(revision.id))).status).toBe('unavailable');
    expect((await asStudent(student, r => r.lookup(updated.id))).status).toBe('available');
    await expect(asStaff(r => r.prepareRevision(preparation()))).rejects.toThrow('UNAVAILABLE');
    // Restore this synthetic test's entitlement to exercise subsequent old-version recovery.
    await f.adminSql`UPDATE class_materials SET version=1 WHERE id=${material}`;
  });
  it('checks immutable versions, composite tenant FK and transaction rollback', async () => {
    await expect(f.adminSql`UPDATE petros_content_units SET searchable_text='mutated' WHERE id=${units[0]!.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(f.adminSql`DELETE FROM petros_document_source_revisions WHERE id=${revision.id}`).rejects.toThrow('append-only');
    await expect(f.adminSql`UPDATE petros_concept_versions SET version=9 WHERE concept_id=${concept.id}`).rejects.toMatchObject({ code: '23514' });
    const invalid = { ...units[0]!, id: randomUUID(), ordinal: 22, institutionId: foreign }; invalid.contentHash = hash(contentUnitHashInput(invalid));
    await expect(admin.insert(schema.petrosContentUnits).values({ id: invalid.id, institutionId: foreign, sourceRevisionId: revision.id,
      ordinal: 22, kind: invalid.payload.kind, manifest: invalid, contentHash: invalid.contentHash, canonicalBody: contentUnitHashInput(invalid), searchableText: invalid.searchableText, createdBy: teacher }))
      .rejects.toMatchObject({ code: '23514' });
    const valid = { ...units[0]!, id: randomUUID(), ordinal: 23 }; valid.contentHash = hash(contentUnitHashInput(valid));
    const conflict = { ...units[1]!, contentHash: 'f'.repeat(64) };
    await expect(asStaff(r => r.persist([valid, conflict]))).rejects.toThrow();
    expect(await f.adminSql`SELECT id FROM petros_content_units WHERE id=${valid.id}`).toHaveLength(0);
  });
  it('revocation and asset loss deny previously pinned revisions immediately', async () => {
    await f.adminSql`DELETE FROM course_enrollments WHERE course_id=${course} AND student_id=${student}`;
    expect((await asStudent(student, r => r.lookup(revision.id))).status).toBe('unavailable');
    await admin.insert(schema.courseEnrollments).values({ institutionId: i, studentId: student, courseId: course });
    await f.adminSql`UPDATE storage_objects SET processing_status='deleted' WHERE id=${object}`;
    expect((await asStudent(student, r => r.lookup(revision.id))).status).toBe('unavailable');
    await f.adminSql`UPDATE storage_objects SET processing_status='ready' WHERE id=${object}`;
    const unauthorizedAsset = { ...units[0]!, id: randomUUID(), ordinal: 24, assets: [{ objectId: randomUUID(), sourceRevisionId: revision.id, contentHash: originalHash, purpose: 'public_teaching' as const }] };
    unauthorizedAsset.contentHash = hash(contentUnitHashInput(unauthorizedAsset));
    await expect(asStaff(r => r.persist([unauthorizedAsset]))).rejects.toThrow('ASSET_UNAVAILABLE');
  });
  it('records bounded repository query behavior and installed indexes', async () => {
    let statements = 0;
    const previous = f.appSql.options.debug;
    f.appSql.options.debug = () => { statements++; };
    const started = performance.now();
    let found: Awaited<ReturnType<PetrosContentUnitRepository['lookup']>>;
    try { found = await asStudent(student, r => r.lookup(revision.id, { limit: 5 })); }
    finally { f.appSql.options.debug = previous; }
    expect(found!.status === 'available' && found!.units.length).toBe(5);
    expect(statements).toBeLessThan(50); // Includes complete eleven-GUC binding/restoration and savepoints.
    const indexes = await f.adminSql`SELECT indexname,indexdef FROM pg_indexes WHERE tablename='petros_content_units' ORDER BY indexname`;
    expect(indexes.some(r => r.indexname === 'petros_content_units_lexical_idx')).toBe(true);
    writeFileSync(petrosVerificationOutput('docs/verification/petros-v2/m1-evidence/repository-query-behavior.json'), JSON.stringify({
      classification: 'Small synthetic disposable fixture; no production latency claim', sourceBound: true, resultLimit: 5, returned: 5,
      statementsIncludingScope: statements, elapsedMs: performance.now() - started, indexes,
    }, null, 2) + '\n');
  });
  it('rejects dedicated workers even with a forged owner/source scope', async () => {
    await f.adminSql.unsafe('ALTER ROLE edrion_petros_document_worker LOGIN');
    const worker = postgres({ host: f.directory, username: 'edrion_petros_document_worker', database: 'postgres', max: 1 });
    try {
      await expect(worker`SELECT id FROM petros_content_units`).rejects.toMatchObject({ code: '42501' });
      await expect(runInReadinessScope(drizzle(worker, { schema }), staffScope(), tx => new PetrosContentUnitRepository(tx).lookup(revision.id))).rejects.toThrow('SCOPE_REQUIRED');
    } finally { await worker.end(); }
  });
  it('replays migrations without duplicate application, backs up and restores data/security', async () => {
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const before = await f.adminSql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`;
    await migrate(admin, { migrationsFolder: resolve(root, 'packages/database/migrations') });
    expect(await f.adminSql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id`).toEqual(before);
    // Exercise the unchanged runner's ordered standalone replay, followed by the M1 overlay.
    const sqlDir = resolve(root, 'packages/database/migrations/sql');
    for (let n = 0; n < 2; n++) for (const name of readdirSync(sqlDir).filter(s => s.endsWith('.sql') && !s.startsWith('._')).sort())
      await f.adminSql.unsafe(readFileSync(resolve(sqlDir, name), 'utf8'));
    const [acl] = await f.adminSql`SELECT has_table_privilege('edrion_app','petros_content_units','UPDATE') AS mutation,
      has_column_privilege('edrion_app','petros_document_lesson_artifacts','private_plan','SELECT') AS private`;
    expect(acl).toEqual({ mutation: false, private: false });
    saved = resolve(f.directory, 'm1.dump');
    const { execFileSync } = await import('node:child_process');
    execFileSync('pg_dump', ['-h', f.directory, '-U', 'petros_test', '-d', 'postgres', '-Fc', '-f', saved]);
    await f.adminSql.unsafe('CREATE DATABASE m1_restored');
    execFileSync('pg_restore', ['-h', f.directory, '-U', 'petros_test', '-d', 'm1_restored', '--exit-on-error', saved]);
    const restored = postgres({ host: f.directory, username: 'edrion_app', database: 'm1_restored', max: 1 });
    try {
      const found = await runInReadinessScope(drizzle(restored, { schema }), { institutionId: i, studentId: student }, tx => new PetrosContentUnitRepository(tx).lookup(revision.id));
      expect(found.status === 'available' && found.units.length).toBe(units.length + 1);
      expect(await restored`SELECT id FROM petros_content_units`).toHaveLength(0);
    } finally { await restored.end(); }
  }, 30000);
  it('emits reproducible two-subject identity chains and an unauthorized denial', async () => {
    const denial = await asStudent(otherStudent, r => r.lookup(revision.id));
    const chain = (u: ContentUnit) => ({ subject: u.locator.kind === 'synthetic' ? u.locator.section : 'synthetic', sourceId: u.sourceId,
      revisionId: u.sourceRevisionId, originalHash: u.sourceHash, unitId: u.id, locator: u.locator, kind: u.payload.kind,
      unitHash: u.contentHash, quality: u.quality, capabilities: u.capabilities, concepts: u.concepts });
    writeFileSync(petrosVerificationOutput('docs/verification/petros-v2/m1-evidence/source-identity-demo.json'), JSON.stringify({
      classification: 'Synthetic representation only; no parsing/academic approval', chains: [chain(cloudConceptUnit), chain(englishConceptUnit)],
      correction: { originalSourceId: revision.source.id, originalRevisionId: revision.id, correctedRevisionId: corrected.id,
        originalRepresentationHash: revision.representationHash, correctedRepresentationHash: corrected.representationHash }, denial,
      migrationHash: hash(readFileSync(resolve(root, 'packages/database/migrations/0235_petros_v2_content_identity.sql'), 'utf8')),
      migrationEvidence,
    }, null, 2) + '\n');
    expect(denial.status).toBe('unavailable');
  });
  it('withdraws materials under App RLS while retaining immutable sources and denying further use', async () => {
    const before = await f.adminSql`SELECT id FROM petros_content_units WHERE source_revision_id=${revision.id} ORDER BY id`;
    const retained = await asStaff(async (_r, tx) => tx.update(schema.classMaterials)
      .set({ sourceRevokedAt: new Date(), version: 2 }).where(eq(schema.classMaterials.id, material))
      .returning({ id: schema.classMaterials.id }));
    expect(retained).toEqual([{ id: material }]);
    expect((await asStudent(student, r => r.lookup(revision.id))).status).toBe('unavailable');
    expect((await asStaff(r => r.lookup(revision.id))).status).toBe('unavailable');
    await expect(asStaff(r => r.persist([units[0]!]))).rejects.toThrow('SOURCE_UNAVAILABLE');
    expect(await f.adminSql`SELECT id FROM petros_content_units WHERE source_revision_id=${revision.id} ORDER BY id`).toEqual(before);
  });
});
