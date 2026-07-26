import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Response } from 'express';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import {
  CANVAS_GRAPH_MAX_BYTES,
  CURRENT_CANVAS_GRAPH_VERSION,
  MIGRATED_FORMAT_LABEL,
  canvasGraphSchema,
  collectVisualGraphIssues,
  completeCanvasGraphSchema,
  type CanvasGraph,
  type VisualArchetype,
  type VisualApplyProposalInput,
  type VisualCanvasCreateInput,
  type VisualCanvasPatchInput,
  type VisualExpandInput,
  type VisualGenerateInput,
  type VisualGraphPatch,
  type VisualMemoryCheckInput,
  type VisualProposalInput,
  type VisualQuizSubmitInput,
  type CanvasGenerateBody,
  type CanvasGenerateAccepted,
} from '@edrion/schemas';

import type { VisualCanvas } from '@edrion/database';

import { JobsService } from '../../../common/queue/jobs.service';
import { IdempotencyService } from '../../../common/idempotency.service';

import { AiUsageLimiter } from '../../copilot/ai-usage-limiter.service';

import type { StudentPrincipal } from '../student.types';

import {

  payloadTooLarge,

  visualInvalidGraph,

  visualLegacyRebuildRequired,

  visualNotFound,

  visualProposalExpired,

  visualProposalStale,

  visualSourceNotReady,
  visualQueueUnavailable,
} from './visual.errors';

import { VisualStudioRepository } from './visual-studio.repository';
import { VisualRevisionService } from './visual-revision.service';

import { VisualTopicalityService } from './visual-topicality.service';

import { VisualGenerationService } from './visual-generation.service';

import { VisualReferenceCacheService } from './visual-reference-cache.service';

import { VisualJobEventStore, type StoredVisualProposal } from './visual-job-event-store';

import {

  VISUAL_ALTERNATIVE_JOB,

  VISUAL_CHECK_MEMORY_JOB,

  VISUAL_EXPAND_JOB,

  VISUAL_GENERATE_JOB,

  VISUAL_NODE_QUIZ_JOB,

  assertProposalFresh,

  assertQueueAvailable,

  allowsInlineVisualJobs,

  principalToRef,

  streamVisualJobEvents,

  VisualStudioProcessor,

  type VisualAlternativeJobData,

  type VisualCheckMemoryJobData,

  type VisualExpandJobData,

  type VisualGenerateJobData,

  type VisualNodeQuizJobData,

} from './visual-studio.processor';



const PROPOSAL_TTL_MS = 15 * 60 * 1000;

function graphByteSize(graph: unknown): number {

  return Buffer.byteLength(JSON.stringify(graph), 'utf8');

}



function assertGraphBytes(graph: unknown): void {

  if (graphByteSize(graph) > CANVAS_GRAPH_MAX_BYTES) throw payloadTooLarge();

}

function sanitizeCanvasGraph(graph: CanvasGraph): CanvasGraph {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const layout_cache: CanvasGraph['layout_cache'] = {};
  for (const [archetype, layout] of Object.entries(graph.layout_cache)) {
    const positions: NonNullable<typeof layout>['positions'] = {};
    for (const [nodeId, position] of Object.entries(layout?.positions ?? {})) {
      if (nodeIds.has(nodeId)) positions[nodeId] = position;
    }
    if (Object.keys(positions).length > 0 || layout?.viewport) {
      layout_cache[archetype as VisualArchetype] = { ...layout, positions };
    }
  }

  let root_node_id = graph.root_node_id;
  if (root_node_id !== null && !nodeIds.has(root_node_id)) {
    const sorted = [...graph.nodes].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
    root_node_id = sorted[0]?.id ?? null;
  }

  return { ...graph, layout_cache, root_node_id };
}



export function sanitizeVisualText(text: string): string {

  return text

    .normalize('NFKC')

    .replace(/\r\n/g, '\n')

    .replace(/\u0000/g, '')

    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, '')

    .trim();

}



