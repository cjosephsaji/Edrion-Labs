import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import type { Job } from 'bullmq';
import type { VisualArchetype } from '@edrion/schemas';

import type { Response } from 'express';

import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';

import { JobsService } from '../../../common/queue/jobs.service';

import { QueueWorkers } from '../../../common/queue/queue.worker';

import { AiUsageLimiter } from '../../copilot/ai-usage-limiter.service';

import type { LearningEventsWriter } from '../ledger/learning-events.writer';

import type { StudentPrincipal } from '../student.types';

import { VisualGenerationService } from './visual-generation.service';

import { VisualGroundingService } from './visual-grounding.service';

import { VisualMemoryDiffService } from './visual-memory-diff.service';

import { VisualReferenceCacheService } from './visual-reference-cache.service';

import { VisualJobEventStore, type StoredVisualProposal } from './visual-job-event-store';

import { VisualStudioRepository } from './visual-studio.repository';

import { visualProposalExpired, visualQueueUnavailable } from './visual.errors';



export const VISUAL_GENERATE_JOB = 'visual.generate';

export const VISUAL_EXPAND_JOB = 'visual.expand';

export const VISUAL_ALTERNATIVE_JOB = 'visual.alternative';

export const VISUAL_NODE_QUIZ_JOB = 'visual.node-quiz';

export const VISUAL_CHECK_MEMORY_JOB = 'visual.check-memory';



const BATCH_YIELD_MS = 40;



export type VisualPrincipalRef =

  | { kind: 'institutional'; institutionId: string; studentId: string; campusId: string | null }

  | { kind: 'independent'; independentUserId: string };



export interface VisualGenerateJobData {

  jobId: string;

  operation: 'generate';

  principalRef: VisualPrincipalRef;

  request: {

    proposalId: string;

    archetype: StoredVisualProposal['archetype'];

    clientRequestId: string;

  };

  correlationId?: string;

}



export interface VisualExpandJobData {

  jobId: string;

  operation: 'expand';

  principalRef: VisualPrincipalRef;

  request: {

    canvasId: string;

    nodeId: string;

    clientRequestId: string;

  };

}



export interface VisualAlternativeJobData {

  jobId: string;

  operation: 'alternative';

  principalRef: VisualPrincipalRef;

  request: {

    canvasId: string;

    nodeId: string;

    clientRequestId: string;

  };

}



export interface VisualNodeQuizJobData {

  jobId: string;

  operation: 'node_quiz';

  principalRef: VisualPrincipalRef;

  request: {

    canvasId: string;

    nodeId: string;

    clientRequestId: string;

  };

}



export interface VisualCheckMemoryJobData {

  jobId: string;

  operation: 'check_memory';

  principalRef: VisualPrincipalRef;

  request: {

    canvasId: string;

    canvasVersion: number;

    clientRequestId: string;

  };

}



type PatchJobData = VisualExpandJobData | VisualAlternativeJobData;



@Injectable()

export class VisualStudioProcessor implements OnModuleInit {

  private readonly logger = new Logger(VisualStudioProcessor.name);



  constructor(

    private readonly workers: QueueWorkers,

    private readonly events: VisualJobEventStore,

    private readonly generation: VisualGenerationService,

    private readonly memoryDiff: VisualMemoryDiffService,

    private readonly referenceCache: VisualReferenceCacheService,

    private readonly grounding: VisualGroundingService,

    private readonly repo: VisualStudioRepository,

    private readonly limiter: AiUsageLimiter,

    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,

  ) {}



  onModuleInit(): void {

    this.workers.register(VISUAL_GENERATE_JOB, (job) => this.handleGenerate(job));

    this.workers.register(VISUAL_EXPAND_JOB, (job) => this.handlePatch(job, 'expansion'));

    this.workers.register(VISUAL_ALTERNATIVE_JOB, (job) => this.handlePatch(job, 'alternative'));

    this.workers.register(VISUAL_NODE_QUIZ_JOB, (job) => this.handleNodeQuiz(job));

    this.workers.register(VISUAL_CHECK_MEMORY_JOB, (job) => this.handleCheckMemory(job));

  }

