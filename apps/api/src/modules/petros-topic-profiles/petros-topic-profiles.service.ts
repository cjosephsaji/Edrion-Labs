import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuditWriter } from '@edrion/audit';
import {
  PETROS_MOVE_TYPES,
  PETROS_TOPIC_PROFILE_FUNCTION_KEY,
  PETROS_TOPIC_PROFILE_GENERATOR_VERSION,
  PETROS_TOPIC_PROFILE_PROMPT_VERSION,
  PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
  petrosResolvedTopicProfileSchema,
  petrosTopicProfileSchema,
  petrosTopicProfileDimensionsSchema,
  type PetrosGenerateTopicProfileInput,
  type PetrosMoveType,
  type PetrosResolvedTopicProfile,
  type PetrosRollbackTopicProfileInput,
  type PetrosTopicProfile,
  type PetrosTopicProfileDto,
  type PetrosTopicProfileListQuery,
  type PetrosUpdateTopicProfileInput,
  type PetrosUpsertTopicProfileOverrideInput,
} from '@edrion/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import {
  PetrosAiGatewayService,
  type PetrosAiExecuteResult,
} from '../petros-ai-routing/petros-ai-gateway.service';
import { PetrosTopicProfilesRepository } from './petros-topic-profiles.repository';

export const PETROS_TOPIC_PROFILE_SYSTEM_PROMPT = `You generate one cached Petros topic profile, not a lesson.
Use only the supplied topic identity, grade, curriculum boundaries, syllabus references, and authoritative grounding.
Return strict JSON matching the schema. Every integer scale is 0..4. All weight sets total 10,000 basis points.
Do not invent a syllabus, prerequisite source, misconception source, curriculum label, or citation.
Move weights must cover the complete move vocabulary. Required/recommended/disallowed lists cannot contradict.
High prerequisite density requires explicit links. High misconception richness requires sourced known misconceptions.
Derivation is unavailable when mathematical load is zero. Do not include hidden reasoning or chain-of-thought.`;

type ProfileRow = Awaited<ReturnType<PetrosTopicProfilesRepository['findProfile']>>;

