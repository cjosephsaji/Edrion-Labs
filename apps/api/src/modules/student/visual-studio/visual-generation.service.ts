import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  aiGeneratedGraphSchema,
  type CanvasGraph,
  type CompleteCanvasGraph,
  type VisualArchetype,
  type VisualGraphEdge,
  type VisualGraphNode,
  visualGraphEdgeSchema,
  visualGraphNodeSchema,
  visualQuizQuestionPrivateSchema,
} from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../student.types';
import {
  graphSystem,
  VISUAL_ALTERNATIVE_SYSTEM,
  VISUAL_EXPANSION_SYSTEM,
  VISUAL_NODE_QUIZ_SYSTEM,
} from './visual-prompts';
import { visualProposalAiSchema } from './visual-topicality.service';
import { VISUAL_PROPOSAL_SYSTEM } from './visual-prompts';
import type { StoredVisualProposal } from './visual-job-event-store';
import { visualAiUnavailable } from './visual.errors';
import { VisualReferenceCacheService } from './visual-reference-cache.service';
import type { VisualNodeGrounding } from './visual-grounding.service';

const aiPatchOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(240),
    nodes: z.array(visualGraphNodeSchema).min(2).max(10),
    edges: z.array(visualGraphEdgeSchema).min(1).max(30),
  })
  .strict();

const aiQuizOutputSchema = z
  .object({
    questions: z.array(visualQuizQuestionPrivateSchema).min(2).max(3),
  })
  .strict();

export type AiPatchOutput = z.infer<typeof aiPatchOutputSchema>;

export interface ProposalContext {
  mode: StoredVisualProposal['mode'];
  prompt?: string;
  sourceLabel?: string;
  subjectLabel?: string;
  curriculumKey?: string;
  groundingExcerpt?: string;
  preferredArchetype?: VisualArchetype;
}

