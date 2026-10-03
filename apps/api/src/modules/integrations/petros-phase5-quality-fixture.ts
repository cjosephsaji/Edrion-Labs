import { createHash, randomUUID } from 'node:crypto';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { eq, schema } from '@edrion/database';
import { PetrosInstitutionalRepository } from '../petros-institutional/petros-institutional.repository';
import { PetrosInstitutionalService } from '../petros-institutional/petros-institutional.service';
import { PetrosLearnerModelRepository } from '../petros-learner-model/petros-learner-model.repository';
import { PetrosLearnerModelService } from '../petros-learner-model/petros-learner-model.service';
import { PetrosObjectiveEvidenceRepository } from '../petros-learner-model/petros-objective-evidence.repository';
import { PetrosObjectiveEvidenceService } from '../petros-learner-model/petros-objective-evidence.service';
import { StudentAuthService } from '../student/auth/student-auth.service';
import { PetrosAdaptiveService } from '../student/petros-loop/petros-adaptive.service';
import { PetrosLoopRepository } from '../student/petros-loop/petros-loop.repository';
import { PetrosLoopService } from '../student/petros-loop/petros-loop.service';
import { PetrosTopicProfilesRepository } from '../petros-topic-profiles/petros-topic-profiles.repository';
import { PetrosTopicProfilesService } from '../petros-topic-profiles/petros-topic-profiles.service';
import { phase2AuthorityFixture } from './petros-phase2-authority-fixture';
import type { Phase2TestDatabase } from './petros-phase2-test-database';

/** Builds the actual source, pack, policy, learner, evidence and loop owners used by Phase 2–4 journeys. */
export async function phase5QualityFixture(database: Phase2TestDatabase) {
  const fixture = await phase2AuthorityFixture(database);
  const env = { ...fixture.env, PETROS_AI_MODE: 'live' }; // Local controlled adapter only; no production gateway or credentials.
  await fixture.qualify();
  await fixture.approve();
  let controlledCalls = 0;
  const controlledProvider = {
    // Deliberately malformed synthetic model output tests the real loop's validation and
    // deterministic fallback. No network, API key or provider call is involved.
    execute: async () => {
      controlledCalls += 1;
      return {
      content: { deliberateDefect: 'unsupported claim' },
      requestId: randomUUID(), functionKey: 'controlled.synthetic', promptVersion: 'phase5-controlled-v1',
      schemaVersion: 'phase5-controlled-schema-v1', providerKey: 'controlled', modelKey: 'fixture',
      estimatedCostMicros: 0, responseTimeMs: 0, retryCount: 0, fallbackTier: 0, cached: false,
      };
    },
    get calls() { return controlledCalls; },
  };
  const auth = new StudentAuthService(database.db, database.auditWriter, fixture.env as never,
    {} as never, {} as never, {} as never);
  const policies = new PetrosInstitutionalService(new PetrosInstitutionalRepository(database.db),
    controlledProvider as never, database.auditWriter, env as never);
  const surfaces = { isPortalEnabled: async () => true };
  const adaptive = new PetrosAdaptiveService(database.db, env as never, database.auditWriter,
    auth, surfaces as never, fixture.packs, policies);
  await fixture.owned(() => adaptive.bind(fixture.student, fixture.sessionId, {
    commandId: randomUUID(), pack: fixture.candidate.pack,
  }));
  const learner = new PetrosLearnerModelService(new PetrosLearnerModelRepository(database.db), database.auditWriter);
  const topicProfiles = new PetrosTopicProfilesService(new PetrosTopicProfilesRepository(database.db),
    controlledProvider as never, database.auditWriter);
  const knowledge = new PetrosLoopRepository(database.db, fixture.knowledge);
  const loop = new PetrosLoopService(knowledge, controlledProvider as never, topicProfiles, learner,
    database.auditWriter, policies, env as never, adaptive, new PetrosObjectiveEvidenceService(
      database.db, env as never, database.auditWriter,
      new PetrosObjectiveEvidenceRepository(database.db), fixture.packs, policies, auth, surfaces as never,
    ));
  await database.db.update(schema.petrosLearningSessions).set({
    maxMoves: 12,
    checkpoints: Array.from({ length: 12 }, (_, i) => ({ id: `p5-${i + 1}`, label: `Step ${i + 1}`, status: i ? 'pending' as const : 'current' as const })),
    currentCheckpointId: 'p5-1',
  }).where(eq(schema.petrosLearningSessions.id, fixture.sessionId));
  return { ...fixture, loop, adaptive, policies, topicProfiles, controlledProvider };
}

export function phase5ContentFreeReport(input: {
  environment:{postgresVersion:string;concurrency:string};
  owners: number;
  tenants: number;
  counters: Record<string, number>;
  timings: Record<'sourceResolveCold' | 'sourceResolveWarm' | 'retrievalCold' | 'retrievalWarm' | 'teachingStartCold' | 'teachingDocumentWarm', number[]>;
  digests: string[];
  sourceVersions: string[];
  packVersions: number[];
  policyVersion: string;
  policyIdentities: Array<{schemaVersion:string;authorityHash:string;versionIds:string[]}>;
  promptVersions: string[];
  schemaVersions: string[];
  controlledModelResult: string;
  controlledModelCalls: number;
}) {
  const distribution = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
    return { samples: sorted.length, minMs: sorted[0] ?? 0, p50Ms: pick(.5), p95Ms: pick(.95), maxMs: sorted.at(-1) ?? 0 };
  };
  return {
    schemaVersion: 'petros.phase5.quality-report.v1', generatedAt: new Date().toISOString(),
    environment:{...input.environment,os:platform(),osRelease:release(),architecture:arch(),node:process.version,cpuCount:cpus().length,memoryBytes:totalmem(),databaseRole:'edrion_app/NOBYPASSRLS',providerTransport:'controlled_no_network',paidProviderCalls:0},
    evidenceClass: 'synthetic_engineering_only', externalEducatorJudgment: 'not_performed', learningEfficacy: 'not_measured',
    identities: { fixture: 'phase2-authority-fixture.v1', sourceVersions: input.sourceVersions,
      teachingPackVersions: input.packVersions, policy: input.policyVersion, policyIdentities:input.policyIdentities,
      promptVersions: input.promptVersions, outputSchemaVersions: input.schemaVersions,
      controlledModel: 'malformed-output-fixture.v1', evaluator: 'deterministic-owner-assertions.v1' },
    population: { owners: input.owners, tenants: input.tenants }, counters: input.counters,
    timingMethod: {
      cold: 'first service read/continuation for each newly created owner fixture; server and OS caches were not flushed',
      warm: 'repeated reads against the same owner/source or persisted session after its first read',
      thresholds: 'none; samples are descriptive engineering observations, not SLOs',
    },
    timingMs: Object.fromEntries(Object.entries(input.timings).map(([name, values]) => [name, distribution(values)])),
    contentDigests: input.digests.map(value => createHash('sha256').update(value).digest('hex')),
    controlledModelLayer: { result: input.controlledModelResult, calls: input.controlledModelCalls, paidCalls: 0 },
    limitations: [
      'Synthetic records and qualification receipts grant engineering fixture authority only.',
      'Malformed controlled output verifies rejection and fallback; no model quality or human judgment is assessed.',
      'Latency samples are local disposable-database measurements, not production SLOs.',
      'No learner, pilot, privacy, curriculum, accessibility or fairness acceptance is implied.',
    ],
  };
}
