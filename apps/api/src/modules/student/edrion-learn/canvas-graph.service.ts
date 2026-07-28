import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VisualGenerationService } from '../visual-studio/visual-generation.service';
import { VisualStudioRepository } from '../visual-studio/visual-studio.repository';
import type { StoredVisualProposal } from '../visual-studio/visual-job-event-store';
import type { StudentPrincipal } from '../student.types';
import type { CompleteCanvasGraph } from '@edrion/schemas';

/**
 * DEC-6: Learn owns no canvas storage. Route visual_spawn through Chat 9's
 * pipeline into `visual_canvases` (+ revision 1). Hard-fail → null; caller
 * degrades to explanation.
 */
@Injectable()
export class CanvasGraphService {
  constructor(
    private readonly visualGen: VisualGenerationService,
    private readonly visualRepo: VisualStudioRepository,
  ) {}

  async generateForSession(
    principal: StudentPrincipal,
    opts: {
      sessionId: string;
      blockId: string;
      topicTitle: string;
      caption?: string;
      topicId?: string | null;
    },
  ): Promise<{ graph: CompleteCanvasGraph; canvasId: string } | null> {
    try {
      const ownerKey =
        principal.kind === 'institutional' ? principal.studentId : principal.independentUserId;
      const aiProposal = await this.visualGen.proposeArchetype(principal, {
        mode: 'session',
        prompt: `Teaching diagram for: ${opts.topicTitle}. ${opts.caption ?? ''}`.trim(),
        subjectLabel: 'Learn',
      });
      const proposalId = randomUUID();
      const stored: StoredVisualProposal = {
        proposal_id: proposalId,
        owner_key: ownerKey,
        mode: 'session',
        title: opts.topicTitle,
        archetype: aiProposal.archetype,
        estimated_nodes: aiProposal.estimated_nodes,
        rationale: aiProposal.rationale,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        prompt: opts.topicTitle,
        session_id: opts.sessionId,
        preferred_archetype: aiProposal.archetype,
        client_request_id: randomUUID(),
        subject_label: 'Learn',
        origin: 'learn_session',
      };
      const graph = await this.visualGen.generateGraph(
        principal,
        stored,
        aiProposal.archetype,
        `learn:${opts.sessionId}:${opts.blockId}`,
      );

      const owner =
        principal.kind === 'institutional'
          ? {
              institutionId: principal.institutionId,
              studentId: principal.studentId,
              independentUserId: null,
            }
          : {
              institutionId: null,
              studentId: null,
              independentUserId: principal.independentUserId,
            };

      const canvasId = randomUUID();
      const created = await this.visualRepo.createMemoryCanvas(principal, {
        id: canvasId,
        ...owner,
        title: opts.topicTitle.slice(0, 120),
        archetype: aiProposal.archetype,
        graph,
        schemaVersion: (graph as { graph_schema_version?: number }).graph_schema_version ?? 1,
        origin: 'learn_session',
        topicId: opts.topicId ?? null,
        sourceSessionId: opts.sessionId,
        sourceId: null,
        legacyArtifactId: null,
      });

      return { graph, canvasId: created.id };
    } catch {
      return null;
    }
  }
}
