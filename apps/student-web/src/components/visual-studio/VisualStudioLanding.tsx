'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { VisualArchetype } from '@edrion/schemas';
import { PageHeader, Eyebrow, PetrosMark, PillChip } from '@/components/ui/primitives';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';
import {
  useVisualMemoryTopics,
  useVisualPropose,
  useVisualGenerate,
  useVisualJobStream,
  useCreateVisualCanvas,
} from '@/lib/hooks/useVisualStudio';
import { StudentClientError } from '@/lib/student-client';
import { GenerationProposalCard, type ProposalView } from './GenerationProposalCard';
import { GenerationProgress } from './GenerationProgress';

type Tab = 'petros' | 'memory';

const ARCHETYPE_LABELS: Record<VisualArchetype, string> = {
  mind_map: 'Mind map',
  flowchart: 'Flowchart',
  cycle: 'Cycle',
  timeline: 'Timeline',
  hierarchy: 'Hierarchy',
  comparison: 'Comparison',
};

function clientRequestId(): string {
  return crypto.randomUUID();
}

export function VisualStudioLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('petros');
  const [prompt, setPrompt] = useState('');
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [archetypeOverride, setArchetypeOverride] = useState<VisualArchetype | undefined>();
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineRetryToken, setDeclineRetryToken] = useState<string | undefined>();

  const sourceId = searchParams.get('source_id') ?? undefined;
  const topicId = searchParams.get('topic_id') ?? undefined;
  const sessionId = searchParams.get('session_id') ?? undefined;
  const effectiveTopicId = topicId;

  const propose = useVisualPropose();
  const generate = useVisualGenerate();
  const createCanvas = useCreateVisualCanvas();
  const memoryTopics = useVisualMemoryTopics();

  const entryMode = useMemo(() => {
    if (sourceId) return { mode: 'source' as const, label: 'From your Library' };
    if (sessionId) return { mode: 'session' as const, label: 'From Learn' };
    if (effectiveTopicId) return { mode: 'topic' as const, label: 'From Learn' };
    return { mode: 'prompt' as const, label: null };
  }, [sourceId, sessionId, effectiveTopicId]);

  useEffect(() => {
    const q = searchParams.get('topic') ?? searchParams.get('prompt');
    if (q) setPrompt(q);
  }, [searchParams]);

  const stream = useVisualJobStream(jobId, {
    onGraphReady: (canvasId) => {
      router.replace(`/lab/visual/${canvasId}`);
    },
    onError: (message) => setError(message),
    onDone: () => setJobId(null),
  });

  const handlePlan = async (override?: { topicId?: string; prompt?: string }) => {
    setError(null);
    const activeTopicId = override?.topicId ?? effectiveTopicId;
    const activePrompt = override?.prompt ?? prompt;
    try {
      const mode = sourceId
        ? 'source'
        : sessionId
          ? 'session'
          : activeTopicId
            ? 'topic'
            : 'prompt';
      const result = await propose.mutateAsync({
        mode,
        prompt: mode === 'prompt' ? activePrompt.trim() : activePrompt.trim() || undefined,
        source_id: sourceId,
        topic_id: activeTopicId,
        session_id: sessionId,
        decline_retry_token: declineRetryToken,
        client_request_id: clientRequestId(),
      });
      setProposal(result);
      setArchetypeOverride(undefined);
      setShowShapePicker(false);
      setDeclineRetryToken(undefined);
    } catch (err) {
      if (err instanceof StudentClientError) {
        if (err.code === 'TOPIC_DECLINED') {
          setDeclineRetryToken(String(err.meta?.decline_retry_token ?? ''));
          setError(err.message);
          return;
        }
        setError(err.message);
        return;
      }
      setError('Something went wrong. Try again.');
    }
  };

  const handleGenerate = async () => {
    if (!proposal) return;
    setError(null);
    try {
      const accepted = await generate.mutateAsync({
        proposal_id: proposal.proposal_id,
        archetype_override: archetypeOverride,
        client_request_id: clientRequestId(),
      });
      if (accepted.canvas_id) {
        router.replace(`/lab/visual/${accepted.canvas_id}`);
        return;
      }
      setJobId(accepted.job_id);
    } catch (err) {
      setError(err instanceof StudentClientError ? err.message : 'Could not start generation.');
    }
  };

  const handleMemoryTopic = async (topic: {
    topic_id: string;
    title: string;
    subject_label: string;
  }) => {
    setError(null);
    try {
      const canvasId = crypto.randomUUID();
      const created = await createCanvas.mutateAsync({
        id: canvasId,
        title: `${topic.title} from memory`,
        archetype: 'mind_map',
        origin: 'memory',
        topic_id: topic.topic_id,
        graph: {
          graph_schema_version: 1,
          title: topic.title,
          archetype: 'mind_map',
          root_node_id: null,
          nodes: [],
          edges: [],
          layout_cache: {},
        },
        client_mutation_id: crypto.randomUUID(),
      });
      router.push(`/lab/visual/${created.id}`);
    } catch (err) {
      setError(err instanceof StudentClientError ? err.message : 'Could not start a memory canvas.');
    }
  };

  const resetFlow = () => {
    stream.cancel();
    setProposal(null);
    setJobId(null);
    setArchetypeOverride(undefined);
    setShowShapePicker(false);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab"
        backLabel="The Lab"
        eyebrow={<Eyebrow color="violet">THINKING CANVAS</Eyebrow>}
        title="See the shape of an idea"
        subtitle="Build a map with Petros, or start from memory and check your connections."
      />

      <div className="mt-6 flex gap-2">
        <PillChip variant={tab === 'petros' ? 'primary' : 'default'} onClick={() => setTab('petros')}>
          Make with Petros
        </PillChip>
        <PillChip variant={tab === 'memory' ? 'primary' : 'default'} onClick={() => setTab('memory')}>
          Build from memory
        </PillChip>
      </div>

      {tab === 'petros' ? (
        <>
          {entryMode.label ? (
            <p className="mt-4 text-sm text-st-muted">
              <span className="rounded-full border border-st-bd2 bg-st-cardAlt px-3 py-1">
                {entryMode.label}
                {proposal?.source_label ? ` · ${proposal.source_label}` : ''}
              </span>
            </p>
          ) : null}

          {!proposal && !jobId ? (
            <div className="mt-6 space-y-4">
              {entryMode.mode === 'source' ? (
                <p className="text-sm text-st-muted">Every idea can point back to your source.</p>
              ) : entryMode.mode === 'session' || entryMode.mode === 'topic' ? (
                <p className="text-sm text-st-muted">Turn this session into a map you can explore.</p>
              ) : null}
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What do you want to see clearly?"
                className="w-full rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm text-st-ink outline-none focus:border-st-accent focus:shadow-[0_0_0_3px_rgba(30,122,94,0.13)]"
              />
              <PillButton
                onClick={() => void handlePlan()}
                disabled={propose.isPending || (entryMode.mode === 'prompt' && !prompt.trim())}
              >
                Plan my canvas <PetrosMark className="ml-1" />
              </PillButton>
            </div>
          ) : null}

          {proposal && !jobId ? (
            <GenerationProposalCard
              proposal={proposal}
              archetypeOverride={archetypeOverride}
              onArchetypeChange={setArchetypeOverride}
              onConfirm={() => void handleGenerate()}
              onCancel={resetFlow}
              confirming={generate.isPending}
              showShapePicker={showShapePicker}
              onToggleShapePicker={() => setShowShapePicker((v) => !v)}
            />
          ) : null}

          {jobId ? (
            <GenerationProgress
              title={proposal?.title ?? 'Your canvas'}
              archetypeLabel={ARCHETYPE_LABELS[archetypeOverride ?? proposal?.archetype ?? 'mind_map']}
              phase={stream.phase}
              nodes={stream.nodes}
              edges={stream.edges}
              totalNodes={stream.totalNodes}
              totalEdges={stream.totalEdges}
              onCancel={resetFlow}
            />
          ) : null}
        </>
      ) : (
        <Card className="mt-6" noPadding>
          <div className="space-y-3 p-5">
            <p className="text-sm text-st-muted">Topics you have studied recently.</p>
            {memoryTopics.isLoading ? <div className="h-16 shimmer rounded-xl" /> : null}
            {memoryTopics.data?.topics.map((topic) => (
              <button
                key={topic.topic_id}
                type="button"
                onClick={() => void handleMemoryTopic(topic)}
                disabled={createCanvas.isPending}
                className="block w-full rounded-[12px] border border-st-bd2 px-4 py-3 text-left hover:border-st-accent/40 disabled:opacity-60"
              >
                <p className="font-medium text-st-ink">{topic.title}</p>
                <p className="text-xs text-st-faint">{topic.subject_label}</p>
              </button>
            ))}
            {!memoryTopics.isLoading && memoryTopics.data?.topics.length === 0 ? (
              <p className="text-sm text-st-faint">Study a topic in Learn first, then build from memory here.</p>
            ) : null}
          </div>
        </Card>
      )}

      {error ?? stream.error ? (
        <Card className="mt-4 border-st-dangerBd bg-st-dangerSoft" noPadding>
          <div className="p-4 text-sm text-st-danger">{error ?? stream.error}</div>
        </Card>
      ) : null}
    </div>
  );
}