@Injectable()
export class PetrosTopicProfilesService {
  constructor(
    private readonly repo: PetrosTopicProfilesRepository,
    private readonly gateway: PetrosAiGatewayService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(query: PetrosTopicProfileListQuery) {
    const profiles = await this.repo.list(query);
    const detailed = await Promise.all(profiles.map((profile) => this.toDto(profile, query.institutionId)));
    return detailed;
  }

  async read(profileId: string, institutionId?: string) {
    return this.toDto(await this.requireProfile(profileId), institutionId);
  }

  async resolveForSession(input: {
    institutionId: string;
    topic: string;
    profileContext?: Record<string, unknown>;
  }): Promise<PetrosResolvedTopicProfile> {
    const generatedInput = profileInputFromSession(input.topic, input.profileContext ?? {});
    let profile = await this.repo.findByIdentity(
      generatedInput.topicKey,
      generatedInput.curriculumKey,
      generatedInput.gradeBand,
    );
    if (!profile) {
      const created = await this.generateInternal(generatedInput, 'system:session-bootstrap', true);
      profile = await this.requireProfile(created.id);
    } else {
      profile = await this.generateInternal(
        generatedInput,
        'system:session-cache-check',
        false,
      );
    }
    const published = await this.repo.findPublishedVersion(profile.id);
    if (!published) {
      throw new ConflictException({
        code: 'PETROS_PROFILE_NOT_PUBLISHED',
        message: 'This topic profile is awaiting publication.',
      });
    }
    await this.repo.touchCacheHit(profile.id);
    const override = await this.repo.findPublishedOverride(profile.id, input.institutionId);
    const canonical = petrosTopicProfileSchema.parse(published.profile);
    const resolvedProfile = override ? applyOverride(canonical, override.patch) : canonical;
    return petrosResolvedTopicProfileSchema.parse({
      profileId: profile.id,
      canonicalVersionId: published.id,
      canonicalVersion: published.version,
      overrideId: override?.id ?? null,
      overrideVersion: override?.version ?? null,
      resolvedForInstitutionId: input.institutionId,
      resolution: override ? 'institution_override' : 'canonical',
      profile: resolvedProfile,
      resolvedAt: new Date().toISOString(),
    });
  }

  async resolve(profileId: string, institutionId: string) {
    await this.requireProfile(profileId);
    const published = await this.repo.findPublishedVersion(profileId);
    if (!published) throw new ConflictException({ code: 'PETROS_PROFILE_NOT_PUBLISHED' });
    const override = await this.repo.findPublishedOverride(profileId, institutionId);
    return petrosResolvedTopicProfileSchema.parse({
      profileId,
      canonicalVersionId: published.id,
      canonicalVersion: published.version,
      overrideId: override?.id ?? null,
      overrideVersion: override?.version ?? null,
      resolvedForInstitutionId: institutionId,
      resolution: override ? 'institution_override' : 'canonical',
      profile: override
        ? applyOverride(petrosTopicProfileSchema.parse(published.profile), override.patch)
        : petrosTopicProfileSchema.parse(published.profile),
      resolvedAt: new Date().toISOString(),
    });
  }

  async generate(input: PetrosGenerateTopicProfileInput, ctx: ActionContext) {
    const generated = await this.generateInternal(input, actorRef(ctx), false);
    await this.writePlatformAudit(ctx, 'petros.topic_profile.generate', generated.id, input.reason, {
      topicKey: input.topicKey,
      regenerate: input.regenerate,
    });
    return this.read(generated.id);
  }

  async update(profileId: string, input: PetrosUpdateTopicProfileInput, ctx: ActionContext) {
    const profile = await this.requireProfile(profileId);
    if (profile.version !== input.expectedVersion) throw versionConflict();
    const parsed = petrosTopicProfileSchema.parse(input.profile);
    assertIdentity(profile, parsed);
    const versions = await this.repo.listVersions(profileId);
    const version = (versions[0]?.version ?? 0) + 1;
    await this.insertVersion(profileId, version, parsed, {
      source: 'human_edit',
      createdBy: actorRef(ctx),
      changeSummary: input.reason,
      basedOnVersion: versions[0]?.version,
    });
    await this.localAudit(profileId, 'edit', actorRef(ctx), input.reason, { version });
    await this.writePlatformAudit(ctx, 'petros.topic_profile.edit', profileId, input.reason, {
      version,
    });
    return this.read(profileId);
  }

  validate(profile: unknown) {
    const result = petrosTopicProfileSchema.safeParse(profile);
    return result.success
      ? { valid: true as const, issues: [] }
      : {
          valid: false as const,
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        };
  }

  async publish(
    profileId: string,
    input: { expectedVersion: number; reason: string },
    ctx: ActionContext,
  ) {
    const profile = await this.requireProfile(profileId);
    if (profile.version !== input.expectedVersion) throw versionConflict();
    const versions = await this.repo.listVersions(profileId);
    const target = versions[0];
    if (!target) throw new ConflictException({ code: 'PETROS_PROFILE_HAS_NO_VERSION' });
    petrosTopicProfileSchema.parse(target.profile);
    const published = await this.repo.publish(profileId, target.version, input.expectedVersion, actorRef(ctx));
    if (!published) throw versionConflict();
    await this.localAudit(profileId, 'publish', actorRef(ctx), input.reason, {
      version: target.version,
    });
    await this.writePlatformAudit(ctx, 'petros.topic_profile.publish', profileId, input.reason, {
      version: target.version,
    });
    return this.read(profileId);
  }

  async rollback(profileId: string, input: PetrosRollbackTopicProfileInput, ctx: ActionContext) {
    const profile = await this.requireProfile(profileId);
    if (profile.version !== input.expectedVersion) throw versionConflict();
    const [target, versions] = await Promise.all([
      this.repo.findVersion(profileId, input.targetVersion),
      this.repo.listVersions(profileId),
    ]);
    if (!target) throw new NotFoundException({ code: 'PETROS_PROFILE_VERSION_NOT_FOUND' });
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    await this.insertVersion(profileId, nextVersion, petrosTopicProfileSchema.parse(target.profile), {
      source: 'rollback',
      createdBy: actorRef(ctx),
      changeSummary: input.reason,
      basedOnVersion: input.targetVersion,
    });
    const refreshed = await this.requireProfile(profileId);
    const published = await this.repo.publish(profileId, nextVersion, refreshed.version, actorRef(ctx));
    if (!published) throw versionConflict();
    await this.localAudit(profileId, 'rollback', actorRef(ctx), input.reason, {
      targetVersion: input.targetVersion,
      restoredAsVersion: nextVersion,
    });
    await this.writePlatformAudit(ctx, 'petros.topic_profile.rollback', profileId, input.reason, {
      targetVersion: input.targetVersion,
      restoredAsVersion: nextVersion,
    });
    return this.read(profileId);
  }

  async publishOverride(
    profileId: string,
    input: PetrosUpsertTopicProfileOverrideInput,
    ctx: ActionContext,
  ) {
    const published = await this.repo.findPublishedVersion(profileId);
    if (!published) throw new ConflictException({ code: 'PETROS_PROFILE_NOT_PUBLISHED' });
    const current = await this.repo.listOverrides(profileId, input.institutionId);
    const currentVersion = current[0]?.version ?? 0;
    if (currentVersion !== input.expectedVersion) throw versionConflict();
    applyOverride(petrosTopicProfileSchema.parse(published.profile), input.patch);
    const created = await this.repo.publishOverride({
      profileId,
      institutionId: input.institutionId,
      version: currentVersion + 1,
      patch: input.patch,
      basedOnCanonicalVersion: published.version,
      changeSummary: input.reason,
      createdBy: actorRef(ctx),
      reviewedBy: actorRef(ctx),
    });
    await this.localAudit(profileId, 'override.publish', actorRef(ctx), input.reason, {
      institutionId: input.institutionId,
      overrideVersion: created.version,
    }, input.institutionId);
    await this.writePlatformAudit(ctx, 'petros.topic_profile_override.publish', profileId, input.reason, {
      institutionId: input.institutionId,
      overrideVersion: created.version,
    });
    return this.read(profileId, input.institutionId);
  }

  compareVersions(left: PetrosTopicProfile, right: PetrosTopicProfile) {
    const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
    diffValue(left, right, '', changes);
    return { changed: changes.length > 0, changes };
  }

  private async generateInternal(
    input: PetrosGenerateTopicProfileInput,
    actor: string,
    autoPublish: boolean,
  ) {
    const trusted = generationContext(input);
    let profileRow = await this.repo.findByIdentity(input.topicKey, input.curriculumKey, input.gradeBand);
    if (
      profileRow &&
      !input.regenerate &&
      profileRow.cacheKey === trusted.cacheKey &&
      profileRow.publishedVersionId
    ) {
      await this.repo.touchCacheHit(profileRow.id);
      await this.localAudit(profileRow.id, 'cache.hit', actor, input.reason, { cacheKey: trusted.cacheKey });
      return profileRow;
    }
    if (profileRow && profileRow.cacheKey !== trusted.cacheKey) {
      await this.repo.markStale(
        profileRow.id,
        'Curriculum, syllabus, schema, prompt, or grounding inputs changed.',
        trusted.invalidationInputs,
        actor,
      );
    }
    const learnTopic = await this.repo.findOrCreateLearnTopic(input);
    if (!profileRow) {
      profileRow = await this.repo.createProfile({
        learnTopicId: learnTopic.id,
        topicKey: input.topicKey,
        canonicalTitle: input.canonicalTitle,
        subjectKey: input.subjectKey,
        subjectLabel: input.subjectLabel,
        gradeBand: input.gradeBand,
        curriculumKey: input.curriculumKey,
        curriculumLabel: input.curriculumLabel,
        status: 'draft',
        cacheKey: trusted.cacheKey,
        invalidationInputs: trusted.invalidationInputs,
      });
    }
    const generated = await this.generateProfile(input, trusted);
    const versions = await this.repo.listVersions(profileRow.id);
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    await this.insertVersion(profileRow.id, nextVersion, generated.profile, {
      source: 'generated',
      createdBy: actor,
      changeSummary: input.reason,
      basedOnVersion: versions[0]?.version,
      generatedResult: generated.result,
    });
    await this.localAudit(profileRow.id, input.regenerate ? 'regenerate' : 'generate', actor, input.reason, {
      version: nextVersion,
      source: generated.result ? 'ai' : 'deterministic_seed',
      requestId: generated.result?.requestId ?? null,
    });
    if (autoPublish || profileRow.publishedVersionId == null) {
      const refreshed = await this.requireProfile(profileRow.id);
      await this.repo.publish(profileRow.id, nextVersion, refreshed.version, actor);
    }
    return this.requireProfile(profileRow.id);
  }

  private async generateProfile(
    input: PetrosGenerateTopicProfileInput,
    trusted: ReturnType<typeof generationContext>,
  ): Promise<{ profile: PetrosTopicProfile; result?: PetrosAiExecuteResult }> {
    if (input.authoritativeGrounding.length || input.syllabusReferences.length) {
      try {
        const result = await this.gateway.execute({
          context: {
            requestId: randomUUID(),
            functionKey: PETROS_TOPIC_PROFILE_FUNCTION_KEY,
            subject: input.subjectLabel,
            topic: input.canonicalTitle,
            grade: input.gradeBand,
            inputModality: 'text',
            estimatedTokens: Math.ceil(JSON.stringify(input).length / 4),
            currentCostMicros: 0,
            previousFailures: 0,
          },
          system: PETROS_TOPIC_PROFILE_SYSTEM_PROMPT,
          input: [{ type: 'text', text: JSON.stringify(input) }],
          responseSchema: zodToJsonSchema(petrosTopicProfileSchema, {
            $refStrategy: 'none',
          }) as Record<string, unknown>,
          correlationId: randomUUID(),
          metadata: { stage: 4, workload: 'topic_profile_generation' },
          cacheTtlSeconds: 86_400 * 30,
        });
        const raw = petrosTopicProfileSchema.parse(result.content);
        assertGeneratedReferencesAreGrounded(raw, input.syllabusReferences);
        const grounded = petrosTopicProfileSchema.parse({
          ...raw,
          identity: trusted.identity,
          provenance: {
            source: 'generated',
            confidenceBasisPoints: raw.provenance.confidenceBasisPoints,
            generatorVersion: PETROS_TOPIC_PROFILE_GENERATOR_VERSION,
            promptVersion: PETROS_TOPIC_PROFILE_PROMPT_VERSION,
            sourceReferences: input.syllabusReferences,
            reviewer: null,
            reviewedAt: null,
          },
          cache: { key: trusted.cacheKey, version: 1, invalidationInputs: trusted.invalidationInputs },
        });
        return { profile: grounded, result };
      } catch {
        // The deterministic profile is intentionally provider-neutral and keeps session creation safe.
      }
    }
    return { profile: deterministicTopicProfile(input, trusted) };
  }

  private async insertVersion(
    profileId: string,
    version: number,
    profile: PetrosTopicProfile,
    metadata: {
      source: 'generated' | 'human_edit' | 'rollback';
      createdBy: string;
      changeSummary: string;
      basedOnVersion?: number;
      generatedResult?: PetrosAiExecuteResult;
    },
  ) {
    const parsed = petrosTopicProfileSchema.parse(profile);
    return this.repo.insertVersion(
      {
        profileId,
        version,
        status: 'draft',
        source: metadata.source,
        profile: parsed,
        profileHash: stableHash(parsed),
        provenance: parsed.provenance,
        confidenceBasisPoints: parsed.provenance.confidenceBasisPoints,
        generatorVersion: parsed.provenance.generatorVersion,
        promptVersion: parsed.provenance.promptVersion,
        schemaVersion: parsed.schemaVersion,
        basedOnVersion: metadata.basedOnVersion,
        changeSummary: metadata.changeSummary,
        generatedRequestId: metadata.generatedResult?.requestId,
        routeReference: metadata.generatedResult
          ? {
              providerKey: metadata.generatedResult.providerKey,
              modelKey: metadata.generatedResult.modelKey,
              cached: metadata.generatedResult.cached,
              fallbackTier: metadata.generatedResult.fallbackTier,
            }
          : null,
        createdBy: metadata.createdBy,
      },
      parsed.dimensions.prerequisites.map((item, sequence) => ({
        profileVersionId: '',
        conceptKey: item.conceptKey,
        label: item.label,
        requiredness: item.requiredness,
        sourceReferences: item.sourceReferences,
        sequence,
      })),
      parsed.dimensions.misconceptions.map((item, sequence) => ({
        profileVersionId: '',
        misconceptionKey: item.key,
        summary: item.summary,
        correctionAnchor: item.correctionAnchor,
        sourceReferences: item.sourceReferences,
        sequence,
      })),
    );
  }

  private async toDto(profile: NonNullable<ProfileRow>, institutionId?: string): Promise<PetrosTopicProfileDto> {
    const [versions, overrides, audits] = await Promise.all([
      this.repo.listVersions(profile.id),
      this.repo.listOverrides(profile.id, institutionId),
      this.repo.listAudits(profile.id),
    ]);
    const published = versions.find((version) => version.status === 'published') ?? null;
    const latest = versions[0] ?? null;
    const content = published?.profile ?? latest?.profile;
    const versionDto = (version: (typeof versions)[number]) => ({
      id: version.id,
      version: version.version,
      status: version.status as 'draft' | 'published' | 'superseded' | 'rolled_back',
      source: version.source as 'generated' | 'human_edit' | 'rollback',
      profile: petrosTopicProfileSchema.parse(version.profile),
      profileHash: version.profileHash,
      changeSummary: version.changeSummary,
      generatedRequestId: version.generatedRequestId,
      createdBy: version.createdBy,
      reviewedBy: version.reviewedBy,
      createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
    });
    return {
      id: profile.id,
      learnTopicId: profile.learnTopicId,
      topicKey: profile.topicKey,
      canonicalTitle: profile.canonicalTitle,
      subjectKey: profile.subjectKey,
      subjectLabel: profile.subjectLabel,
      gradeBand: profile.gradeBand,
      curriculumKey: profile.curriculumKey,
      curriculumLabel: profile.curriculumLabel,
      status: profile.status as PetrosTopicProfileDto['status'],
      cacheKey: profile.cacheKey,
      cacheVersion: profile.cacheVersion,
      cacheHitCount: profile.cacheHitCount,
      staleReason: profile.staleReason,
      version: profile.version,
      publishedVersion: published ? versionDto(published) : null,
      latestVersion: latest ? versionDto(latest) : null,
      versions: versions.map(versionDto),
      overrides: overrides.map((override) => ({
        id: override.id,
        institutionId: override.institutionId,
        version: override.version,
        status: override.status as 'draft' | 'published' | 'archived',
        patch: override.patch,
        basedOnCanonicalVersion: override.basedOnCanonicalVersion,
        createdAt: override.createdAt.toISOString(),
        publishedAt: override.publishedAt?.toISOString() ?? null,
      })),
      prerequisites: content ? petrosTopicProfileSchema.parse(content).dimensions.prerequisites : [],
      misconceptions: content ? petrosTopicProfileSchema.parse(content).dimensions.misconceptions : [],
      auditHistory: audits.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorRef: entry.actorRef,
        reason: entry.reason,
        metadata: entry.metadata,
        createdAt: entry.createdAt.toISOString(),
      })),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private async requireProfile(profileId: string) {
    const profile = await this.repo.findProfile(profileId);
    if (!profile) throw new NotFoundException({ code: 'PETROS_TOPIC_PROFILE_NOT_FOUND' });
    return profile;
  }