  /** Run a visual job in-process when BullMQ is disabled (local dev). */
  async dispatchJob(job: Job): Promise<unknown> {
    switch (job.name) {
      case VISUAL_GENERATE_JOB:
        return this.handleGenerate(job);
      case VISUAL_EXPAND_JOB:
        return this.handlePatch(job, 'expansion');
      case VISUAL_ALTERNATIVE_JOB:
        return this.handlePatch(job, 'alternative');
      case VISUAL_NODE_QUIZ_JOB:
        return this.handleNodeQuiz(job);
      case VISUAL_CHECK_MEMORY_JOB:
        return this.handleCheckMemory(job);
      default:
        throw new Error(`Unknown visual job: ${job.name}`);
    }
  }



  async handleGenerate(job: Job): Promise<{ ok: boolean }> {

    const data = job.data as VisualGenerateJobData;

    const principal = principalFromRef(data.principalRef);

    const { jobId, request } = data;



    try {

      const proposal = await this.events.getProposal(request.proposalId);

      if (!proposal || new Date(proposal.expires_at).getTime() <= Date.now()) {

        await this.emitError(jobId, 'VISUAL_PROPOSAL_EXPIRED', 'That suggestion has expired.', false);

        return { ok: false };

      }



      await this.events.appendEvent(jobId, {

        type: 'started',

        job_id: jobId,

        estimated_nodes: proposal.estimated_nodes.max,

      });



      await this.limiter.acquireStudentCall(principal, 'visual.generate', `${jobId}:graph`);



      const graph = await this.generation.generateGraph(

        principal,

        proposal,

        request.archetype,

        `${jobId}:graph`,

      );



      const nodeBatches = this.generation.chunkNodes(graph.nodes);

      const edgeBatches = this.generation.chunkEdges(graph.edges);

      let receivedNodes = 0;

      for (const batch of nodeBatches) {

        receivedNodes += batch.length;

        await this.events.appendEvent(jobId, {

          type: 'node_batch',

          nodes: batch,

          received: receivedNodes,

          total: graph.nodes.length,

        });

        await sleep(BATCH_YIELD_MS);

      }

      let receivedEdges = 0;

      for (const batch of edgeBatches) {

        receivedEdges += batch.length;

        await this.events.appendEvent(jobId, {

          type: 'edge_batch',

          edges: batch,

          received: receivedEdges,

          total: graph.edges.length,

        });

        await sleep(BATCH_YIELD_MS);

      }



      const canvasId = randomUUID();

      const created = await this.repo.createGeneratedCanvas(principal, {

        id: canvasId,

        title: proposal.title,

        archetype: request.archetype,

        graph,

        origin: proposal.origin,

        sourceId: proposal.source_id ?? null,

        topicId: proposal.topic_id ?? null,

        sourceSessionId: proposal.session_id ?? null,

      });



      await this.ledger.log({

        principal,

        eventType: 'visual.canvas_created',

        payload: {

          canvasId: created.id,

          origin: created.origin,

          archetype: created.archetype,

          nodeCount: graph.nodes.length,

          edgeCount: graph.edges.length,

        },

        topicKey: undefined,

      });



      await this.events.appendEvent(jobId, {

        type: 'graph_ready',

        canvas_id: created.id,

        graph,

        version: created.version,

      });

      await this.events.appendEvent(jobId, { type: 'done', job_id: jobId });

      return { ok: true };

    } catch (err) {

      this.logger.error(`visual.generate failed for ${jobId}: ${(err as Error).message}`);

      const code =

        err && typeof err === 'object' && 'getResponse' in err

          ? ((err as { getResponse: () => { code?: string; message?: string } }).getResponse()?.code ??

            'VISUAL_GENERATION_FAILED')

          : 'VISUAL_GENERATION_FAILED';

      const message =

        err && typeof err === 'object' && 'getResponse' in err

          ? ((err as { getResponse: () => { message?: string } }).getResponse()?.message ??

            "This map didn't come together cleanly.")

          : "This map didn't come together cleanly.";

      await this.emitError(jobId, code, message, code === 'AI_LIMIT_REACHED');

      return { ok: false };

    }

  }



