import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  visualGraphPatchSchema,
  visualQuizQuestionPrivateSchema,
  visualSseEventSchema,
  type VisualGraphPatch,
  type VisualSseEvent,
} from '@edrion/schemas';
import { RedisService } from '../../../common/redis/redis.service';
import { studentSubjectKey } from '../../copilot/ai-usage-limiter.service';
import type { StudentPrincipal } from '../student.types';
import { VisualEventMemory } from './visual-event-memory';

const JOB_TTL_SECONDS = 15 * 60;
const PROPOSAL_TTL_SECONDS = 15 * 60;
const CLIENT_JOB_TTL_SECONDS = 24 * 60 * 60;

export const storedVisualProposalSchema = z
  .object({
    proposal_id: z.string().uuid(),
    owner_key: z.string(),
    mode: z.enum(['prompt', 'source', 'topic', 'session']),
    title: z.string(),
    archetype: z.enum(['mind_map', 'flowchart', 'cycle', 'timeline', 'hierarchy', 'comparison']),
    estimated_nodes: z.object({ min: z.number().int(), max: z.number().int() }).strict(),
    rationale: z.string(),
    source_label: z.string().optional(),
    expires_at: z.string().datetime(),
    prompt: z.string().optional(),
    source_id: z.string().uuid().optional(),
    topic_id: z.string().uuid().optional(),
    session_id: z.string().uuid().optional(),
    preferred_archetype: z
      .enum(['mind_map', 'flowchart', 'cycle', 'timeline', 'hierarchy', 'comparison'])
      .optional(),
    client_request_id: z.string().uuid(),
    subject_label: z.string().optional(),
    curriculum_key: z.string().optional(),
    grounding_excerpt: z.string().optional(),
    origin: z.enum(['prompt', 'library_source', 'learn_topic', 'learn_session']),
  })
  .strict();

export type StoredVisualProposal = z.infer<typeof storedVisualProposalSchema>;

export const storedVisualQuizSchema = z
  .object({
    quiz_id: z.string().uuid(),
    owner_key: z.string(),
    canvas_id: z.string().uuid(),
    node_id: z.string(),
    questions: z.array(visualQuizQuestionPrivateSchema).min(2).max(3),
    submitted: z.boolean().default(false),
    expires_at: z.string().datetime(),
  })
  .strict();

export type StoredVisualQuiz = z.infer<typeof storedVisualQuizSchema>;

@Injectable()
export class VisualJobEventStore {
  private readonly memory = new VisualEventMemory();

  constructor(private readonly redis: RedisService) {}

  private useMemory(): boolean {
    return !this.redis.enabled;
  }

  private async kvGet(key: string): Promise<string | null> {
    if (this.useMemory()) return this.memory.get(key);
    return this.redis.get(key);
  }

