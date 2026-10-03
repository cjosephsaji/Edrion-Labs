import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditWriter } from '@edrion/audit';
import type { ActionContext } from '../../common/action-context';
import type { PetrosAiGatewayService } from '../petros-ai-routing/petros-ai-gateway.service';
import { stage4ProfileFixture } from '../student/petros-loop/petros-stage4.fixture';
import type { PetrosTopicProfilesRepository } from './petros-topic-profiles.repository';
import { PetrosTopicProfilesService } from './petros-topic-profiles.service';

const PROFILE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VERSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INSTITUTION_A = '33333333-3333-4333-8333-333333333333';
const INSTITUTION_B = '44444444-4444-4444-8444-444444444444';
const EMPLOYEE_ID = '55555555-5555-4555-8555-555555555555';

describe('PetrosTopicProfilesService', () => {
  it('coalesces concurrent session bootstraps for the same topic identity', async () => {
    const canonical = stage4ProfileFixture('photosynthesis', INSTITUTION_A).profile;
    const profile = profileRow();
    const published = versionRow(3, 'published', 'human_edit', canonical);
    let releaseGeneration!: (value: typeof profile) => void;
    const generation = new Promise<typeof profile>((resolve) => {
      releaseGeneration = resolve;
    });
    const repo = {
      findByIdentity: vi.fn(async () => undefined),
      findProfile: vi.fn(async () => profile),
      findPublishedVersion: vi.fn(async () => published),
      findPublishedOverride: vi.fn(async () => undefined),
      touchCacheHit: vi.fn(async () => undefined),
    };
    const service = makeService(repo);
    const generateInternal = vi
      .spyOn(service as never, 'generateInternal')
      .mockReturnValue(generation as never);

    const request = {
      institutionId: INSTITUTION_A,
      topic: 'Photosynthesis',
      profileContext: {},
    };
    const first = service.resolveForSession(request);
    const second = service.resolveForSession(request);
    await vi.waitFor(() => expect(generateInternal).toHaveBeenCalledTimes(1));
    releaseGeneration(profile);

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(repo.findByIdentity).toHaveBeenCalledTimes(1);
  });

  it('applies a published override only to its institution', async () => {
    const canonical = stage4ProfileFixture('photosynthesis', INSTITUTION_A).profile;
    const profile = profileRow();
    const published = versionRow(3, 'published', 'human_edit', canonical);
    const repo = {
      findProfile: vi.fn(async () => profile),
      findPublishedVersion: vi.fn(async () => published),
      findPublishedOverride: vi.fn(async (_profileId: string, institutionId: string) =>
        institutionId === INSTITUTION_A
          ? {
              id: '66666666-6666-4666-8666-666666666666',
              version: 2,
              patch: { dimensions: { abstractionLevel: 4 } },
            }
          : undefined,
      ),
    };
    const service = makeService(repo);

    const overridden = await service.resolve(PROFILE_ID, INSTITUTION_A);
    const canonicalForOtherTenant = await service.resolve(PROFILE_ID, INSTITUTION_B);

    expect(overridden.resolution).toBe('institution_override');
    expect(overridden.profile.dimensions.abstractionLevel).toBe(4);
    expect(canonicalForOtherTenant.resolution).toBe('canonical');
    expect(canonicalForOtherTenant.profile.dimensions.abstractionLevel).toBe(2);
    expect(repo.findPublishedOverride).toHaveBeenCalledWith(PROFILE_ID, INSTITUTION_B);
  });

  it('regenerates once after invalidation, then hard-hits the cache without replacing human publication', async () => {
    const canonical = stage4ProfileFixture('history of a revolution', INSTITUTION_A).profile;
    const profile = profileRow({
      topicKey: 'history-of-a-revolution',
      canonicalTitle: 'History of a revolution',
      subjectKey: 'history',
      subjectLabel: 'History',
      curriculumKey: 'generic',
      curriculumLabel: 'General curriculum',
      gradeBand: 'unspecified',
      cacheKey: 'old-cache-key',
      publishedVersionId: VERSION_ID,
    });
    const humanPublished = versionRow(3, 'published', 'human_edit', canonical);
    let generatedDraft: ReturnType<typeof versionRow> | undefined;
    const repo = {
      findByIdentity: vi.fn(async () => profile),
      findProfile: vi.fn(async () => profile),
      findPublishedVersion: vi.fn(async () => humanPublished),
      findPublishedOverride: vi.fn(async () => undefined),
      markStale: vi.fn(async () => profile),
      findOrCreateLearnTopic: vi.fn(async () => ({ id: '77777777-7777-4777-8777-777777777777' })),
      listVersions: vi.fn(async () =>
        generatedDraft ? [generatedDraft, humanPublished] : [humanPublished],
      ),
      insertVersion: vi.fn(async (values: Record<string, unknown>) => {
        const generatedProfile = values.profile as typeof canonical;
        profile.cacheKey = generatedProfile.cache.key;
        profile.status = 'draft';
        profile.version += 1;
        generatedDraft = versionRow(4, 'draft', 'generated', generatedProfile);
        return generatedDraft;
      }),
      touchCacheHit: vi.fn(async () => undefined),
      recordAudit: vi.fn(async () => undefined),
    };
    const gateway = { execute: vi.fn() };
    const service = makeService(repo, gateway);

    const request = {
      institutionId: INSTITUTION_A,
      topic: 'History of a revolution',
      profileContext: {},
    };
    const first = await service.resolveForSession(request);
    const second = await service.resolveForSession(request);

    expect(repo.markStale).toHaveBeenCalledTimes(1);
    expect(repo.insertVersion).toHaveBeenCalledTimes(1);
    expect(gateway.execute).not.toHaveBeenCalled();
    expect(first.canonicalVersion).toBe(3);
    expect(second.canonicalVersion).toBe(3);
    expect(first.profile.provenance.source).not.toBe('generated');
    expect(repo.touchCacheHit).toHaveBeenCalledTimes(3);
  });

  it('rejects a stale reviewer version before writing', async () => {
    const repo = {
      findProfile: vi.fn(async () => profileRow({ version: 9 })),
      insertVersion: vi.fn(),
    };
    const service = makeService(repo);
    const profile = stage4ProfileFixture('photosynthesis', INSTITUTION_A).profile;

    await expect(
      service.update(
        PROFILE_ID,
        { expectedVersion: 8, profile, reason: 'Reviewer edit' },
        actionContext(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.insertVersion).not.toHaveBeenCalled();
  });

  it('restores a prior version as a new auditable version and publishes it optimistically', async () => {
    const target = versionRow(
      2,
      'superseded',
      'human_edit',
      stage4ProfileFixture('photosynthesis', INSTITUTION_A).profile,
    );
    const latest = versionRow(
      4,
      'published',
      'human_edit',
      stage4ProfileFixture('photosynthesis', INSTITUTION_A).profile,
    );
    const profile = profileRow({ version: 7 });
    const repo = {
      findProfile: vi.fn(async () => profile),
      findVersion: vi.fn(async () => target),
      listVersions: vi.fn(async () => [latest, target]),
      insertVersion: vi.fn(async () => {
        profile.version += 1;
        return versionRow(5, 'draft', 'rollback', target.profile);
      }),
      publish: vi.fn(async () => ({ profile, version: target })),
      recordAudit: vi.fn(async () => undefined),
    };
    const audit = { logAudit: vi.fn(async () => undefined) };
    const service = makeService(repo, undefined, audit);
    vi.spyOn(service, 'read').mockResolvedValue({ id: PROFILE_ID } as never);

    await service.rollback(
      PROFILE_ID,
      { targetVersion: 2, expectedVersion: 7, reason: 'Restore reviewed profile' },
      actionContext(),
    );

    expect(repo.insertVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        version: 5,
        source: 'rollback',
        basedOnVersion: 2,
      }),
      expect.any(Array),
      expect.any(Array),
    );
    expect(repo.publish).toHaveBeenCalledWith(PROFILE_ID, 5, 8, EMPLOYEE_ID);
    expect(repo.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'rollback', actorRef: EMPLOYEE_ID }),
    );
    expect(audit.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'petros.topic_profile.rollback' }),
    );
  });
});