  async handlePatch(job: Job, kind: 'expansion' | 'alternative'): Promise<{ ok: boolean }> {

    const data = job.data as PatchJobData;

    const principal = principalFromRef(data.principalRef);

    const { jobId, request } = data;

    const scope = kind === 'expansion' ? 'visual.expand' : 'visual.alternative';



    try {

      const canvas = await this.repo.getCanvas(principal, request.canvasId);

      if (!canvas) {

        await this.emitError(jobId, 'VISUAL_NOT_FOUND', "This canvas isn't here.", false);

        return { ok: false };

      }



      await this.events.appendEvent(jobId, { type: 'started', job_id: jobId });



      await this.limiter.acquireStudentCall(principal, scope, `${jobId}:patch`);



      const patchOutput =

        kind === 'expansion'

          ? await this.generation.generateExpansionPatch(

              principal,

              canvas.graph,

              request.nodeId,

              `${jobId}:patch`,

            )

          : await this.generation.generateAlternativePatch(

              principal,

              canvas.graph,

              request.nodeId,

              `${jobId}:patch`,

            );



      const stored = await this.storePatchProposal(principal, canvas, {

        kind,

        anchor_node_id: request.nodeId,

        summary: patchOutput.summary,

        nodes: patchOutput.nodes,

        edges: patchOutput.edges,

      });



      const nodeBatches = this.generation.chunkNodes(patchOutput.nodes, 4);

      const edgeBatches = this.generation.chunkEdges(patchOutput.edges, 8);

      let receivedNodes = 0;

      for (const batch of nodeBatches) {

        receivedNodes += batch.length;

        await this.events.appendEvent(jobId, {

          type: 'node_batch',

          nodes: batch,

          received: receivedNodes,

          total: patchOutput.nodes.length,

        });

        await sleep(BATCH_YIELD_MS);

      }

      let receivedEdges = 0;

      for (const batch of edgeBatches) {

        receivedEdges += batch.length;

        await this.events.appendEvent(jobId, {

          type: 'edge_batch',

          edges: batch,

          received: receivedEdges,

          total: patchOutput.edges.length,

        });

        await sleep(BATCH_YIELD_MS);

      }



      await this.events.appendEvent(jobId, { type: 'patch_proposal_ready', proposal: stored });

      await this.events.appendEvent(jobId, { type: 'done', job_id: jobId });

      return { ok: true };

    } catch (err) {

      this.logger.error(`visual.${kind} failed for ${jobId}: ${(err as Error).message}`);

      await this.emitError(

        jobId,

        'VISUAL_GENERATION_FAILED',

        "This map didn't come together cleanly.",

        false,

      );

      return { ok: false };

    }

  }



  async handleNodeQuiz(job: Job): Promise<{ ok: boolean }> {

    const data = job.data as VisualNodeQuizJobData;

    const principal = principalFromRef(data.principalRef);

    const { jobId, request } = data;



    try {

      const canvas = await this.repo.getCanvas(principal, request.canvasId);

      if (!canvas) {

        await this.emitError(jobId, 'VISUAL_NOT_FOUND', "This canvas isn't here.", false);

        return { ok: false };

      }



      await this.events.appendEvent(jobId, { type: 'started', job_id: jobId });

      await this.limiter.acquireStudentCall(principal, 'visual.node_quiz', `${jobId}:quiz`);



      const grounding = await this.grounding.forNode(principal, request.canvasId, request.nodeId);

      const questions = await this.generation.generateNodeQuiz(

        principal,

        grounding,

        `${jobId}:quiz`,

      );



      const quizId = randomUUID();

      const ownerKey =

        principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();



      await this.events.saveQuiz({

        quiz_id: quizId,

        owner_key: ownerKey,

        canvas_id: request.canvasId,

        node_id: request.nodeId,

        questions,

        submitted: false,

        expires_at: expiresAt,

      });



      await this.events.appendEvent(jobId, {

        type: 'quiz_ready',

        quiz: {

          quiz_id: quizId,

          canvas_id: request.canvasId,

          node_id: request.nodeId,

          questions: questions.map(({ correct_key, feedback, ...rest }) => rest),

          expires_at: expiresAt,

        },

      });

      await this.events.appendEvent(jobId, { type: 'done', job_id: jobId });

      return { ok: true };

    } catch (err) {

      this.logger.error(`visual.node-quiz failed for ${jobId}: ${(err as Error).message}`);

      await this.emitError(

        jobId,

        'VISUAL_GENERATION_FAILED',

        "This map didn't come together cleanly.",

        false,

      );

      return { ok: false };

    }

  }