  private localAudit(
    profileId: string,
    action: string,
    actor: string,
    reason: string,
    metadata: Record<string, unknown>,
    institutionId?: string,
  ) {
    return this.repo.recordAudit({
      profileId,
      institutionId,
      action,
      actorRef: actor,
      reason,
      metadata,
    });
  }

  private writePlatformAudit(
    ctx: ActionContext,
    action: string,
    entityId: string,
    reason: string,
    newState: Record<string, unknown>,
  ) {
    return this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: 'petros',
      entityType: 'petros_topic_profile',
      entityId,
      reason,
      newState,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }
}

function generationContext(input: PetrosGenerateTopicProfileInput) {
  const groundingHash = stableHash({
    references: input.syllabusReferences,
    grounding: input.authoritativeGrounding,
  });
  const invalidationInputs = {
    curriculumVersion: input.curriculumVersion,
    syllabusVersion: input.syllabusVersion,
    schemaVersion: PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
    promptVersion: PETROS_TOPIC_PROFILE_PROMPT_VERSION,
    groundingHash,
  };
  const identity = {
    topicKey: input.topicKey,
    canonicalTitle: input.canonicalTitle,
    subjectKey: input.subjectKey,
    subjectLabel: input.subjectLabel,
    gradeBand: input.gradeBand,
    curriculumKey: input.curriculumKey,
    curriculumLabel: input.curriculumLabel,
    syllabusReferences: input.syllabusReferences,
  };
  return {
    identity,
    invalidationInputs,
    cacheKey: stableHash({
      identity: {
        topicKey: input.topicKey.trim().toLowerCase(),
        subjectKey: input.subjectKey.trim().toLowerCase(),
        gradeBand: input.gradeBand.trim().toLowerCase(),
        curriculumKey: input.curriculumKey.trim().toLowerCase(),
      },
      invalidationInputs,
    }),
  };
}

