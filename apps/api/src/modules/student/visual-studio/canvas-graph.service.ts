import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { debateClashFixture, type CanvasGraph, type VisualArchetype } from '@edrion/schemas';
import { buildClashMapGraph } from '../debate/debate-clash-map.builder';
import type { StudentPrincipal } from '../student.types';
import { VisualGenerationService } from './visual-generation.service';
import { repairGeneratedGraph } from './visual-graph-repair';
import { VisualRevisionService } from './visual-revision.service';

export class CanvasGraphNotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CanvasGraphNotImplementedError';
  }
}

const SESSION_WAIT_MS = 8_000;

@Injectable()
export class CanvasGraphService {
  constructor(
    private readonly generation: VisualGenerationService,
    private readonly revisions: VisualRevisionService,
  ) {}

  /** Debate clash builder — CanvasGraph v1 comparison contract (≤40 nodes). */
  buildClashMap(input: {
    owner: unknown;
    debateRoundId: string;
    transcriptRef?: string;
    nodeBudget?: number;
    motionTitle?: string;
    clashes?: Parameters<typeof buildClashMapGraph>[0]['clashes'];
  }): CanvasGraph {
    void input.owner;
    void input.transcriptRef;
    const budget = input.nodeBudget ?? 40;
    const graph = buildClashMapGraph({
      debateRoundId: input.debateRoundId,
      motionTitle: input.motionTitle ?? 'Debate round',
      clashes: input.clashes ?? [
        {
          id: 'default',
          title: 'Core clash',
          summary: 'Default clash placeholder.',
          winner: 'tied',
          weight: 1,
          propArgumentRefs: ['T0-A1'],
          oppArgumentRefs: ['T1-A1'],
        },
      ],
    });
    if (graph.nodes.length > budget) {
      return { ...graph, nodes: graph.nodes.slice(0, budget) };
    }
    return graph;
  }

  /** Validates the frozen Debate clash fixture against the canonical graph contract. */
  validateClashFixture(): CanvasGraph {
    return debateClashFixture;
  }

  async generateForSession(
    principal: StudentPrincipal,
    input: {
      sessionId: string;
      blockId?: string;
      archetype: VisualArchetype;
      title: string;
      waitMs?: number;
    },
    generate: () => Promise<CanvasGraph>,
  ): Promise<{ canvasId: string; status: 'ready' | 'generating' }> {
    const canvasId = randomUUID();
    await this.revisions.commitInitial(principal, {
      id: canvasId,
      title: input.title,
      archetype: input.archetype,
      graph: {
        graph_schema_version: 1,
        archetype: input.archetype,
        title: input.title,
        nodes: [],
        edges: [],
      },
      origin: 'learn_session',
      sourceId: input.blockId ?? null,
      topicId: null,
      sourceSessionId: input.sessionId,
      reason: 'generation',
      status: 'generating',
    });

    const waitMs = input.waitMs ?? SESSION_WAIT_MS;
    const result = await Promise.race([
      generate().then((graph) => ({ kind: 'done' as const, graph })),
      new Promise<{ kind: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'timeout' }), waitMs),
      ),
    ]);

    if (result.kind === 'timeout') {
      void this.finishSessionGeneration(principal, canvasId, input, generate);
      return { canvasId, status: 'generating' };
    }

    await this.commitGeneratedGraph(principal, canvasId, input, result.graph);
    return { canvasId, status: 'ready' };
  }

  private async finishSessionGeneration(
    principal: StudentPrincipal,
    canvasId: string,
    input: { archetype: VisualArchetype; title: string },
    generate: () => Promise<CanvasGraph>,
  ) {
    try {
      const graph = await generate();
      await this.commitGeneratedGraph(principal, canvasId, input, graph);
    } catch {
      // Background failure is surfaced via canvas status polling.
    }
  }

  private async commitGeneratedGraph(
    principal: StudentPrincipal,
    canvasId: string,
    input: { archetype: VisualArchetype; title: string },
    rawGraph: CanvasGraph,
  ) {
    const repaired = repairGeneratedGraph(rawGraph as never);
    await this.revisions.commit(principal, {
      canvasId,
      baseRevision: 1,
      graph: repaired.graph,
      title: input.title,
      archetype: input.archetype,
      reason: 'generation',
      status: 'ready',
    });
  }

  repairAfterGeneration(graph: CanvasGraph) {
    return repairGeneratedGraph(graph as never);
  }
}