  async handleCheckMemory(job: Job): Promise<{ ok: boolean }> {

    const data = job.data as VisualCheckMemoryJobData;

    const principal = principalFromRef(data.principalRef);

    const { jobId, request } = data;



    try {

      const canvas = await this.repo.getCanvas(principal, request.canvasId);

      if (!canvas) {

        await this.emitError(jobId, 'VISUAL_NOT_FOUND', "This canvas isn't here.", false);

        return { ok: false };

      }

      if (canvas.origin !== 'memory') {

        await this.emitError(

          jobId,

          'VISUAL_INVALID_GRAPH',

          'Memory check is only available on memory canvases.',

          false,

        );

        return { ok: false };

      }

      if (canvas.version !== request.canvasVersion) {

        await this.emitError(

          jobId,

          'VISUAL_PROPOSAL_STALE',

          'This canvas changed before the memory check ran.',

          false,

        );

        return { ok: false };

      }

      if (!canvas.topicId) {

        await this.emitError(jobId, 'VISUAL_NOT_FOUND', 'This memory canvas has no topic.', false);

        return { ok: false };

      }



      const topic = await this.repo.getTopic(canvas.topicId);

      if (!topic) {

        await this.emitError(jobId, 'VISUAL_NOT_FOUND', 'This topic is no longer available.', false);

        return { ok: false };

      }



      await this.events.appendEvent(jobId, { type: 'started', job_id: jobId });



      const archetype = canvas.archetype as VisualArchetype;

      const cachedReference = await this.referenceCache.get(canvas.topicId, archetype);

      if (!cachedReference) {

        await this.limiter.acquireStudentCall(

          principal,

          'visual.memory_reference',

          `${jobId}:reference`,

        );

      }



      const referenceGraph = await this.generation.ensureReferenceGraph(principal, {

        topicId: canvas.topicId,

        archetype,

        title: topic.title,

        subjectLabel: topic.subjectLabel,

        curriculumKey: topic.curriculumKey,

        idempotencyKey: `${jobId}:reference`,

      });



      const diff = await this.memoryDiff.computeDiff({

        canvasId: canvas.id,

        studentGraph: canvas.graph,

        referenceGraph,

        principal,

        idempotencyKey: `${jobId}:diff`,

      });



      await this.ledger.log({

        principal,

        eventType: 'visual.memory_check_completed',

        payload: {

          canvasId: canvas.id,

          topicId: canvas.topicId,

          matchedNodeIds: diff.matched_nodes.map((match) => match.student_node_id),

          missingReferenceNodeIds: diff.missing_nodes.map((entry) => entry.reference_node.id),

          correctEdgeIds: diff.correct_edges.map((edge) => edge.student_edge_id),

          wrongEdgeIds: diff.wrong_edges.map((edge) => edge.student_edge_id),

          matchingMode: diff.matching_mode,

        },

        topicKey: topic.topicKey,

      });



      await this.events.appendEvent(jobId, { type: 'memory_diff_ready', diff });

      await this.events.appendEvent(jobId, { type: 'done', job_id: jobId });

      return { ok: true };

    } catch (err) {

      this.logger.error(`visual.check-memory failed for ${jobId}: ${(err as Error).message}`);

      const code =

        err && typeof err === 'object' && 'getResponse' in err

          ? ((err as { getResponse: () => { code?: string; message?: string } }).getResponse()?.code ??

            'VISUAL_GENERATION_FAILED')

          : 'VISUAL_GENERATION_FAILED';

      const message =

        err && typeof err === 'object' && 'getResponse' in err

          ? ((err as { getResponse: () => { message?: string } }).getResponse()?.message ??

            'Could not check your memory map.')

          : 'Could not check your memory map.';

      await this.emitError(jobId, code, message, code === 'AI_LIMIT_REACHED');

      return { ok: false };

    }

  }