function deterministicTopicProfile(
  input: PetrosGenerateTopicProfileInput,
  trusted: ReturnType<typeof generationContext>,
): PetrosTopicProfile {
  const key = `${input.topicKey} ${input.canonicalTitle}`.toLowerCase();
  const integration = /integration.by.parts|integration by parts/.test(key);
  const photosynthesis = /photosynth/.test(key);
  const historical = /history|revolution|empire|war|independence|renaissance/.test(key);
  const programming = /program|coding|loop|iteration/.test(key);
  const source = input.syllabusReferences[0] ?? {
    label: 'Edrion verified Stage 4 teaching fixture',
    reference: null,
    licence: 'internal',
  };
  const weights = baseMoveWeights();
  let knowledgeTypes: PetrosTopicProfile['dimensions']['knowledgeTypes'];
  let representations: PetrosTopicProfile['dimensions']['representations'];
  let abstractionLevel = 2;
  let prerequisiteDensity = 2;
  let misconceptionRichness = 1;
  let mathematicalLoad = 0;
  let memorisationLoad = 1;
  let prerequisites: PetrosTopicProfile['dimensions']['prerequisites'] = [];
  let misconceptions: PetrosTopicProfile['dimensions']['misconceptions'] = [];
  let openingPattern: PetrosMoveType[] = ['goal_frame', 'predict_then_reveal'];
  let practicePattern: PetrosMoveType[] = ['layered_explanation', 'recall_check'];
  let closingPattern: PetrosMoveType[] = ['synthesis', 'forward_link'];

  if (integration) {
    knowledgeTypes = [{ type: 'procedural', weightBasisPoints: 10_000 }];
    representations = [
      { type: 'symbolic', weightBasisPoints: 7_000 },
      { type: 'sequential', weightBasisPoints: 3_000 },
    ];
    abstractionLevel = 4;
    prerequisiteDensity = 4;
    mathematicalLoad = 4;
    memorisationLoad = 1;
    prerequisites = [
      { conceptKey: 'product-rule', label: 'Product rule', requiredness: 'mandatory', sourceReferences: [source] },
      { conceptKey: 'u-substitution', label: 'Substitution', requiredness: 'strong', sourceReferences: [source] },
    ];
    boost(weights, { prerequisite_check: 9000, worked_example: 10000, contrast_case: 9000, predict_then_reveal: 8500, derivation: 6000, recall_check: 7000, diagram: 1000, story: 0 });
    openingPattern = ['prerequisite_check', 'goal_frame'];
    practicePattern = ['worked_example', 'predict_then_reveal', 'contrast_case', 'recall_check'];
    closingPattern = ['artifact_commit', 'forward_link'];
  } else if (photosynthesis) {
    knowledgeTypes = [
      { type: 'conceptual', weightBasisPoints: 6_000 },
      { type: 'factual_memorisation', weightBasisPoints: 4_000 },
    ];
    representations = [
      { type: 'visual', weightBasisPoints: 6_000 },
      { type: 'sequential', weightBasisPoints: 2_500 },
      { type: 'verbal', weightBasisPoints: 1_500 },
    ];
    abstractionLevel = 2;
    prerequisiteDensity = 2;
    misconceptionRichness = 4;
    memorisationLoad = 3;
    prerequisites = [{ conceptKey: 'cell-organelles', label: 'Cell organelles', requiredness: 'helpful', sourceReferences: [source] }];
    misconceptions = [{ key: 'plants-get-food-from-soil', summary: 'Plants obtain their food directly from soil.', correctionAnchor: 'Matter in glucose is assembled mainly from carbon dioxide and water using light energy.', sourceReferences: [source] }];
    boost(weights, { hook: 8000, misconception_demolition: 10000, diagram: 10000, layered_explanation: 7500, recall_check: 7500, derivation: 0, story: 1500 });
    openingPattern = ['hook', 'misconception_demolition'];
    practicePattern = ['diagram', 'layered_explanation', 'recall_check'];
    closingPattern = ['synthesis', 'artifact_commit'];
  } else if (historical) {
    knowledgeTypes = [
      { type: 'conceptual', weightBasisPoints: 4_000 },
      { type: 'factual_memorisation', weightBasisPoints: 6_000 },
    ];
    representations = [
      { type: 'verbal', weightBasisPoints: 5_000 },
      { type: 'sequential', weightBasisPoints: 3_500 },
      { type: 'comparative', weightBasisPoints: 1_500 },
    ];
    abstractionLevel = 2;
    misconceptionRichness = 2;
    memorisationLoad = 4;
    boost(weights, {
      hook: 7_000,
      story: 10_000,
      diagram: 6_500,
      contrast_case: 6_000,
      recall_check: 3_000,
      derivation: 0,
      worked_example: 500,
    });
    openingPattern = ['hook', 'goal_frame'];
    practicePattern = ['story', 'diagram', 'contrast_case', 'recall_check'];
    closingPattern = ['synthesis', 'forward_link'];
  } else if (programming) {
    knowledgeTypes = [
      { type: 'skill_performance', weightBasisPoints: 7_000 },
      { type: 'procedural', weightBasisPoints: 3_000 },
    ];
    representations = [
      { type: 'sequential', weightBasisPoints: 5_500 },
      { type: 'symbolic', weightBasisPoints: 3_000 },
      { type: 'visual', weightBasisPoints: 1_500 },
    ];
    prerequisiteDensity = 3;
    prerequisites = [{ conceptKey: 'state-and-conditions', label: 'State and boolean conditions', requiredness: 'strong', sourceReferences: [source] }];
    boost(weights, { prerequisite_check: 7500, predict_then_reveal: 10000, worked_example: 8500, contrast_case: 8000, apply_to_your_world: 8000, recall_check: 3500, story: 0, derivation: 0 });
    openingPattern = ['prerequisite_check', 'predict_then_reveal'];
    practicePattern = ['worked_example', 'contrast_case', 'apply_to_your_world'];
    closingPattern = ['artifact_commit', 'forward_link'];
  } else {
    knowledgeTypes = [{ type: 'conceptual', weightBasisPoints: 10_000 }];
    representations = [
      { type: 'verbal', weightBasisPoints: 6_000 },
      { type: 'comparative', weightBasisPoints: 4_000 },
    ];
  }
  const recommended = [...new Set([...openingPattern, ...practicePattern, ...closingPattern])];
  const disallowed = PETROS_MOVE_TYPES.filter((move) => weights[move] === 0);
  return petrosTopicProfileSchema.parse({
    schemaVersion: PETROS_TOPIC_PROFILE_SCHEMA_VERSION,
    identity: trusted.identity,
    dimensions: {
      knowledgeTypes,
      abstractionLevel,
      representations,
      prerequisiteDensity,
      prerequisites,
      misconceptionRichness,
      misconceptions,
      mathematicalLoad,
      memorisationLoad,
      realWorldAnchors: {
        availability: historical || photosynthesis || programming ? 4 : 2,
        quality: historical || photosynthesis || programming ? 4 : 2,
        examples: [`A grounded ${input.canonicalTitle} application selected from approved material.`],
      },
      moves: {
        required: prerequisiteDensity >= 3 ? ['prerequisite_check'] : [],
        recommended,
        disallowed,
        weights,
        openingPattern,
        practicePattern,
        closingPattern,
      },
    },
    provenance: {
      source: 'deterministic_seed',
      confidenceBasisPoints: input.syllabusReferences.length ? 7_500 : 5_500,
      generatorVersion: PETROS_TOPIC_PROFILE_GENERATOR_VERSION,
      promptVersion: PETROS_TOPIC_PROFILE_PROMPT_VERSION,
      sourceReferences: input.syllabusReferences,
      reviewer: null,
      reviewedAt: null,
    },
    cache: { key: trusted.cacheKey, version: 1, invalidationInputs: trusted.invalidationInputs },
  });
}

