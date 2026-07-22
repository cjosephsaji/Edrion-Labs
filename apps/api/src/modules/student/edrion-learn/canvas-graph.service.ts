import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { VisualGenerationService } from '../visual-studio/visual-generation.service';
import type { StoredVisualProposal } from '../visual-studio/visual-job-event-store';
import type { StudentPrincipal } from '../student.types';
import type { CompleteCanvasGraph } from '@edrion/schemas';

@Injectable()
export class CanvasGraphService {
  constructor(private readonly visualGen: VisualGenerationService) {}

  /**
   * Generate a graph for an Edrion Learn session block via the frozen Visual Studio pipeline.
   * Hard-fail returns null; caller degrades to text explanation.
   */
  async generateForSession(
    principal: StudentPrincipal,
    opts: { sessionId: string; blockId: string; topicTitle: string; caption?: string },
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
      return { graph, canvasId: randomUUID() };
    } catch {
      return null;
    }
  }
}
