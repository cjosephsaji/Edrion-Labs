import { petrosVerificationOutput } from './petros-verification-output';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import IORedis from 'ioredis';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import type { RedisService } from '../../common/redis/redis.service';
import { PetrosContentIntelligenceJobs } from '../student/knowledge/petros-content-intelligence.jobs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { runInReadinessScope, runInScopedTenant, schema, sql, eq, type Database } from '@edrion/database';
import { PetrosAiRoutingRepository } from '../petros-ai-routing/petros-ai-routing.repository';
import { PetrosAiGatewayService } from '../petros-ai-routing/petros-ai-gateway.service';
import type { SourceReservation } from '../petros-ai-routing/petros-source-reservation';
import type { SourceBinding, SourceRevision } from '@edrion/schemas';
import { KnowledgePdfProcess } from '../student/knowledge/knowledge-pdf-process';
import { PdfContentAdapter } from '../student/knowledge/adapters/pdf-content.adapter';
import { TxtContentAdapter } from '../student/knowledge/adapters/txt-content.adapter';
import { MarkdownContentAdapter } from '../student/knowledge/adapters/markdown-content.adapter';
import { DocxContentAdapter } from '../student/knowledge/adapters/docx-content.adapter';
import { revisionPreparation } from '../student/knowledge/petros-content-intelligence.service';
import { canonicalContent, contentUnitHashInput, type ContentUnit } from '@edrion/schemas';
import { PptxContentAdapter } from '../student/knowledge/adapters/pptx-content.adapter';
import { PetrosContentUnitRepository } from '../student/knowledge/petros-content-unit.repository';
import { KnowledgePreparationRepository } from '../student/knowledge/knowledge-preparation.repository';
import { PetrosContentIntelligenceService } from '../student/knowledge/petros-content-intelligence.service';
import { sha256 } from '../student/knowledge/adapters/content-adapter';
import { M2_PROMPT, referenceFor } from '../student/knowledge/petros-content-interpretation';
import {
  controlledGateway,
  controlledAuthorization,
} from '../student/knowledge/petros-m2-controlled-gateway.fixture';
import { startPhase2TestDatabase, type Phase2TestDatabase } from './petros-phase2-test-database';
const root = resolve(__dirname, '../../../../..'),
  sources = resolve(root, 'packages/learn-evals/src/petros-v2/fixtures/sources');
// Each real preparation is already bounded to 55 seconds by the service. A
// multi-document integration case must let its awaited jobs finish before the
// next dependent case starts; this does not relax worker or queue latency limits.
const preparationCaseBudget = (jobs: number) => jobs * 55_000 + 15_000;
const evidence = resolve(petrosVerificationOutput(process.env.PETROS_M2FA_TESTS === '1' ? 'docs/verification/petros-v2/m2fa-evidence/marker' : process.env.PETROS_M2G_TESTS === '1'
  ? 'docs/verification/petros-v2/m2g-2026-10-13/marker' : 'docs/verification/petros-v2/m2/marker'),'..');