  private async kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.useMemory()) {
      this.memory.set(key, value, ttlSeconds);
      return;
    }
    await this.redis.set(key, value, ttlSeconds);
  }

  private async kvDel(key: string): Promise<void> {
    if (this.useMemory()) {
      this.memory.del(key);
      return;
    }
    await this.redis.del(key);
  }

  private async kvIncr(key: string, ttlSeconds: number): Promise<number> {
    if (this.useMemory()) return this.memory.incr(key, ttlSeconds);
    return (await this.redis.incr(key)) ?? 1;
  }

  private async kvGetInt(key: string): Promise<number | null> {
    if (this.useMemory()) return this.memory.getInt(key);
    return this.redis.getInt(key);
  }

  private async listAppend(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.useMemory()) {
      this.memory.listAppend(key, value, ttlSeconds);
      return;
    }
    await this.redis.jsonListAppend(key, value, ttlSeconds);
  }

  private async listRange(key: string): Promise<unknown[]> {
    if (this.useMemory()) return this.memory.listRange(key, 0, -1);
    return (await this.redis.jsonListRange(key, 0, -1)) ?? [];
  }

  private async touchTtl(key: string, ttlSeconds: number): Promise<void> {
    if (this.useMemory()) {
      this.memory.expire(key, ttlSeconds);
      return;
    }
    await this.redis.expire(key, ttlSeconds);
  }

  private jobOwnerKey(jobId: string) {
    return `visual:job:${jobId}:owner`;
  }

  private jobSeqKey(jobId: string) {
    return `visual:job:${jobId}:seq`;
  }

  private jobEventsKey(jobId: string) {
    return `visual:job:${jobId}:events`;
  }

  private proposalKey(proposalId: string) {
    return `visual:proposal:${proposalId}`;
  }

  private clientJobKey(clientRequestId: string) {
    return `visual:client-job:${clientRequestId}`;
  }

  private patchKey(proposalId: string) {
    return `visual:patch:${proposalId}`;
  }

  private quizKey(quizId: string) {
    return `visual:quiz:${quizId}`;
  }

  async setJobOwner(jobId: string, principal: StudentPrincipal): Promise<void> {
    await this.kvSet(this.jobOwnerKey(jobId), studentSubjectKey(principal), JOB_TTL_SECONDS);
  }

  async verifyJobOwner(jobId: string, principal: StudentPrincipal): Promise<boolean> {
    const owner = await this.kvGet(this.jobOwnerKey(jobId));
    if (!owner) return false;
    return owner === studentSubjectKey(principal);
  }

  async mapClientRequest(clientRequestId: string, jobId: string): Promise<void> {
    await this.kvSet(this.clientJobKey(clientRequestId), jobId, CLIENT_JOB_TTL_SECONDS);
  }

  async getJobForClientRequest(clientRequestId: string): Promise<string | null> {
    return this.kvGet(this.clientJobKey(clientRequestId));
  }

  async saveProposal(proposal: StoredVisualProposal): Promise<void> {
    await this.kvSet(this.proposalKey(proposal.proposal_id), JSON.stringify(proposal), PROPOSAL_TTL_SECONDS);
  }

  async getProposal(proposalId: string): Promise<StoredVisualProposal | null> {
    const raw = await this.kvGet(this.proposalKey(proposalId));
    if (!raw) return null;
    const parsed = storedVisualProposalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async deleteProposal(proposalId: string): Promise<void> {
    await this.kvDel(this.proposalKey(proposalId));
  }

  async savePatchProposal(patch: VisualGraphPatch, ownerKey: string): Promise<void> {
    await this.kvSet(
      this.patchKey(patch.proposal_id),
      JSON.stringify({ ...patch, owner_key: ownerKey }),
      PROPOSAL_TTL_SECONDS,
    );
  }

  async getPatchProposal(
    proposalId: string,
  ): Promise<(VisualGraphPatch & { owner_key: string }) | null> {
    const raw = await this.kvGet(this.patchKey(proposalId));
    if (!raw) return null;
    const parsed = visualGraphPatchSchema
      .extend({ owner_key: z.string() })
      .safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async deletePatchProposal(proposalId: string): Promise<void> {
    await this.kvDel(this.patchKey(proposalId));
  }

  async saveQuiz(quiz: StoredVisualQuiz): Promise<void> {
    const QUIZ_TTL_SECONDS = 30 * 60;
    await this.kvSet(this.quizKey(quiz.quiz_id), JSON.stringify(quiz), QUIZ_TTL_SECONDS);
  }

  async getQuiz(quizId: string): Promise<StoredVisualQuiz | null> {
    const raw = await this.kvGet(this.quizKey(quizId));
    if (!raw) return null;
    const parsed = storedVisualQuizSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async markQuizSubmitted(quizId: string): Promise<boolean> {
    const quiz = await this.getQuiz(quizId);
    if (!quiz || quiz.submitted) return false;
    await this.saveQuiz({ ...quiz, submitted: true });
    return true;
  }

  async appendEvent(
    jobId: string,
    event: { type: VisualSseEvent['type'] } & Record<string, unknown>,
  ): Promise<VisualSseEvent> {
    const seq = await this.kvIncr(this.jobSeqKey(jobId), JOB_TTL_SECONDS);
    const full = visualSseEventSchema.parse({ ...event, sequence: seq });
    await this.listAppend(this.jobEventsKey(jobId), full, JOB_TTL_SECONDS);
    await this.touchTtl(this.jobOwnerKey(jobId), JOB_TTL_SECONDS);
    return full;
  }

  async listEventsAfter(jobId: string, afterSequence: number): Promise<VisualSseEvent[]> {
    const rows = await this.listRange(this.jobEventsKey(jobId));
    const events: VisualSseEvent[] = [];
    for (const row of rows) {
      const parsed = visualSseEventSchema.safeParse(row);
      if (parsed.success && parsed.data.sequence > afterSequence) {
        events.push(parsed.data);
      }
    }
    return events.sort((a, b) => a.sequence - b.sequence);
  }

  async latestSequence(jobId: string): Promise<number> {
    return (await this.kvGetInt(this.jobSeqKey(jobId))) ?? 0;
  }
}

export function newDeclineRetryToken(): string {
  return randomUUID();
}
