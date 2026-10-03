import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@edrion/database';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import { KnowledgeDocumentService, publishKnowledgeExtraction } from '../student/knowledge/knowledge-document.service';
import { StudentMaterialsService } from '../student/materials/student-materials.service';
import { PetrosTeachingPackRepository } from '../student/knowledge/petros-teaching-pack.repository';
import { PetrosTeachingPackService } from '../student/knowledge/petros-teaching-pack.service';
import { PortalAuthService } from '../portal/portal-auth.service';

describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 6 source comparison and teacher authoring gates', () => {
  let db: Phase2TestDatabase;
  beforeAll(async () => { db = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await db?.close(); });

  it('compares only the current owner-selected immutable source pins and returns exact page locators', async () => {
    const f = await phase2AuthorityFixture(db);
    const foreign = await phase2AuthorityFixture(db);
    const [secondSource] = await f.admin.insert(schema.knowledgeItems).values({
      ...f.source, id: randomUUID(), title: 'Synthetic second source',
    }).returning();
    if (!secondSource) throw new Error('Expected synthetic second source');
    const secondVersion = await f.admin.transaction(tx => publishKnowledgeExtraction(tx, secondSource,
      ['Horizontal velocity is constant without drag. Vertical velocity changes under gravity and reaches zero at the apex.']));
    const enabledEnv = { ...f.env, PETROS_MULTI_SOURCE_ENABLED: true };
    const documents = new KnowledgeDocumentService(db.db, new StudentMaterialsService(db.db), enabledEnv as never);
    const comparison = await f.owned(() => documents.compare(f.student, {
      schemaVersion: 'petros.source-comparison.v1', question: 'Compare horizontal velocity and gravity',
      sources: [
        { sourceId: f.source.id, sourceVersion: f.extraction.version.fingerprint, pages: [1] },
        { sourceId: secondSource.id, sourceVersion: secondVersion.version.fingerprint, pages: [1] },
      ],
    }));

    expect(comparison.evidenceRecorded).toBe(false);
    expect(comparison.selectedScope).toHaveLength(2);
    expect(comparison.sources).toHaveLength(2);
    for (const sourceResult of comparison.sources) {
      expect(sourceResult.sourceVersion).toBe(comparison.selectedScope.find(pin => pin.sourceId === sourceResult.sourceId)?.sourceVersion);
      expect(sourceResult.hits.length).toBeGreaterThan(0);
      for (const hit of sourceResult.hits) {
        expect(hit.source.locator.sourceVersion).toBe(sourceResult.sourceVersion);
        expect(hit.source.locator.page).toBe(1);
        expect(hit.source.text).toMatch(/horizontal|gravity/i);
      }
    }
    const foreignSecond = await foreign.admin.insert(schema.knowledgeItems).values({
      ...foreign.source, id: randomUUID(), title: 'Foreign synthetic second source',
    }).returning();
    const foreignExtra = foreignSecond[0];
    if (!foreignExtra) throw new Error('Expected foreign synthetic second source');
    const foreignExtraVersion = await foreign.admin.transaction(tx => publishKnowledgeExtraction(tx, foreignExtra,
      ['For a separate learner, horizontal velocity remains constant when drag is absent.']));
    const foreignDocuments = new KnowledgeDocumentService(db.db, new StudentMaterialsService(db.db),
      { ...foreign.env, PETROS_MULTI_SOURCE_ENABLED: true } as never);
    const foreignComparison = await foreign.owned(() => foreignDocuments.compare(foreign.student, {
      schemaVersion: 'petros.source-comparison.v1', question: 'Compare horizontal velocity',
      sources: [
        { sourceId: foreign.source.id, sourceVersion: foreign.extraction.version.fingerprint, pages: [1] },
        { sourceId: foreignExtra.id, sourceVersion: foreignExtraVersion.version.fingerprint, pages: [1] },
      ],
    }));
    expect(foreignComparison.sources).toHaveLength(2);
    expect(foreignComparison.sources.every(result => result.hits.every(hit =>
      hit.source.locator.sourceVersion === result.sourceVersion))).toBe(true);

    const sourcePins = [
      { sourceId: f.source.id, sourceVersion: f.extraction.version.fingerprint, pages: [1] },
      { sourceId: secondSource.id, sourceVersion: secondVersion.version.fingerprint, pages: [1] },
    ];
    await expect(f.owned(() => documents.compare(f.student, { schemaVersion: 'petros.source-comparison.v1',
      question: 'Compare the passages', sources: [{ ...sourcePins[0]!, sourceVersion: 'e'.repeat(64) }, sourcePins[1]!] }))).rejects.toThrow();
    await expect(f.owned(() => documents.compare(f.student, { schemaVersion: 'petros.source-comparison.v1',
      question: 'Compare the passages', sources: [sourcePins[0]!, {
        sourceId: foreign.source.id, sourceVersion: foreign.extraction.version.fingerprint, pages: [1],
      }] }))).rejects.toThrow();

    await expect(f.owned(() => documents.compare(f.student, { schemaVersion: 'petros.source-comparison.v1',
      question: 'Compare the passages', sources: [sourcePins[0]!, sourcePins[0]!] }))).rejects.toThrow();
    await expect(f.owned(() => documents.compare(f.student, { schemaVersion: 'petros.source-comparison.v1',
      question: 'Compare the passages', sources: [sourcePins[0]!, { ...sourcePins[1]!, pages: [501] }] }))).rejects.toThrow();

    // Revoke one pin after its retrieved result exists. The service's final authority recheck
    // must reject the whole comparison, not return the first passage as a partial answer.
    const racedDocuments = new KnowledgeDocumentService(db.db, new StudentMaterialsService(db.db), enabledEnv as never);
    const search = racedDocuments.search.bind(racedDocuments);
    let retrievedSources = 0;
    vi.spyOn(racedDocuments, 'search').mockImplementation(async (...args) => {
      const retrieved = await search(...args);
      retrievedSources += 1;
      if (retrievedSources === 2) await f.admin.update(schema.knowledgeItems).set({ sourceRevokedAt: new Date() })
        .where(eq(schema.knowledgeItems.id, f.source.id));
      return retrieved;
    });
    await expect(f.owned(() => racedDocuments.compare(f.student, { schemaVersion: 'petros.source-comparison.v1',
      question: 'Compare the passages', sources: sourcePins }))).rejects.toThrow();

    await f.admin.update(schema.knowledgeItems).set({ sourceRevokedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, secondSource.id));
    await expect(f.owned(() => documents.compare(f.student, { schemaVersion: 'petros.source-comparison.v1',
      question: 'Compare the passages', sources: sourcePins }))).rejects.toThrow();
  });

  it('fails closed while comparison is disabled and requires current authoring, course, candidate and reviewer authority', async () => {
    const f = await phase2AuthorityFixture(db);
    const foreign = await phase2AuthorityFixture(db);
    const disabledDocuments = new KnowledgeDocumentService(db.db, new StudentMaterialsService(db.db), f.env as never);
    await expect(f.owned(() => disabledDocuments.compare(f.student, {
      schemaVersion: 'petros.source-comparison.v1', question: 'Compare two sources', sources: [],
    }))).rejects.toMatchObject({ response: { code: 'PETROS_MULTI_SOURCE_DISABLED' } });

    await expect(f.packs.listCandidates(f.ctx, f.course.id))
      .rejects.toMatchObject({ response: { code: 'PETROS_TEACHER_AUTHORING_DISABLED' } });
    for (const owner of [f, foreign]) {
      const before = await owner.admin.select().from(schema.petrosTeachingPackCandidates);
      await expect(owner.institution(() => owner.packs.compileAuthoredCandidate(owner.ctx, owner.compileCommand)))
        .rejects.toMatchObject({ response: { code: 'PETROS_TEACHER_AUTHORING_DISABLED' } });
      await expect(owner.institution(() => owner.packs.reviewAuthoredCandidate(owner.ctx, owner.compiled.candidateId, owner.reviewCommand)))
        .rejects.toMatchObject({ response: { code: 'PETROS_TEACHER_AUTHORING_DISABLED' } });
      await expect(owner.institution(() => owner.packs.revokeAuthoredReview(owner.ctx, randomUUID(), {
        schemaVersion: 'petros.teaching-pack-review-revocation.v1', commandId: randomUUID(),
        expectedReviewVersion: 1, reason: 'Synthetic disabled admission check',
      }))).rejects.toMatchObject({ response: { code: 'PETROS_TEACHER_AUTHORING_DISABLED' } });
      expect(await owner.admin.select().from(schema.petrosTeachingPackCandidates)).toEqual(before);
    }
    const authoringEnv = { ...f.env, PETROS_TEACHER_AUTHORING_ENABLED: true };
    const authoring = new PetrosTeachingPackService(new PetrosTeachingPackRepository(db.db), f.knowledge,
      new PortalAuthService(db.db, authoringEnv as never), db.db, authoringEnv as never, db.auditWriter);
    expect((await f.institution(() => authoring.compileAuthoredCandidate(f.ctx, f.compileCommand))).replayed).toBe(true);
    const candidates = await f.institution(() => authoring.listCandidates(f.ctx, f.course.id));
    expect(candidates.items).toHaveLength(1);
    expect(candidates.items[0]).toMatchObject({ id: f.compiled.candidateId,
      payloadHash: f.compiled.payloadHash, sourceItemId: f.source.id, packVersion: f.candidate.pack.version });
    await expect(f.institution(() => authoring.listCandidates(f.ctx, foreign.course.id))).rejects.toThrow();
    await expect(f.institution(() => authoring.previewCandidate(f.ctx, foreign.compiled.candidateId))).rejects.toThrow();

    const preview = await f.institution(() => authoring.previewCandidate(f.ctx, f.compiled.candidateId));
    expect(preview).toMatchObject({ candidateId: f.compiled.candidateId, payloadHash: f.compiled.payloadHash,
      assessmentConditions: { supervision: 'unknown', externalAssistance: 'unknown',
        purpose: 'formative_preview', evidenceRecorded: false } });
    expect(preview.blocks.length).toBeGreaterThan(0);

    expect((await f.institution(() => authoring.reviewerQualifications(f.ctx, f.course.id))).items).toEqual([]);
    await f.qualify();
    expect((await f.institution(() => authoring.reviewerQualifications(f.ctx, f.course.id))).items)
      .toMatchObject([{ id: f.qualificationId, version: 1, subjectKey: f.subjectId, status: 'active' }]);
    await expect(f.institution(() => authoring.reviewAuthoredCandidate(f.ctx, f.compiled.candidateId, f.reviewCommand)))
      .rejects.toMatchObject({ response: { code: 'PETROS_PACK_SELF_APPROVAL_DENIED' } });

    // Independent current staff member with a separately qualified, append-only credential can approve.
    const independentUserId = randomUUID();
    const independentStaffId = randomUUID();
    const independentQualificationId = randomUUID();
    await f.admin.insert(schema.institutionUsers).values({ id: independentUserId, institutionId: f.institutionId,
      fullName: 'Synthetic independent reviewer', email: `${independentUserId}@example.test`, status: 'active' });
    await f.admin.insert(schema.institutionUserRoles).values({ institutionUserId: independentUserId, roleKey: 'institution_owner' });
    await f.admin.insert(schema.staff).values({ id: independentStaffId, institutionId: f.institutionId,
      institutionUserId: independentUserId, firstName: 'Synthetic', lastName: 'Reviewer' });
    await f.admin.insert(schema.petrosReviewerQualifications).values({ id: independentQualificationId, version: 1,
      institutionId: f.institutionId, reviewerUserId: independentUserId, reviewerStaffId: independentStaffId,
      subjectKey: f.subjectId, status: 'active', validFrom: new Date('2026-01-01'), validUntil: new Date('2030-01-01'),
      evidenceKind: 'institution_record', evidenceHash: 'f'.repeat(64), recordedByUserId: f.teacherUserId });
    const independentPrincipal = await f.institution(() => new PortalAuthService(db.db, f.env as never)
      .resolveById(independentUserId, null));
    const independentCtx = { ...f.ctx, principal: independentPrincipal };
    expect((await f.institution(() => authoring.reviewerQualifications(independentCtx, f.course.id))).items)
      .toMatchObject([{ id: independentQualificationId, version: 1, subjectKey: f.subjectId, status: 'active' }]);
    const independentlyReviewed = await f.institution(() => authoring.reviewAuthoredCandidate(independentCtx, f.compiled.candidateId, {
      ...f.reviewCommand, commandId: randomUUID(), qualificationId: independentQualificationId,
    }));
    expect(independentlyReviewed.receipt.decision).toBe('approved');

    await f.admin.insert(schema.petrosReviewerQualifications).values({ id: f.qualificationId, version: 2,
      institutionId: f.institutionId, reviewerUserId: f.teacherUserId, reviewerStaffId: f.teacherId,
      subjectKey: f.subjectId, status: 'revoked', validFrom: new Date('2026-01-01'),
      validUntil: new Date('2030-01-01'), evidenceKind: 'institution_record', evidenceHash: 'd'.repeat(64),
      recordedByUserId: f.teacherUserId });
    expect((await f.institution(() => authoring.reviewerQualifications(f.ctx, f.course.id))).items).toEqual([]);
    await expect(f.institution(() => authoring.reviewAuthoredCandidate(f.ctx, f.compiled.candidateId, f.reviewCommand))).rejects.toThrow();

    // Revoke the staff user's live role; stale client-side permissions must not remain usable.
    await f.admin.update(schema.institutionUserRoles).set({ roleKey: 'student' })
      .where(eq(schema.institutionUserRoles.institutionUserId, f.teacherUserId));
    await expect(f.institution(() => authoring.listCandidates(f.ctx, f.course.id)))
      .rejects.toMatchObject({ response: { code: 'PETROS_CURRENT_PERMISSION_REQUIRED' } });
    await expect(f.institution(() => authoring.previewCandidate(f.ctx, f.compiled.candidateId)))
      .rejects.toMatchObject({ response: { code: 'PETROS_CURRENT_PERMISSION_REQUIRED' } });
  });
});