function formatCanvasDto(canvas: VisualCanvas) {

  return {

    id: canvas.id,

    title: canvas.title,

    archetype: canvas.archetype,

    graph: canvas.graph,

    schema_version: canvas.schemaVersion,

    origin: canvas.origin,

    source_id: canvas.sourceId,

    topic_id: canvas.topicId,

    source_session_id: canvas.sourceSessionId,

    version: canvas.version,

    created_at: canvas.createdAt.toISOString(),

    updated_at: canvas.updatedAt.toISOString(),

  };

}



function formatQuota(scopes: Record<string, { limit: number; used: number; remaining: number; resets_at: string }>) {

  return { scopes };

}



@Injectable()

export class VisualStudioService {

  private readonly logger = new Logger(VisualStudioService.name);

  constructor(

    private readonly repo: VisualStudioRepository,

    private readonly revisions: VisualRevisionService,

    private readonly limiter: AiUsageLimiter,

    private readonly topicality: VisualTopicalityService,

    private readonly generation: VisualGenerationService,

    private readonly referenceCache: VisualReferenceCacheService,

    private readonly events: VisualJobEventStore,

    private readonly jobs: JobsService,

    private readonly idempotency: IdempotencyService,

    private readonly processor: VisualStudioProcessor,

    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,

  ) {}



  async peekQuota(principal: StudentPrincipal) {

    const scopes = await this.limiter.peekStudent(principal);

    return formatQuota(scopes);

  }



  async propose(principal: StudentPrincipal, input: VisualProposalInput) {

    const operationId = input.client_request_id;

    const prompt = input.prompt ? sanitizeVisualText(input.prompt) : undefined;



    const grounding = await this.resolveGrounding(principal, input, prompt);

    await this.topicality.assertPromptAllowed(principal, {

      mode: input.mode,

      prompt,

      declineRetryToken: input.decline_retry_token,

      operationId,

      previousPrompt: input.decline_retry_token ? prompt : undefined,

    });



    await this.limiter.acquireStudentCall(

      principal,

      'visual.propose',

      `${input.client_request_id}:proposal`,

    );



    const aiProposal = await this.generation.proposeArchetype(principal, {

      mode: input.mode,

      prompt,

      sourceLabel: grounding.sourceLabel,

      subjectLabel: grounding.subjectLabel,

      curriculumKey: grounding.curriculumKey,

      groundingExcerpt: grounding.groundingExcerpt,

      preferredArchetype: input.preferred_archetype,

    });



    const archetype = input.preferred_archetype ?? aiProposal.archetype;

    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_MS).toISOString();

    const proposalId = randomUUID();

    const stored: StoredVisualProposal = {

      proposal_id: proposalId,

      owner_key: principal.kind === 'institutional' ? principal.studentId : principal.independentUserId,

      mode: input.mode,

      title: sanitizeVisualText(aiProposal.title),

      archetype,

      estimated_nodes: aiProposal.estimated_nodes,

      rationale: sanitizeVisualText(aiProposal.rationale),

      source_label: grounding.sourceLabel,

      expires_at: expiresAt,

      prompt,

      source_id: input.source_id,

      topic_id: grounding.topicId,

      session_id: input.session_id,

      preferred_archetype: input.preferred_archetype,

      client_request_id: input.client_request_id,

      subject_label: grounding.subjectLabel,

      curriculum_key: grounding.curriculumKey,

      grounding_excerpt: grounding.groundingExcerpt,

      origin: grounding.origin,

    };



    await this.events.saveProposal(stored);

    const quota = await this.peekQuota(principal);