@Injectable()
export class VisualGenerationService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
    private readonly referenceCache: VisualReferenceCacheService,
  ) {}

  async proposeArchetype(principal: StudentPrincipal, context: ProposalContext) {
    if (!this.ai.available) throw visualAiUnavailable();

    const user = this.buildProposalUserPrompt(context);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual_propose',
      tier: 'nano',
      system: VISUAL_PROPOSAL_SYSTEM,
      user,
      schema: visualProposalAiSchema,
      schemaName: 'visual_proposal',
      maxOutputTokens: 400,
      privacySensitive: true,
    });
    await this.callLog.log(principal, 'visual_propose', usage);
    return result;
  }

  async generateGraph(
    principal: StudentPrincipal,
    proposal: StoredVisualProposal,
    archetype: VisualArchetype,
    idempotencyKey: string,
  ): Promise<CompleteCanvasGraph> {
    if (!this.ai.available) throw visualAiUnavailable();

    const user = this.buildGenerationUserPrompt(proposal, archetype);
    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual_generate',
      tier: 'large',
      system: graphSystem(archetype),
      user,
      schema: aiGeneratedGraphSchema,
      schemaName: 'visual_graph',
      maxOutputTokens: 8000,
      privacySensitive: true,
    });
    await this.callLog.log(principal, 'visual_generate', usage);
    void idempotencyKey;
    const normalized = this.normalizeGeneratedGraph({ ...result, layout_cache: result.layout_cache ?? {} });
    if (proposal.topic_id) {
      await this.referenceCache.put(
        proposal.topic_id,
        archetype,
        normalized,
        usage.model,
      );
    }
    return normalized;
  }

  async ensureReferenceGraph(
    principal: StudentPrincipal,
    input: {
      topicId: string;
      archetype: VisualArchetype;
      title: string;
      subjectLabel?: string;
      curriculumKey?: string;
      idempotencyKey: string;
    },
  ): Promise<CompleteCanvasGraph> {
    const cached = await this.referenceCache.get(input.topicId, input.archetype);
    if (cached) return cached;

    const proposal: StoredVisualProposal = {
      proposal_id: input.idempotencyKey,
      owner_key:
        principal.kind === 'institutional' ? principal.studentId : principal.independentUserId,
      mode: 'topic',
      title: input.title,
      archetype: input.archetype,
      estimated_nodes: { min: 8, max: 16 },
      rationale: `Reference map for memory check: ${input.title}`,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      topic_id: input.topicId,
      subject_label: input.subjectLabel,
      curriculum_key: input.curriculumKey,
      client_request_id: input.idempotencyKey,
      origin: 'learn_topic',
    };

    const graph = await this.generateGraph(
      principal,
      proposal,
      input.archetype,
      `${input.idempotencyKey}:reference`,
    );
    return graph;
  }

  async cacheReferenceGraph(
    topicId: string,
    archetype: VisualArchetype,
    graph: CompleteCanvasGraph,
    model: string,
  ): Promise<void> {
    await this.referenceCache.put(topicId, archetype, graph, model);
  }

  normalizeGeneratedGraph(graph: CompleteCanvasGraph): CompleteCanvasGraph {
    const childCounts = new Map<string, number>();
    for (const edge of graph.edges) {
      if (edge.type === 'part_of') {
        childCounts.set(edge.source, (childCounts.get(edge.source) ?? 0) + 1);
      }
      childCounts.set(edge.target, (childCounts.get(edge.target) ?? 0) + 1);
    }

    const nodes: VisualGraphNode[] = graph.nodes.map((node) => {
      let collapsed = node.collapsed;
      if (node.depth >= 2) {
        const hasDescendant = graph.edges.some(
          (e) =>
            (e.source === node.id || e.target === node.id) &&
            graph.nodes.some((n) => n.depth > node.depth && (n.id === e.source || n.id === e.target)),
        );
        if (hasDescendant) collapsed = true;
      }
      return {
        ...node,
        title: node.title.trim(),
        body: node.body.trim(),
        collapsed,
      };
    });

    return {
      ...graph,
      title: graph.title.trim(),
      nodes,
      edges: graph.edges.map((e) => normalizeEdge(e)),
      layout_cache: {} as CompleteCanvasGraph['layout_cache'],
    };
  }

  buildProposalUserPrompt(context: ProposalContext): string {
    const lines = [`Mode: ${context.mode}`];
    if (context.prompt) lines.push(`Student request: ${context.prompt}`);
    if (context.sourceLabel) lines.push(`Source: ${context.sourceLabel}`);
    if (context.subjectLabel) lines.push(`Subject: ${context.subjectLabel}`);
    if (context.curriculumKey) lines.push(`Curriculum: ${context.curriculumKey}`);
    if (context.preferredArchetype) lines.push(`Preferred archetype: ${context.preferredArchetype}`);
    return lines.join('\n');
  }

  buildGenerationUserPrompt(proposal: StoredVisualProposal, archetype: VisualArchetype): string {
    const lines = [
      `Title: ${proposal.title}`,
      `Archetype: ${archetype}`,
      `Requested focus: ${proposal.rationale}`,
    ];
    if (proposal.subject_label) lines.push(`Subject: ${proposal.subject_label}`);
    if (proposal.curriculum_key) lines.push(`Curriculum: ${proposal.curriculum_key}`);
    if (proposal.prompt) lines.push(`Student request: ${proposal.prompt}`);
    if (proposal.grounding_excerpt) {
      lines.push('<SOURCE_MATERIAL>');
      lines.push(proposal.grounding_excerpt.slice(0, 12_000));
      lines.push('</SOURCE_MATERIAL>');
    } else if (proposal.topic_id) {
      lines.push(`<LEARN_TOPIC id="${proposal.topic_id}">`);
      if (proposal.source_label) lines.push(proposal.source_label);
      lines.push('</LEARN_TOPIC>');
    }
    return lines.join('\n');
  }

  chunkNodes(nodes: VisualGraphNode[], size = 6): VisualGraphNode[][] {
    const out: VisualGraphNode[][] = [];
    for (let i = 0; i < nodes.length; i += size) out.push(nodes.slice(i, i + size));
    return out;
  }

  chunkEdges(edges: VisualGraphEdge[], size = 12): VisualGraphEdge[][] {
    const out: VisualGraphEdge[][] = [];
    for (let i = 0; i < edges.length; i += size) out.push(edges.slice(i, i + size));
    return out;
  }

  async generateExpansionPatch(
    principal: StudentPrincipal,
    graph: CanvasGraph,
    anchorNodeId: string,
    idempotencyKey: string,
  ): Promise<AiPatchOutput> {
    if (!this.ai.available) throw visualAiUnavailable();
    const user = this.buildPatchUserPrompt(graph, anchorNodeId, 'expansion');
    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual_expand',
      tier: 'large',
      system: VISUAL_EXPANSION_SYSTEM,
      user,
      schema: aiPatchOutputSchema,
      schemaName: 'visual_patch',
      maxOutputTokens: 4000,
      privacySensitive: true,
    });
    await this.callLog.log(principal, 'visual_expand', usage);
    void idempotencyKey;
    return this.normalizePatch(result, graph, anchorNodeId, 'ai_expansion');
  }

  async generateAlternativePatch(
    principal: StudentPrincipal,
    graph: CanvasGraph,
    anchorNodeId: string,
    idempotencyKey: string,
  ): Promise<AiPatchOutput> {
    if (!this.ai.available) throw visualAiUnavailable();
    const user = this.buildPatchUserPrompt(graph, anchorNodeId, 'alternative');
    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual_alternative',
      tier: 'large',
      system: VISUAL_ALTERNATIVE_SYSTEM,
      user,
      schema: aiPatchOutputSchema,
      schemaName: 'visual_patch',
      maxOutputTokens: 4000,
      privacySensitive: true,
    });
    await this.callLog.log(principal, 'visual_alternative', usage);
    void idempotencyKey;
    return this.normalizePatch(result, graph, anchorNodeId, 'alternative_path');
  }

  async generateNodeQuiz(
    principal: StudentPrincipal,
    grounding: VisualNodeGrounding,
    idempotencyKey: string,
  ) {
    if (!this.ai.available) throw visualAiUnavailable();
    const lines = [
      `Canvas: ${grounding.canvas.title} (${grounding.canvas.archetype})`,
      `Node [${grounding.node.type}]: ${grounding.node.title}`,
      grounding.node.body,
      'Neighbors:',
    ];
    for (const neighbor of grounding.neighbors) {
      lines.push(
        `- ${neighbor.direction} ${neighbor.edgeType} ${neighbor.node.title}: ${neighbor.node.body}`,
      );
    }
    if (grounding.source) {
      lines.push(`SOURCE EXCERPT (${grounding.source.label}): ${grounding.source.excerpt}`);
    }

    const { result, usage } = await this.ai.completeJson({
      purpose: 'visual_quiz',
      tier: 'nano',
      system: VISUAL_NODE_QUIZ_SYSTEM,
      user: lines.join('\n'),
      schema: aiQuizOutputSchema,
      schemaName: 'visual_node_quiz',
      maxOutputTokens: 2000,
      privacySensitive: true,
    });
    await this.callLog.log(principal, 'visual_quiz', usage);
    void idempotencyKey;
    return result.questions.map((q) => ({
      ...q,
      id: q.id || randomUUID(),
    }));
  }

  buildPatchUserPrompt(
    graph: CanvasGraph,
    anchorNodeId: string,
    kind: 'expansion' | 'alternative',
  ): string {
    const anchor = graph.nodes.find((n) => n.id === anchorNodeId);
    if (!anchor) return '';

    const existingIds = graph.nodes.map((n) => n.id).join(', ');
    const ancestors = this.collectAncestors(graph, anchorNodeId, 2);
    const children = graph.edges
      .filter((e) => e.source === anchorNodeId || e.target === anchorNodeId)
      .map((e) => {
        const otherId = e.source === anchorNodeId ? e.target : e.source;
        const other = graph.nodes.find((n) => n.id === otherId);
        if (!other) return null;
        const body =
          other.origin === 'student' && other.type === 'note'
            ? '[student note content omitted]'
            : other.body;
        return `${e.type} ${other.title}: ${body}`;
      })
      .filter(Boolean)
      .join('\n');

    return [
      `Operation: ${kind}`,
      `Canvas: ${graph.title}`,
      `Archetype: ${graph.archetype}`,
      `Anchor [${anchor.type}]: ${anchor.title}`,
      anchor.body,
      `Ancestors:\n${ancestors}`,
      `Immediate connections:\n${children}`,
      `EXISTING IDS: ${existingIds}`,
    ].join('\n\n');
  }

  private collectAncestors(graph: CanvasGraph, nodeId: string, maxDepth: number): string {
    const lines: string[] = [];
    let current = nodeId;
    for (let depth = 0; depth < maxDepth; depth++) {
      const parentEdge = graph.edges.find(
        (e) => e.target === current && (e.type === 'part_of' || e.type === 'leads_to'),
      );
      if (!parentEdge) break;
      const parent = graph.nodes.find((n) => n.id === parentEdge.source);
      if (!parent) break;
      lines.push(`${parent.type} ${parent.title}`);
      current = parent.id;
    }
    return lines.join('\n') || '(none)';
  }

  private normalizePatch(
    patch: AiPatchOutput,
    graph: CanvasGraph,
    anchorNodeId: string,
    defaultOrigin: VisualGraphNode['origin'],
  ): AiPatchOutput {
    const existingIds = new Set(graph.nodes.map((n) => n.id));
    const anchor = graph.nodes.find((n) => n.id === anchorNodeId);
    const anchorDepth = anchor?.depth ?? 0;

    const nodes = patch.nodes.map((node, index) => ({
      ...node,
      title: node.title.trim(),
      body: node.body.trim(),
      origin: index === 0 && defaultOrigin === 'alternative_path' ? 'alternative_path' : defaultOrigin,
      status: 'normal' as const,
      collapsed: false,
      depth: Math.min(Math.max(node.depth, anchorDepth + 1), 6),
    }));

    for (const node of nodes) {
      if (existingIds.has(node.id)) {
        throw visualAiUnavailable();
      }
    }

    return {
      summary: patch.summary.trim(),
      nodes,
      edges: patch.edges.map((e) => normalizeEdge(e)),
    };
  }
}

function normalizeEdge(edge: VisualGraphEdge): VisualGraphEdge {
  return {
    ...edge,
    label: edge.label?.trim() || undefined,
  };
}