describe.runIf(process.env.PETROS_M2_DB_TESTS === '1')(
  'M2 genuine-byte producer in a disposable restricted-role database',
  () => {
    let f: Phase2TestDatabase,
      admin: Database,
      service: PetrosContentIntelligenceService,
      repo: PetrosContentUnitRepository,
      prep: KnowledgePreparationRepository;
    const i = randomUUID(),
      foreign = randomUUID(),
      teacher = randomUUID(),
      staff = randomUUID(),
      student = randomUUID(),
      other = randomUUID(),
      user = randomUUID(),
      otherUser = randomUUID(),
      course = randomUUID(),
      subject = randomUUID();
    const scope = { institutionId: i, institutionUserId: teacher, courseId: course };
    const materialScope = (binding: SourceBinding) =>
      binding.kind === 'material'
        ? { ...scope, sourceItemId: binding.materialId, courseId: binding.contextId }
        : scope;
    const scoped = <T>(binding: SourceBinding, fn: () => Promise<T>) =>
      runInScopedTenant(f.db, materialScope(binding), fn);
    const reader = (institutionId: string, studentId: string, rev: string) =>
      runInReadinessScope(f.db, { institutionId, studentId }, (tx) =>
        new PetrosContentUnitRepository(tx).lookup(rev, { limit: 50 }),
      );
    const rows: Record<string, unknown>[] = [];
    const providerId = randomUUID(), modelId = randomUUID(), routeId = randomUUID();
    let functionId: string;
    async function original(name: string, bindingKind = 'material') {
      const id = randomUUID(),
        object = randomUUID(),
        bytes = readFileSync(resolve(sources, name.startsWith('m2fa/') ? name : name)),
        key = `m2-${object}.bin`;
      writeFileSync(resolve(f.directory, key), bytes);
      const mime = name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : name.endsWith('.txt') ? 'text/plain' : name.endsWith('.md') ? 'text/markdown' : name.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      await admin.insert(schema.storageObjects).values({
        id: object,
        institutionId: i,
        ownerStaffUserId: teacher,
        kind: bindingKind === 'material' ? 'pdf' : 'petros_guidance_attachment',
        driver: 'local',
        storageKey: key,
        filename: name,
        mimeType: mime,
        sizeBytes: bytes.length,
        checksumSha256: sha256(bytes),
        processingStatus: 'ready',
      });
      if (bindingKind === 'material')
        await admin.insert(schema.classMaterials).values({
          id,
          institutionId: i,
          contextType: 'course',
          contextId: course,
          subjectId: subject,
          objectId: object,
          title: name,
          version: 1,
        });
      return {
        id,
        object,
        bytes,
        key,
        binding: {
          kind: 'material',
          materialId: id,
          materialVersion: 1,
          objectId: object,
          contextKind: 'course',
          contextId: course,
          subjectId: subject,
        } as SourceBinding,
      };
    }
    const worker = new KnowledgePdfProcess(),
      pdf = new PdfContentAdapter(worker),
      pptx = new PptxContentAdapter(worker);
    function make(pdfAdapter = pdf, unitRepo = repo, gateway: PetrosAiGatewayService = {} as PetrosAiGatewayService) {
      return new PetrosContentIntelligenceService(
        f.db,
        {
          NODE_ENV: 'test',
          PETROS_M2_ISOLATED_ENABLED: true,
          STUDENT_STORAGE_DIR: f.directory,
        } as never,
        pdfAdapter,
        pptx,
        unitRepo,
        prep,
        gateway, new DocxContentAdapter(worker), new TxtContentAdapter(worker), new MarkdownContentAdapter(worker),
      );
    }
    beforeAll(async () => {
      if (
        process.env.DATABASE_URL ||
        process.env.DATABASE_MIGRATION_URL ||
        Object.keys(process.env).some((k) => k.startsWith('PG') && process.env[k])
      )
        throw new Error('M2_CONFIGURED_TARGET_REFUSED');
      f = await startPhase2TestDatabase({ temporaryRoot: '/tmp' });
      admin = drizzle(f.adminSql, { schema });
      if (process.env.PETROS_M2FA_TESTS === '1') await f.adminSql.unsafe(readFileSync(resolve(root,'packages/database/proposals/m2fa-native-locators.sql'),'utf8'));
      if (process.env.PETROS_M2G_TESTS === '1') {
        await admin.select().from(schema.petrosAiAttemptReservations).limit(1);
        await f.adminSql.unsafe(readFileSync(resolve(root, 'packages/database/proposals/m2g-staff-source-reservations.sql'), 'utf8'));
        await admin.insert(schema.petrosAiProviders).values({ id: providerId, key: 'm2g-local-contract', displayName: 'No transport', adapterType: 'openai_compatible' });
        await admin.insert(schema.petrosAiModels).values({ id: modelId, providerId, modelKey: 'm2g-local-contract', displayName: 'No transport',
          pricing: { inputPerMillionMicros: 1000, outputPerMillionMicros: 1000 } });
        const [fn] = await admin.insert(schema.petrosAiFunctions).values({ key: 'document.understand', displayName: 'M2-G isolated contract',
          description: 'No genuine inference', category: 'document', settings: { maxInputTokens: 18000, maxOutputTokens: 3000,
            temperature: 0, timeoutMs: 15000, maxRetries: 0, streaming: false, caching: false } }).onConflictDoUpdate({
              target: schema.petrosAiFunctions.key, set: { enabled: true, settings: { maxInputTokens: 18000, maxOutputTokens: 3000,
                temperature: 0, timeoutMs: 15000, maxRetries: 0, streaming: false, caching: false } } }).returning();
        functionId = fn!.id;
        await admin.insert(schema.petrosAiFunctionRoutes).values({ id: routeId, functionId, providerId, modelId });
        await admin.insert(schema.petrosAiBudgetPolicies).values({ scope: 'global', dailyBudgetMicros: 1000000, monthlyBudgetMicros: 1000000 })
          .onConflictDoNothing();
        await admin.update(schema.petrosAiBudgetPolicies).set({ enabled: true, dailyBudgetMicros: 1000000, monthlyBudgetMicros: 1000000 })
          .where(eq(schema.petrosAiBudgetPolicies.scope, 'global'));
      }
      repo = new PetrosContentUnitRepository(f.db);
      prep = new KnowledgePreparationRepository(f.db);
      service = make();
      await admin.insert(schema.institutions).values(
        [i, foreign].map((id) => ({
          id,
          publicId: randomUUID(),
          legalName: 'Disposable M2 fixtures',
          displayName: 'Disposable M2',
          type: 'school',
          country: 'IN',
          primaryContact: { name: 'Fixture', email: 'fixture@example.test' },
        })),
      );
      await admin.insert(schema.institutionUsers).values(
        [teacher, user, otherUser].map((id) => ({
          id,
          institutionId: i,
          fullName: 'Synthetic M2 actor',
          email: `${id}@example.test`,
          status: 'active',
        })),
      );
      await admin.insert(schema.institutionUserRoles).values([
        { institutionUserId: teacher, roleKey: 'institution_owner' },
        { institutionUserId: user, roleKey: 'student' },
        { institutionUserId: otherUser, roleKey: 'student' },
      ]);
      await admin.insert(schema.staff).values({
        id: staff,
        institutionId: i,
        institutionUserId: teacher,
        firstName: 'Synthetic',
        lastName: 'Educator',
      });
      await admin.insert(schema.students).values([
        {
          id: student,
          institutionId: i,
          institutionUserId: user,
          admissionNo: randomUUID(),
          firstName: 'Synthetic',
          lastName: 'Recipient',
        },
        {
          id: other,
          institutionId: i,
          institutionUserId: otherUser,
          admissionNo: randomUUID(),
          firstName: 'Synthetic',
          lastName: 'Nonrecipient',
        },
      ]);
      await admin.insert(schema.subjects).values({
        id: subject,
        institutionId: i,
        name: 'M2 source inspection',
        code: randomUUID(),
      });
      await admin.insert(schema.courses).values({
        id: course,
        institutionId: i,
        subjectId: subject,
        professorTeacherId: staff,
        name: 'M2 fixture course',
        code: randomUUID(),
      });
      await admin
        .insert(schema.courseEnrollments)
        .values({ institutionId: i, studentId: student, courseId: course });
    }, 60000);
    afterAll(async () => {
      writeFileSync(resolve(evidence, 'database-evidence.json'), JSON.stringify(rows, null, 2));
      await f?.close();
    }, 30000);
    let cloud: Awaited<ReturnType<typeof original>>,
      cloudRevision: SourceRevision,
      english: Awaited<ReturnType<typeof original>>,
      englishRevision: SourceRevision;
    it.runIf(process.env.PETROS_M2G_TESTS === '1')('rehearses real staff-source reservations, duplicate rejection, budgets and settlement without learner identities', async () => {
      const file = await original('argument.pdf');
      const queued = await service.enqueue(materialScope(file.binding), file.binding);
      const prepared = await service.run(materialScope(file.binding), queued.id, new AbortController().signal);
      if (!('revision' in prepared)) throw new Error('Source preparation failed');
      const receipt = await scoped(file.binding, () => prep.get(i, queued.id, false, 'v2'));
      const authority: SourceReservation = {
        kind: 'staff_source', institutionId: i, staffActorId: teacher, sourceRevisionId: prepared.revision.id,
        sourceHash: prepared.revision.source.originalHash, preparationId: queued.id, fence: receipt.fence,
        stage: 'document.understand', interpretationVersion: M2_PROMPT, requestId: randomUUID(), approvalId: randomUUID(),
        routeId, providerKey: 'm2g-local-contract', modelKey: 'm2g-local-contract', maxSpendMicros: 1000,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      const ledger = new PetrosAiRoutingRepository(f.db);
      const reserve = (value = authority, reserveMicros = 21) => scoped(file.binding, () => ledger.reserveSourceAttempt({
        authority: value, functionId, providerId, modelId, reserveMicros,
      }));
      await expect(reserve({ ...authority, staffActorId: randomUUID() })).rejects.toThrow();
      await expect(reserve({ ...authority, sourceHash: 'f'.repeat(64) })).rejects.toThrow();
      await expect(reserve({ ...authority, fence: receipt.fence + 1 })).rejects.toThrow();
      await expect(reserve({ ...authority, maxSpendMicros: 1 })).rejects.toThrow();
      const hold = await reserve();
      expect(hold.commandId).toBeNull(); expect(hold.studentId).toBeNull(); expect(hold.sessionId).toBeNull();
      expect(hold.sourceContext?.staffActorId).toBe(teacher);
      await expect(reserve()).rejects.toThrow();
      const foreignRows = await runInReadinessScope(f.db, { institutionId: foreign, institutionUserId: teacher }, tx =>
        tx.select().from(schema.petrosAiAttemptReservations).where(eq(schema.petrosAiAttemptReservations.id, hold.id)));
      expect(foreignRows).toEqual([]);
      await scoped(file.binding, () => ledger.markDocumentAttemptDispatched(hold.id));
      const usage = await scoped(file.binding, () => ledger.settleDocumentAttempt(hold.id, {
        requestId: authority.requestId, institutionId: i, functionId, providerId, modelId,
        inputTokens: 10, outputTokens: 8, estimatedCostMicros: 1, responseTimeMs: 1, status: 'success',
        metadata: { verification: 'controlled_ledger_receipt_no_provider_dispatch' },
      }));
      expect(usage.budgetReservationId).toBe(hold.id);
      expect(usage.studentId).toBeNull();
      await expect(scoped(file.binding, () => ledger.settleDocumentAttempt(hold.id, {
        requestId: authority.requestId, institutionId: i, functionId, providerId, modelId,
        estimatedCostMicros: 1, responseTimeMs: 1, status: 'success',
      }))).rejects.toThrow();
      await admin.update(schema.petrosAiBudgetPolicies).set({ dailyBudgetMicros: 1 }).where(eq(schema.petrosAiBudgetPolicies.scope, 'global'));
      await expect(reserve({ ...authority, interpretationVersion: 'm2g.changed-contract', requestId: randomUUID() })).rejects.toThrow();
      await admin.update(schema.petrosAiBudgetPolicies).set({ dailyBudgetMicros: 1000000 }).where(eq(schema.petrosAiBudgetPolicies.scope, 'global'));
      const later = await reserve({ ...authority, interpretationVersion: 'm2g.changed-contract', requestId: randomUUID() });
      await scoped(file.binding, () => ledger.releaseDocumentAttempt(later.id));
      await admin.execute(sql`update class_materials set source_revoked_at=now(),version=version+1 where id=${file.id}::uuid`);
      await expect(reserve({ ...authority, interpretationVersion: 'm2g.withdrawn', requestId: randomUUID() })).rejects.toThrow();
      rows.push({ check: 'm2g_staff_ledger', actualProviderCalls: 0, commandId: null, studentId: null,
        sourceHash: authority.sourceHash, holdId: hold.id, usageId: usage.id, status: 'passed' });
    }, 30000);
    it.runIf(process.env.PETROS_M2G_TESTS === '1')('runs the staff gateway with real restricted ledger and controlled transport; withdrawal fences the result but not usage settlement', async () => {
      for (const withdraw of [false, true]) {
        const file = await original('argument.pdf');
        const queued = await service.enqueue(materialScope(file.binding), file.binding);
        const prepared = await service.run(materialScope(file.binding), queued.id, new AbortController().signal);
        if (!('revision' in prepared)) throw new Error('Missing prepared revision');
        const lookup = await scoped(file.binding, () => repo.lookup(prepared.revision.id, { limit: 8 }));
        if (lookup.status !== 'available') throw new Error('Missing units');
        const unit = lookup.units.find(value => value.searchableText.includes('survey of 120'))!;
        const receipt = await scoped(file.binding, () => prep.get(i, queued.id, false, 'v2'));
        const authority = controlledAuthorization(prepared.revision);
        Object.assign(authority.sourceReservation!, { preparationId: queued.id, fence: receipt.fence,
          routeId, providerKey: 'm2g-local-contract', modelKey: 'm2g-local-contract' });
        const candidate = { routeId, providerId, modelId, tier: 0 };
        const transport = vi.fn(async () => {
          if (withdraw) await admin.execute(sql`update class_materials set source_revoked_at=now(),version=version+1 where id=${file.id}::uuid`);
          return { kind: 'json', content: { schemaVersion: M2_PROMPT, proposals: [{
            kind: 'evidence', statement: 'A survey of 120 learners found that 84 preferred later access.',
            support: [{ reference: referenceFor(unit), quote: unit.searchableText }], relatedUnitId: null, diagramEdge: null,
          }], uncertainties: [] }, inputTokens: 10, outputTokens: 8, cachedTokens: 0, actualCostMicros: 0 };
        });
        const gateway = new PetrosAiGatewayService({ ensureRegistry: async () => {}, previewRoute: async () => ({
          selected: candidate, attempts: [candidate], cacheAllowed: false, matchedRules: [],
        }) } as never, new PetrosAiRoutingRepository(f.db), { adapter: () => ({ execute: transport }) } as never,
        { get: vi.fn(), set: vi.fn() } as never,
        { PETROS_AI_MODE: 'live', NODE_ENV: 'test', PETROS_M2_ISOLATED_ENABLED: true } as never);
        const scopedService = make(pdf, repo, gateway as never);
        const pending = scopedService.interpret(materialScope(file.binding), prepared.revision.id, authority, new AbortController().signal);
        if (withdraw) await expect(pending).rejects.toThrow();
        else {
          const result = await pending;
          expect(result.liveVerified).toBe(false);
          const correction = await scopedService.appendInterpretation(materialScope(file.binding), prepared.revision.id, result);
          expect(correction.revision.processing.correctionOf).toBe(prepared.revision.id);
        }
        expect(transport).toHaveBeenCalledOnce();
        const [usage] = await admin.select().from(schema.petrosAiUsageEvents).where(eq(schema.petrosAiUsageEvents.requestId, authority.sourceReservation!.requestId));
        expect(usage?.budgetReservationId).toBeTruthy();
        expect(usage?.studentId).toBeNull();
        expect(usage?.metadata.executionOrigin).toBe('controlled');
        rows.push({ check: 'm2g_end_to_end_staff_gateway', withdrawnDuringControlledTransport: withdraw,
          usageSettled: true, actualProviderCalls: 0, liveVerified: false });
      }
    }, 30000);
    it('processes real cloud PPTX and English PDF and retrieves their actual M1 units', async () => {
      for (const name of ['cloud-models.pptx', 'argument.pdf']) {
        const started = performance.now();
        const file = await original(name),
          queued = await service.enqueue(materialScope(file.binding), file.binding),
          stages: string[] = [],
          out = await service.run(
            materialScope(file.binding),
            queued.id,
            new AbortController().signal,
            (s) => stages.push(s),
          );
        expect(['partially_supported', 'completed']).toContain(out.status);
        if (!('revision' in out)) throw new Error('revision missing');
        const lookup = await reader(i, student, out.revision.id);
        expect(lookup.status).toBe('available');
        if (lookup.status !== 'available') throw new Error('lookup missing');
        expect(lookup.units.length).toBe(out.unitCount);
        expect(out.semantic.liveVerified).toBe(false);
        expect(out.teachingReady).toBe(false);
        const status = await scoped(file.binding, () => prep.get(i, queued.id, false, 'v2'));
        expect(status.state).toBe('succeeded');
        expect(status.m2Progress).toMatchObject({ stage: out.status, revisionId: out.revision.id });
        if (name === 'cloud-models.pptx')
          expect(out.revision.visualReceipts?.some((r) => r.text.includes('Gateway'))).toBe(true);
        rows.push({
          name,
          preparationId: queued.id,
          revision: out.revision,
          unitCount: out.unitCount,
          stages,
          timing: out.timing,
          endToEndMs: performance.now() - started,
          semantic: out.semantic,
        });
        if (name.endsWith('.pptx')) {
          cloud = file;
          cloudRevision = out.revision;
          expect(lookup.units.some((u) => u.payload.kind === 'table')).toBe(true);
          expect(lookup.units.some((u) => u.sourceChannel === 'notes')).toBe(true);
        } else {
          english = file;
          englishRevision = out.revision;
          expect(lookup.units.some((u) => u.payload.kind === 'table')).toBe(true);
        }
      }
    }, preparationCaseBudget(2));
    it('rejects cross-tenant, nonrecipient and unsafe student worker scopes; original/crop retrieval rechecks access', async () => {
      expect((await reader(i, other, cloudRevision.id)).status).toBe('unavailable');
      expect((await reader(foreign, student, cloudRevision.id)).status).toBe('unavailable');
      await expect(
        service.inspectSurface(
          { institutionId: i, studentId: other },
          cloudRevision.id,
          1,
          new AbortController().signal,
        ),
      ).rejects.toThrow('UNAVAILABLE');
      const queued = await service.enqueue(materialScope(cloud.binding), cloud.binding);
      await expect(
        service.run(
          { institutionId: i, studentId: student },
          queued.id,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      const surface = await service.inspectSurface(
        { institutionId: i, studentId: student },
        englishRevision.id,
        1,
        new AbortController().signal,
      );
      expect(surface.preview?.fidelity).toBe('source_render');
      const key = cloudRevision.visualReceipts![0]!.key;
      await expect(
        service.inspectCrop(
          { institutionId: i, studentId: other },
          cloudRevision.id,
          key,
          new AbortController().signal,
        ),
      ).rejects.toThrow('UNAVAILABLE');
      const crop = await service.inspectCrop(
        { institutionId: i, studentId: student },
        cloudRevision.id,
        key,
        new AbortController().signal,
      );
      expect(crop.crop.hash).toBe(cloudRevision.visualReceipts![0]!.cropHash);
      expect(crop.crop.width).toBeLessThanOrEqual(1280);
      rows.push({
        security: {
          crossTenant: 'denied',
          nonrecipient: 'denied',
          unsafeWorkerScope: 'denied',
          unauthorizedPreview: 'denied',
          authorizedPreview: 'source_render',
          unauthorizedCrop: 'denied',
          authorizedCrop: 'receipt_hash_matches',
        },
      });
    }, preparationCaseBudget(1));
    it('deduplicates repeated admission/delivery and detects changed table cells and arrow direction', async () => {
      const queued = await service.enqueue(materialScope(cloud.binding), cloud.binding);
      expect(
        await service.run(materialScope(cloud.binding), queued.id, new AbortController().signal),
      ).toEqual({ status: 'not_claimed' });
      expect((await service.enqueue(materialScope(cloud.binding), cloud.binding)).id).toBe(
        queued.id,
      );
      const changed = await original('cloud-models-revised.pptx');
      await f.adminSql`DELETE FROM class_materials WHERE id=${changed.id}`;
      await f.adminSql`UPDATE class_materials SET object_id=${changed.object},version=2 WHERE id=${cloud.id}`;
      const binding = {
        ...cloud.binding,
        materialVersion: 2,
        objectId: changed.object,
      } as SourceBinding;
      const next = await service.enqueue(materialScope(binding), binding),
        out = await service.run(materialScope(binding), next.id, new AbortController().signal);
      if (!('revision' in out)) throw new Error('revision missing');
      const current = await reader(i, student, out.revision.id);
      if (current.status !== 'available') throw new Error('current unavailable');
      expect(out.revision.source.originalHash).not.toBe(cloudRevision.source.originalHash);
      expect((await reader(i, student, cloudRevision.id)).status).toBe('unavailable');
      const t = current.units.find((u) => u.payload.kind === 'table')!;
      expect(JSON.stringify(t.payload)).toContain('Application code and runtime');
      const d = current.units.find((u) => u.payload.kind === 'diagram')!;
      if (d.payload.kind !== 'diagram') throw new Error('diagram missing');
      expect(d.payload.relationships[0]!.from).toBe(
        d.payload.nodes.find((n) => n.label === 'Database')!.id,
      );
      const [preserved] =
        await f.adminSql`SELECT checksum FROM petros_document_source_revisions WHERE id=${cloudRevision.id}`;
      expect(preserved!.checksum).toBe(cloudRevision.source.originalHash);
      rows.push({
        change: {
          originalHash: cloudRevision.source.originalHash,
          revisedHash: out.revision.source.originalHash,
          originalPreserved: true,
          staleLookup: 'denied',
          tableCell: 'Application code and runtime',
          arrow: 'Database->Server',
        },
      });
      cloud.binding = binding;
      cloud.object = changed.object;
      cloudRevision = out.revision;
    }, preparationCaseBudget(1));
    it('stores controlled gateway interpretation as a new immutable correction and retains original extraction', async () => {
      const lookup = await reader(i, student, englishRevision.id);
      if (lookup.status !== 'available') throw new Error('missing');
      const u = lookup.units.find((u) => u.searchableText.includes('120 learners'))!;
      const response = {
        schemaVersion: M2_PROMPT,
        proposals: [
          {
            kind: 'evidence',
            statement: 'A survey of 120 learners found that 84 preferred later access.',
            support: [{ reference: referenceFor(u), quote: u.searchableText }],
            relatedUnitId: lookup.units[0]!.id,
            diagramEdge: null,
          },
        ],
        uncertainties: ['Reasoning relationships require academic review.'],
      };
      const fake = controlledGateway(response),
        s = make(pdf, repo, fake.gateway as never);
      const authorization = controlledAuthorization(englishRevision);
      const [preparation] = await admin.select().from(schema.knowledgePreparations)
        .where(sql`m2_progress->>'revisionId'=${englishRevision.id}`).limit(1);
      authorization.sourceReservation!.preparationId = preparation!.id;
      authorization.sourceReservation!.fence = preparation!.fence;
      const result = await s.interpret(
        materialScope(english.binding),
        englishRevision.id,
        authorization,
        new AbortController().signal,
      );
      const out = await s.appendInterpretation(
        materialScope(english.binding),
        englishRevision.id,
        result,
      );
      expect(out.revision.processing.correctionOf).toBe(englishRevision.id);
      expect(out.revision.interpretationReceipt?.verification).toBe('controlled_provider_response');
      expect(out.liveVerified).toBe(false);
      const corrected = await reader(i, student, out.revision.id);
      if (corrected.status !== 'available') throw new Error('missing');
      expect(
        corrected.units.some((u) =>
          u.claims.some((c) => c.origin === 'model' && c.status === 'proposed'),
        ),
      ).toBe(true);
      const old = await reader(i, student, englishRevision.id);
      if (old.status !== 'available') throw new Error('missing');
      expect(old.units.every((u) => u.claims.length === 0)).toBe(true);
      expect(
        (await s.appendInterpretation(materialScope(english.binding), englishRevision.id, result))
          .revision.id,
      ).toBe(out.revision.id);
      rows.push({
        controlledInterpretation: {
          revisionId: out.revision.id,
          correctionOf: englishRevision.id,
          liveVerified: false,
          verification: 'controlled_provider_response',
        },
      });
    }, preparationCaseBudget(1));
    it('rolls back source revision and all units on an injected persistence failure and retries cleanly', async () => {
      const file = await original('argument-commentary.pptx'),
        queued = await service.enqueue(materialScope(file.binding), file.binding),
        bad = new PetrosContentUnitRepository(f.db);
      vi.spyOn(bad, 'persist').mockRejectedValueOnce(new Error('Injected transaction failure'));
      await expect(
        make(pdf, bad).run(materialScope(file.binding), queued.id, new AbortController().signal),
      ).rejects.toThrow();
      expect(
        await f.adminSql`SELECT id FROM petros_document_source_revisions WHERE original_source_id=${file.id}`,
      ).toHaveLength(0);
      const status = await scoped(file.binding, () => prep.get(i, queued.id, false, 'v2'));
      expect(status.state).toBe('failed');
      // Infrastructure errors are not automatically retryable until classified; explicit test resets the disposable receipt only.
      await f.adminSql`UPDATE knowledge_preparations SET state='queued',next_attempt_at=now(),lease_until=NULL WHERE id=${queued.id}`;
      const out = await service.run(
        materialScope(file.binding),
        queued.id,
        new AbortController().signal,
      );
      expect(out.status).toBe('partially_supported');
      rows.push({ rollback: true, retry: 'real_bytes_succeeded' });
    }, preparationCaseBudget(2));
    it('rejects source withdrawal and a late worker fence before final publication', async () => {
      for (const mode of ['withdrawal', 'fence']) {
        const file = await original('cloud-reference.pdf'),
          queued = await service.enqueue(materialScope(file.binding), file.binding);
        const adapter = {
          extract: async (...args: Parameters<PdfContentAdapter['extract']>) => {
            const e = await pdf.extract(...args);
            if (mode === 'withdrawal')
              await f.adminSql`UPDATE class_materials SET source_revoked_at=now(),version=version+1 WHERE id=${file.id}`;
            else
              await f.adminSql`UPDATE knowledge_preparations SET fence=fence+1 WHERE id=${queued.id}`;
            return e;
          },
        } as PdfContentAdapter;
        await expect(
          make(adapter).run(materialScope(file.binding), queued.id, new AbortController().signal),
        ).rejects.toThrow();
        expect(
          await f.adminSql`SELECT id FROM petros_document_source_revisions WHERE original_source_id=${file.id}`,
        ).toHaveLength(0);
      }
      rows.push({ withdrawalDuringParsing: 'no_publication', staleWorker: 'no_publication' });
    }, preparationCaseBudget(2));
    it('keeps actual guidance assignment/publication and recipient isolation during real PDF ingestion', async () => {
      const year = randomUUID(),
        grade = randomUUID(),
        classId = randomUUID(),
        assignment = randomUUID();
      await admin.insert(schema.academicYears).values({
        id: year,
        institutionId: i,
        name: 'Disposable M2 year',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      await admin
        .insert(schema.gradeLevels)
        .values({ id: grade, institutionId: i, name: 'Disposable M2 level' });
      await admin.insert(schema.classes).values({
        id: classId,
        institutionId: i,
        academicYearId: year,
        gradeLevelId: grade,
        name: 'Disposable M2 class',
      });
      await f.adminSql`UPDATE students SET class_id=${classId} WHERE id IN(${student},${other})`;
      const file = await original('argument.pdf', 'guidance_attachment');
      await f.adminSql`UPDATE storage_objects SET derived=${JSON.stringify({ guidanceBinding: { classId, subjectId: subject } })}::jsonb WHERE id=${file.object}`;
      await admin.insert(schema.assignments).values({
        id: assignment,
        institutionId: i,
        classId,
        subjectId: subject,
        teacherId: staff,
        title: 'Disposable M2 guidance',
        status: 'published',
        version: 0,
        petrosGuidance: {
          schemaVersion: 'petros.teacher-guidance.v1',
          focus: 'Source inspection',
          instructions: '',
          approach: 'understand',
          sessionMinutes: 15,
          attachmentObjectIds: [file.object],
        },
      });
      await admin
        .insert(schema.assignmentAssignees)
        .values({ assignmentId: assignment, studentId: student });
      const binding: SourceBinding = {
        kind: 'guidance_attachment',
        objectId: file.object,
        assignmentId: assignment,
        publicationVersion: 0,
        classId,
        subjectId: subject,
      };
      const queued = await service.enqueue(materialScope(binding), binding),
        out = await service.run(scope, queued.id, new AbortController().signal);
      if (!('revision' in out)) throw new Error('missing');
      expect((await reader(i, student, out.revision.id)).status).toBe('available');
      expect((await reader(i, other, out.revision.id)).status).toBe('unavailable');
      const [row] =
        await f.adminSql`SELECT source_key,class_material_id FROM petros_document_source_revisions WHERE id=${out.revision.id}`;
      expect(row).toEqual({
        source_key: `guidance_attachment:${file.object}:0`,
        class_material_id: null,
      });
      await f.adminSql`UPDATE assignments SET status='closed',version=1 WHERE id=${assignment}`;
      expect((await reader(i, student, out.revision.id)).status).toBe('unavailable');
      rows.push({
        guidance: {
          identity: `guidance_attachment:${file.object}:0`,
          nonrecipient: 'denied',
          withdrawn: 'denied',
          actualPDF: true,
        },
      });
    }, preparationCaseBudget(1));
    it.runIf(process.env.PETROS_M2FA_TESTS === '1').each(['cloud-notes.docx','cloud-notes.txt','argument-notes.md'])('keeps native guidance recipients, class, subject, publication and assets isolated: %s', async name => {
      const year = randomUUID(),
        grade = randomUUID(),
        classId = randomUUID(),
        assignment = randomUUID();
      await admin.insert(schema.academicYears).values({
        id: year,
        institutionId: i,
        name: 'Disposable M2 year',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      });
      await admin
        .insert(schema.gradeLevels)
        .values({ id: grade, institutionId: i, name: 'Disposable M2 level' });
      await admin.insert(schema.classes).values({
        id: classId,
        institutionId: i,
        academicYearId: year,
        gradeLevelId: grade,
        name: 'Disposable M2 class',
      });
      await f.adminSql`UPDATE students SET class_id=${classId} WHERE id IN(${student},${other})`;
      const file = await original('m2fa/'+name, 'guidance_attachment');
      await f.adminSql`UPDATE storage_objects SET derived=${JSON.stringify({ guidanceBinding: { classId, subjectId: subject } })}::jsonb WHERE id=${file.object}`;
      await admin.insert(schema.assignments).values({
        id: assignment,
        institutionId: i,
        classId,
        subjectId: subject,
        teacherId: staff,
        title: 'Disposable M2 guidance',
        status: 'published',
        version: 0,
        petrosGuidance: {
          schemaVersion: 'petros.teacher-guidance.v1',
          focus: 'Source inspection',
          instructions: '',
          approach: 'understand',
          sessionMinutes: 15,
          attachmentObjectIds: [file.object],
        },
      });
      await admin
        .insert(schema.assignmentAssignees)
        .values({ assignmentId: assignment, studentId: student });
      const binding: SourceBinding = {
        kind: 'guidance_attachment',
        objectId: file.object,
        assignmentId: assignment,
        publicationVersion: 0,
        classId,
        subjectId: subject,
      };
      const queued = await service.enqueue(materialScope(binding), binding),
        out = await service.run(scope, queued.id, new AbortController().signal);
      if (!('revision' in out)) throw new Error('missing');
      expect((await reader(i, student, out.revision.id)).status).toBe('available');
      expect((await reader(i, other, out.revision.id)).status).toBe('unavailable');
      const [row] =
        await f.adminSql`SELECT source_key,class_material_id FROM petros_document_source_revisions WHERE id=${out.revision.id}`;
      expect(row).toEqual({
        source_key: `guidance_attachment:${file.object}:0`,
        class_material_id: null,
      });
      const deniedScope={institutionId:i,studentId:other};
      const image=(await reader(i,student,out.revision.id));
      if(image.status==='available'&&image.units[0]) await expect(service.inspectNativeUnit(deniedScope,out.revision.id,image.units[0].id,new AbortController().signal)).rejects.toThrow();
      expect((await reader(foreign,student,out.revision.id)).status).toBe('unavailable');
      await f.adminSql`UPDATE assignments SET status='closed',version=1 WHERE id=${assignment}`;
      expect((await reader(i, student, out.revision.id)).status).toBe('unavailable');
      rows.push({
        guidance: {
          identity: `guidance_attachment:${file.object}:0`,
          nonrecipient: 'denied',
          withdrawn: 'denied',
          format:name,
        },
      });
    }, 15000);
    it('enforces hash/type/scan admission, immutable content and current publication checks', async () => {
      const queued = await service.enqueue(materialScope(english.binding), english.binding);
      expect(queued.operationVersion).toBe('v2');
      for (const invalidProgress of [{}, { stage: null }, { stage: 'invented_stage' }]) {
        await expect(
          f.adminSql`UPDATE knowledge_preparations SET m2_progress=${JSON.stringify(invalidProgress)}::jsonb WHERE id=${queued.id}`,
        ).rejects.toThrow('m2_preparation_progress_bound');
      }
      await f.adminSql`UPDATE storage_objects SET processing_status='quarantined' WHERE id=${english.object}`;
      await expect(
        service.inspectSurface(
          materialScope(english.binding),
          englishRevision.id,
          1,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      await f.adminSql`UPDATE storage_objects SET processing_status='ready' WHERE id=${english.object}`;
      await expect(
        f.adminSql`UPDATE petros_content_units SET searchable_text='changed' WHERE source_revision_id=${englishRevision.id}`,
      ).rejects.toThrow('M1_IMMUTABLE_VERSION');
      const file = await original('argument.pdf');
      writeFileSync(resolve(f.directory, file.key), Buffer.from('corrupted bytes'));
      const job = await service.enqueue(materialScope(file.binding), file.binding);
      await expect(
        service.run(materialScope(file.binding), job.id, new AbortController().signal),
      ).rejects.toThrow('SOURCE_SIZE');
      expect(
        await f.adminSql`SELECT id FROM petros_document_source_revisions WHERE original_source_id=${file.id}`,
      ).toHaveLength(0);
    }, 10000);
    it.each(['structures.pdf', ...(process.env.PETROS_M2FA_TESTS === '1' ? ['m2fa/cloud-notes.docx','m2fa/cloud-notes.txt','m2fa/argument-notes.md'] : [])])('uses actual BullMQ, lease recovery and queue measurements: %s', async queueName => {
      const socket = resolve(f.directory, 'redis.sock');
      const server = spawn(
        process.env.PETROS_TEST_REDIS_SERVER ?? '/opt/homebrew/bin/redis-server',
        [
          '--port',
          '0',
          '--unixsocket',
          socket,
          '--unixsocketperm',
          '700',
          '--save',
          '',
          '--appendonly',
          'no',
          '--dir',
          f.directory,
        ],
        { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let redis: IORedis | undefined,
        jobs: JobsService | undefined,
        workers: QueueWorkers | undefined,
        producer: PetrosContentIntelligenceJobs | undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Disposable Redis startup timeout')),
            5000,
          );
          server.on('error', reject);
          server.stdout.on('data', (b) => {
            if (b.toString().toLowerCase().includes('ready to accept connections')) {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
        redis = new IORedis(socket, { maxRetriesPerRequest: 1 });
        await redis.ping();
        const env = {
          REDIS_ENABLED: true,
          QUEUE_WORKERS_ENABLED: true,
          REDIS_URL: socket,
        } as never;
        jobs = new JobsService(env);
        workers = new QueueWorkers(env, {} as RedisService);
        producer = new PetrosContentIntelligenceJobs(jobs, workers, service);
        producer.onModuleInit();
        const file = await original(queueName),
          actor = materialScope(file.binding),
          queued = await service.enqueue(actor, file.binding);
        const crashed = await scoped(file.binding, () => prep.claim(i, queued.id, 'v2'));
        expect(crashed).not.toBeNull();
        await f.adminSql`UPDATE knowledge_preparations SET lease_until=now()-interval '1 second' WHERE id=${queued.id}`;
        const due = await service.recover(actor);
        expect(due.some((r) => r.id === queued.id)).toBe(true);
        const receipt = due.find((r) => r.id === queued.id)!,
          ack: number[] = [];
        for (let n = 0; n < 20; n++) {
          const start = performance.now();
          await producer.dispatch(receipt);
          ack.push(performance.now() - start);
        }
        const payload = await redis.hgetall(
          `bull:imports:petros-m2-${queued.id}-${receipt.dispatchSequence}`,
        );
        expect(JSON.parse(payload.data!)).toEqual({
          id: queued.id,
          institutionId: i,
          requestedBy: teacher,
          sourceItemId: file.id,
          courseId: course,
        });
        workers.onModuleInit();
        // Completion is bounded by the worker's 55-second job limit, distinct
        // from the unchanged 500ms enqueue-p95 assertion below.
        const end = Date.now() + 60_000;
        let state: string | undefined;
        while (Date.now() < end) {
          const [row] =
            await f.adminSql`SELECT state FROM knowledge_preparations WHERE id=${queued.id}`;
          state = row?.state;
          if (state === 'succeeded' || state === 'failed') break;
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(state).toBe('succeeded');
        await expect(scoped(file.binding, () => prep.assertLease(crashed!))).rejects.toThrow();
        const [count] =
          await f.adminSql`SELECT count(*)::int AS n FROM petros_document_source_revisions WHERE original_source_id=${file.id}`;
        expect(count!.n).toBe(1);
        const sorted = [...ack].sort((a, b) => a - b),
          p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
        expect(p95).toBeLessThanOrEqual(500);
        const hit = await service.retrieve(
          { institutionId: i, studentId: student },
          englishRevision.id,
          'survey',
        );
        expect(hit.status).toBe('available');
        if (hit.status === 'available') {
          expect(hit.units.length).toBeLessThanOrEqual(8);
          expect(hit.passes).toBe(2);
          expect(hit.units.some((u) => u.searchableText.includes('120'))).toBe(true);
        }
        expect(
          (
            await service.retrieve(
              { institutionId: i, studentId: student },
              englishRevision.id,
              'absentunsupportedterm',
            )
          ).status,
        ).toBe('content_gap');
        rows.push({
          queue: {
            format:queueName,
            transport: 'new private Unix-socket Redis',
            ackMs: ack,
            p95AckMs: p95,
            expiredLeaseRecovered: true,
            lateFenceRejected: true,
            uniqueRevision: true,
            redisPayload: 'IDs only',
          },
          retrieval: { maxUnits: 8, maxPasses: 2, contentGap: 'explicit' },
        });
      } finally {
        producer?.onModuleDestroy();
        await workers?.onModuleDestroy();
        await jobs?.onModuleDestroy();
        await redis?.quit();
        server.kill('SIGTERM');
        await new Promise<void>((r) =>
          server.exitCode !== null || server.signalCode !== null
            ? r()
            : server.once('exit', () => r()),
        );
      }
    }, preparationCaseBudget(1));
    it.runIf(process.env.PETROS_M2FA_TESTS === '1').each([
      ['cloud-notes.docx','cloud-table-cell.docx'],['cloud-notes.txt','text-statistic.txt'],['argument-notes.md','argument-code.md'],
    ])('persists native %s with idempotency, revisions, RLS, exact anchors and immutable corrections',async (name,changed)=>{
      const file=await original('m2fa/'+name),actor=materialScope(file.binding),start=performance.now();
      const queued=await service.enqueue(actor,file.binding);
      const stages:string[]=[];
      const out=await service.run(actor,queued.id,new AbortController().signal,s=>stages.push(s));
      if(!('revision' in out))throw new Error('native preparation failed');
      const preparationMs=performance.now()-start;
      const read=await reader(i,student,out.revision.id);if(read.status!=='available')throw new Error('native retrieval failed');
      const snapshot=canonicalContent(read.units);
      if(name.endsWith('.docx'))expect((await service.retrieve({institutionId:i,studentId:student},out.revision.id,'Reveal private')).status).toBe('content_gap');
      expect(stages).toContain('format_detection');expect(stages).toContain('semantic_eligibility');expect(stages).not.toContain('rendering');
      expect(out.teachingReady).toBe(false);expect(out.semantic.status).toBe('unavailable');
      expect((await service.enqueue(actor,file.binding)).id).toBe(queued.id);
      expect(await service.run(actor,queued.id,new AbortController().signal)).toEqual({status:'not_claimed'});
      expect((await reader(foreign,student,out.revision.id)).status).toBe('unavailable');
      expect((await reader(i,other,out.revision.id)).status).toBe('unavailable');
      const selected=read.units.find(u=>u.payload.kind==='table')??read.units.find(u=>u.payload.kind==='code')??read.units[0]!;
      const anchor=selected.payload.kind==='table'?selected.payload.cells.find(c=>c.value==='99.9')?.id:undefined;
      const inspection=await service.inspectNativeUnit({institutionId:i,studentId:student},out.revision.id,selected.id,new AbortController().signal,anchor);
      expect(inspection.sourceHash).toBe(out.revision.source.originalHash);
      if(anchor)expect(inspection.locator).toMatchObject(name.endsWith('.docx')?{kind:'docx',row:1,column:1}:{kind:'markdown',nodeType:'table_cell'});
      await expect(service.inspectSurface({institutionId:i,studentId:student},out.revision.id,1,new AbortController().signal)).rejects.toThrow('M2_SURFACE_UNAVAILABLE');
      await expect(service.inspectNativeUnit({institutionId:i,studentId:other},out.revision.id,selected.id,new AbortController().signal)).rejects.toThrow();
      const bad:ContentUnit={...structuredClone(read.units[0]!),id:randomUUID(),ordinal:99};
      if('textSpan' in bad.locator)bad.locator.textSpan={start:900000,end:900001};
      bad.contentHash=sha256(contentUnitHashInput(bad));
      await expect(scoped(file.binding,()=>repo.persist([bad]))).rejects.toThrow();
      await expect(runInReadinessScope(f.db,{institutionId:i,institutionUserId:teacher},tx=>tx.insert(schema.petrosContentUnits).values({id:bad.id,institutionId:i,sourceRevisionId:out.revision.id,parentId:bad.parentId,ordinal:99,kind:bad.payload.kind,manifest:bad,contentHash:bad.contentHash,canonicalBody:contentUnitHashInput(bad),searchableText:bad.searchableText,createdBy:teacher}))).rejects.toThrow();
      const truncated={...bad,id:randomUUID(),ordinal:98,locator:{kind:out.revision.source.kind,version:'petros.native-locator.v1',sourceHash:out.revision.source.originalHash}} as unknown as ContentUnit;
      truncated.contentHash=sha256(contentUnitHashInput(truncated));
      await expect(runInReadinessScope(f.db,{institutionId:i,institutionUserId:teacher},tx=>tx.insert(schema.petrosContentUnits).values({id:truncated.id,institutionId:i,sourceRevisionId:out.revision.id,parentId:truncated.parentId,ordinal:98,kind:truncated.payload.kind,manifest:truncated,contentHash:truncated.contentHash,canonicalBody:contentUnitHashInput(truncated),searchableText:truncated.searchableText,createdBy:teacher}))).rejects.toThrow();
      const supportUnit=read.units.find(u=>name.endsWith('.docx')?u.native?.runs?.some(r=>r.bold):name.endsWith('.md')?u.payload.kind==='code'&&u.payload.language==='python':u.payload.kind==='paragraph')!;
      const supportId=name.endsWith('.docx')?supportUnit.native!.runs!.find(r=>r.bold)!.id:name.endsWith('.md')&&supportUnit.payload.kind==='code'?supportUnit.payload.lines[0]!.id:null;
      const quote=name.endsWith('.docx')?'Bold ':name.endsWith('.md')?'value = 99.9':supportUnit.searchableText;
      const controlled=controlledGateway({schemaVersion:M2_PROMPT,proposals:[{kind:'claim',statement:quote,support:[{reference:referenceFor(supportUnit,supportId),quote}],relatedUnitId:null,diagramEdge:null}],uncertainties:[]});
      const approved=controlledAuthorization(out.revision),actualReceipt=await scoped(file.binding,()=>prep.get(i,queued.id,false,'v2'));
      Object.assign(approved.sourceReservation!,{preparationId:queued.id,fence:actualReceipt.fence});
      const interpreted=await make(pdf,repo,controlled.gateway).interpret(actor,out.revision.id,approved,new AbortController().signal,undefined,supportUnit.id);
      const appended=await service.appendInterpretation(actor,out.revision.id,interpreted);
      expect(appended.revision.processing.correctionOf).toBe(out.revision.id);expect(appended.teachingReady).toBe(false);
      const nativeE=await service.extractBytes(file.bytes,out.revision.source.kind as 'docx'|'txt'|'markdown',new AbortController().signal);
      const correction=await scoped(file.binding,()=>repo.prepareRevision({...revisionPreparation(nativeE,file.binding,name),correctionOf:out.revision.id,interpretationVersion:'native.correction.fixture'}));
      expect(correction.processing.correctionOf).toBe(out.revision.id);
      if(process.env.PETROS_M2G_TESTS === '1') {
        const receipt=await scoped(file.binding,()=>prep.get(i,queued.id,false,'v2'));
        const authority:SourceReservation={kind:'staff_source',institutionId:i,staffActorId:teacher,sourceRevisionId:out.revision.id,
          sourceHash:out.revision.source.originalHash,preparationId:queued.id,fence:receipt.fence,stage:'document.understand',interpretationVersion:M2_PROMPT,
          requestId:randomUUID(),approvalId:randomUUID(),routeId,providerKey:'m2g-local-contract',modelKey:'m2g-local-contract',maxSpendMicros:1000,expiresAt:new Date(Date.now()+60000).toISOString()};
        const ledger=new PetrosAiRoutingRepository(f.db);
        const held=await scoped(file.binding,()=>ledger.reserveSourceAttempt({authority,functionId,providerId,modelId,reserveMicros:21}));
        await expect(scoped(file.binding,()=>ledger.reserveSourceAttempt({authority,functionId,providerId,modelId,reserveMicros:21}))).rejects.toThrow();
        await scoped(file.binding,()=>ledger.releaseDocumentAttempt(held.id));
        rows.push({nativeReservation:name,role:'edrion_app',duplicateDenied:true,transport:'not_dispatched',paidInference:0});
      }
      const changedBytes=readFileSync(resolve(sources,'m2fa',changed)),object=randomUUID(),key=`m2fa-changed-${object}.bin`;writeFileSync(resolve(f.directory,key),changedBytes);
      await admin.insert(schema.storageObjects).values({id:object,institutionId:i,ownerStaffUserId:teacher,kind:'pdf',driver:'local',storageKey:key,filename:name,mimeType:name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':name.endsWith('.txt')?'text/plain':'text/markdown',sizeBytes:changedBytes.length,checksumSha256:sha256(changedBytes),processingStatus:'ready'});
      await f.adminSql`UPDATE class_materials SET object_id=${object},version=version+1 WHERE id=${file.id}`;
      const binding={...file.binding,objectId:object,materialVersion:2} as SourceBinding;
      const next=await service.enqueue(materialScope(binding),binding),latest=await service.run(materialScope(binding),next.id,new AbortController().signal);
      if(!('revision' in latest))throw new Error('changed preparation failed');
      expect(latest.revision.id).not.toBe(out.revision.id);expect(latest.revision.source.originalHash).toBe(sha256(changedBytes));
      expect((await reader(i,student,out.revision.id)).status).toBe('unavailable');
      const current=await reader(i,student,latest.revision.id);expect(current.status).toBe('available');
      if(current.status==='available')expect(current.units.some(u=>u.searchableText.includes(name.endsWith('.md')?'print(value + 1)':'97.3'))).toBe(true);
      const stored=await f.adminSql`SELECT manifest FROM petros_content_units WHERE source_revision_id=${out.revision.id} ORDER BY ordinal`;
      expect(canonicalContent(stored.map(r=>r.manifest))).toBe(snapshot);
      await expect(service.enqueue(actor,file.binding)).rejects.toThrow();
      await f.adminSql`UPDATE class_materials SET source_revoked_at=now() WHERE id=${file.id}`;
      expect((await reader(i,student,latest.revision.id)).status).toBe('unavailable');
      await expect(service.inspectNativeUnit({institutionId:i,studentId:student},latest.revision.id,selected.id,new AbortController().signal)).rejects.toThrow();
      rows.push({format:name,sourceHash:out.revision.source.originalHash,revisionId:out.revision.id,changedHash:latest.revision.source.originalHash,unitCount:read.units.length,endToEndMs:preparationMs,totalScenarioMs:performance.now()-start,role:'edrion_app',idempotent:true,invalidLocatorDenied:true,rawSqlLocatorDenied:true,crossTenantDenied:true,nonrecipientDenied:true,staleDenied:true,withdrawnDenied:true,oldBytesImmutable:true,correctionLineage:true,stages});
    },30000);
    it.runIf(process.env.PETROS_M2FA_TESTS === '1').each(['cloud-notes.docx','cloud-notes.txt','argument-notes.md'])('fences native withdrawal, hash changes, persistence rollback and cancellation: %s',async name=>{
      for(const failure of ['withdrawal','fence','hash','persist','cancel']) {
        const file=await original('m2fa/'+name),actor=materialScope(file.binding),queued=await service.enqueue(actor,file.binding);
        const testing=make(),extract=testing.extractBytes.bind(testing),cancel=new AbortController();
        if(failure==='hash')await f.adminSql`UPDATE storage_objects SET checksum_sha256=${'f'.repeat(64)} WHERE id=${file.object}`;
        if(failure==='persist')vi.spyOn(repo,'persist').mockImplementationOnce(async()=>{throw new Error('injected persistence failure');});
        if(['withdrawal','fence','cancel'].includes(failure))vi.spyOn(testing,'extractBytes').mockImplementationOnce(async(...args)=>{
          const e=await extract(...args);
          if(failure==='withdrawal')await f.adminSql`UPDATE class_materials SET source_revoked_at=now() WHERE id=${file.id}`;
          if(failure==='fence')await f.adminSql`UPDATE knowledge_preparations SET fence=fence+1 WHERE id=${queued.id}`;
          if(failure==='cancel')cancel.abort();return e;
        });
        await expect(testing.run(actor,queued.id,cancel.signal)).rejects.toThrow();
        expect(await f.adminSql`SELECT id FROM petros_document_source_revisions WHERE original_source_id=${file.id}`).toHaveLength(0);
        if(failure==='persist') {
          await f.adminSql`UPDATE knowledge_preparations SET state='queued',next_attempt_at=now(),lease_until=NULL WHERE id=${queued.id}`;
          expect(await service.run(actor,queued.id,new AbortController().signal)).toHaveProperty('revision');
        }
        rows.push({nativeFailure:name,failure,noPartialPublication:true,retry:failure==='persist'?'actual_bytes_succeeded':null});
      }
    },30000);
    it.runIf(process.env.PETROS_M2FA_TESTS === '1').each(['cloud-notes.docx','cloud-notes.txt','argument-notes.md'])('denies native withdrawal during controlled interpretation: %s',async name=>{
      const file=await original('m2fa/'+name),actor=materialScope(file.binding),queued=await service.enqueue(actor,file.binding),out=await service.run(actor,queued.id,new AbortController().signal);
      if(!('revision' in out))throw new Error('missing revision');
      const lookup=await reader(i,student,out.revision.id);if(lookup.status!=='available')throw new Error('missing units');
      const unit=lookup.units.find(u=>u.sourceChannel==='visible'&&u.payload.kind==='paragraph')!;
      const raw={schemaVersion:M2_PROMPT,proposals:[{kind:'claim',statement:unit.searchableText,support:[{reference:referenceFor(unit),quote:unit.searchableText}],relatedUnitId:null,diagramEdge:null}],uncertainties:[]};
      const control=controlledGateway(raw),originalExecute=control.execute.getMockImplementation()!;
      control.execute.mockImplementationOnce(async()=>{await f.adminSql`UPDATE class_materials SET source_revoked_at=now() WHERE id=${file.id}`;return originalExecute();});
      const approval=controlledAuthorization(out.revision),receipt=await scoped(file.binding,()=>prep.get(i,queued.id,false,'v2'));
      Object.assign(approval.sourceReservation!,{preparationId:queued.id,fence:receipt.fence});
      await expect(make(pdf,repo,control.gateway).interpret(actor,out.revision.id,approval,new AbortController().signal,undefined,unit.id)).rejects.toThrow();
      expect(control.execute).toHaveBeenCalledOnce();expect((await reader(i,student,out.revision.id)).status).toBe('unavailable');
      rows.push({nativeInterpretationWithdrawal:name,transport:'controlled',genuineProviderRequests:0,resultDenied:true,academicApproval:false});
    },15000);
  },
);
