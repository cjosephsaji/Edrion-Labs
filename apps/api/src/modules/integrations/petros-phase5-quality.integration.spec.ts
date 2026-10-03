import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { eq, runInStudentTenant, schema } from '@edrion/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
import { phase5ContentFreeReport, phase5QualityFixture } from './petros-phase5-quality-fixture';

type QualityTimingKey = 'sourceResolveCold' | 'sourceResolveWarm' | 'retrievalCold' | 'retrievalWarm' | 'teachingStartCold' | 'teachingDocumentWarm';

/** Opt-in only. Uses the private disposable app-role PostgreSQL fixture and never reads .env. */
describe.runIf(process.env.PETROS_LOCAL_DB_TESTS === '1')('Phase 5 production-owner quality evidence / disposable PostgreSQL', () => {
  let database: Phase2TestDatabase;
  beforeAll(async () => { database = await startPhase2TestDatabase(); }, 90_000);
  afterAll(async () => { await database?.close(); });

  it('evaluates current source and teaching owners for two learners in two tenants and emits content-free latency evidence', async () => {
    const owners = [await phase5QualityFixture(database), await phase5QualityFixture(database)];
    const counters = { sourceReady: 0, citationsResolved: 0, productionMoves: 0, controlledOutputsRejected: 0, foreignOwnerDenied: 0 };
    const timings: Record<QualityTimingKey, number[]> = { sourceResolveCold: [], sourceResolveWarm: [], retrievalCold: [], retrievalWarm: [], teachingStartCold: [], teachingDocumentWarm: [] };
    const digests: string[] = [];
    const policyIdentities:Array<{schemaVersion:string;authorityHash:string;versionIds:string[]}>=[];
    const identities: Array<{ sourceVersion: string; packVersion: number; promptVersion: string; schemaVersion: string }> = [];

    for (const f of owners) {
      const sourceStart = performance.now();
      const source = await f.owned(() => f.knowledge.resolve(f.student, f.source.id, 1, f.extraction.version.fingerprint));
      timings.sourceResolveCold.push(performance.now() - sourceStart);
      expect(source.version).toMatchObject({ fingerprint: f.extraction.version.fingerprint, state: 'complete', admissible: true });
      expect(source.item).toMatchObject({ status: 'ready', extractedTextReady: true });
      counters.sourceReady += 1;

      const resolved = await f.owned(() => f.knowledge.locator(f.student, f.source.id, f.citation.locator));
      expect(resolved).toEqual({ locator: f.citation.locator, text: f.citation.excerpt });
      expect(resolved.text).toContain('horizontal velocity remains constant');
      counters.citationsResolved += 1;
      digests.push(createHash('sha256').update(resolved.text).digest('hex'));

      const searchInput={sourceVersion:f.extraction.version.fingerprint,query:'horizontal velocity',purpose:'source_lookup' as const,pages:[1],limit:3};
      const retrievalStart=performance.now();
      const retrieval=await f.owned(()=>f.knowledge.search(f.student,f.source.id,searchInput));
      timings.retrievalCold.push(performance.now()-retrievalStart);
      expect(retrieval.hits.length).toBeGreaterThan(0);
      expect(retrieval.hits.every(hit=>hit.source.locator.page===1&&hit.source.text.includes('horizontal'))).toBe(true);
      for(let sample=0;sample<20;sample++){
        const start=performance.now();const warm=await f.owned(()=>f.knowledge.search(f.student,f.source.id,searchInput));
        timings.retrievalWarm.push(performance.now()-start);expect(warm.sourceVersion).toBe(f.extraction.version.fingerprint);
      }
      // A malformed citation/claim is rejected by source/pack owners before any teaching release.
      await expect(f.owned(() => f.knowledge.locator(f.student, f.source.id, { ...f.citation.locator, page: 99 } as never))).rejects.toThrow();
      const defective = structuredClone(f.candidate);
      const defectiveClaim = defective.claims?.[0];
      expect(defectiveClaim).toBeTruthy();
      defectiveClaim!.anchors[0]!.locator = { ...defectiveClaim!.anchors[0]!.locator, page: 99 } as never;
      const before = await f.packs.compile(f.ctx, { ...f.compileCommand, commandId: randomUUID(), candidate: defective } as never).catch((error: unknown) => error);
      expect(before).toBeInstanceOf(Error);

      // Exercise the registered topic-profile owner with a controlled malformed model response.
      const controlledProfile = await f.topicProfiles.resolveForSession({
        institutionId: f.institutionId, topic: `phase5 controlled output ${randomUUID()}`,
        profileContext: { authoritativeGrounding: ['Synthetic controlled reference for profile validation.'] },
      });
      expect(controlledProfile.profile.schemaVersion).toBeTruthy();
      expect(f.controlledProvider.calls).toBeGreaterThan(0);

      // The production loop persists a pack-bound decision/block using the actual adaptive owner.
      const teachingStart = performance.now();
      const first = await f.owned(() => f.loop.continue(f.student, f.sessionId, randomUUID()));
      timings.teachingStartCold.push(performance.now() - teachingStart);
      expect(first.blocks.length).toBeGreaterThan(0);
      const current = first.blocks.find(block => block.status === 'current') ?? first.blocks.at(-1)!;
      expect(current.content.type).toBe('layered_explanation');
      expect(current.content).toMatchObject({ sourceGrounding: [{ label: 'Original source, page 1' }] });
      expect(JSON.stringify(current.content)).toContain('horizontal and vertical components');
      expect(JSON.stringify(current.content)).toContain('gravity changes only the vertical component');
      counters.productionMoves += 1;
      counters.controlledOutputsRejected += f.controlledProvider.calls;
      const persisted = await f.admin.select().from(schema.petrosPlanningDecisions).where(eq(schema.petrosPlanningDecisions.sessionId, f.sessionId));
      expect(persisted.at(-1)).toMatchObject({ source: 'deterministic_fallback', promptVersion: expect.any(String), schemaVersion: expect.any(String) });
      const blocks = await f.admin.select().from(schema.petrosTeachingBlocks).where(eq(schema.petrosTeachingBlocks.sessionId, f.sessionId));
      expect(blocks.length).toBeGreaterThan(0);

      // Warm persisted owner reads exercise the actual learner-facing document/recovery path.
      for (let sample = 0; sample < 20; sample += 1) {
        const start = performance.now();
        const document = await f.owned(() => f.loop.document(f.student, f.sessionId));
        timings.teachingDocumentWarm.push(performance.now() - start);
        expect(document.blocks.some(block => block.id === current.id)).toBe(true);
      }
      for (let sample = 0; sample < 20; sample += 1) {
        const start = performance.now();
        const warm = await f.owned(() => f.knowledge.resolve(f.student, f.source.id, 1, f.extraction.version.fingerprint));
        timings.sourceResolveWarm.push(performance.now() - start);
        expect(warm.version?.fingerprint).toBe(f.extraction.version.fingerprint);
      }
      const policy=await f.owned(()=>f.policies.documentKnowledgePolicy(f.student,f.sessionId));
      policyIdentities.push({schemaVersion:policy.schemaVersion,authorityHash:policy.authorityHash,versionIds:policy.policyVersionIds});
      identities.push({ sourceVersion: f.extraction.version.fingerprint, packVersion: f.candidate.pack.version,
        promptVersion: String(persisted.at(-1)?.promptVersion), schemaVersion: String(persisted.at(-1)?.schemaVersion) });
    }

    // Same institution boundary is still enforced per student; a second tenant cannot read the first source.
    const left = owners[0]!;
    const right = owners[1]!;
    await expect(right.owned(() => right.knowledge.resolve(right.student, left.source.id, 1, left.extraction.version.fingerprint)))
      .rejects.toThrow();
    counters.foreignOwnerDenied += 1;
    const sameTenantStudentId = randomUUID();
    const sameTenantUserId = randomUUID();
    const [leftStudentRow] = await left.admin.select().from(schema.students).where(eq(schema.students.id, left.student.studentId));
    expect(leftStudentRow).toBeTruthy();
    await left.admin.insert(schema.institutionUsers).values({ id: sameTenantUserId, institutionId: left.institutionId,
      fullName: 'Synthetic second learner', email: `${sameTenantStudentId}@example.test`, status: 'active' });
    await left.admin.insert(schema.institutionUserRoles).values({ institutionUserId: sameTenantUserId, roleKey: 'student' });
    await left.admin.insert(schema.students).values({ id: sameTenantStudentId, institutionId: left.institutionId,
      institutionUserId: sameTenantUserId, classId: leftStudentRow!.classId, admissionNo: randomUUID(), firstName: 'Synthetic', lastName: 'Second' });
    const sameTenantStudent = { ...left.student, studentId: sameTenantStudentId, institutionUserId: sameTenantUserId,
      email: `${sameTenantStudentId}@example.test` };
    await expect(runInStudentTenant(database.db, sameTenantStudent, () =>
      left.knowledge.resolve(sameTenantStudent, left.source.id, 1, left.extraction.version.fingerprint))).rejects.toThrow();
    counters.foreignOwnerDenied += 1;
    const [pg]=await database.adminSql`show server_version`;
    const report = phase5ContentFreeReport({environment:{postgresVersion:String(pg!.server_version),concurrency:'sequential per owner, two owners/two tenants; closure may execute independent schema/typecheck/browser workloads concurrently'}, owners: 2, tenants: new Set(owners.map(f => f.institutionId)).size,
      counters, timings, digests, sourceVersions: identities.map(item => item.sourceVersion),
      packVersions: identities.map(item => item.packVersion),
      policyVersion: 'institutional-policy/current-owner-read',policyIdentities,
      promptVersions: identities.map(item => item.promptVersion), schemaVersions: identities.map(item => item.schemaVersion),
      controlledModelResult: 'invalid topic-profile output rejected; profile owner used deterministic seed; production loop rendered the approved pack',
      controlledModelCalls: owners.reduce((sum, item) => sum + item.controlledProvider.calls, 0) });
    expect(report.timingMs.sourceResolveWarm?.samples).toBeGreaterThanOrEqual(20);
    expect(report.timingMs.teachingDocumentWarm?.samples).toBeGreaterThanOrEqual(20);
    expect(report.externalEducatorJudgment).toBe('not_performed');
    expect(JSON.stringify(report)).not.toContain('Under uniform gravity');
    if (process.env.PETROS_PHASE5_QUALITY_ARTIFACT) {
      mkdirSync(dirname(process.env.PETROS_PHASE5_QUALITY_ARTIFACT), { recursive: true });
      writeFileSync(process.env.PETROS_PHASE5_QUALITY_ARTIFACT, `${JSON.stringify(report, null, 2)}\n`);
    }
  }, 180_000);
});