    return {

      proposal_id: proposalId,

      title: stored.title,

      archetype,

      estimated_nodes: stored.estimated_nodes,

      rationale: stored.rationale,

      source_label: stored.source_label,

      expires_at: expiresAt,

      quota,

    };

  }



  async generate(principal: StudentPrincipal, input: VisualGenerateInput) {
    assertQueueAvailable(this.jobs);

    const proposal = assertProposalFresh(await this.events.getProposal(input.proposal_id));
    this.assertProposalOwner(principal, proposal);

    const archetype = input.archetype_override ?? proposal.archetype;
    const jobId = randomUUID();

    return this.startVisualJob(
      principal,
      input.client_request_id,
      jobId,
      VISUAL_GENERATE_JOB,
      'generate',
      {
        jobId,
        operation: 'generate',
        principalRef: principalToRef(principal),
        request: {
          proposalId: input.proposal_id,
          archetype,
          clientRequestId: input.client_request_id,
        },
      } satisfies VisualGenerateJobData,
    );
  }

  async generateCanvas(
    principal: StudentPrincipal,
    input: CanvasGenerateBody,
    idempotencyKey?: string,
  ): Promise<CanvasGenerateAccepted> {
    const scope = `canvas.generate:${principal.kind === 'institutional' ? principal.studentId : principal.independentUserId}`;
    const { result } = await this.idempotency.run(idempotencyKey, scope, async () => {
      const clientRequestId = randomUUID();
      const proposalInput = this.mapCanvasSourceToProposal(input, clientRequestId);
      const proposal = await this.propose(principal, proposalInput);
      const accepted = await this.generate(principal, {
        proposal_id: proposal.proposal_id,
        archetype_override: input.archetype,
        client_request_id: clientRequestId,
      });
      return {
        canvas_id: accepted.canvas_id ?? randomUUID(),
        job_id: accepted.job_id,
        status: 'generating' as const,
      };
    });
    return result;
  }

  private mapCanvasSourceToProposal(
    input: CanvasGenerateBody,
    clientRequestId: string,
  ): VisualProposalInput {
    switch (input.source.kind) {
      case 'prompt':
        return {
          mode: 'prompt',
          prompt: input.source.prompt,
          preferred_archetype: input.archetype,
          client_request_id: clientRequestId,
        };
      case 'library':
        return {
          mode: 'source',
          source_id: input.source.item_id,
          preferred_archetype: input.archetype,
          client_request_id: clientRequestId,
        };
      case 'learn_topic':
        return {
          mode: 'topic',
          topic_id: input.source.topic_id,
          preferred_archetype: input.archetype,
          client_request_id: clientRequestId,
        };
      case 'learn_session':
        return {
          mode: 'session',
          session_id: input.source.session_id,
          preferred_archetype: input.archetype,
          client_request_id: clientRequestId,
        };
      default:
        return input.source satisfies never;
    }
  }



  async streamJobEvents(

    principal: StudentPrincipal,

    jobId: string,

    afterSequence: number,

    res: Response,

  ) {

    const ok = await this.events.verifyJobOwner(jobId, principal);

    if (!ok) throw visualNotFound();

    await streamVisualJobEvents(this.events, res, jobId, afterSequence);

  }



  private assertProposalOwner(principal: StudentPrincipal, proposal: StoredVisualProposal) {

    const owner =

      principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;

    if (proposal.owner_key !== owner) throw visualProposalExpired();

  }



  private async resolveGrounding(

    principal: StudentPrincipal,

    input: VisualProposalInput,

    prompt?: string,

  ): Promise<{

    sourceLabel?: string;

    subjectLabel?: string;

    curriculumKey?: string;

    groundingExcerpt?: string;

    topicId?: string;

    origin: StoredVisualProposal['origin'];

  }> {

    if (input.mode === 'prompt') {

      return { origin: 'prompt' };

    }



    if (input.mode === 'source') {

      const item = await this.repo.getKnowledgeItem(principal, input.source_id!);

      if (!item) throw visualNotFound();

      if (item.status !== 'ready' || !item.extractedTextReady) throw visualSourceNotReady();

      const pages = await this.repo.listKnowledgePages(item.id);

      const excerpt = pages

        .map((p) => `page_index=${p.pageIndex}\n${p.text ?? ''}`)

        .join('\n\n')

        .slice(0, 12_000);

      return {

        sourceLabel: item.title,

        subjectLabel: 'General',

        curriculumKey: 'generic',

        groundingExcerpt: excerpt,

        origin: 'library_source',

      };

    }



    if (input.mode === 'topic') {

      const topic = await this.repo.getTopic(input.topic_id!);

      if (!topic) throw visualNotFound();

      return {

        sourceLabel: topic.title,

        subjectLabel: topic.subjectLabel,

        curriculumKey: topic.curriculumKey,

        topicId: topic.id,

        origin: 'learn_topic',

      };

    }



    const session = await this.repo.getSession(principal, input.session_id!);

    if (!session) throw visualNotFound();

    const topic = session.topicId ? await this.repo.getTopic(session.topicId) : null;

    const planText = JSON.stringify(session.sessionPlan ?? {}).slice(0, 8_000);

    return {

      sourceLabel: topic?.title ?? prompt ?? 'Learn session',

      subjectLabel: topic?.subjectLabel ?? 'General',

      curriculumKey: topic?.curriculumKey ?? 'generic',

      groundingExcerpt: planText || undefined,

      topicId: topic?.id,

      origin: 'learn_session',

    };

  }



  async createCanvas(principal: StudentPrincipal, input: VisualCanvasCreateInput) {

    assertGraphBytes(input.graph);

    const parsed = canvasGraphSchema.safeParse(input.graph);

    if (!parsed.success) {

      throw visualInvalidGraph({ issues: parsed.error.flatten() });

    }



    const topic = await this.repo.getTopic(input.topic_id);

    if (!topic) throw visualNotFound();



    const { canvas: created } = await this.revisions.commitInitial(principal, {
      id: input.id,
      title: sanitizeVisualText(input.title),
      archetype: input.archetype,
      graph: parsed.data,
      origin: 'memory',
      topicId: input.topic_id,
      sourceId: null,
      sourceSessionId: null,
      reason: 'created',
    });

    return formatCanvasDto(created);
  }



  async listCanvases(

    principal: StudentPrincipal,

    query: { limit: number; cursor?: string; source_id?: string; topic_id?: string },

  ) {

    const { items, nextCursor } = await this.repo.listCanvases(principal, {

      limit: query.limit,

      cursor: query.cursor,

      sourceId: query.source_id,

      topicId: query.topic_id,

    });



    return {

      items: items.map((c) => ({

        id: c.id,

        title: c.title,

        archetype: c.archetype,

        origin: c.origin,

        node_count: c.graph.nodes.length,

        from_label: null,

        updated_at: c.updatedAt.toISOString(),

      })),

      next_cursor: nextCursor,

    };

  }



  async getCanvas(principal: StudentPrincipal, id: string) {

    const canvas = await this.repo.getCanvas(principal, id);

    if (!canvas) throw visualNotFound();



    const parsed = canvasGraphSchema.safeParse(canvas.graph);

    if (!parsed.success) throw visualInvalidGraph({ issues: parsed.error.flatten() });



    return formatCanvasDto({ ...canvas, graph: parsed.data });

  }



  async patchCanvas(principal: StudentPrincipal, id: string, input: VisualCanvasPatchInput) {

    assertGraphBytes(input.graph);

    const graph = sanitizeCanvasGraph(input.graph);

    const existing = await this.repo.getCanvas(principal, id);

    if (!existing) throw visualNotFound();

    const schemaRef =

      existing.origin === 'memory' ? canvasGraphSchema : completeCanvasGraphSchema;

    const parsed = schemaRef.safeParse(graph);

    if (!parsed.success) {

      throw visualInvalidGraph({ issues: parsed.error.flatten() });

    }



    if (parsed.data.archetype !== input.archetype) {

      throw visualInvalidGraph({ path: ['archetype'], message: 'Archetype must match graph' });

    }



    const result = await this.revisions.commit(principal, {
      canvasId: id,
      baseRevision: input.base_version,
      title: sanitizeVisualText(input.title),
      archetype: input.archetype,
      graph: parsed.data,
      reason: 'autosave',
    });

    return { canvas: formatCanvasDto(result.canvas) };
  }



  async deleteCanvas(principal: StudentPrincipal, id: string, version: number) {

    const deleted = await this.revisions.softDelete(principal, id, version);

    if (!deleted) throw visualNotFound();

  }



  async listRevisions(principal: StudentPrincipal, canvasId: string, limit: number) {

    const items = await this.repo.listRevisions(principal, canvasId, limit);

    if (!items) throw visualNotFound();



    return {

      items: items.map((r) => ({
        id: r.id,
        revision_number: r.revisionNumber,
        reason: r.reason,
        created_at: r.createdAt.toISOString(),
        title: r.title,
        archetype: r.archetype,
        updated_format:
          r.schemaVersion < CURRENT_CANVAS_GRAPH_VERSION ? MIGRATED_FORMAT_LABEL : null,
      })),

    };

  }



  async restoreRevision(

    principal: StudentPrincipal,

    canvasId: string,

    revisionId: string,

    input: { base_version: number },

  ) {

    const revision = await this.repo.getRevision(principal, canvasId, revisionId);

    if (!revision) throw visualNotFound();



    const parsed = canvasGraphSchema.safeParse(revision.graph);

    if (!parsed.success) throw visualInvalidGraph({ issues: parsed.error.flatten() });



    const result = await this.revisions.restoreRevision(
      principal,
      canvasId,
      revisionId,
      input.base_version,
    );

    if (!result) throw visualNotFound();



    return formatCanvasDto(result.canvas);

  }



  async memoryTopics(principal: StudentPrincipal) {

    const rows = await this.repo.listMemoryTopics(principal);

    return {

      topics: rows.map((r) => ({

        topic_id: r.topicId,

        topic_key: r.topicKey,

        title: r.title,

        subject_label: r.subjectLabel,

        last_touched: new Date(r.lastTouched).toISOString(),

      })),

    };

  }



  async legacyLookup(principal: StudentPrincipal, artifactId: string) {

    const artifact = await this.repo.getKnowledgeArtifact(principal, artifactId);

    if (!artifact) throw visualNotFound();



    const mapped = await this.repo.getCanvasByLegacyArtifact(principal, artifactId);

    if (mapped) return { canvas_id: mapped.id };



    throw visualLegacyRebuildRequired();

  }



  async revisionQueue(

    principal: StudentPrincipal,

    canvasId: string,

    input: VisualRevisionQueueInput,

  ) {

    const canvas = await this.repo.getCanvas(principal, canvasId);

    if (!canvas) throw visualNotFound();



    let topicId = canvas.topicId;

    if (!topicId) {

      topicId = await this.ensureVisualTopic(canvas.title);

      await this.repo.attachTopicId(principal, canvasId, topicId);

    }



    const state = await this.repo.getRevisionState(principal, topicId);

    const existing = [...(state?.manualReasons ?? [])];



    const nodeById = new Map(canvas.graph.nodes.map((n) => [n.id, n]));

    let referenceById = new Map<string, { id: string; title: string }>();
    if (canvas.topicId) {
      const reference = await this.referenceCache.get(
        canvas.topicId,
        canvas.archetype as VisualArchetype,
      );
      if (reference) {
        referenceById = new Map(reference.nodes.map((node) => [node.id, node]));
      }
    }

    let reasons = existing;

    let queued = false;

    let queuedNodeIds: string[] = [];



    if (input.action === 'enqueue_shaky') {

      for (const nodeId of input.node_ids) {

        const node = nodeById.get(nodeId);

        if (!node) continue;

        const key = `${canvasId}:${nodeId}:shaky`;

        if (reasons.some((r) => `${r.contextId}:${r.nodeId}:${r.reason}` === key)) continue;

        reasons.push({

          contextType: 'visual_canvas',

          contextId: canvasId,

          nodeId,

          title: node.title,

          reason: 'shaky',

          queuedAt: new Date().toISOString(),

        });

        queued = true;

        queuedNodeIds.push(nodeId);

      }

    } else if (input.action === 'resolve') {

      const remove = new Set(input.node_ids);

      const before = reasons.length;

      reasons = reasons.filter((r) => !(r.contextId === canvasId && remove.has(r.nodeId)));

      queued = reasons.length < before;

    } else if (input.action === 'enqueue_memory_missing') {

      for (const nodeId of input.reference_node_ids) {

        const node = referenceById.get(nodeId);

        if (!node) continue;

        const key = `${canvasId}:${nodeId}:memory_missing`;

        if (reasons.some((r) => `${r.contextId}:${r.nodeId}:${r.reason}` === key)) continue;

        reasons.push({

          contextType: 'visual_canvas',

          contextId: canvasId,

          nodeId,

          title: node.title,

          reason: 'memory_missing',

          queuedAt: new Date().toISOString(),

        });

        queued = true;

        queuedNodeIds.push(nodeId);

      }

    }



    const { manualReasonCount } = await this.repo.updateManualReasons(principal, topicId, reasons);

    if (input.action === 'enqueue_shaky' && queued && canvas.topicId) {
      for (const nodeId of input.node_ids) {
        await this.ledger.log({
          principal,
          eventType: 'visual.node_marked_shaky',
          payload: { canvasId, nodeId, topicId },
        });
      }
    } else if (input.action === 'resolve' && queued && canvas.topicId) {
      for (const nodeId of input.node_ids) {
        await this.ledger.log({
          principal,
          eventType: 'visual.node_resolved',
          payload: { canvasId, nodeId, topicId },
        });
      }
    } else if (input.action === 'enqueue_memory_missing' && queued && queuedNodeIds.length > 0) {
      await this.ledger.log({
        principal,
        eventType: 'visual.revision_queued',
        payload: {
          canvasId,
          topicId,
          nodeIds: queuedNodeIds,
          reason: 'memory_missing',
        },
      });
    }

    return { queued, manual_reason_count: manualReasonCount };

  }



  private async ensureVisualTopic(title: string): Promise<string> {

    const normalized = title.trim().toLowerCase();

    const topicKey = `visual-${createHash('sha256').update(normalized).digest('hex').slice(0, 20)}`;

    const existing = await this.repo.getTopicByKey(topicKey);

    if (existing) return existing.id;



    const topic = await this.repo.upsertTopic({

      topicKey,

      title: title.trim(),

      subjectLabel: 'General',

      curriculumKey: 'generic',

      source: 'ai',

    });

    return topic.id;

  }

  async expand(principal: StudentPrincipal, input: VisualExpandInput) {
    return this.enqueuePatchJob(principal, input, 'expand', VISUAL_EXPAND_JOB);
  }

  async alternative(principal: StudentPrincipal, input: VisualExpandInput) {
    const canvas = await this.repo.getCanvas(principal, input.canvas_id);
    if (!canvas) throw visualNotFound();
    const node = canvas.graph.nodes.find((n) => n.id === input.node_id);
    if (!node) throw visualNotFound();
    if (node.type !== 'decision' && node.type !== 'process_step') {
      throw visualInvalidGraph({ message: 'Alternatives are only available on steps and decisions.' });
    }
    return this.enqueuePatchJob(principal, input, 'alternative', VISUAL_ALTERNATIVE_JOB);
  }

  async nodeQuiz(principal: StudentPrincipal, input: VisualExpandInput) {
    assertQueueAvailable(this.jobs);
    const canvas = await this.repo.getCanvas(principal, input.canvas_id);
    if (!canvas) throw visualNotFound();
    if (!canvas.graph.nodes.some((n) => n.id === input.node_id)) throw visualNotFound();
    await this.topicality.assertCanvasIsStudyContext(principal, canvas);

    const jobId = randomUUID();
    return this.startVisualJob(
      principal,
      input.client_request_id,
      jobId,
      VISUAL_NODE_QUIZ_JOB,
      'node_quiz',
      {
        jobId,
        operation: 'node_quiz',
        principalRef: principalToRef(principal),
        request: {
          canvasId: input.canvas_id,
          nodeId: input.node_id,
          clientRequestId: input.client_request_id,
        },
      } satisfies VisualNodeQuizJobData,
    );
  }

  async checkMemory(principal: StudentPrincipal, input: VisualMemoryCheckInput) {
    assertQueueAvailable(this.jobs);
    const canvas = await this.repo.getCanvas(principal, input.canvas_id);
    if (!canvas) throw visualNotFound();
    if (canvas.origin !== 'memory') {
      throw visualInvalidGraph({ message: 'Memory check is only available on memory canvases.' });
    }
    if (canvas.version !== input.canvas_version) throw visualProposalStale();

    const jobId = randomUUID();
    return this.startVisualJob(
      principal,
      input.client_request_id,
      jobId,
      VISUAL_CHECK_MEMORY_JOB,
      'check_memory',
      {
        jobId,
        operation: 'check_memory',
        principalRef: principalToRef(principal),
        request: {
          canvasId: input.canvas_id,
          canvasVersion: input.canvas_version,
          clientRequestId: input.client_request_id,
        },
      } satisfies VisualCheckMemoryJobData,
    );
  }

  async submitQuiz(
    principal: StudentPrincipal,
    quizId: string,
    input: VisualQuizSubmitInput,
  ) {
    const quiz = await this.events.getQuiz(quizId);
    if (!quiz) throw visualProposalExpired();
    const owner =
      principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;
    if (quiz.owner_key !== owner) throw visualNotFound();
    if (new Date(quiz.expires_at).getTime() <= Date.now()) throw visualProposalExpired();

    const answerById = new Map(
      input.answers.map((answer: VisualQuizSubmitInput['answers'][number]) => [
        answer.question_id,
        answer.choice_key,
      ]),
    );
    const results = quiz.questions.map((question) => {
      const choice = answerById.get(question.id);
      const correct = choice === question.correct_key;
      return {
        question_id: question.id,
        correct,
        feedback: correct
          ? question.feedback
          : `${question.feedback}`,
      };
    });

    const marked = await this.events.markQuizSubmitted(quizId);
    if (marked) {
      await this.ledger.log({
        principal,
        eventType: 'visual.node_quiz_completed',
        payload: {
          canvasId: quiz.canvas_id,
          nodeId: quiz.node_id,
          results: results.map((r) => ({ questionId: r.question_id, correct: r.correct })),
        },
      });
    }

    return { results };
  }

  async applyProposal(
    principal: StudentPrincipal,
    canvasId: string,
    input: VisualApplyProposalInput,
  ) {
    const proposal = await this.events.getPatchProposal(input.proposal_id);
    if (!proposal) throw visualProposalExpired();
    const owner =
      principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;
    if (proposal.owner_key !== owner || proposal.canvas_id !== canvasId) throw visualNotFound();
    if (new Date(proposal.expires_at).getTime() <= Date.now()) throw visualProposalExpired();

    const canvas = await this.repo.getCanvas(principal, canvasId);
    if (!canvas) throw visualNotFound();
    if (!canvas.graph.nodes.some((n) => n.id === proposal.anchor_node_id)) {
      throw visualProposalStale();
    }

    const existingIds = new Set(canvas.graph.nodes.map((n) => n.id));
    for (const node of proposal.nodes) {
      if (existingIds.has(node.id)) throw visualProposalStale();
    }

    const mergedGraph = {
      ...canvas.graph,
      nodes: [...canvas.graph.nodes, ...proposal.nodes],
      edges: [...canvas.graph.edges, ...proposal.edges],
    };

    const schemaRef =
      canvas.origin === 'memory' ? canvasGraphSchema : completeCanvasGraphSchema;
    const parsed = schemaRef.safeParse(mergedGraph);
    if (!parsed.success) throw visualInvalidGraph({ issues: parsed.error.flatten() });
    if (canvas.origin !== 'memory') {
      const issues = collectVisualGraphIssues(parsed.data);
      if (issues.length > 0) {
        throw visualInvalidGraph({ issues: issues.map((i) => ({ path: i.path, message: i.message })) });
      }
    }

    const result = await this.revisions.commit(principal, {
      canvasId,
      baseRevision: input.base_version,
      title: canvas.title,
      archetype: canvas.archetype,
      graph: parsed.data,
      reason: 'ai_patch',
    });
    if (!result) throw visualNotFound();

    await this.events.deletePatchProposal(input.proposal_id);

    const addedNodeIds = proposal.nodes.map((n) => n.id);
    await this.ledger.log({
      principal,
      eventType:
        proposal.kind === 'expansion' ? 'visual.branch_expanded' : 'visual.alternative_added',
      payload: {
        canvasId,
        anchorNodeId: proposal.anchor_node_id,
        addedNodeIds,
      },
      topicKey: undefined,
    });

    return formatCanvasDto(result.canvas);
  }

  private async enqueuePatchJob(
    principal: StudentPrincipal,
    input: VisualExpandInput,
    operation: 'expand' | 'alternative',
    jobName: typeof VISUAL_EXPAND_JOB | typeof VISUAL_ALTERNATIVE_JOB,
  ) {
    assertQueueAvailable(this.jobs);
    const canvas = await this.repo.getCanvas(principal, input.canvas_id);
    if (!canvas) throw visualNotFound();
    if (!canvas.graph.nodes.some((n) => n.id === input.node_id)) throw visualNotFound();
    await this.topicality.assertCanvasIsStudyContext(principal, canvas);

    const jobId = randomUUID();
    const jobData =
      operation === 'expand'
        ? ({
            jobId,
            operation: 'expand',
            principalRef: principalToRef(principal),
            request: {
              canvasId: input.canvas_id,
              nodeId: input.node_id,
              clientRequestId: input.client_request_id,
            },
          } satisfies VisualExpandJobData)
        : ({
            jobId,
            operation: 'alternative',
            principalRef: principalToRef(principal),
            request: {
              canvasId: input.canvas_id,
              nodeId: input.node_id,
              clientRequestId: input.client_request_id,
            },
          } satisfies VisualAlternativeJobData);

    return this.startVisualJob(principal, input.client_request_id, jobId, jobName, operation, jobData);
  }

  private async startVisualJob(
    principal: StudentPrincipal,
    clientRequestId: string,
    jobId: string,
    jobName: string,
    operation: 'generate' | 'expand' | 'alternative' | 'check_memory' | 'node_quiz',
    jobData: Record<string, unknown>,
  ): Promise<{ job_id: string; stream_url: string }> {
    const existingJob = await this.events.getJobForClientRequest(clientRequestId);
    if (existingJob) {
      return { job_id: existingJob, stream_url: `/visual/jobs/${existingJob}/events` };
    }

    await this.events.setJobOwner(jobId, principal);
    await this.events.mapClientRequest(clientRequestId, jobId);
    await this.events.appendEvent(jobId, { type: 'queued', job_id: jobId, operation });

    if (this.jobs.enabled) {
      const enqueued = await this.jobs.enqueue('ai', jobName, jobData, {
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      });
      if (!enqueued) throw visualQueueUnavailable();
    } else if (allowsInlineVisualJobs()) {
      const job = { id: jobId, name: jobName, data: jobData } as Job;
      try {
        await this.processor.dispatchJob(job);
      } catch (err) {
        this.logger.error(`Inline visual job ${jobName} failed: ${(err as Error).message}`);
        throw err;
      }
    } else {
      throw visualQueueUnavailable();
    }

    let canvasId: string | undefined;
    if (!this.jobs.enabled && allowsInlineVisualJobs()) {
      const events = await this.events.listEventsAfter(jobId, 0);
      const ready = events.find((event) => event.type === 'graph_ready');
      if (ready?.type === 'graph_ready') canvasId = ready.canvas_id;
    }

    return {
      job_id: jobId,
      stream_url: `/visual/jobs/${jobId}/events`,
      ...(canvasId ? { canvas_id: canvasId } : {}),
    };
  }

  private ownerKey(principal: StudentPrincipal): string {
    return principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;
  }

  async storePatchProposal(
    principal: StudentPrincipal,
    canvas: VisualCanvas,
    patch: Omit<VisualGraphPatch, 'proposal_id' | 'canvas_id' | 'base_version' | 'expires_at'>,
  ): Promise<VisualGraphPatch> {
    const proposal: VisualGraphPatch = {
      proposal_id: randomUUID(),
      canvas_id: canvas.id,
      base_version: canvas.version,
      expires_at: new Date(Date.now() + PROPOSAL_TTL_MS).toISOString(),
      ...patch,
    };
    await this.events.savePatchProposal(proposal, this.ownerKey(principal));
    return proposal;
  }

}