function baseMoveWeights(): Record<PetrosMoveType, number> {
  return Object.fromEntries(PETROS_MOVE_TYPES.map((move) => [move, 3_000])) as Record<
    PetrosMoveType,
    number
  >;
}

function boost(weights: Record<PetrosMoveType, number>, changes: Partial<Record<PetrosMoveType, number>>) {
  Object.assign(weights, changes);
}

function profileInputFromSession(
  topic: string,
  context: Record<string, unknown>,
): PetrosGenerateTopicProfileInput {
  const topicKey = stringValue(context.topicKey) ?? slug(topic);
  const subjectLabel = stringValue(context.subjectLabel) ?? inferSubject(topic);
  return {
    topicKey,
    canonicalTitle: topic,
    subjectKey: stringValue(context.subjectKey) ?? slug(subjectLabel),
    subjectLabel,
    gradeBand: stringValue(context.gradeBand) ?? 'unspecified',
    curriculumKey: stringValue(context.curriculumKey) ?? 'generic',
    curriculumLabel: stringValue(context.curriculumLabel) ?? 'General curriculum',
    curriculumVersion: stringValue(context.curriculumVersion) ?? 'unspecified',
    syllabusVersion: stringValue(context.syllabusVersion) ?? 'unspecified',
    syllabusReferences: sourceReferencesValue(context.syllabusReferences),
    authoritativeGrounding: stringListValue(context.authoritativeGrounding),
    reason: 'Create the cached canonical profile required to start this topic.',
    regenerate: false,
  };
}

