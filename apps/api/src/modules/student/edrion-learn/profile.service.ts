import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  DEFAULT_TOPIC_PROFILE_V1,
  topicProfileV1Schema,
  type TopicProfileV1,
} from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import { LearnConfigService } from './learn-config.service';
import { JobsService } from '../../../common/queue/jobs.service';
import { configTierToAiTier, PROFILE_INLINE_TIMEOUT_MS } from './learn-ai-tier';
import {
  PROFILE_PROMPT_VERSION,
  budgetAtomSummaries,
  buildProfileSystemPrompt,
  buildProfileUserPrompt,
} from './prompts/profile.prompt';
import { LEARN_PROFILE_TOPIC_JOB, type ProfileTopicJobData } from './learn-profile.job-types';

const ATOM_SEED_PROMPT_VERSION = 'atom-seed.v1';
const atomSeedSchema = z.object({
  atoms: z
    .array(
      z.object({
        title: z.string().min(2).max(120),
        summary: z.string().min(10).max(500),
      }),
    )
    .min(3)
    .max(8),
});

export type ProfileResolveOpts = {
  learnTopicId?: string | null;
  topicKey: string;
  title: string;
  syllabusContext?: string | null;
  materialOutline?: string | null;
  materialFirstChunk?: string | null;
  background?: boolean;
};

@Injectable()
export class TopicProfileService {
  private readonly logger = new Logger(TopicProfileService.name);

  constructor(
    private readonly repo: EdrionLearnRepository,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
    private readonly config: LearnConfigService,
    private readonly jobs: JobsService,
  ) {}

  async resolve(
    principal: StudentPrincipal,
    opts: ProfileResolveOpts,
  ): Promise<{ profile: TopicProfileV1; profileId: string | null; fromCache: boolean }> {
    const cfg = await this.config.getAll(this.configCtx(principal));
    const cached = await this.repo.findTopicProfile(principal, {
      learnTopicId: opts.learnTopicId,
      topicKey: opts.topicKey,
    });

    if (cached) {
      const profile = topicProfileV1Schema.parse(cached.profile);
      if (cached.source === 'human_override') {
        return { profile, profileId: cached.id, fromCache: true };
      }

      const stale = await this.isStale(cached, opts.learnTopicId, cfg.profile_ttl_days);
      if (!stale) {
        return { profile, profileId: cached.id, fromCache: true };
      }

      await this.enqueueRegen(principal, opts);
      return { profile, profileId: cached.id, fromCache: true };
    }

    const generated = await this.generateProfile(principal, opts, cfg.profiler_model_tier, true);
    const row = await this.persistGenerated(principal, opts, generated.profile, generated.model);
    await this.ensureConceptAtoms(principal, opts, generated.profile, generated.model);
    if (generated.degraded) {
      await this.enqueueRegen(principal, opts);
    }
    return { profile: generated.profile, profileId: row.id, fromCache: false };
  }

  async regenerate(principal: StudentPrincipal, opts: ProfileResolveOpts): Promise<TopicProfileV1> {
    const cfg = await this.config.getAll(this.configCtx(principal));
    const generated = await this.generateProfile(principal, opts, cfg.profiler_model_tier, false);
    await this.persistGenerated(principal, opts, generated.profile, generated.model);
    await this.ensureConceptAtoms(principal, opts, generated.profile, generated.model);
    return generated.profile;
  }

  /**
   * Eval harness (§1.2): seed a frozen human_override profile so runs never call the profiler LLM.
   * Gated at the controller by LEARN_EVAL_SECRET.
   */
  async upsertFrozenEvalProfile(
    principal: StudentPrincipal,
    opts: { topicKey: string; title: string; profile: TopicProfileV1 },
  ) {
    const owner =
      principal.kind === 'institutional'
        ? { institutionId: principal.institutionId, independentUserId: null }
        : { institutionId: null, independentUserId: principal.independentUserId };
    const profile = topicProfileV1Schema.parse(opts.profile);
    return this.repo.insertTopicProfile({
      ...owner,
      learnTopicId: null,
      topicKey: opts.topicKey,
      title: opts.title,
      profile,
      source: 'human_override',
      model: 'eval-fixture',
      promptVersion: 'eval-frozen',
      expiresAt: null,
      overriddenBy: null,
    });
  }

