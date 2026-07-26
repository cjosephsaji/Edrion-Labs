import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CanvasGraph,
  CompleteCanvasGraph,
  MemoryGraphDiff,
  VisualGraphEdge,
  VisualGraphNode,
  VisualRevisionReason,
} from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { Database } from '@edrion/database';
import { AiUsageLimiter } from '../../copilot/ai-usage-limiter.service';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { StudentPrincipal } from '../student.types';
import { memoryEmbedText, normalizeMemoryText } from './visual-memory-text';
import { LearningEventsWriter } from '../ledger/learning-events.writer';
import {
  cosineSimilarity,
  hungarianMaximize,
  MEMORY_EMBED_ASSIGN_THRESHOLD,
  MEMORY_EMBED_HIGH_THRESHOLD,
} from './visual-vector';

export type MemoryDiffInput = {
  canvasId: string;
  studentGraph: CanvasGraph;
  referenceGraph: CompleteCanvasGraph;
  principal: StudentPrincipal;
  idempotencyKey: string;
};

type NodeMatch = {
  studentNodeId: string;
  referenceNodeId: string;
  method: 'normalized_title' | 'embedding';
};

@Injectable()
export class VisualMemoryDiffService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
    private readonly limiter: AiUsageLimiter,
    private readonly ledger: LearningEventsWriter,
  ) {}

  /**
   * Emit learning_events for memory canvases after a committed revision.
   * Study-mode reads never call this path.
   */
  async observeCommittedGraph(input: {
    principal: StudentPrincipal;
    canvasId: string;
    topicId: string | null;
    previousGraph: CanvasGraph;
    committedGraph: CanvasGraph;
    reason: VisualRevisionReason;
    tx: Database;
  }): Promise<void> {
    if (!input.topicId) return;
    if (input.reason === 'migration' || input.reason === 'restore') return;

    const prevShaky = new Set(
      input.previousGraph.nodes.filter((n) => n.status === 'shaky').map((n) => n.id),
    );
    const nextShaky = input.committedGraph.nodes.filter((n) => n.status === 'shaky');
    const resolved = input.committedGraph.nodes.filter(
      (n) => n.status === 'resolved' && prevShaky.has(n.id),
    );

    for (const node of nextShaky) {
      if (prevShaky.has(node.id)) continue;
      await this.ledger.logStrictInTransaction(input.tx, {
        principal: input.principal,
        eventType: 'visual.node_marked_shaky',
        payload: {
          canvasId: input.canvasId,
          nodeId: node.id,
          topicId: input.topicId,
        },
      });
    }

    for (const node of resolved) {
      await this.ledger.logStrictInTransaction(input.tx, {
        principal: input.principal,
        eventType: 'visual.node_resolved',
        payload: {
          canvasId: input.canvasId,
          nodeId: node.id,
          topicId: input.topicId,
        },
      });
    }
  }

  async computeDiff(input: MemoryDiffInput): Promise<MemoryGraphDiff> {
    const { studentGraph, referenceGraph } = input;
    const studentNodes = studentGraph.nodes;
    const referenceNodes = referenceGraph.nodes;

    const matchedStudent = new Set<string>();
    const matchedReference = new Set<string>();
    const matches: NodeMatch[] = [];

    this.matchExactTitles(studentNodes, referenceNodes, matchedStudent, matchedReference, matches);

    let matchingMode: MemoryGraphDiff['matching_mode'] = 'normalized_title_fallback';
    const remainingStudent = studentNodes.filter((node) => !matchedStudent.has(node.id));
    const remainingReference = referenceNodes.filter((node) => !matchedReference.has(node.id));

    if (remainingStudent.length > 0 && remainingReference.length > 0 && this.ai.available) {
      const embedded = await this.matchWithEmbeddings(
        input.principal,
        remainingStudent,
        remainingReference,
        matchedStudent,
        matchedReference,
        matches,
        input.idempotencyKey,
      );
      if (embedded) matchingMode = 'embeddings';
    }

    const studentToReference = new Map(matches.map((m) => [m.studentNodeId, m.referenceNodeId]));
    const referenceToStudent = new Map(matches.map((m) => [m.referenceNodeId, m.studentNodeId]));

    const missingNodes = referenceNodes
      .filter((node) => !matchedReference.has(node.id))
      .map((node) => ({
        reference_node: node,
        suggested_parent_student_node_id: this.suggestParentStudentNode(
          node.id,
          referenceGraph,
          referenceToStudent,
        ),
      }));

    const extraStudentNodeIds = studentNodes
      .filter((node) => !matchedStudent.has(node.id))
      .map((node) => node.id);

    const edgeResult = this.classifyEdges(
      studentGraph.edges,
      referenceGraph.edges,
      studentToReference,
      referenceToStudent,
    );

    const evidenceLines = this.buildEvidenceLines(
      matches.length,
      missingNodes.length,
      extraStudentNodeIds.length,
      edgeResult.correct.length,
      edgeResult.missing.length,
      edgeResult.wrong.length,
      matchingMode,
    );

    return {
      check_id: randomUUID(),
      canvas_id: input.canvasId,
      matching_mode: matchingMode,
      matched_nodes: matches.map((match) => ({
        student_node_id: match.studentNodeId,
        reference_node_id: match.referenceNodeId,
        method: match.method,
      })),
      missing_nodes: missingNodes,
      extra_student_node_ids: extraStudentNodeIds,
      correct_edges: edgeResult.correct,
      missing_edges: edgeResult.missing,
      wrong_edges: edgeResult.wrong,
      evidence_lines: evidenceLines,
      created_at: new Date().toISOString(),
    };
  }

  private matchExactTitles(
    studentNodes: VisualGraphNode[],
    referenceNodes: VisualGraphNode[],
    matchedStudent: Set<string>,
    matchedReference: Set<string>,
    matches: NodeMatch[],
  ): void {
    const referenceByTitle = new Map<string, VisualGraphNode[]>();
    for (const node of referenceNodes) {
      const key = normalizeMemoryText(node.title);
      if (!key) continue;
      const bucket = referenceByTitle.get(key) ?? [];
      bucket.push(node);
      referenceByTitle.set(key, bucket);
    }

    for (const student of studentNodes) {
      const key = normalizeMemoryText(student.title);
      if (!key) continue;
      const candidates = referenceByTitle.get(key);
      if (!candidates?.length) continue;
      const reference = candidates.find((node) => !matchedReference.has(node.id));
      if (!reference) continue;
      matches.push({
        studentNodeId: student.id,
        referenceNodeId: reference.id,
        method: 'normalized_title',
      });
      matchedStudent.add(student.id);
      matchedReference.add(reference.id);
    }
  }

  private async matchWithEmbeddings(
    principal: StudentPrincipal,
    studentNodes: VisualGraphNode[],
    referenceNodes: VisualGraphNode[],
    matchedStudent: Set<string>,
    matchedReference: Set<string>,
    matches: NodeMatch[],
    idempotencyKey: string,
  ): Promise<boolean> {
    try {
      const studentTexts = studentNodes.map((node) => memoryEmbedText(node));
      const referenceTexts = referenceNodes.map((node) => memoryEmbedText(node));
      await this.limiter.acquireStudentCall(
        principal,
        'visual.memory_embedding',
        `${idempotencyKey}:embed`,
      );
      const { vectors, usage } = await this.ai.embedTexts([...studentTexts, ...referenceTexts]);
      await this.callLog.log(principal, 'visual_memory', {
        inputTokens: usage.inputTokens,
        outputTokens: 0,
        model: usage.model,
        durationMs: usage.durationMs,
      });
      void idempotencyKey;

      const studentVectors = vectors.slice(0, studentNodes.length);
      const referenceVectors = vectors.slice(studentNodes.length);

      const similarity: number[][] = studentNodes.map((_, row) =>
        referenceNodes.map((__, col) =>
          cosineSimilarity(studentVectors[row] ?? [], referenceVectors[col] ?? []),
        ),
      );

      const highPairs: Array<{ row: number; col: number; score: number }> = [];
      for (let row = 0; row < studentNodes.length; row++) {
        for (let col = 0; col < referenceNodes.length; col++) {
          const score = similarity[row]![col]!;
          if (score >= MEMORY_EMBED_HIGH_THRESHOLD) {
            highPairs.push({ row, col, score });
          }
        }
      }
      highPairs.sort((a, b) => b.score - a.score);
      for (const { row, col } of highPairs) {
        const student = studentNodes[row]!;
        const reference = referenceNodes[col]!;
        if (matchedStudent.has(student.id) || matchedReference.has(reference.id)) continue;
        matches.push({
          studentNodeId: student.id,
          referenceNodeId: reference.id,
          method: 'embedding',
        });
        matchedStudent.add(student.id);
        matchedReference.add(reference.id);
      }

      const remainingStudent = studentNodes.filter((node) => !matchedStudent.has(node.id));
      const remainingReference = referenceNodes.filter((node) => !matchedReference.has(node.id));
      if (remainingStudent.length === 0 || remainingReference.length === 0) return true;

      const remSim: number[][] = remainingStudent.map((student) =>
        remainingReference.map((reference) => {
          const row = studentNodes.findIndex((node) => node.id === student.id);
          const col = referenceNodes.findIndex((node) => node.id === reference.id);
          return similarity[row]![col]!;
        }),
      );

      const assignments = hungarianMaximize(remSim, MEMORY_EMBED_ASSIGN_THRESHOLD);
      for (const { row, col } of assignments) {
        const student = remainingStudent[row]!;
        const reference = remainingReference[col]!;
        if (matchedStudent.has(student.id) || matchedReference.has(reference.id)) continue;
        matches.push({
          studentNodeId: student.id,
          referenceNodeId: reference.id,
          method: 'embedding',
        });
        matchedStudent.add(student.id);
        matchedReference.add(reference.id);
      }

      return true;
    } catch {
      return false;
    }
  }

  private suggestParentStudentNode(
    referenceNodeId: string,
    referenceGraph: CompleteCanvasGraph,
    referenceToStudent: Map<string, string>,
  ): string | undefined {
    const parentEdge = referenceGraph.edges.find(
      (edge) => edge.source === referenceNodeId && edge.type === 'part_of',
    );
    if (parentEdge) {
      return referenceToStudent.get(parentEdge.target);
    }
    const incoming = referenceGraph.edges.find((edge) => edge.target === referenceNodeId);
    if (incoming) return referenceToStudent.get(incoming.source);
    return referenceGraph.root_node_id
      ? referenceToStudent.get(referenceGraph.root_node_id)
      : undefined;
  }

  private classifyEdges(
    studentEdges: VisualGraphEdge[],
    referenceEdges: VisualGraphEdge[],
    studentToReference: Map<string, string>,
    referenceToStudent: Map<string, string>,
  ) {
    const correct: MemoryGraphDiff['correct_edges'] = [];
    const missing: MemoryGraphDiff['missing_edges'] = [];
    const wrong: MemoryGraphDiff['wrong_edges'] = [];
    const usedStudentEdges = new Set<string>();

    const referenceEdgeKey = (edge: VisualGraphEdge) =>
      `${edge.source}:${edge.target}:${edge.type}`;

    const referenceEdgeLookup = new Map(
      referenceEdges.map((edge) => [referenceEdgeKey(edge), edge]),
    );

    for (const referenceEdge of referenceEdges) {
      const sourceStudent = referenceToStudent.get(referenceEdge.source);
      const targetStudent = referenceToStudent.get(referenceEdge.target);
      if (!sourceStudent || !targetStudent) {
        missing.push({
          reference_edge: referenceEdge,
          source_student_node_id: sourceStudent,
          target_student_node_id: targetStudent,
        });
        continue;
      }

      const direct = studentEdges.find(
        (edge) =>
          edge.source === sourceStudent &&
          edge.target === targetStudent &&
          edge.type === referenceEdge.type,
      );
      if (direct) {
        correct.push({ student_edge_id: direct.id, reference_edge_id: referenceEdge.id });
        usedStudentEdges.add(direct.id);
        continue;
      }

      const reversed = studentEdges.find(
        (edge) =>
          edge.source === targetStudent &&
          edge.target === sourceStudent &&
          edge.type === referenceEdge.type,
      );
      if (reversed) {
        wrong.push({
          student_edge_id: reversed.id,
          reason: 'reversed_direction',
          expected_type: referenceEdge.type,
        });
        usedStudentEdges.add(reversed.id);
        missing.push({
          reference_edge: referenceEdge,
          source_student_node_id: sourceStudent,
          target_student_node_id: targetStudent,
        });
        continue;
      }

      const related = studentEdges.find(
        (edge) =>
          (edge.source === sourceStudent && edge.target === targetStudent) ||
          (edge.source === targetStudent && edge.target === sourceStudent),
      );
      if (related) {
        wrong.push({
          student_edge_id: related.id,
          reason: 'wrong_relation',
          expected_type: referenceEdge.type,
        });
        usedStudentEdges.add(related.id);
      }

      missing.push({
        reference_edge: referenceEdge,
        source_student_node_id: sourceStudent,
        target_student_node_id: targetStudent,
      });
    }

    for (const studentEdge of studentEdges) {
      if (usedStudentEdges.has(studentEdge.id)) continue;
      const refSource = studentToReference.get(studentEdge.source);
      const refTarget = studentToReference.get(studentEdge.target);
      if (!refSource || !refTarget) continue;

      const expected = referenceEdgeLookup.get(
        `${refSource}:${refTarget}:${studentEdge.type}`,
      );
      if (expected) continue;

      const reverseExpected = referenceEdgeLookup.get(
        `${refTarget}:${refSource}:${studentEdge.type}`,
      );
      if (reverseExpected) {
        wrong.push({
          student_edge_id: studentEdge.id,
          reason: 'reversed_direction',
          expected_type: studentEdge.type,
        });
        continue;
      }

      const expectedEdge = referenceEdges.find(
        (edge) =>
          (edge.source === refSource && edge.target === refTarget) ||
          (edge.source === refTarget && edge.target === refSource),
      );
      if (!expectedEdge) {
        wrong.push({
          student_edge_id: studentEdge.id,
          reason: 'unsupported_connection',
        });
      } else {
        wrong.push({
          student_edge_id: studentEdge.id,
          reason: 'wrong_relation',
          expected_type: expectedEdge?.type,
        });
      }
    }

    return { correct, missing, wrong };
  }

  private buildEvidenceLines(
    matchedCount: number,
    missingCount: number,
    extraCount: number,
    correctEdgeCount: number,
    missingEdgeCount: number,
    wrongEdgeCount: number,
    matchingMode: MemoryGraphDiff['matching_mode'],
  ): string[] {
    const lines = [
      `Matched ${matchedCount} idea${matchedCount === 1 ? '' : 's'} from memory.`,
      missingCount > 0
        ? `${missingCount} key idea${missingCount === 1 ? '' : 's'} still missing.`
        : 'You recalled every key idea.',
    ];
    if (correctEdgeCount > 0) {
      lines.push(
        `${correctEdgeCount} connection${correctEdgeCount === 1 ? '' : 's'} look right.`,
      );
    }
    if (wrongEdgeCount > 0 || missingEdgeCount > 0) {
      lines.push(
        `${wrongEdgeCount + missingEdgeCount} connection${wrongEdgeCount + missingEdgeCount === 1 ? '' : 's'} need another look.`,
      );
    }
    if (extraCount > 0) {
      lines.push(`${extraCount} extra idea${extraCount === 1 ? '' : 's'} not in the reference map.`);
    }
    if (matchingMode === 'normalized_title_fallback') {
      lines.push('Matched by title wording because embeddings were unavailable.');
    }
    return lines.slice(0, 4);
  }
}