function applyOverride(
  canonical: PetrosTopicProfile,
  patch: { dimensions: Partial<PetrosTopicProfile['dimensions']> },
) {
  return petrosTopicProfileSchema.parse({
    ...canonical,
    dimensions: petrosTopicProfileDimensionsSchema.parse({
      ...canonical.dimensions,
      ...patch.dimensions,
    }),
  });
}

function assertGeneratedReferencesAreGrounded(
  generated: PetrosTopicProfile,
  trustedReferences: PetrosGenerateTopicProfileInput['syllabusReferences'],
) {
  const allowed = new Set(trustedReferences.map((reference) => stableJson(reference)));
  const generatedReferences = [
    ...generated.dimensions.prerequisites.flatMap((item) => item.sourceReferences),
    ...generated.dimensions.misconceptions.flatMap((item) => item.sourceReferences),
  ];
  if (generatedReferences.some((reference) => !allowed.has(stableJson(reference)))) {
    throw new Error('Generated profile contained a source reference outside supplied grounding.');
  }
}

function assertIdentity(profile: NonNullable<ProfileRow>, candidate: PetrosTopicProfile) {
  if (
    candidate.identity.topicKey !== profile.topicKey ||
    candidate.identity.curriculumKey !== profile.curriculumKey ||
    candidate.identity.gradeBand !== profile.gradeBand
  )
    throw new ConflictException({
      code: 'PETROS_PROFILE_IDENTITY_IMMUTABLE',
      message: 'Create a separate canonical profile to change topic, curriculum, or grade identity.',
    });
}