  async patchOverride(
    principal: StudentPrincipal,
    profileId: string,
    patch: { profile?: Record<string, unknown>; title?: string },
    overriddenBy: string | null,
  ) {
    const existing = await this.repo.getTopicProfileById(principal, profileId);
    if (!existing) return null;
    const merged = topicProfileV1Schema.parse({
      ...(existing.profile as object),
      ...(patch.profile ?? {}),
    });
    const updated = await this.repo.updateTopicProfile(profileId, {
      profile: merged,
      title: patch.title ?? existing.title,
      source: 'human_override',
      expiresAt: null,
      overriddenBy,
    });
    const owner =
      principal.kind === 'institutional'
        ? {
            studentId: principal.studentId,
            independentUserId: null,
            institutionId: principal.institutionId,
          }
        : {
            studentId: null,
            independentUserId: principal.independentUserId,
            institutionId: null,
          };
    await this.repo.insertModelEvent({
      ...owner,
      sessionId: null,
      eventType: 'profile_overridden',
      idempotencyKey: `profile_overridden:${profileId}:${Date.now()}`,
      payload: { profile_id: profileId, overridden_by: overriddenBy },
    });
    return updated;
  }

  private async enqueueRegen(principal: StudentPrincipal, opts: ProfileResolveOpts): Promise<void> {
    const data: ProfileTopicJobData = {
      principal,
      learnTopicId: opts.learnTopicId ?? null,
      topicKey: opts.topicKey,
      title: opts.title,
      syllabusContext: opts.syllabusContext ?? null,
      materialOutline: opts.materialOutline ?? null,
      materialFirstChunk: opts.materialFirstChunk ?? null,
    };
    const id = await this.jobs.enqueue(
      'ai',
      LEARN_PROFILE_TOPIC_JOB,
      data as unknown as Record<string, unknown>,
      {
        jobId: `profile-topic:${opts.topicKey}:${opts.learnTopicId ?? 'adhoc'}`,
        removeOnComplete: { count: 200 },
      },
    );
    if (!id && !this.jobs.enabled) {
      void this.regenerate(principal, opts).catch((err) =>
        this.logger.warn(`inline profile regen failed: ${(err as Error).message}`),
      );
    }
  }

  private async isStale(
    cached: {
      expiresAt: Date | null;
      promptVersion: string | null;
      updatedAt: Date;
    },
    learnTopicId: string | null | undefined,
    ttlDays: number,
  ): Promise<boolean> {
    if (cached.expiresAt && cached.expiresAt.getTime() < Date.now()) return true;
    if (!cached.expiresAt) {
      const ageMs = Date.now() - cached.updatedAt.getTime();
      if (ageMs > ttlDays * 24 * 60 * 60 * 1000) return true;
    }
    if (cached.promptVersion !== PROFILE_PROMPT_VERSION) return true;
    if (learnTopicId) {
      const atoms = await this.repo.listConceptAtoms(learnTopicId);
      const newest = atoms.reduce<Date | null>((acc, a) => {
        if (!acc || a.updatedAt > acc) return a.updatedAt;
        return acc;
      }, null);
      if (newest && newest.getTime() > cached.updatedAt.getTime()) return true;
    }
    return false;
  }

