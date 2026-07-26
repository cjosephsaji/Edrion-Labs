import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import { VisualStudioProcessor, VISUAL_GENERATE_JOB } from './visual-studio.processor';
import type { VisualJobEventStore } from './visual-job-event-store';
import type { VisualGenerationService } from './visual-generation.service';
import type { VisualStudioRepository } from './visual-studio.repository';
import type { QueueWorkers } from '../../../common/queue/queue.worker';

const principalRef = {
  kind: 'independent' as const,
  independentUserId: '00000000-0000-4000-8000-000000000001',
};

const proposal = {
  proposal_id: '00000000-0000-4000-8000-000000000010',
  owner_key: '00000000-0000-4000-8000-000000000001',
  mode: 'prompt' as const,
  title: 'Photosynthesis',
  archetype: 'mind_map' as const,
  estimated_nodes: { min: 8, max: 16 },
  rationale: 'A mind map fits branching ideas.',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  client_request_id: '00000000-0000-4000-8000-000000000020',
  origin: 'prompt' as const,
};

describe('VisualStudioProcessor', () => {
  let workers: QueueWorkers;
  let events: VisualJobEventStore;
  let generation: VisualGenerationService;
  let repo: VisualStudioRepository;
  let revisions: { commitInitial: ReturnType<typeof vi.fn> };
  let limiter: { acquireStudentCall: ReturnType<typeof vi.fn> };
    let grounding: { forNode: ReturnType<typeof vi.fn> };
    let ledger: { log: ReturnType<typeof vi.fn> };
  let processor: VisualStudioProcessor;

  beforeEach(() => {
    workers = { register: vi.fn() } as unknown as QueueWorkers;
    events = {
      getProposal: vi.fn().mockResolvedValue(proposal),
      appendEvent: vi.fn().mockImplementation(async (_jobId, event) => ({ ...event, sequence: 1 })),
    } as unknown as VisualJobEventStore;
    generation = {
      generateGraph: vi.fn().mockResolvedValue({
        graph_schema_version: 1,
        title: 'Photosynthesis',
        archetype: 'mind_map',
        root_node_id: 'root',
        nodes: [
          {
            id: 'root',
            type: 'concept',
            title: 'Photosynthesis',
            body: 'Plants make food from light.',
            depth: 0,
            collapsed: false,
            status: 'normal',
            origin: 'ai',
          },
          {
            id: 'leaf',
            type: 'concept',
            title: 'Chlorophyll',
            body: 'Captures light.',
            depth: 1,
            collapsed: false,
            status: 'normal',
            origin: 'ai',
          },
        ],
        edges: [{ id: 'e1', source: 'leaf', target: 'root', type: 'part_of' }],
        layout_cache: {},
      }),
      chunkNodes: vi.fn((nodes: unknown[]) => {
        const list = nodes as Array<{ id: string }>;
        return [list.slice(0, 1), list.slice(1)];
      }),
      chunkEdges: vi.fn((edges: unknown[]) => [edges]),
    } as unknown as VisualGenerationService;
    repo = {} as unknown as VisualStudioRepository;
    revisions = {
      commitInitial: vi.fn().mockResolvedValue({
        canvas: {
          id: '00000000-0000-4000-8000-000000000030',
          version: 1,
          archetype: 'mind_map',
          origin: 'prompt',
        },
      }),
    };
    limiter = { acquireStudentCall: vi.fn().mockResolvedValue({ enforced: true }) };
    grounding = { forNode: vi.fn() };
    ledger = { log: vi.fn().mockResolvedValue(undefined) };
    processor = new VisualStudioProcessor(
      workers,
      events,
      generation,
      {} as never,
      {} as never,
      grounding as never,
      repo,
      revisions as never,
      limiter as never,
      ledger as never,
    );
  });

  it('registers visual jobs on module init', () => {
    processor.onModuleInit();
    expect(workers.register).toHaveBeenCalledWith(VISUAL_GENERATE_JOB, expect.any(Function));
    expect(workers.register).toHaveBeenCalledWith('visual.expand', expect.any(Function));
    expect(workers.register).toHaveBeenCalledWith('visual.alternative', expect.any(Function));
    expect(workers.register).toHaveBeenCalledWith('visual.node-quiz', expect.any(Function));
  });

  it('acquires visual.generate before provider call and persists canvas', async () => {
    const job = {
      data: {
        jobId: 'job-1',
        operation: 'generate',
        principalRef,
        request: {
          proposalId: proposal.proposal_id,
          archetype: 'mind_map',
          clientRequestId: proposal.client_request_id,
        },
      },
    } as Job;

    const result = await processor.handleGenerate(job);

    expect(limiter.acquireStudentCall).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'independent' }),
      'visual.generate',
      'job-1:graph',
    );
    expect(generation.generateGraph).toHaveBeenCalled();
    expect(revisions.commitInitial).toHaveBeenCalled();
    expect(events.appendEvent).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ type: 'graph_ready' }),
    );
    expect(result.ok).toBe(true);
  });
});
