import { Injectable } from '@nestjs/common';
import type { VisualArchetype, VisualGraphEdge, VisualGraphNode } from '@edrion/schemas';
import type { VisualCanvas } from '@edrion/database';
import type { StudentPrincipal } from '../student.types';
import { VisualStudioRepository } from './visual-studio.repository';
import { visualNotFound } from './visual.errors';

export type VisualNodeNeighbor = {
  direction: 'incoming' | 'outgoing';
  edgeType: VisualGraphEdge['type'];
  edgeLabel?: string;
  node: Pick<VisualGraphNode, 'id' | 'type' | 'title' | 'body'>;
};

export type VisualNodeGrounding = {
  canvas: { title: string; archetype: VisualArchetype };
  node: Pick<VisualGraphNode, 'id' | 'type' | 'title' | 'body' | 'status' | 'origin'>;
  neighbors: VisualNodeNeighbor[];
  source?: { label: string; pageIndex?: number; excerpt: string };
};

const MAX_NEIGHBORS = 8;
const MAX_NEIGHBOR_CHARS = 6_000;
const MAX_EXCERPT = 1_200;

@Injectable()
export class VisualGroundingService {
  constructor(private readonly repo: VisualStudioRepository) {}

  async forNode(
    principal: StudentPrincipal,
    canvasId: string,
    nodeId: string,
  ): Promise<VisualNodeGrounding> {
    const canvas = await this.repo.getCanvas(principal, canvasId);
    if (!canvas) throw visualNotFound();

    const graph = canvas.graph;
    const node = graph.nodes.find((entry) => entry.id === nodeId);
    if (!node) throw visualNotFound();

    const neighbors = this.collectNeighbors(graph, nodeId);
    const source = await this.resolveSourceExcerpt(principal, canvas, node);

    return {
      canvas: { title: canvas.title, archetype: canvas.archetype as VisualArchetype },
      node: {
        id: node.id,
        type: node.type,
        title: node.title,
        body: node.body,
        status: node.status,
        origin: node.origin,
      },
      neighbors,
      source,
    };
  }

  /** @deprecated use forNode */
  async buildNodeGrounding(
    principal: StudentPrincipal,
    canvas: VisualCanvas,
    nodeId: string,
  ): Promise<{ canvasTitle: string; nodeTitle: string; excerpt: string | null }> {
    const grounding = await this.forNode(principal, canvas.id, nodeId);
    return {
      canvasTitle: grounding.canvas.title,
      nodeTitle: grounding.node.title,
      excerpt: grounding.source?.excerpt ?? null,
    };
  }

  formatAskUserPrompt(grounding: VisualNodeGrounding, question: string): string {
    const lines = [
      `Visual canvas: ${grounding.canvas.title} (${grounding.canvas.archetype})`,
      `Selected node [${grounding.node.type}]: ${grounding.node.title}`,
      grounding.node.body,
      'Connections:',
    ];

    for (const neighbor of grounding.neighbors) {
      lines.push(
        `- ${neighbor.direction} ${neighbor.edgeType} ${neighbor.node.title}: ${neighbor.node.body}`,
      );
    }

    if (grounding.source) {
      const page =
        grounding.source.pageIndex != null ? ` p.${grounding.source.pageIndex + 1}` : '';
      lines.push(`Source excerpt (${grounding.source.label}${page}): ${grounding.source.excerpt}`);
    }

    lines.push(`Student question: ${question}`);
    return lines.join('\n');
  }

  private collectNeighbors(
    graph: VisualCanvas['graph'],
    nodeId: string,
  ): VisualNodeNeighbor[] {
    const outgoing: VisualNodeNeighbor[] = [];
    const incoming: VisualNodeNeighbor[] = [];

    for (const edge of graph.edges) {
      if (edge.source === nodeId) {
        const target = graph.nodes.find((n) => n.id === edge.target);
        if (target) {
          outgoing.push({
            direction: 'outgoing',
            edgeType: edge.type,
            edgeLabel: edge.label,
            node: { id: target.id, type: target.type, title: target.title, body: target.body },
          });
        }
      }
      if (edge.target === nodeId) {
        const source = graph.nodes.find((n) => n.id === edge.source);
        if (source) {
          incoming.push({
            direction: 'incoming',
            edgeType: edge.type,
            edgeLabel: edge.label,
            node: { id: source.id, type: source.type, title: source.title, body: source.body },
          });
        }
      }
    }

    outgoing.sort((a, b) =>
      `${a.edgeType}:${a.node.title}`.localeCompare(`${b.edgeType}:${b.node.title}`),
    );
    incoming.sort((a, b) =>
      `${a.edgeType}:${a.node.title}`.localeCompare(`${b.edgeType}:${b.node.title}`),
    );

    const ordered = [...outgoing, ...incoming];
    const capped: VisualNodeNeighbor[] = [];
    let chars = 0;
    for (const neighbor of ordered) {
      if (capped.length >= MAX_NEIGHBORS) break;
      const nextChars = neighbor.node.body.length + neighbor.node.title.length + 40;
      if (chars + nextChars > MAX_NEIGHBOR_CHARS && capped.length > 0) break;
      capped.push(neighbor);
      chars += nextChars;
    }
    return capped;
  }

  private async resolveSourceExcerpt(
    principal: StudentPrincipal,
    canvas: VisualCanvas,
    node: VisualGraphNode,
  ): Promise<VisualNodeGrounding['source'] | undefined> {
    const ref = node.source_ref;
    if (ref?.kind === 'library_page') {
      const item = await this.repo.getKnowledgeItem(principal, ref.item_id);
      if (!item) return undefined;
      const pages = await this.repo.listKnowledgePages(ref.item_id);
      const page = pages.find((p) => p.pageIndex === ref.page_index) ?? pages[0];
      const text = page?.text ?? '';
      const excerpt = excerptAroundTitle(text, node.title, MAX_EXCERPT);
      return {
        label: item.title,
        pageIndex: ref.page_index,
        excerpt,
      };
    }

    if (ref?.kind === 'learn_topic' || canvas.topicId) {
      const topicId = ref?.kind === 'learn_topic' ? ref.topic_id : canvas.topicId;
      if (!topicId) return undefined;
      const topic = await this.repo.getTopic(topicId);
      if (!topic) return undefined;
      return { label: topic.title, excerpt: topic.title.slice(0, MAX_EXCERPT) };
    }

    return undefined;
  }
}

function excerptAroundTitle(text: string, title: string, maxLen: number): string {
  if (!text.trim()) return '';
  const normalized = title.trim().toLowerCase();
  const lower = text.toLowerCase();
  const index = normalized ? lower.indexOf(normalized) : -1;
  if (index < 0) return text.slice(0, maxLen);
  const start = Math.max(0, index - Math.floor((maxLen - normalized.length) / 2));
  return text.slice(start, start + maxLen);
}