function makeService(
  repo: Record<string, unknown>,
  gateway: Record<string, unknown> = { execute: vi.fn() },
  audit: Record<string, unknown> = { logAudit: vi.fn(async () => undefined) },
) {
  return new PetrosTopicProfilesService(
    repo as unknown as PetrosTopicProfilesRepository,
    gateway as unknown as PetrosAiGatewayService,
    audit as unknown as AuditWriter,
  );
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    learnTopicId: null,
    topicKey: 'photosynthesis',
    canonicalTitle: 'Photosynthesis',
    subjectKey: 'biology',
    subjectLabel: 'Biology',
    gradeBand: 'secondary',
    curriculumKey: 'fixture',
    curriculumLabel: 'Stage 4 fixture curriculum',
    status: 'published',
    cacheKey: 'fixture:photosynthesis',
    cacheVersion: 1,
    cacheHitCount: 0,
    staleReason: null,
    version: 7,
    publishedVersionId: VERSION_ID,
    invalidationInputs: {},
    createdAt: new Date('2026-08-08T08:00:00.000Z'),
    updatedAt: new Date('2026-08-08T08:00:00.000Z'),
    ...overrides,
  };
}

function versionRow(
  version: number,
  status: 'draft' | 'published' | 'superseded',
  source: 'generated' | 'human_edit' | 'rollback',
  profile: ReturnType<typeof stage4ProfileFixture>['profile'],
) {
  return {
    id: version === 3 ? VERSION_ID : `${version}8888888-8888-4888-8888-888888888888`,
    profileId: PROFILE_ID,
    version,
    status,
    source,
    profile,
    profileHash: `hash-${version}`,
    provenance: profile.provenance,
    confidenceBasisPoints: profile.provenance.confidenceBasisPoints,
    generatorVersion: profile.provenance.generatorVersion,
    promptVersion: profile.provenance.promptVersion,
    schemaVersion: profile.schemaVersion,
    basedOnVersion: version > 1 ? version - 1 : null,
    changeSummary: `${source} version`,
    generatedRequestId: null,
    routeReference: null,
    createdBy: EMPLOYEE_ID,
    reviewedBy: status === 'published' ? EMPLOYEE_ID : null,
    createdAt: new Date(`2026-08-0${Math.min(version, 9)}T08:00:00.000Z`),
    publishedAt: status === 'published' ? new Date('2026-08-08T08:00:00.000Z') : null,
  };
}

function actionContext(): ActionContext {
  return {
    principalContext: {
      principal: {
        employeeId: EMPLOYEE_ID,
        fullName: 'Stage Four Reviewer',
        roleKeys: ['super_admin'],
      },
    },
    request: {
      ip: '127.0.0.1',
      userAgent: 'vitest',
      requestId: 'stage4-request',
      correlationId: 'stage4-correlation',
      apiEndpoint: '/petros-topic-profiles',
    },
  } as ActionContext;
}