  private async storePatchProposal(
    principal: StudentPrincipal,
    canvas: Awaited<ReturnType<VisualStudioRepository['getCanvas']>> & object,
    patch: {
      kind: 'expansion' | 'alternative';
      anchor_node_id: string;
      summary: string;
      nodes: import('@edrion/schemas').VisualGraphNode[];
      edges: import('@edrion/schemas').VisualGraphEdge[];
    },
  ) {
    const ownerKey =
      principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;
    const proposal = {
      proposal_id: randomUUID(),
      canvas_id: canvas!.id,
      base_version: canvas!.version,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      ...patch,
    };
    await this.events.savePatchProposal(proposal, ownerKey);
    return proposal;
  }

  private async emitError(jobId: string, code: string, message: string, retryable: boolean) {

    await this.events.appendEvent(jobId, {

      type: 'error',

      code,

      message,

      retryable,

    });

    await this.events.appendEvent(jobId, { type: 'done', job_id: jobId });

  }

}



export function principalFromRef(ref: VisualPrincipalRef): StudentPrincipal {

  if (ref.kind === 'institutional') {

    return {

      kind: 'institutional',

      institutionId: ref.institutionId,

      campusId: ref.campusId,

      institutionUserId: '',

      studentId: ref.studentId,

      email: '',

      fullName: '',

      lastAuthAt: null,

      permissions: [],

    };

  }

  return {

    kind: 'independent',

    independentUserId: ref.independentUserId,

    email: '',

    fullName: '',

    lastAuthAt: null,

    permissions: [],

  };

}



export function principalToRef(principal: StudentPrincipal): VisualPrincipalRef {

  if (principal.kind === 'institutional') {

    return {

      kind: 'institutional',

      institutionId: principal.institutionId,

      studentId: principal.studentId,

      campusId: principal.campusId,

    };

  }

  return { kind: 'independent', independentUserId: principal.independentUserId };

}



export async function streamVisualJobEvents(

  events: VisualJobEventStore,

  res: Response,

  jobId: string,

  afterSequence: number,

): Promise<void> {

  res.status(200);

  res.setHeader('Content-Type', 'text/event-stream');

  res.setHeader('Cache-Control', 'no-cache, no-transform');

  res.setHeader('Connection', 'keep-alive');

  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders?.();



  const started = Date.now();

  const maxMs = 10 * 60 * 1000;

  let cursor = afterSequence;

  let lastHeartbeat = Date.now();



  const writeEvent = (event: { sequence: number } & Record<string, unknown>) => {

    res.write(`id: ${event.sequence}\n`);

    res.write(`data: ${JSON.stringify(event)}\n\n`);

  };



  try {

    while (Date.now() - started < maxMs) {

      const batch = await events.listEventsAfter(jobId, cursor);

      for (const event of batch) {

        writeEvent(event);

        cursor = event.sequence;

        if (event.type === 'done' || event.type === 'error') {

          res.end();

          return;

        }

      }



      const latest = await events.latestSequence(jobId);

      const latestEvents = latest > cursor ? await events.listEventsAfter(jobId, cursor) : [];

      const terminal = latestEvents.find((e) => e.type === 'done' || e.type === 'error');

      if (terminal) {

        if (terminal.sequence > cursor) writeEvent(terminal);

        res.end();

        return;

      }



      if (Date.now() - lastHeartbeat >= 15_000) {

        res.write(': heartbeat\n\n');

        lastHeartbeat = Date.now();

      }

      await sleep(250);

    }

    res.end();

  } catch {

    res.end();

  }

}



export function allowsInlineVisualJobs(): boolean {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return nodeEnv === 'development';
}

export function assertQueueAvailable(jobs: JobsService): void {

  if (!jobs.enabled && !allowsInlineVisualJobs()) throw visualQueueUnavailable();

}



export function assertProposalFresh(proposal: StoredVisualProposal | null): StoredVisualProposal {

  if (!proposal) throw visualProposalExpired();

  if (new Date(proposal.expires_at).getTime() <= Date.now()) throw visualProposalExpired();

  return proposal;

}



function sleep(ms: number): Promise<void> {

  return new Promise((resolve) => setTimeout(resolve, ms));

}