function actorRef(ctx: ActionContext) {
  return ctx.principalContext.principal.employeeId;
}

function stableHash(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => item.trim().slice(0, 2_000))
        .slice(0, 20)
    : [];
}

function sourceReferencesValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!isRecord(item) || typeof item.label !== 'string' || !item.label.trim()) return [];
    return [
      {
        label: item.label.trim().slice(0, 200),
        reference:
          typeof item.reference === 'string' && item.reference.trim()
            ? item.reference.trim().slice(0, 600)
            : null,
        licence:
          typeof item.licence === 'string' && item.licence.trim()
            ? item.licence.trim().slice(0, 120)
            : null,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160) || 'topic';
}

function inferSubject(topic: string) {
  if (/integrat|derivat|algebra|equation/i.test(topic)) return 'Mathematics';
  if (/photosynth|cell|biology/i.test(topic)) return 'Biology';
  if (/program|loop|coding/i.test(topic)) return 'Computer Science';
  if (/history|revolution|empire|war|independence/i.test(topic)) return 'History';
  return 'General';
}

function versionConflict() {
  return new ConflictException({
    code: 'PETROS_PROFILE_VERSION_CONFLICT',
    message: 'This topic profile changed since it was loaded. Reload and try again.',
  });
}

function diffValue(
  before: unknown,
  after: unknown,
  path: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>,
) {
  if (stableJson(before) === stableJson(after)) return;
  if (
    before &&
    after &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const keys = new Set([
      ...Object.keys(before as Record<string, unknown>),
      ...Object.keys(after as Record<string, unknown>),
    ]);
    for (const key of keys)
      diffValue(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        changes,
      );
    return;
  }
  changes.push({ path, before, after });
}
