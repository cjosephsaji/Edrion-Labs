import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_TOPIC_PROFILE_V1,
  topicProfileV1Schema,
  type TopicProfileV1,
} from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { LEARN_PROFILE_TTL_DAYS } from './constants';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import { PROMPT_VERSION } from '../learn-ai/prompts/version';
@Injectable()
export class TopicProfileService {
  constructor(
    private readonly repo: EdrionLearnRepository,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
  ) {}
  async resolve(
    principal: StudentPrincipal,
    opts: { learnTopicId?: string; topicKey: string; title: string },
  ): Promise<{ profile: TopicProfileV1; profileId: string | null; fromCache: boolean }> {
    const cached = await this.repo.findTopicProfile(principal, {
      learnTopicId: opts.learnTopicId,
      topicKey: opts.topicKey,
    });
    if (cached) {
      const profile = topicProfileV1Schema.parse(cached.profile);
      if (cached.source === 'human_override') {
        return { profile, profileId: cached.id, fromCache: true };
      }
      const expired = cached.expiresAt && cached.expiresAt.getTime() < Date.now();
      if (!expired) return { profile, profileId: cached.id, fromCache: true };
    }
    const generated = await this.generateProfile(principal, opts.title, opts.topicKey);
    const owner =
      principal.kind === 'institutional'
        ? { institutionId: principal.institutionId, independentUserId: null }
        : { institutionId: null, independentUserId: principal.independentUserId };
    const row = await this.repo.insertTopicProfile({
      ...owner,
      learnTopicId: opts.learnTopicId ?? null,
      topicKey: opts.topicKey,
      title: opts.title,
      profile: generated,
      source: 'generated',
      model: this.ai.available ? 'learn_profile' : 'default',
      promptVersion: PROMPT_VERSION,
      expiresAt: this.buildExpiryDate(),
    });
    return { profile: generated, profileId: row.id, fromCache: false };
  }
  private async generateProfile(
    principal: StudentPrincipal,
    title: string,
    topicKey: string,
  ): Promise<TopicProfileV1> {
    if (!this.ai.available) return DEFAULT_TOPIC_PROFILE_V1;
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_profile',
        tier: 'small',
        system: 'Generate a TopicProfileV1 JSON for teaching this topic.',
        user: JSON.stringify({ title, topicKey }),
        schema: topicProfileV1Schema,
        schemaName: 'TopicProfileV1',
        maxOutputTokens: 600,
      });
      await this.logSafe(principal, 'learn_profile', usage, { promptVersion: PROMPT_VERSION });
      return result;
    } catch {
      return DEFAULT_TOPIC_PROFILE_V1;
    }
  }
  /** Telemetry must never escape the handler it is reporting from. */
  private async logSafe(...args: Parameters<LearnAiCallLogger['log']>): Promise<void> {
    try {
      await this.callLog.log(...args);
    } catch {
      /* non-fatal */
    }
  }
  buildExpiryDate(): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + LEARN_PROFILE_TTL_DAYS);
    return d;
  }
}