  private async generateProfile(
    principal: StudentPrincipal,
    opts: ProfileResolveOpts,
    tier: 'small' | 'mid',
    withTimeout: boolean,
  ): Promise<{ profile: TopicProfileV1; model: string; degraded: boolean }> {
    if (!this.ai.available) {
      return { profile: DEFAULT_TOPIC_PROFILE_V1, model: 'default', degraded: true };
    }

    const atoms = opts.learnTopicId
      ? budgetAtomSummaries(
          (await this.repo.listConceptAtoms(opts.learnTopicId)).map((a) => ({
            id: a.id,
            title: a.variantKey || a.atomKind,
            content: typeof a.content === 'string' ? a.content : JSON.stringify(a.content ?? ''),
          })),
        )
      : [];

    const system = buildProfileSystemPrompt();
    const user = buildProfileUserPrompt({
      title: opts.title,
      topicKey: opts.topicKey,
      atoms,
      syllabusContext: opts.syllabusContext,
      materialOutline: opts.materialOutline,
      materialFirstChunk: opts.materialFirstChunk,
    });

    const run = async () => {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_profile',
        tier: configTierToAiTier(tier),
        system,
        user,
        schema: topicProfileV1Schema,
        schemaName: 'TopicProfileV1',
        maxOutputTokens: 600,
      });
      await this.callLog.log(principal, 'learn_profile', usage, {
        promptVersion: PROFILE_PROMPT_VERSION,
      });
      const known = new Set(atoms.map((a) => a.id));
      const sanitized: TopicProfileV1 = {
        ...result,
        prerequisites: result.prerequisites.map((p) => ({
          ...p,
          atom_id: p.atom_id && known.has(p.atom_id) ? p.atom_id : null,
        })),
      };
      await this.repo.insertModelEvent({
        ...(principal.kind === 'institutional'
          ? {
              studentId: principal.studentId,
              independentUserId: null,
              institutionId: principal.institutionId,
            }
          : {
              studentId: null,
              independentUserId: principal.independentUserId,
              institutionId: null,
            }),
        sessionId: null,
        eventType: 'profile_generated',
        idempotencyKey: `profile_generated:${opts.topicKey}:${usage.model}:${Date.now()}`,
        payload: { topic_key: opts.topicKey, model: usage.model },
      });
      return { profile: sanitized, model: usage.model, degraded: false as const };
    };

    try {
      if (!withTimeout) return await run();
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('profile_timeout')), PROFILE_INLINE_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`profile_generation_failed topic=${opts.topicKey}: ${reason}`);
      await this.callLog.log(
        principal,
        'learn_profile',
        { inputTokens: 0, outputTokens: 0, model: 'fallback', durationMs: 0 },
        {
          promptVersion: PROFILE_PROMPT_VERSION,
          error: 'profile_generation_failed',
          degraded: true,
        },
      );
      return { profile: DEFAULT_TOPIC_PROFILE_V1, model: 'default', degraded: true };
    }
  }

  private async persistGenerated(
    principal: StudentPrincipal,
    opts: ProfileResolveOpts,
    profile: TopicProfileV1,
    model: string,
  ) {
    const cfg = await this.config.getAll(this.configCtx(principal));
    const owner =
      principal.kind === 'institutional'
        ? { institutionId: principal.institutionId, independentUserId: null }
        : { institutionId: null, independentUserId: principal.independentUserId };
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + cfg.profile_ttl_days);
    return this.repo.insertTopicProfile({
      ...owner,
      learnTopicId: opts.learnTopicId ?? null,
      topicKey: opts.topicKey,
      title: opts.title,
      profile,
      source: 'generated',
      model,
      promptVersion: PROFILE_PROMPT_VERSION,
      expiresAt,
    });
  }

  private configCtx(principal: StudentPrincipal) {
    return principal.kind === 'institutional'
      ? { institutionId: principal.institutionId }
      : { independentUserId: principal.independentUserId };
  }

  private slugVariant(title: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return base || 'concept';
  }

  /** P1.3 — seed concept_atoms when a topic has none so retrieval checks can grade. */
  private async ensureConceptAtoms(
    principal: StudentPrincipal,
    opts: ProfileResolveOpts,
    profile: TopicProfileV1,
    model: string,
  ): Promise<void> {
    if (!opts.learnTopicId) return;
    const existing = await this.repo.listConceptAtoms(opts.learnTopicId);
    if (existing.length > 0) return;

    const labels = [
      opts.title,
      ...profile.prerequisites.map((p) => p.label).filter(Boolean),
      ...profile.known_misconceptions.slice(0, 3),
    ].filter((v, i, a) => a.indexOf(v) === i);

    if (!this.ai.available) {
      await this.repo.seedLearnConceptAtoms(
        opts.learnTopicId,
        labels.slice(0, 6).map((title, i) => ({
          variantKey: `${this.slugVariant(title)}-${i}`,
          title,
          summary: `Core idea for ${opts.title}: ${title}.`,
        })),
        model,
        ATOM_SEED_PROMPT_VERSION,
      );
      return;
    }

    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_profile',
        tier: configTierToAiTier('small'),
        system:
          'Derive teachable concept atoms for a topic. Output JSON {atoms:[{title, summary}]}. 3–8 atoms; summaries ≤2 sentences.',
        user: JSON.stringify({
          title: opts.title,
          topic_key: opts.topicKey,
          prerequisites: profile.prerequisites,
          hooks: profile.real_world_anchors,
        }),
        schema: atomSeedSchema,
        schemaName: 'LearnAtomSeed',
        maxOutputTokens: 700,
      });
      await this.callLog.log(principal, 'learn_profile', usage, {
        promptVersion: ATOM_SEED_PROMPT_VERSION,
      });
      await this.repo.seedLearnConceptAtoms(
        opts.learnTopicId,
        result.atoms.map((a, i) => ({
          variantKey: `${this.slugVariant(a.title)}-${i}`,
          title: a.title,
          summary: a.summary,
        })),
        usage.model,
        ATOM_SEED_PROMPT_VERSION,
      );
    } catch (err) {
      this.logger.warn(
        `atom_seed_failed topic=${opts.topicKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
      await this.repo.seedLearnConceptAtoms(
        opts.learnTopicId,
        labels.slice(0, 5).map((title, i) => ({
          variantKey: `${this.slugVariant(title)}-${i}`,
          title,
          summary: `Key idea: ${title}.`,
        })),
        model,
        ATOM_SEED_PROMPT_VERSION,
      );
    }
  }
}
