'use client';
import React from 'react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  CreditCard,
  FilePenLine,
  Flag,
  Flame,
  Gauge,
  HardHat,
  Layers3,
  Lightbulb,
  LoaderCircle,
  MessageSquareText,
  Network,
  Pause,
  PartyPopper,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  ShieldCheck,
  Send,
  Target,
  Trophy,
  WifiOff,
} from 'lucide-react';
import type {
  PetrosLearningSessionDocument,
  PetrosDetour,
  PetrosSessionBlock,
  PetrosStudentQuestionState,
  PetrosTeachingBlockContent,
  PetrosArtifactContent,
  PetrosSavedArtifact,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import { PetrosArtifactCuration } from './petros-artifact-curation';
import {
  usePetrosCompanionOptional,
  usePetrosPage,
  type PetrosLessonInterruption,
} from './petros-companion-context';
import {
  buildPetrosLessonNarration,
  petrosLessonTarget,
  type PetrosLessonNarrationSegment,
  type PetrosLessonPausePoint,
} from './petros-lesson-narration';
import { PetrosNarratedText } from './petros-narrated-text';
import { buildPetrosSpeechTimeline } from './use-petros-voice';
import styles from './petros-session.module.css';

interface SessionProps {
  topic: string;
  score?: string;
  source: string;
  resultId?: string;
  sessionId?: string;
}

type SessionSubject = 'machine-learning' | 'construction-safety' | 'technical';
type PetrosSessionReaction = 'reading' | 'thinking' | 'correct' | 'retry' | 'checkpoint' | 'celebrate';

function sessionSubject(topic: string, source: string): SessionSubject {
  const haystack = `${topic} ${source}`.toLowerCase();
  if (/machine learning|neural|model|training data|classification|regression|algorithm|feature/.test(haystack)) {
    return 'machine-learning';
  }
  if (/construction|site safety|ppe|hazard|scaffold|excavat|work at height|toolbox talk/.test(haystack)) {
    return 'construction-safety';
  }
  return 'technical';
}

function signalPetros(
  kind: PetrosSessionReaction,
  label: string,
  durationMs = 2_800,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('petros:session-reaction', {
    detail: { kind, label, durationMs },
  }));
}

function hasCurrentBlock(document: PetrosLearningSessionDocument) {
  return document.blocks.some((block) => block.status === 'current');
}

function requiresAnswerBeforeProgress(content: PetrosTeachingBlockContent) {
  return (
    content.type === 'prerequisite_check' ||
    content.type === 'predict_then_reveal' ||
    content.type === 'recall_check' ||
    content.type === 'socratic_probe'
  );
}

function needsNextBlock(document: PetrosLearningSessionDocument) {
  return document.status === 'active' && !hasCurrentBlock(document);
}

/** A compact continuation handoff built from the same visible teaching beats Petros narrates. */
function spokenLesson(block: PetrosSessionBlock) {
  return buildPetrosLessonNarration(block).map((segment) => segment.text).join(' ').slice(0, 800);
}

function formatSessionTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function sessionAttemptStats(document: PetrosLearningSessionDocument | null) {
  const attempts = document?.blocks.flatMap((block) =>
    block.questions.flatMap((question) => question.attempts),
  ) ?? [];
  const correct = attempts.filter((attempt) => attempt.correctness === 'correct').length;
  let streak = 0;
  for (const attempt of [...attempts].reverse()) {
    if (attempt.correctness !== 'correct') break;
    streak += 1;
  }
  return { attempts: attempts.length, correct, streak };
}

function SessionTrail({
  checkpoints,
  completedCount,
}: {
  checkpoints: PetrosLearningSessionDocument['checkpoints'];
  completedCount: number;
}) {
  return (
    <ol
      className={styles.sessionTrail}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={checkpoints.length}
      aria-valuenow={completedCount}
      aria-label={`${completedCount} of ${checkpoints.length} checkpoints complete`}
    >
      {checkpoints.map((checkpoint, index) => (
        <li
          key={checkpoint.id}
          data-complete={checkpoint.status === 'complete'}
          data-current={checkpoint.status === 'current'}
          aria-current={checkpoint.status === 'current' ? 'step' : undefined}
        >
          <span className={styles.trailNode}>
            {checkpoint.status === 'complete' ? <Check aria-hidden="true" /> : index + 1}
          </span>
          <span className={styles.trailLabel}>{checkpoint.label}</span>
        </li>
      ))}
    </ol>
  );
}

type FinalRecallItem = {
  id: string;
  question: string;
  answer: string;
  source: string;
};

function groundingLabel(block: PetrosSessionBlock, fallback: string) {
  const content = block.content;
  if ('sourceGrounding' in content && content.sourceGrounding.length) {
    const grounding = content.sourceGrounding[0]!;
    return grounding.reference ? `${grounding.label} · ${grounding.reference}` : grounding.label;
  }
  return fallback;
}

function finalRecallItems(document: PetrosLearningSessionDocument): FinalRecallItem[] {
  const source = contextualSourceView(document, 'session source').citations[0];
  const fallbackSource = source
    ? `${source.label}${source.page ? ` · p. ${source.page}` : ''}${source.section ? ` · ${source.section}` : ''}`
    : 'this verified session';
  const items: FinalRecallItem[] = [];
  for (const block of [...document.blocks].reverse()) {
    const content = block.content;
    let question = '';
    let answer = '';
    if (content.type === 'layered_explanation') {
      question = `Without looking back, what was the key idea behind “${content.title}”?`;
      answer = content.keyIdea;
    } else if (content.type === 'predict_then_reveal' || content.type === 'hook') {
      question = content.prompt;
      answer = content.reveal;
    } else if (content.type === 'worked_example') {
      question = content.finalCheck;
      answer = content.steps.at(-1)?.explanation ?? content.problemStatement;
    } else if (content.type === 'diagram') {
      question = `Rebuild the most important connection in “${content.title}” in one sentence.`;
      answer = content.fallbackText;
    } else if (content.type === 'contrast_case') {
      question = `What distinction separates ${content.left.label} from ${content.right.label}?`;
      answer = content.keyDistinction;
    } else if (content.type === 'misconception_demolition') {
      question = `What correction replaces this misconception: “${content.misconception}”?`;
      answer = content.correction;
    } else if (content.type === 'synthesis') {
      question = content.prompt;
      const response = block.interactionState.response;
      answer = typeof response === 'string' && response.trim()
        ? response
        : content.tighteningGuidance ?? content.prompt;
    } else {
      const answeredCorrectly = block.questions
        .flatMap((item) => item.attempts)
        .reverse()
        .find((attempt) => attempt.correctness === 'correct');
      const prompt = block.questions[0]?.prompt;
      if (prompt && answeredCorrectly) {
        question = prompt;
        answer = answeredCorrectly.rawAnswer;
      }
    }
    if (!question.trim() || !answer.trim() || items.some((item) => item.question === question)) continue;
    items.push({
      id: block.id,
      question,
      answer,
      source: groundingLabel(block, fallbackSource),
    });
    if (items.length === 3) break;
  }
  return items.reverse();
}

type DiagramContent = Extract<PetrosTeachingBlockContent, { type: 'diagram' }>;
type DiagramPoint = { x: number; y: number };
type DiagramStage =
  | { kind: 'node'; key: string; nodeId: string }
  | { kind: 'edge'; key: string; edgeIndex: number };

function diagramPoints(type: DiagramContent['diagramType'], count: number): DiagramPoint[] {
  const safeCount = Math.max(1, count);
  if (type === 'timeline') {
    return Array.from({ length: count }, (_, index) => ({
      x: 90 + (index * 580) / Math.max(1, safeCount - 1),
      y: 180,
    }));
  }
  if (type === 'comparison') {
    return Array.from({ length: count }, (_, index) => ({
      x: index % 2 === 0 ? 210 : 550,
      y: 90 + Math.floor(index / 2) * 120,
    }));
  }
  if (type === 'concept_map') {
    return Array.from({ length: count }, (_, index) => {
      if (index === 0) return { x: 380, y: 190 };
      const angle = ((index - 1) / Math.max(1, safeCount - 1)) * Math.PI * 2 - Math.PI / 2;
      return { x: 380 + Math.cos(angle) * 255, y: 190 + Math.sin(angle) * 125 };
    });
  }
  return Array.from({ length: count }, (_, index) => ({
    x: 380 + (index % 2 === 0 ? -55 : 55),
    y: 72 + index * 100,
  }));
}

function buildDiagramStages(content: DiagramContent): DiagramStage[] {
  const stages: DiagramStage[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<number>();
  const visit = (rootId: string) => {
    if (!seenNodes.has(rootId)) {
      seenNodes.add(rootId);
      stages.push({ kind: 'node', key: `node:${rootId}`, nodeId: rootId });
    }
    const queue = [rootId];
    while (queue.length) {
      const from = queue.shift()!;
      content.edges.forEach((edge, edgeIndex) => {
        if (edge.from !== from || seenEdges.has(edgeIndex)) return;
        seenEdges.add(edgeIndex);
        stages.push({ kind: 'edge', key: `edge:${edgeIndex}`, edgeIndex });
        if (!seenNodes.has(edge.to)) {
          seenNodes.add(edge.to);
          stages.push({ kind: 'node', key: `node:${edge.to}`, nodeId: edge.to });
          queue.push(edge.to);
        }
      });
    }
  };
  for (const node of content.nodes) visit(node.id);
  content.edges.forEach((_edge, edgeIndex) => {
    if (!seenEdges.has(edgeIndex)) stages.push({ kind: 'edge', key: `edge:${edgeIndex}`, edgeIndex });
  });
  return stages.length ? stages : [{ kind: 'node', key: 'node:empty', nodeId: '' }];
}

function AnimatedDiagram({
  blockId,
  content,
  labels,
  interactionState,
  expanded,
  completed,
  onEdit,
  onInteraction,
}: {
  blockId: string;
  content: DiagramContent;
  labels: Record<string, unknown>;
  interactionState: Record<string, unknown>;
  expanded: boolean;
  completed: boolean;
  onEdit: (nodeId: string, label: string) => void;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
}) {
  const stages = React.useMemo(() => buildDiagramStages(content), [content]);
  const totalSteps = stages.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [challengeFeedback, setChallengeFeedback] = useState('');
  const markerId = React.useId().replace(/:/g, '');
  const diagramId = `diagram-${markerId}`;
  const points = diagramPoints(content.diagramType, content.nodes.length);
  const canvasHeight = content.diagramType === 'flowchart'
    ? Math.max(360, content.nodes.length * 100 + 45)
    : content.diagramType === 'comparison'
      ? Math.max(360, Math.ceil(content.nodes.length / 2) * 120 + 70)
      : 380;

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(totalSteps - 1);
      setPlaying(false);
    }
  }, [totalSteps]);

  const nodeLabel = (node: DiagramContent['nodes'][number]) =>
    typeof labels[node.id] === 'string' ? String(labels[node.id]) : node.label;
  const storedBuildCount = Number(interactionState.diagramBuildEdgeCount ?? 0);
  const buildEdgeCount = Math.max(0, Math.min(content.edges.length, Number.isFinite(storedBuildCount) ? storedBuildCount : 0));
  const builtOnce = completed || interactionState.diagramBuilt === true || content.edges.length === 0;
  const buildMode = content.diagramType === 'concept_map' && !builtOnce;
  const buildEdge = buildMode ? content.edges[buildEdgeCount] : undefined;
  const buildFrom = buildEdge ? content.nodes.find((node) => node.id === buildEdge.from) : undefined;
  const buildTo = buildEdge ? content.nodes.find((node) => node.id === buildEdge.to) : undefined;
  const activeStage = stages[Math.min(step, totalSteps - 1)]!;
  const activeNode = activeStage.kind === 'node'
    ? content.nodes.find((node) => node.id === activeStage.nodeId)
    : undefined;
  const activeEdge = activeStage.kind === 'edge' ? content.edges[activeStage.edgeIndex] : undefined;
  const activeEdgeFrom = activeEdge
    ? content.nodes.find((node) => node.id === activeEdge.from)
    : undefined;
  const activeEdgeTo = activeEdge
    ? content.nodes.find((node) => node.id === activeEdge.to)
    : undefined;
  const narration = activeNode
    ? `${nodeLabel(activeNode)}. ${activeNode.description}`
    : activeEdge && activeEdgeFrom && activeEdgeTo
      ? `Follow the connection from ${nodeLabel(activeEdgeFrom)} to ${nodeLabel(activeEdgeTo)}. ${activeEdge.label ? `“${activeEdge.label}” explains how those two ideas are related.` : 'The arrow shows the direction of the process.'}`
      : content.altText;
  const targetKey = `${diagramId}:${activeStage.key}`;
  const visibleStages = stages.slice(0, Math.min(step + 1, totalSteps));
  const visibleNodeIds = buildMode
    ? new Set([
        content.nodes[0]?.id ?? '',
        ...content.edges.slice(0, buildEdgeCount).flatMap((edge) => [edge.from, edge.to]),
      ])
    : new Set(
        visibleStages.flatMap((stage) => {
          if (stage.kind === 'node') return [stage.nodeId];
          const edge = content.edges[stage.edgeIndex];
          return edge ? [edge.from, edge.to] : [];
        }),
      );
  const visibleEdgeIndexes = buildMode
    ? new Set(content.edges.slice(0, buildEdgeCount).map((_edge, index) => index))
    : new Set(visibleStages.flatMap((stage) => stage.kind === 'edge' ? [stage.edgeIndex] : []));

  const chooseConnection = (correct: boolean) => {
    if (!buildEdge) return;
    if (!correct) {
      setChallengeFeedback(`Close — start at ${buildFrom ? nodeLabel(buildFrom) : 'the first idea'} and follow what causes the next idea.`);
      signalPetros('retry', 'Almost — follow the cause before the effect.', 2_800);
      return;
    }
    const nextCount = Math.min(content.edges.length, buildEdgeCount + 1);
    const finished = nextCount >= content.edges.length;
    setChallengeFeedback(finished ? 'Map built. Nice — you can replay Petros’s walkthrough now.' : 'Connection locked. One more piece of the map is ready.');
    signalPetros(
      finished ? 'checkpoint' : 'correct',
      finished ? 'Map built — every connection is carrying weight.' : 'That connection snaps into place.',
      3_000,
    );
    onInteraction({
      diagramBuildEdgeCount: nextCount,
      diagramBuilt: finished,
    }, true);
  };

  useEffect(() => {
    const advance = (event: Event) => {
      const detail = (event as CustomEvent<{ diagramId?: string; step?: number }>).detail;
      if (detail?.diagramId !== diagramId || detail.step !== step) return;
      setStep((current) => {
        if (current >= totalSteps - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    };
    const stop = (event: Event) => {
      const detail = (event as CustomEvent<{ diagramId?: string }>).detail;
      if (!detail?.diagramId || detail.diagramId === diagramId) setPlaying(false);
    };
    const resume = (event: Event) => {
      const detail = (event as CustomEvent<{ diagramId?: string; step?: number }>).detail;
      if (detail?.diagramId !== diagramId || detail.step !== step) return;
      setStep((current) => {
        if (current >= totalSteps - 1) {
          setPlaying(false);
          return current;
        }
        setPlaying(true);
        return current + 1;
      });
    };
    window.addEventListener('petros:diagram-advance', advance);
    window.addEventListener('petros:diagram-stop', stop);
    window.addEventListener('petros:diagram-resume', resume);
    return () => {
      window.removeEventListener('petros:diagram-advance', advance);
      window.removeEventListener('petros:diagram-stop', stop);
      window.removeEventListener('petros:diagram-resume', resume);
    };
  }, [diagramId, step, totalSteps]);

  useEffect(() => {
    if (!playing) return undefined;
    window.dispatchEvent(new CustomEvent('petros:diagram-step', {
      detail: { diagramId, step, targetKey, text: narration },
    }));
    // The mentor normally advances when its audio ends. This guard keeps the visual usable
    // if voice playback is unavailable or the mentor has been disabled for this route.
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('petros:diagram-advance', {
        detail: { diagramId, step },
      }));
    }, Math.max(20_000, narration.split(/\s+/).length * 520));
    return () => window.clearTimeout(timer);
  }, [diagramId, narration, playing, step, targetKey]);

  return (
    <div
      className={styles.diagram}
      data-expanded={expanded}
      data-petros-target={petrosLessonTarget(blockId, 'diagram')}
    >
      <div className={styles.diagramToolbar} aria-label={buildMode ? 'Concept map build progress' : 'Diagram playback controls'}>
        {buildMode ? (
          <>
            <span className={styles.buildBadge}><Target aria-hidden="true" /> Your turn: build the map</span>
            <span>{buildEdgeCount} / {content.edges.length} connections</span>
          </>
        ) : (
          <>
        <button type="button" onClick={() => {
          if (playing) window.dispatchEvent(new CustomEvent('petros:diagram-stop', { detail: { diagramId } }));
          setPlaying((value) => !value);
        }} aria-label={playing ? 'Pause diagram explanation' : 'Explain diagram'}>
          {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? 'Pause' : 'Play review'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            window.dispatchEvent(new CustomEvent('petros:diagram-stop', { detail: { diagramId } }));
            setStep((current) => Math.min(totalSteps - 1, current + 1));
          }}
        >
          Next step <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            setStep(0);
            setPlaying(true);
          }}
        >
          <RotateCcw aria-hidden="true" /> Replay
        </button>
        <span>{Math.min(step + 1, totalSteps)} / {totalSteps}</span>
          </>
        )}
      </div>

      {!buildMode && interactionState.diagramBuilt === true && !completed ? (
        <div className={styles.diagramBuiltNotice} role="status">
          <Check aria-hidden="true" /> Map built · replay unlocked
        </div>
      ) : null}

      <svg
        className={styles.diagramCanvas}
        viewBox={`0 0 760 ${canvasHeight}`}
        role="img"
        aria-label={content.altText}
      >
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" />
          </marker>
        </defs>
        {content.edges.map((edge, index) => {
          const fromIndex = content.nodes.findIndex((node) => node.id === edge.from);
          const toIndex = content.nodes.findIndex((node) => node.id === edge.to);
          if (fromIndex < 0 || toIndex < 0) return null;
          const from = points[fromIndex]!;
          const to = points[toIndex]!;
          const visible = visibleEdgeIndexes.has(index);
          const active = buildMode
            ? index === buildEdgeCount
            : activeStage.kind === 'edge' && activeStage.edgeIndex === index;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={`${edge.from}-${edge.to}-${index}`} className={styles.diagramEdge} data-visible={visible} data-active={active || undefined} data-petros-target={`${diagramId}:edge:${index}`}>
              <path d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} markerEnd={`url(#${markerId})`} />
              {edge.label && <text x={midX} y={midY - 8}>{edge.label}</text>}
            </g>
          );
        })}
        {content.nodes.map((node, index) => {
          const point = points[index]!;
          const visible = visibleNodeIds.has(node.id);
          const active = buildMode
            ? buildEdge?.to === node.id
            : activeStage.kind === 'node' && activeStage.nodeId === node.id;
          const label = nodeLabel(node);
          return (
            <g
              key={node.id}
              className={styles.diagramNode}
              data-visible={visible}
              data-active={active}
              data-petros-target={`${diagramId}:node:${node.id}`}
              transform={`translate(${point.x - 90} ${point.y - 34})`}
              role="button"
              tabIndex={visible ? 0 : -1}
              aria-label={`${label}. ${node.description}`}
              onClick={() => {
                if (buildMode) return;
                const index = stages.findIndex((stage) => stage.kind === 'node' && stage.nodeId === node.id);
                if (index >= 0) setStep(index);
                setPlaying(true);
              }}
              onKeyDown={(event) => {
                if (!buildMode && (event.key === 'Enter' || event.key === ' ')) {
                  const index = stages.findIndex((stage) => stage.kind === 'node' && stage.nodeId === node.id);
                  if (index >= 0) setStep(index);
                  setPlaying(true);
                }
              }}
            >
              <rect width="180" height="68" rx="16" />
              <text x="90" y="31" textAnchor="middle">{label.slice(0, 28)}</text>
              {label.length > 28 && <text x="90" y="49" textAnchor="middle">{label.slice(28, 52)}</text>}
            </g>
          );
        })}
      </svg>

      {buildMode && buildEdge && buildFrom && buildTo ? (
        <div className={styles.diagramChallenge} aria-live="polite">
          <div>
            <span>Connection {buildEdgeCount + 1}</span>
            <strong>Which relationship belongs next?</strong>
            <p>Pick a direction. Petros will animate it into place only after you commit.</p>
          </div>
          <div role="group" aria-label="Candidate concept-map connections">
            {buildEdgeCount % 2 === 0 ? (
              <>
                <button type="button" onClick={() => chooseConnection(true)}>
                  {nodeLabel(buildFrom)} <ArrowRight aria-hidden="true" /> {nodeLabel(buildTo)}
                </button>
                <button type="button" onClick={() => chooseConnection(false)}>
                  {nodeLabel(buildTo)} <ArrowRight aria-hidden="true" /> {nodeLabel(buildFrom)}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => chooseConnection(false)}>
                  {nodeLabel(buildTo)} <ArrowRight aria-hidden="true" /> {nodeLabel(buildFrom)}
                </button>
                <button type="button" onClick={() => chooseConnection(true)}>
                  {nodeLabel(buildFrom)} <ArrowRight aria-hidden="true" /> {nodeLabel(buildTo)}
                </button>
              </>
            )}
          </div>
          {challengeFeedback ? <p className={styles.challengeFeedback}>{challengeFeedback}</p> : null}
        </div>
      ) : null}

      {!buildMode && (activeNode || activeEdge) && (
        <div className={styles.diagramNarration} aria-live="polite">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>{activeNode ? `Petros is teaching: ${nodeLabel(activeNode)}` : 'Petros is following the connection'}</strong>
            <p>{narration}</p>
          </div>
        </div>
      )}

      {content.editable && !buildMode && (
        <div className={styles.diagramEditor} aria-label="Editable diagram labels">
          {content.nodes.map((node) => (
            <label key={node.id}>
              <span>{node.description}</span>
              <input
                aria-label={`Edit ${node.label}`}
                value={nodeLabel(node)}
                disabled={completed}
                onFocus={() => {
                  const index = stages.findIndex((stage) => stage.kind === 'node' && stage.nodeId === node.id);
                  if (index >= 0) setStep(index);
                }}
                onChange={(event) => onEdit(node.id, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type SnapOpening = {
  prompt?: string;
  fastestUsefulNextStep?: string;
  completeSolutionIncluded?: boolean;
};

export function PetrosRepairSession({ topic, score, source, resultId, sessionId }: SessionProps) {
  const api = useStudentApi();
  const companion = usePetrosCompanionOptional();
  const [document, setDocument] = useState<PetrosLearningSessionDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submittingQuestionId, setSubmittingQuestionId] = useState<string | null>(null);
  const [hintingQuestionId, setHintingQuestionId] = useState<string | null>(null);
  const [preparingQuestionBlockId, setPreparingQuestionBlockId] = useState<string | null>(null);
  const [submittingComposer, setSubmittingComposer] = useState(false);
  const [adaptingBlockId, setAdaptingBlockId] = useState<string | null>(null);
  const [adaptingLevel, setAdaptingLevel] = useState<'simpler' | 'deeper' | null>(null);
  const [lifecyclePending, setLifecyclePending] = useState<'pause' | 'resume' | 'close' | null>(null);
  const [continuingClosed, setContinuingClosed] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [visibleElapsed, setVisibleElapsed] = useState(0);
  const [pacePreference, setPacePreference] = useState<'full' | 'quick'>('full');
  const clockSessionId = useRef<string | null>(null);
  const expansionOfferedFor = useRef<string | null>(null);
  const requestAbort = useRef<AbortController | null>(null);
  const continueKey = useRef<string | null>(null);
  const interactionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Interaction state written locally but not yet accepted by the server. */
  const pendingInteractions = useRef(new Map<string, Record<string, unknown>>());
  const questionRepairAttempted = useRef(new Set<string>());
  const subject = sessionSubject(document?.topic ?? topic, source);

  useEffect(() => {
    const root = window.document.documentElement;
    const previousSession = root.dataset.petrosSession;
    const previousSubject = root.dataset.petrosSubject;
    root.dataset.petrosSession = 'true';
    root.dataset.petrosSubject = subject;
    return () => {
      if (previousSession) root.dataset.petrosSession = previousSession;
      else delete root.dataset.petrosSession;
      if (previousSubject) root.dataset.petrosSubject = previousSubject;
      else delete root.dataset.petrosSubject;
    };
  }, [subject]);

  const requestNext = useCallback(
    async (id: string) => {
      if (!navigator.onLine) {
        setOnline(false);
        setError(
          'You are offline. Your completed blocks are still here; reconnect to prepare the next one.',
        );
        return;
      }
      setContinuing(true);
      setError('');
      setSlow(false);
      signalPetros('thinking', `I’m tracing the next connection in ${topic}.`, 0);
      requestAbort.current?.abort();
      const controller = new AbortController();
      requestAbort.current = controller;
      continueKey.current ??= newIdempotencyKey();
      const slowTimer = setTimeout(() => setSlow(true), 4_000);
      const pollTimer = setInterval(() => {
        void api
          .get<PetrosLearningSessionDocument>(`/student/petros/sessions/${id}`, controller.signal)
          .then((latest) => setDocument(latest))
          .catch(() => undefined);
      }, 2_500);
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${id}/continue`,
          { idempotencyKey: continueKey.current },
          undefined,
          controller.signal,
        );
        continueKey.current = null;
        setDocument(next);
        signalPetros('reading', 'Next move ready — I’m leaning in with you.', 2_600);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
          setError(formatApiError(caught));
          signalPetros('retry', 'That step snagged. Your place is safe.', 3_200);
        }
      } finally {
        clearTimeout(slowTimer);
        clearInterval(pollTimer);
        setContinuing(false);
        setSlow(false);
      }
    },
    [api, topic],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    requestAbort.current = controller;
    setOnline(navigator.onLine);
    const onlineListener = () => setOnline(true);
    const offlineListener = () => setOnline(false);
    window.addEventListener('online', onlineListener);
    window.addEventListener('offline', offlineListener);

    async function start() {
      setLoading(true);
      setError('');
      try {
        let current: PetrosLearningSessionDocument;
        if (sessionId) {
          current = await api.get(`/student/petros/sessions/${sessionId}`, controller.signal);
        } else {
          throw new Error('Open Petros from a verified result, exam, document, learning path, or assistant preview.');
        }
        if (cancelled) return;
        setDocument(current);
        if (needsNextBlock(current)) void requestNext(current.id);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === 'AbortError'))
          setError(formatApiError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void start();
    return () => {
      cancelled = true;
      controller.abort();
      requestAbort.current?.abort();
      interactionTimers.current.forEach(clearTimeout);
      window.removeEventListener('online', onlineListener);
      window.removeEventListener('offline', offlineListener);
    };
  }, [api, requestNext, resultId, score, sessionId, source, topic]);

  useEffect(() => {
    if (!document) return;
    const changedSession = clockSessionId.current !== document.id;
    clockSessionId.current = document.id;
    setVisibleElapsed((current) => changedSession
      ? document.elapsedSeconds
      : Math.max(current, document.elapsedSeconds));
    let accepted = document.elapsedSeconds > 5 || document.blocks.length > 1;
    try {
      const saved = JSON.parse(localStorage.getItem(`petros:session-start:${document.id}`) ?? 'null') as {
        accepted?: boolean;
        pace?: 'full' | 'quick';
      } | null;
      accepted = accepted || saved?.accepted === true;
      if (saved?.pace === 'quick') setPacePreference('quick');
    } catch {
      // The huddle is still usable if browser storage is unavailable.
    }
    setSessionReady(accepted);
  }, [document?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!document || document.status !== 'active' || !sessionReady) return undefined;
    const timer = window.setInterval(() => setVisibleElapsed((seconds) => seconds + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [document?.status, sessionReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmSessionStart = useCallback((pace: 'full' | 'quick') => {
    if (!document) return;
    setPacePreference(pace);
    setSessionReady(true);
    try {
      localStorage.setItem(`petros:session-start:${document.id}`, JSON.stringify({ accepted: true, pace }));
    } catch {
      // Keeping this preference on this page is enough for private-browsing environments.
    }
  }, [document]);

  /*
   * Older sessions can contain a genuine learner prompt without a persisted question spec.
   * Repair it in place so the student gets the same answer, feedback, hint, and retry contract
   * as a newly planned move. The block id is also the server-side idempotency key.
   */
  useEffect(() => {
    if (!document || document.status !== 'active') return;
    const block = document.blocks.find((candidate) => candidate.status === 'current');
    if (
      !block ||
      block.questions.length > 0 ||
      !requiresAnswerBeforeProgress(block.content) ||
      questionRepairAttempted.current.has(block.id)
    )
      return;
    questionRepairAttempted.current.add(block.id);
    setPreparingQuestionBlockId(block.id);
    setError('');
    void api
      .post<PetrosLearningSessionDocument>(
        `/student/petros/sessions/${document.id}/blocks/${block.id}/question`,
        { idempotencyKey: block.id },
      )
      .then((next) => setDocument(next))
      .catch((caught) => {
        questionRepairAttempted.current.delete(block.id);
        setError(formatApiError(caught));
      })
      .finally(() => setPreparingQuestionBlockId(null));
  }, [api, document]);

  const updateInteraction = useCallback(
    (blockId: string, patch: Record<string, unknown>, immediate = false) => {
      setDocument((current) =>
        current
          ? {
              ...current,
              blocks: current.blocks.map((block) =>
                block.id === blockId
                  ? {
                      ...block,
                      interactionState: { ...block.interactionState, ...patch },
                    }
                  : block,
              ),
            }
          : current,
      );
      if (!document) return;
      const existing = interactionTimers.current.get(blockId);
      if (existing) clearTimeout(existing);
      const currentBlock = document.blocks.find((block) => block.id === blockId);
      const interactionState = { ...currentBlock?.interactionState, ...patch };
      pendingInteractions.current.set(blockId, interactionState);
      const persist = () => {
        void api
          .put(`/student/petros/sessions/${document.id}/blocks/${blockId}/interaction`, {
            interactionState,
          })
          .then(() => pendingInteractions.current.delete(blockId))
          .catch(() => undefined);
        interactionTimers.current.delete(blockId);
      };
      if (immediate) persist();
      else interactionTimers.current.set(blockId, setTimeout(persist, 500));
    },
    [api, document],
  );

  const saveBlockArtifact = useCallback(
    async (block: PetrosSessionBlock, content: PetrosArtifactContent) => {
      if (!document || !online) throw new Error('Reconnect before saving this study item.');
      const saved = await api.post<PetrosSavedArtifact>(
        `/student/petros/artifacts/sessions/${document.id}/blocks/${block.id}`,
        { idempotencyKey: newIdempotencyKey(), content },
      );
      updateInteraction(
        block.id,
        content.kind === 'note'
          ? { noteArtifactId: saved.id, requestedAction: 'note_saved' }
          : { flashcardArtifactId: saved.id, requestedAction: 'flashcard_saved' },
        true,
      );
      return saved;
    },
    [api, document, online, updateInteraction],
  );

  /**
   * A session used to die with the tab. Work typed in the last half-second sat behind the
   * debounce and was dropped, and the session itself was never paused, so it stayed
   * `active` for ever with no elapsed time recorded and no way back to it.
   *
   * `visibilitychange` flushes pending writes when the student switches away — cheap, and
   * they may not come back. `pagehide` is the real departure, so it also parks the session,
   * which is what makes it resumable rather than an orphan.
   */
  useEffect(() => {
    if (!document || document.status === 'closed') return;
    const sessionId = document.id;
    const isActive = document.status === 'active';

    const flush = () => {
      for (const [blockId, interactionState] of pendingInteractions.current) {
        const timer = interactionTimers.current.get(blockId);
        if (timer) clearTimeout(timer);
        interactionTimers.current.delete(blockId);
        api.keepalive(
          `/student/petros/sessions/${sessionId}/blocks/${blockId}/interaction`,
          { interactionState },
          'PUT',
        );
      }
      pendingInteractions.current.clear();
    };

    const onHidden = () => {
      if (window.document.visibilityState === 'hidden') flush();
    };
    const onLeave = () => {
      flush();
      // Parked, not closed: the student did not say they were finished.
      if (isActive) {
        api.keepalive(`/student/petros/sessions/${sessionId}/pause`, {
          idempotencyKey: newIdempotencyKey(),
        });
      }
    };

    window.document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [api, document]);

  const completeBlock = useCallback(
    async (block: PetrosSessionBlock) => {
      if (!document || !online) return;
      setError('');
      try {
        const completed = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/blocks/${block.id}/complete`,
          {
            idempotencyKey: newIdempotencyKey(),
            blockType: block.content.type,
            expectedBlockVersion: block.version,
            interactionState: block.interactionState,
            observedOutcome: { completed: true, stage: 3 },
          },
        );
        setDocument(completed);
        signalPetros(
          completed.status === 'closed' ? 'celebrate' : 'checkpoint',
          completed.status === 'closed' ? 'Route complete — you built this.' : 'Checkpoint locked. Keep the line moving.',
          completed.status === 'closed' ? 8_000 : 3_000,
        );
        if (completed.status === 'active') void requestNext(completed.id);
      } catch (caught) {
        setError(formatApiError(caught));
      }
    },
    [api, document, online, requestNext],
  );

  const continueClosedSession = useCallback(
    async (block: PetrosSessionBlock | null, level?: 'simpler' | 'deeper') => {
      if (!document || !online || document.status !== 'closed' || continuingClosed) return;
      setContinuingClosed(true);
      setError('');
      try {
        const focus = block?.content.title ?? document.topic;
        const direction = level === 'simpler'
          ? 'Explain it again in much simpler language, with one concrete example.'
          : level === 'deeper'
            ? 'Explain it again at a deeper level, including the mechanism and important distinctions.'
            : 'Continue from the saved session with the next useful teaching step.';
        const next = await api.post<PetrosLearningSessionDocument>('/student/petros/sessions', {
          clientRequestId: newIdempotencyKey(),
          sessionType: 'learn',
          topic: document.topic,
          goal: `${direction} Start from “${focus}”.`,
          timeBudgetSeconds: Math.max(600, Math.min(1_200, document.timeBudgetSeconds)),
          maxMoves: Math.max(3, Math.min(6, document.maxMoves)),
          learnerContext: {
            continuedFromSessionId: document.id,
            requestedExplanationLevel: level ?? 'continue',
          },
          topicContext: {
            sourceSessionId: document.id,
            sourceBlockId: block?.id ?? null,
            sourceLesson: block ? spokenLesson(block) : document.currentGoal,
          },
          sourceContext: {
            door: 'student_portal',
            referenceId: document.id,
            label: `Continued from ${document.topic}`.slice(0, 240),
          },
          profileContext: { subjectLabel: document.topic },
        });
        window.location.assign(`/petros/session?session=${next.id}`);
      } catch (caught) {
        setError(formatApiError(caught));
        setContinuingClosed(false);
      }
    },
    [api, continuingClosed, document, online],
  );

  const requestReexplanation = useCallback(
    async (block: PetrosSessionBlock, level: 'simpler' | 'deeper') => {
      if (!document || !online || adaptingBlockId) return;
      if (document.status === 'closed') {
        setAdaptingBlockId(block.id);
        setAdaptingLevel(level);
        await continueClosedSession(block, level);
        setAdaptingBlockId(null);
        setAdaptingLevel(null);
        return;
      }
      setAdaptingBlockId(block.id);
      setAdaptingLevel(level);
      setError('');
      try {
        let activeDocument = document;
        if (activeDocument.status === 'paused') {
          activeDocument = await api.post<PetrosLearningSessionDocument>(
            `/student/petros/sessions/${activeDocument.id}/resume`,
            { idempotencyKey: newIdempotencyKey() },
          );
          setDocument(activeDocument);
        }
        if (activeDocument.status !== 'active')
          throw new Error('This session could not be resumed. Use Resume and try again.');
        const queued = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${activeDocument.id}/blocks/${block.id}/reexplain`,
          {
            idempotencyKey: newIdempotencyKey(),
            level,
            expectedBlockVersion: block.version,
            interactionState: block.interactionState,
          },
        );
        setDocument(queued);
        if (queued.status === 'active') await requestNext(queued.id);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setAdaptingBlockId(null);
        setAdaptingLevel(null);
      }
    },
    [adaptingBlockId, api, continueClosedSession, document, online, requestNext],
  );

  const submitAnswer = useCallback(
    async (
      block: PetrosSessionBlock,
      questionId: string,
      answer: string,
      confidence: 'sure' | 'think_so' | 'guessing',
      responseTimeMs: number,
    ) => {
      if (!document || !online || submittingQuestionId) return;
      setSubmittingQuestionId(questionId);
      setError('');
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/blocks/${block.id}/answers`,
          {
            idempotencyKey: newIdempotencyKey(),
            questionId,
            answer,
            confidence,
            expectedBlockVersion: block.version,
            responseTimeMs,
          },
        );
        setDocument(next);
        const checkedQuestion = next.blocks
          .find((candidate) => candidate.id === block.id)
          ?.questions.find((candidate) => candidate.id === questionId);
        const latestAttempt = checkedQuestion?.attempts.at(-1);
        signalPetros(
          latestAttempt?.correctness === 'correct' ? 'correct' : 'retry',
          latestAttempt?.correctness === 'correct'
            ? 'Yes — that connection holds.'
            : 'Stay with it. Use the nudge, then take another run.',
          3_400,
        );
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setSubmittingQuestionId(null);
      }
    },
    [api, document, online, submittingQuestionId],
  );

  const requestHint = useCallback(
    async (block: PetrosSessionBlock, questionId: string) => {
      if (!document || !online || hintingQuestionId) return;
      setHintingQuestionId(questionId);
      setError('');
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/blocks/${block.id}/hint`,
          {
            idempotencyKey: newIdempotencyKey(),
            questionId,
            expectedBlockVersion: block.version,
          },
        );
        setDocument(next);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setHintingQuestionId(null);
      }
    },
    [api, document, hintingQuestionId, online],
  );

  const askLessonQuestion = useCallback(async (
    question: string,
    pausePoint?: PetrosLessonPausePoint,
  ): Promise<PetrosLessonInterruption> => {
    if (!document || !online) throw new Error('Reconnect before asking about this lesson.');
    if (submittingComposer) throw new Error('Please wait for your previous question.');
    if (question.trim().length < 2) throw new Error('Ask a complete question so Petros can answer it.');
    setSubmittingComposer(true);
    setError('');
    try {
      const next = await api.post<PetrosLearningSessionDocument>(
        `/student/petros/sessions/${document.id}/questions`,
        {
          idempotencyKey: newIdempotencyKey(),
          question: question.trim(),
          expectedSessionVersion: document.version,
          ...(pausePoint ? { pausePoint } : {}),
        },
      );
      setDocument(next);
      const detour = [...next.detours]
        .reverse()
        .find((candidate) => candidate.question === question.trim() && candidate.action === 'answer_now');
      if (!detour?.acknowledgement) {
        throw new Error('Petros kept your question, but the answer did not finish. Please try again.');
      }
      return {
        detourId: detour.id,
        question: detour.question,
        answer: detour.acknowledgement,
        returnPlan: detour.returnPlan ?? 'Return to the current explanation at the same point.',
      };
    } catch (caught) {
      setError(formatApiError(caught));
      throw caught;
    } finally {
      setSubmittingComposer(false);
    }
  }, [api, document, online, submittingComposer]);

  const resumeLessonQuestion = useCallback(async (detourId: string) => {
    if (!document || !online) throw new Error('Reconnect before returning to the lesson.');
    const next = await api.post<PetrosLearningSessionDocument>(
      `/student/petros/sessions/${document.id}/questions/${detourId}/understood`,
      { idempotencyKey: newIdempotencyKey() },
    );
    setDocument(next);
    signalPetros('reading', 'Detour resolved — picking up at the exact same line.', 3_200);
  }, [api, document, online]);

  const lifecycle = useCallback(
    async (action: 'pause' | 'resume' | 'close') => {
      if (!document || lifecyclePending) return;
      requestAbort.current?.abort();
      setLifecyclePending(action);
      setError('');
      try {
        const next = await api.post<PetrosLearningSessionDocument>(
          `/student/petros/sessions/${document.id}/${action}`,
          action === 'close'
            ? { idempotencyKey: newIdempotencyKey(), reason: 'student_stopped' }
            : { idempotencyKey: newIdempotencyKey() },
        );
        setDocument(next);
        setConfirmClose(false);
        if (action === 'resume' && needsNextBlock(next)) void requestNext(next.id);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setLifecyclePending(null);
      }
    },
    [api, document, lifecyclePending, requestNext],
  );

  const expandFiveMinute = useCallback(async () => {
    if (!document || document.sourceContext?.door !== 'five_minute') return;
    setExpanding(true);
    setError('');
    try {
      const next = await api.post<PetrosLearningSessionDocument>('/student/petros/sessions', {
        clientRequestId: newIdempotencyKey(),
        sessionType: 'learn',
        topic: document.topic,
        goal: `Continue beyond the completed five-minute session on ${document.topic}.`,
        timeBudgetSeconds: 900,
        maxMoves: 5,
        learnerContext: { expandedFromFiveMinuteSessionId: document.id },
        topicContext: { explicitExpansionAccepted: true },
        sourceContext: { door: 'student_portal', referenceId: document.id, label: 'Explicitly expanded five-minute session' },
        profileContext: { subjectLabel: document.topic },
      });
      void api.post('/student/petros/modality-events', {
        mode: 'five_minute', type: 'expansion_accepted', sessionId: document.id,
        idempotencyKey: newIdempotencyKey(),
      }).catch(() => undefined);
      window.location.assign(`/petros/session?session=${next.id}`);
    } catch (caught) {
      setError(formatApiError(caught));
      setExpanding(false);
    }
  }, [api, document]);

  const ignoreArtifactCounts = useCallback(() => undefined, []);

  const completedCount =
    document?.checkpoints.filter((checkpoint) => checkpoint.status === 'complete').length ?? 0;
  const artifactCommitReady = document?.blocks.some((block) => block.content.type === 'artifact_commit') ?? false;
  const closed = document?.status === 'closed';
  const resumeWillContinue = document?.status === 'paused' && !hasCurrentBlock(document);
  const sourceView = contextualSourceView(document, source);
  const SubjectIcon = subject === 'construction-safety' ? HardHat : Network;
  const subjectLabel = subject === 'construction-safety'
    ? 'Site safety run'
    : subject === 'machine-learning'
      ? 'Model lab'
      : 'Focus lab';
  const activeCheckpoint =
    document?.checkpoints.find((checkpoint) => checkpoint.status === 'current') ??
    document?.checkpoints.find((checkpoint) => checkpoint.status === 'pending') ??
    null;
  const currentLesson =
    document?.blocks.find((block) => block.status === 'current') ??
    document?.blocks.at(-1) ??
    null;
  const totalCheckpoints = document?.checkpoints.length ?? 0;
  const attemptStats = sessionAttemptStats(document);
  const flashcardCount = document?.blocks.filter(
    (block) => typeof block.interactionState.flashcardArtifactId === 'string',
  ).length ?? 0;
  const sessionXp = completedCount * 20 + attemptStats.correct * 10;
  const timeBudgetSeconds = document?.timeBudgetSeconds ?? 900;
  const paceRatio = timeBudgetSeconds > 0 ? visibleElapsed / timeBudgetSeconds : 0;
  const completionRatio = totalCheckpoints > 0 ? completedCount / totalCheckpoints : 0;
  const paceTone = closed
    ? 'complete'
    : document?.status === 'paused'
      ? 'paused'
      : paceRatio > Math.max(0.55, completionRatio + 0.28)
        ? 'gentle'
        : completionRatio > paceRatio + 0.3
          ? 'ahead'
          : 'steady';
  const paceLabel = paceTone === 'complete'
    ? 'Run complete'
    : paceTone === 'paused'
      ? 'Clock paused'
      : paceTone === 'gentle'
        ? 'Take the time you need'
        : paceTone === 'ahead'
          ? 'Ahead of pace'
          : 'Right on pace';
  const momentumMessage = paceTone === 'gentle'
    ? 'We’re a little beyond the plan for this step. No stress — ask me for the short version, or keep the full depth.'
    : paceTone === 'ahead'
      ? 'Nice pace. Let’s spend ten seconds checking that it actually stuck before we move.'
      : completedCount > 0
        ? `Nice — ${completedCount} down. ${activeCheckpoint?.label ? `${activeCheckpoint.label} is next.` : 'Let’s bring it home.'}`
        : 'I’ve got the clock. You do the thinking — I’ll keep this run moving.';
  const lessonNarration: PetrosLessonNarrationSegment[] = currentLesson
    ? buildPetrosLessonNarration(currentLesson)
    : [];
  usePetrosPage(
    document
      ? {
          title: currentLesson?.content.title ?? document.topic,
          summary: lessonNarration[0]?.text ?? document.currentGoal,
          narration: lessonNarration,
          // The visible teaching block is narrated and targeted locally. It is not disguised
          // as a learning-path database row, which would give the context resolver a false id.
          candidates: [],
          onAsk: askLessonQuestion,
          onResumeQuestion: resumeLessonQuestion,
        }
      : null,
  );
  useEffect(() => {
    if (!document) return;
    window.dispatchEvent(new CustomEvent('petros:session-pulse', {
      detail: {
        mastered: completedCount,
        total: totalCheckpoints,
        xp: sessionXp,
        streak: attemptStats.streak,
        flashcards: flashcardCount,
        elapsedLabel: formatSessionTime(visibleElapsed),
        paceLabel,
      },
    }));
  }, [attemptStats.streak, completedCount, document, flashcardCount, paceLabel, sessionXp, totalCheckpoints, visibleElapsed]);
  const isFiveMinute = document?.sourceContext?.door === 'five_minute';
  useEffect(() => {
    if (!document || !closed || !isFiveMinute || expansionOfferedFor.current === document.id) return;
    expansionOfferedFor.current = document.id;
    const startedAt = new Date(document.createdAt).getTime();
    const finishedAt = new Date(document.updatedAt).getTime();
    const durationMs = Number.isFinite(startedAt) && Number.isFinite(finishedAt)
      ? Math.max(0, finishedAt - startedAt)
      : undefined;
    void api.post('/student/petros/modality-events', {
      mode: 'five_minute',
      type: 'expansion_offered',
      sessionId: document.id,
      durationMs,
      // The session id makes the offer idempotent across refreshes and devices.
      idempotencyKey: document.id,
    }).catch(() => undefined);
  }, [api, closed, document, isFiveMinute]);
  let snapOpening: SnapOpening | null = null;
  if (document?.sourceContext?.door === 'snap_question') {
    try {
      snapOpening = JSON.parse(sessionStorage.getItem(`petros:snap-opening:${document.id}`) ?? 'null') as SnapOpening | null;
    } catch {
      snapOpening = null;
    }
  }

  if (loading && !document) return <SessionLoading topic={topic} subject={subject} />;

  return (
    <div className={styles.shell} data-subject={subject}>
      <header className={styles.stickyHeader}>
        <div className={styles.headerRow}>
          <Link href={sourceView.returnHref} className={styles.back}>
            <ArrowLeft aria-hidden="true" /> {sourceView.returnLabel}
          </Link>
          <div className={styles.identity}>
            <span>
              <SubjectIcon aria-hidden="true" />
            </span>
            <div>
              <strong>Petros</strong>
              <small>{subjectLabel} · {sourceView.sessionLabel} · {document?.topic ?? topic}</small>
            </div>
          </div>
          <div className={styles.sessionControls}>
            {document?.status === 'closed' ? (
              <button
                className={styles.pause}
                data-action="continue"
                disabled={!online || continuingClosed}
                aria-busy={continuingClosed}
                data-loading-indicator={continuingClosed || undefined}
                onClick={() => void continueClosedSession(currentLesson)}
              >
                {continuingClosed ? (
                  <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}
                {continuingClosed ? 'Opening…' : 'Continue learning'}
              </button>
            ) : document?.status === 'paused' ? (
              <button
                className={styles.pause}
                data-action="resume"
                disabled={lifecyclePending !== null}
                aria-busy={lifecyclePending === 'resume'}
                data-loading-indicator={lifecyclePending === 'resume' || undefined}
                onClick={() => void lifecycle('resume')}
              >
                {lifecyclePending === 'resume' ? (
                  <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
                ) : (
                  <Play aria-hidden="true" />
                )}{' '}
                {lifecyclePending === 'resume'
                  ? 'Resuming…'
                  : resumeWillContinue
                    ? 'Resume and continue'
                    : 'Resume'}
              </button>
            ) : (
              <button
                className={styles.pause}
                data-action="pause"
                disabled={!document || lifecyclePending !== null}
                aria-busy={lifecyclePending === 'pause'}
                data-loading-indicator={lifecyclePending === 'pause' || undefined}
                onClick={() => void lifecycle('pause')}
              >
                {lifecyclePending === 'pause' ? (
                  <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
                ) : (
                  <Pause aria-hidden="true" />
                )}{' '}
                {lifecyclePending === 'pause' ? 'Saving…' : 'Save and pause'}
              </button>
            )}
            <button
              className={styles.closeButton}
              disabled={!document || closed}
              aria-label="Close session"
              title="Finish this session"
              onClick={() => setConfirmClose(true)}
            >
              <Square aria-hidden="true" />
              <span>Finish</span>
            </button>
          </div>
        </div>
        <div className={styles.progressRow}>
          <div className={styles.progressMain}>
            <SessionTrail
              checkpoints={document?.checkpoints ?? Array.from({ length: 5 }, (_, index) => ({
                id: String(index),
                label: `Step ${index + 1}`,
                status: 'pending' as const,
              }))}
              completedCount={completedCount}
            />
            <p className={styles.progressCaption}>
              Step {Math.min(completedCount + 1, document?.checkpoints.length ?? 1)} of{' '}
              {document?.checkpoints.length ?? 1}
              {activeCheckpoint?.label ? ` · ${activeCheckpoint.label}` : ''}
            </p>
          </div>
          <div className={styles.sessionScoreboard} aria-label="Session momentum">
            <span title="Concepts checked off"><Target aria-hidden="true" /><strong>{completedCount}/{totalCheckpoints || 1}</strong> mastered</span>
            <span title="Session points"><Trophy aria-hidden="true" /><strong>{sessionXp}</strong> XP</span>
            <span title="Correct-answer streak"><Flame aria-hidden="true" /><strong>{attemptStats.streak}</strong> streak</span>
            <Link href="/flashcards" title="Open session flashcards"><CreditCard aria-hidden="true" /><strong>{flashcardCount}</strong> cards</Link>
            <span data-pace={paceTone}><Gauge aria-hidden="true" /><strong>{formatSessionTime(visibleElapsed)}</strong> {paceLabel}</span>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <article className={styles.document} aria-live="polite">
          <section className={styles.opening}>
            <h1>{document?.topic ?? topic}</h1>
            <p>{document?.currentGoal ?? `A focused session on ${topic}.`}</p>
            <div className={styles.goal}>
              <Clock3 aria-hidden="true" />
              <span>
                <strong>
                  {Math.ceil((document?.timeBudgetSeconds ?? 480) / 60)} minute session
                </strong>{' '}
                · {document?.maxMoves ?? 4} steps
              </span>
            </div>
          </section>

          {!sessionReady && document && !closed ? (
            <SessionStartHuddle
              minutes={Math.ceil(document.timeBudgetSeconds / 60)}
              checkpoints={document.checkpoints.length}
              onStart={confirmSessionStart}
            />
          ) : null}

          {sessionReady && document && !closed ? (
            <section className={styles.momentum} data-pace={paceTone} aria-live="polite">
              <span><Sparkles aria-hidden="true" /></span>
              <div>
                <strong>{pacePreference === 'quick' ? 'Quick-pass mode' : 'Petros pace check'}</strong>
                <p>{momentumMessage}</p>
              </div>
              {paceTone === 'gentle' ? (
                <div>
                  <button type="button" onClick={() => setPacePreference('full')}>Keep the full depth</button>
                  <button type="button" onClick={() => companion?.openWith('Give me the short version of this step, then quiz me once.')}>Use the short version</button>
                </div>
              ) : null}
            </section>
          ) : null}

          {/*
            Everything from here to the teaching blocks is context, not the lesson: sources,
            the privacy summary, and status notices. Grouping it lets it recede as a block
            rather than stacking full-weight cards between the student and the first move.
          */}
          <div className={styles.advisories}>
          {sourceView.citations.length ? (
            <section className={styles.sourceStrip} aria-label="Session sources">
              <span className={styles.sourceStripLead}>
                <ShieldCheck aria-hidden="true" />
                <strong>Source checked</strong>
              </span>
              <span className={styles.sourceChips}>
                {sourceView.citations.slice(0, 3).map((citation) => (
                  <span key={`${citation.label}:${citation.page ?? citation.section ?? ''}`}>
                    {citation.label}{citation.page ? ` · p. ${citation.page}` : ''}{citation.section ? ` · ${citation.section}` : ''}
                  </span>
                ))}
                {sourceView.citations.length > 3 ? (
                  <span>+{sourceView.citations.length - 3} more</span>
                ) : null}
              </span>
            </section>
          ) : null}
          {snapOpening && (
            <section className={styles.grounding} aria-label="Photographed question opening">
              <strong>{snapOpening.prompt}</strong>
              <span>Fastest useful next step: {snapOpening.fastestUsefulNextStep}</span>
              <span>No complete solution is shown before this teaching step.</span>
            </section>
          )}
          {document?.institutionalPolicy ? (
            <InstitutionalPolicyPanel document={document} />
          ) : null}

          {!online && (
            <StatusBanner
              icon={WifiOff}
              tone="warning"
              title="You are offline"
              body="Everything already shown remains readable. Reconnect to complete or prepare another block."
            />
          )}
          {error && (
            <StatusBanner
              icon={CircleHelp}
              tone="warning"
              title="This teaching action did not finish"
              body={error}
              action={
                document && online ? (
                  <button onClick={() => void requestNext(document.id)}>Try again</button>
                ) : undefined
              }
            />
          )}
          {confirmClose && (
            <StatusBanner
              icon={Square}
              tone="warning"
              title="Close this session?"
              action={
                <>
                  <button onClick={() => void lifecycle('close')}>Close session</button>
                  <button onClick={() => setConfirmClose(false)}>Keep learning</button>
                </>
              }
            />
          )}

          </div>

          {document?.detours.map((detour) => (
            <DetourBanner key={detour.id} detour={detour} />
          ))}

          {document?.blocks.map((block, index) => (
            <TeachingBlock
              key={block.id}
              block={block}
              live={index === (document?.blocks.length ?? 0) - 1}
              onInteraction={(patch, immediate) => updateInteraction(block.id, patch, immediate)}
              onSaveArtifact={(content) => saveBlockArtifact(block, content)}
              onReexplain={(level) => void requestReexplanation(block, level)}
              adaptingLevel={adaptingBlockId === block.id ? adaptingLevel : null}
              adaptationDisabled={!online || continuing || continuingClosed}
              sessionPaused={document.status === 'paused'}
              sessionClosed={document.status === 'closed'}
              topic={document.topic}
            >
              <BlockContent
                block={block}
                onInteraction={(patch, immediate) => updateInteraction(block.id, patch, immediate)}
                onComplete={() => void completeBlock(block)}
                onAnswer={(questionId, answer, confidence, responseTimeMs) =>
                  void submitAnswer(block, questionId, answer, confidence, responseTimeMs)
                }
                onHint={(questionId) => void requestHint(block, questionId)}
                submittingQuestionId={submittingQuestionId}
                hintingQuestionId={hintingQuestionId}
                preparingQuestion={preparingQuestionBlockId === block.id}
                hasRemainingCheckpoint={document.checkpoints.some(
                  (checkpoint) => checkpoint.status === 'pending',
                )}
              />
            </TeachingBlock>
          ))}

          {document && artifactCommitReady && (
            <PetrosArtifactCuration sessionId={document.id} onCounts={ignoreArtifactCounts} />
          )}

          {continuing && (
            <BlockSkeleton
              expected={document?.expectedMoveType ?? null}
              slow={slow}
              topic={document?.topic ?? topic}
              checkpoint={activeCheckpoint?.label ?? null}
              sourceHint={sourceView.citations[0]
                ? `${sourceView.citations[0].label}${sourceView.citations[0].page ? ` · page ${sourceView.citations[0].page}` : ''}`
                : sourceView.heading}
            />
          )}
          {!loading && document && document.blocks.length === 0 && !continuing && !error && (
            <StatusBanner
              icon={BookOpen}
              tone="neutral"
              title="This session is ready for its first block"
              body="Prepare one teaching move from the current goal and result context."
              action={<button onClick={() => void requestNext(document.id)}>Start the loop</button>}
            />
          )}

          {closed && (
            <section className={styles.close}>
              <div>
                <span>
                  <Check aria-hidden="true" />
                </span>
                <div>
                  <p>Session closed · {document.closeReason?.replace(/_/g, ' ')}</p>
                  <h2>Session saved.</h2>
                </div>
              </div>
              <SessionFinale
                document={document}
                baseXp={sessionXp}
                elapsedSeconds={visibleElapsed || document.elapsedSeconds}
                flashcards={flashcardCount}
              />
              {isFiveMinute && (
                <button type="button" disabled={expanding} aria-busy={expanding} onClick={() => void expandFiveMinute()}>
                  {expanding ? 'Opening…' : 'Choose a full session'} <ArrowRight aria-hidden="true" />
                </button>
              )}
              <Link href={sourceView.returnHref} onClick={() => {
                if (document?.sourceContext && typeof document.sourceContext.intentId === 'string') {
                  void api.post(`/student/petros/intents/${document.sourceContext.intentId}/events`, {
                    event: 'returned', idempotencyKey: newIdempotencyKey(), sessionId: document.id,
                  }).catch(() => undefined);
                }
              }}>
                {/^(back|return) to\b/i.test(sourceView.returnLabel)
                  ? sourceView.returnLabel
                  : `Return to ${sourceView.returnLabel.toLowerCase()}`}{' '}
                <ArrowRight aria-hidden="true" />
              </Link>
            </section>
          )}

        </article>
      </div>
    </div>
  );
}

function SessionStartHuddle({
  minutes,
  checkpoints,
  onStart,
}: {
  minutes: number;
  checkpoints: number;
  onStart: (pace: 'full' | 'quick') => void;
}) {
  return (
    <section className={styles.startHuddle} aria-labelledby="session-huddle-title">
      <div className={styles.huddleMark}><Sparkles aria-hidden="true" /></div>
      <div className={styles.huddleCopy}>
        <span>30-second huddle</span>
        <h2 id="session-huddle-title">What does “done” look like today?</h2>
        <p>
          Build and check {checkpoints} ideas, then finish with a 75-second recall lap. I’ll keep
          the pace gentle and your place safe if you stop to ask something.
        </p>
        <div className={styles.huddleRules}>
          <span><Clock3 aria-hidden="true" /> {minutes} min target</span>
          <span><ShieldCheck aria-hidden="true" /> Every claim stays cited</span>
          <span><MessageSquareText aria-hidden="true" /> Detours return here</span>
        </div>
      </div>
      <div className={styles.huddleActions}>
        <button type="button" onClick={() => onStart('full')}>I’m in — start the run <ArrowRight aria-hidden="true" /></button>
        <button type="button" onClick={() => onStart('quick')}>Keep it to the essentials</button>
        <small>Starting acknowledges the privacy and learning rules shown with this session.</small>
      </div>
    </section>
  );
}

function SessionFinale({
  document,
  baseXp,
  elapsedSeconds,
  flashcards,
}: {
  document: PetrosLearningSessionDocument;
  baseXp: number;
  elapsedSeconds: number;
  flashcards: number;
}) {
  const items = React.useMemo(() => finalRecallItems(document), [document]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [remembered, setRemembered] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(75);
  const [copied, setCopied] = useState(false);
  const done = items.length === 0 || index >= items.length;
  const item = items[index];
  const finalXp = baseXp + remembered * 15;

  useEffect(() => {
    signalPetros('celebrate', `You finished the ${document.topic} route.`, 8_000);
  }, [document.topic]);

  useEffect(() => {
    if (done || secondsLeft <= 0) return undefined;
    const timer = window.setInterval(() => setSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [done, secondsLeft]);

  const rate = (gotIt: boolean) => {
    if (gotIt) setRemembered((count) => count + 1);
    setIndex((current) => current + 1);
    setDraft('');
    setRevealed(false);
  };

  const copyRecap = async () => {
    const summary = [
      `Petros session: ${document.topic}`,
      `${document.checkpoints.filter((checkpoint) => checkpoint.status === 'complete').length}/${document.checkpoints.length} concepts checked`,
      `${remembered}/${items.length || 1} recalled without notes`,
      `${finalXp} XP · ${formatSessionTime(elapsedSeconds)} · ${flashcards} flashcards`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!done && item) {
    return (
      <div className={styles.finalRecall} data-phase="quiz">
        <div className={styles.recallHeader}>
          <div>
            <span>Final recall · question {index + 1} of {items.length}</span>
            <strong>Close the notes. Bring it back yourself.</strong>
          </div>
          <time><Clock3 aria-hidden="true" /> {formatSessionTime(secondsLeft)}</time>
        </div>
        <p className={styles.recallQuestion}>{item.question}</p>
        <textarea
          aria-label="Your final recall answer"
          value={draft}
          maxLength={1_000}
          placeholder="One or two lines is enough…"
          onChange={(event) => setDraft(event.target.value)}
        />
        {!revealed ? (
          <button type="button" disabled={draft.trim().length < 3} onClick={() => setRevealed(true)}>
            Compare with the source <ArrowRight aria-hidden="true" />
          </button>
        ) : (
          <div className={styles.recallReveal}>
            <div><span>Your recall</span><p>{draft}</p></div>
            <div><span>Grounded answer</span><p>{item.answer}</p><small>Grounded in {item.source}</small></div>
            <footer>
              <span>Be honest — this only tunes your next review.</span>
              <button type="button" onClick={() => rate(false)}>Review once more</button>
              <button type="button" onClick={() => rate(true)}><Check aria-hidden="true" /> Got it</button>
            </footer>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.finalRecall} data-phase="complete">
      <div className={styles.confetti} aria-hidden="true">
        {Array.from({ length: 14 }, (_, confettiIndex) => <i key={confettiIndex} />)}
      </div>
      <div className={styles.finaleTitle}>
        <span><PartyPopper aria-hidden="true" /></span>
        <div>
          <small>Run complete</small>
          <strong>You earned this one.</strong>
          <p>{remembered}/{items.length || 1} ideas recalled without notes</p>
        </div>
      </div>
      <div className={styles.recapStats}>
        <span><Trophy aria-hidden="true" /><strong>{finalXp}</strong> XP</span>
        <span><Target aria-hidden="true" /><strong>{document.checkpoints.length}</strong> concepts</span>
        <span><Clock3 aria-hidden="true" /><strong>{formatSessionTime(elapsedSeconds)}</strong> time</span>
        <span><CreditCard aria-hidden="true" /><strong>{flashcards}</strong> cards</span>
      </div>
      <button type="button" className={styles.copyRecap} onClick={() => void copyRecap()}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Recap copied' : 'Copy my win'}
      </button>
    </div>
  );
}

function TeachingBlock({
  block,
  onInteraction,
  onSaveArtifact,
  onReexplain,
  adaptingLevel,
  adaptationDisabled,
  sessionPaused,
  sessionClosed,
  topic,
  live,
  children,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
  onSaveArtifact: (content: PetrosArtifactContent) => Promise<PetrosSavedArtifact>;
  onReexplain: (level: 'simpler' | 'deeper') => void;
  adaptingLevel: 'simpler' | 'deeper' | null;
  adaptationDisabled: boolean;
  sessionPaused: boolean;
  sessionClosed: boolean;
  topic: string;
  /** The move the student is on. Earlier moves stay readable but recede. */
  live?: boolean;
  children: ReactNode;
}) {
  const Icon = iconFor(block.content.type);
  const showWhy = block.interactionState.whyOpen === true;
  return (
    <section
      className={styles.block}
      data-complete={block.status === 'completed'}
      data-live={live || undefined}
      data-block-type={block.content.type}
      data-petros-target={live ? 'lesson:current' : `lesson:block:${block.id}`}
    >
      <div className={styles.blockHead}>
        <span>
          <Icon aria-hidden="true" />
        </span>
        <div>
          <p>
            {labelFor(block.content.type)}
          </p>
          <h2 data-petros-target={petrosLessonTarget(block.id, 'title')}>{block.content.title}</h2>
        </div>
        <div className={styles.blockHeadActions}>
          {block.status === 'completed' ? <span><Check aria-hidden="true" /> +20 XP</span> : null}
          <button
            aria-expanded={showWhy}
            aria-controls={`why-${block.id}`}
            onClick={() => onInteraction({ whyOpen: !showWhy }, true)}
          >
            Why this step?
          </button>
        </div>
      </div>
      {showWhy && (
        <div id={`why-${block.id}`} className={styles.why}>
          {block.whyThis.trim() || studentFriendlyWhy(block.content.type, block.whyThis)}
        </div>
      )}
      <div className={styles.blockBody}>
        {children}
        <BlockActions
          block={block}
          onSaveArtifact={onSaveArtifact}
          onReexplain={onReexplain}
          adaptingLevel={adaptingLevel}
          adaptationDisabled={adaptationDisabled}
          sessionPaused={sessionPaused}
          sessionClosed={sessionClosed}
          topic={topic}
        />
      </div>
    </section>
  );
}

function BlockContent({
  block,
  onInteraction,
  onComplete,
  onAnswer,
  onHint,
  submittingQuestionId,
  hintingQuestionId,
  preparingQuestion,
  hasRemainingCheckpoint,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
  onComplete: () => void;
  onAnswer: (
    questionId: string,
    answer: string,
    confidence: 'sure' | 'think_so' | 'guessing',
    responseTimeMs: number,
  ) => void;
  onHint: (questionId: string) => void;
  submittingQuestionId: string | null;
  hintingQuestionId: string | null;
  preparingQuestion: boolean;
  hasRemainingCheckpoint: boolean;
}) {
  const content = block.content;
  const completed = block.status === 'completed';
  const recovered =
    block.questions.length === 0 ||
    [...new Set(block.questions.map((question) => question.equivalenceKey))].every((key) =>
      block.questions.some(
        (question) =>
          question.equivalenceKey === key &&
          question.attempts.some((attempt) => attempt.correctness === 'correct'),
      ),
    );
  const questions = block.questions.length ? (
    <QuestionStack
      block={block}
      onInteraction={onInteraction}
      onAnswer={onAnswer}
      onHint={onHint}
      submittingQuestionId={submittingQuestionId}
      hintingQuestionId={hintingQuestionId}
    />
  ) : null;
  if (
    !completed &&
    block.questions.length === 0 &&
    requiresAnswerBeforeProgress(content)
  ) {
    return <AnswerCheckPreparing busy={preparingQuestion} />;
  }
  if (content.type === 'layered_explanation') {
    const expanded = Array.isArray(block.interactionState.expandedLayerIds)
      ? block.interactionState.expandedLayerIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const layerPredictions = isRecord(block.interactionState.layerPredictions)
      ? block.interactionState.layerPredictions
      : {};
    const revealedLayerIds = Array.isArray(block.interactionState.revealedLayerIds)
      ? block.interactionState.revealedLayerIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const keyIdeaResponse = typeof block.interactionState.keyIdeaResponse === 'string'
      ? block.interactionState.keyIdeaResponse
      : '';
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p
              className={styles.explanation}
              data-petros-target={petrosLessonTarget(block.id, 'first-layer')}
            >
              <PetrosNarratedText
                text={content.firstLayer}
                targetKey={petrosLessonTarget(block.id, 'first-layer')}
              />
            </p>
            {content.deeperLayers.length > 1 ? (
              <div className={styles.ideaBlueprint} aria-label="Shape of this explanation">
                <span><Network aria-hidden="true" /> Idea blueprint</span>
                <ol>
                  {content.deeperLayers.slice(0, 4).map((layer, index) => (
                    <li key={layer.id} data-open={expanded.includes(layer.id) || undefined}>
                      <i>{index + 1}</i>
                      <strong>{layer.label}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div className={styles.layers}>
              {content.deeperLayers.map((layer) => {
                const open = expanded.includes(layer.id);
                const prediction = typeof layerPredictions[layer.id] === 'string'
                  ? String(layerPredictions[layer.id])
                  : '';
                const revealed = completed || revealedLayerIds.includes(layer.id);
                return (
                  <div key={layer.id}>
                    <button
                      aria-expanded={open}
                      onClick={() =>
                        onInteraction(
                          {
                            expandedLayerIds: open
                              ? expanded.filter((id) => id !== layer.id)
                              : [...expanded, layer.id],
                          },
                          true,
                        )
                      }
                    >
                      <Layers3 aria-hidden="true" /> {layer.label}
                      <ChevronRight aria-hidden="true" />
                    </button>
                    {open && !revealed ? (
                      <div className={styles.predictionGate}>
                        <span><Brain aria-hidden="true" /> Predict before Petros reveals</span>
                        <label htmlFor={`prediction-${block.id}-${layer.id}`}>
                          In one sentence, what do you think “{layer.label}” means?
                        </label>
                        <textarea
                          id={`prediction-${block.id}-${layer.id}`}
                          value={prediction}
                          maxLength={500}
                          placeholder="My best guess is…"
                          onChange={(event) => onInteraction({
                            layerPredictions: { ...layerPredictions, [layer.id]: event.target.value },
                          })}
                        />
                        <div>
                          <button
                            type="button"
                            disabled={prediction.trim().length < 3}
                            onClick={() => onInteraction({
                              layerPredictions: { ...layerPredictions, [layer.id]: prediction.trim() },
                              revealedLayerIds: [...revealedLayerIds, layer.id],
                            }, true)}
                          >
                            Lock in my prediction <ArrowRight aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onInteraction({
                              layerPredictions: { ...layerPredictions, [layer.id]: 'I was not sure yet.' },
                              revealedLayerIds: [...revealedLayerIds, layer.id],
                            }, true)}
                          >
                            I’m not sure — reveal
                          </button>
                        </div>
                      </div>
                    ) : open ? (
                      <div className={styles.predictionCompare}>
                        <div>
                          <span>Your prediction</span>
                          <p>{prediction || 'You opened this before prediction mode was added.'}</p>
                        </div>
                        <div data-petros-target={petrosLessonTarget(block.id, `layer:${layer.id}`)}>
                          <span>Petros’s explanation</span>
                          <p>
                            <PetrosNarratedText
                              text={layer.content}
                              targetKey={petrosLessonTarget(block.id, `layer:${layer.id}`)}
                            />
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'key-idea')} data-checkpoint="true">
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>{completed ? 'Checkpoint cleared · +20 XP' : 'Checkpoint · make it stick'}</strong>
                <p>
                  <PetrosNarratedText
                    text={content.keyIdea}
                    targetKey={petrosLessonTarget(block.id, 'key-idea')}
                  />
                </p>
                {!completed && block.questions.length === 0 ? (
                  <label className={styles.keyIdeaResponse}>
                    Put the idea into your own words before moving on.
                    <input
                      value={keyIdeaResponse}
                      maxLength={500}
                      placeholder="The important relationship is…"
                      onChange={(event) => onInteraction({ keyIdeaResponse: event.target.value })}
                    />
                  </label>
                ) : null}
              </div>
            </div>
            <Grounding content={content} />
            {!completed && (
              <CompleteButton
                onClick={onComplete}
                disabled={block.questions.length === 0 && keyIdeaResponse.trim().length < 8}
                ariaLabel="I have the key idea"
              >
                Claim 20 XP &amp; continue
              </CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'worked_example') {
    const revealed = Math.max(1, Number(block.interactionState.revealedStepCount ?? 1));
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'problem')}>
              <PetrosNarratedText
                text={content.problemStatement}
                targetKey={petrosLessonTarget(block.id, 'problem')}
              />
            </p>
            <div className={styles.steps}>
              {content.steps.map((step, index) => (
                <Step
                  key={step.id}
                  number={index + 1}
                  title={step.title}
                  body={step.explanation}
                  prediction={step.predictionPrompt}
                  visible={index < revealed}
                  targetKey={petrosLessonTarget(block.id, `step:${step.id}`)}
                />
              ))}
            </div>
            {revealed < content.steps.length ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealedStepCount: revealed + 1 }, true)}
              >
                Predict the next step, then reveal <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <>
                <div className={styles.finalCheck} data-petros-target={petrosLessonTarget(block.id, 'final-check')}>
                  <strong>Final check</strong>
                  <p>
                    <PetrosNarratedText
                      text={content.finalCheck}
                      targetKey={petrosLessonTarget(block.id, 'final-check')}
                    />
                  </p>
                </div>
                {!completed && (
                  <CompleteButton onClick={onComplete}>Finish this example</CompleteButton>
                )}
              </>
            )}
            <Grounding content={content} />
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'recall_check') {
    return (
      <>
        <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'instructions')}>
          <PetrosNarratedText
            text={content.instructions}
            targetKey={petrosLessonTarget(block.id, 'instructions')}
          />
        </p>
        {questions}
        {completed ? (
          <div className={styles.submitted}>
            <Check aria-hidden="true" /> {content.feedback.submittedMessage}
          </div>
        ) : (
          <CompleteButton onClick={onComplete} disabled={!recovered}>
            Complete this check
          </CompleteButton>
        )}
        <p className={styles.helper}>{content.feedback.stageBoundary}</p>
      </>
    );
  }
  if (content.type === 'hook' || content.type === 'predict_then_reveal') {
    const revealed = block.interactionState.revealed === true;
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'prompt')}>
              <PetrosNarratedText
                text={content.prompt}
                targetKey={petrosLessonTarget(block.id, 'prompt')}
              />
            </p>
            {!revealed ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealed: true }, true)}
              >
                Show the connection <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'reveal')}>
                <Lightbulb aria-hidden="true" />
                <div>
                  <strong>{content.type === 'hook' ? 'Why this matters' : 'What happens'}</strong>
                  <p>
                    <PetrosNarratedText
                      text={content.reveal}
                      targetKey={petrosLessonTarget(block.id, 'reveal')}
                    />
                  </p>
                  {content.type === 'hook' && !isGenericAnchor(content.anchor) ? (
                    <small data-petros-target={petrosLessonTarget(block.id, 'anchor')}>
                      <PetrosNarratedText
                        text={content.anchor}
                        targetKey={petrosLessonTarget(block.id, 'anchor')}
                      />
                    </small>
                  ) : content.type !== 'hook' ? (
                    <small data-petros-target={petrosLessonTarget(block.id, 'explanation')}>
                      <PetrosNarratedText
                        text={content.explanation}
                        targetKey={petrosLessonTarget(block.id, 'explanation')}
                      />
                    </small>
                  ) : null}
                </div>
              </div>
            )}
            {!completed && revealed && (
              <CompleteButton onClick={onComplete}>Keep going</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'prerequisite_check') {
    return (
      <>
        <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'instructions')}>
          <PetrosNarratedText
            text={content.instructions}
            targetKey={petrosLessonTarget(block.id, 'instructions')}
          />
        </p>
        <div className={styles.layers}>
          {content.prerequisites.map((prerequisite) => (
            <div key={prerequisite.key}>
              <p>{prerequisite.label}</p>
            </div>
          ))}
        </div>
        {questions}
        <p className={styles.helper}>{content.detourMessage}</p>
        {!completed && (
          <CompleteButton onClick={onComplete} disabled={!recovered}>
            Finish the foundation check
          </CompleteButton>
        )}
      </>
    );
  }
  if (content.type === 'goal_frame') {
    return (
      <>
        <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'goal')}>
          <Target aria-hidden="true" />
          <div>
            <strong>{content.timeEstimateMinutes} minute target</strong>
            <p>
              <PetrosNarratedText
                text={content.goal}
                targetKey={petrosLessonTarget(block.id, 'goal')}
              />
            </p>
          </div>
        </div>
        <ol className={styles.steps}>
          {content.checkpoints.map((checkpoint, index) => (
            <Step
              key={checkpoint}
              number={index + 1}
              title={checkpoint}
              body="A bounded checkpoint in this session."
              visible
              targetKey={petrosLessonTarget(block.id, `checkpoint:${index}`)}
            />
          ))}
        </ol>
        {!completed && <CompleteButton onClick={onComplete}>Start with this target</CompleteButton>}
      </>
    );
  }
  if (content.type === 'analogy') {
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'analogy')}>
              {content.targetIdea} through {content.familiarDomain}
            </p>
            <div className={styles.steps}>
              {content.mappings.map((mapping, index) => (
                <Step
                  key={`${mapping.familiar}-${mapping.target}`}
                  number={index + 1}
                  title={mapping.familiar}
                  body={`Maps to: ${mapping.target}`}
                  visible
                  targetKey={petrosLessonTarget(block.id, `mapping:${index}`)}
                />
              ))}
            </div>
            <div className={styles.finalCheck} data-petros-target={petrosLessonTarget(block.id, 'limit')}>
              <strong>Where the analogy stops</strong>
              <p>{content.limit}</p>
            </div>
            {!completed && (
              <CompleteButton onClick={onComplete}>I can use—and limit—the analogy</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'story') {
    const revealed = Math.max(1, Number(block.interactionState.revealedEventCount ?? 1));
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'setup')}>
              <PetrosNarratedText
                text={content.setup}
                targetKey={petrosLessonTarget(block.id, 'setup')}
              />
            </p>
            <div className={styles.steps}>
              {content.events.map((event, index) => (
                <Step
                  key={event.id}
                  number={index + 1}
                  title={event.label}
                  body={event.detail}
                  visible={index < revealed}
                  targetKey={petrosLessonTarget(block.id, `event:${event.id}`)}
                />
              ))}
            </div>
            {revealed < content.events.length ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealedEventCount: revealed + 1 }, true)}
              >
                Continue the causal thread <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'takeaway')}>
                <Flag aria-hidden="true" />
                <div>
                  <strong>Causal thread</strong>
                  <p>
                    <PetrosNarratedText
                      text={content.takeaway}
                      targetKey={petrosLessonTarget(block.id, 'takeaway')}
                    />
                  </p>
                </div>
              </div>
            )}
            {!completed && revealed >= content.events.length && (
              <CompleteButton onClick={onComplete}>I can trace the thread</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'derivation') {
    const revealed = Math.max(1, Number(block.interactionState.revealedStepCount ?? 1));
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <div className={styles.finalCheck} data-petros-target={petrosLessonTarget(block.id, 'assumptions')}>
              <strong>Starting assumptions</strong>
              <p>{content.startingAssumptions.join(' · ')}</p>
            </div>
            <div className={styles.steps}>
              {content.steps.map((step, index) => (
                <Step
                  key={step.id}
                  number={index + 1}
                  title={step.expression}
                  body={step.explanation}
                  visible={index < revealed}
                  targetKey={petrosLessonTarget(block.id, `step:${step.id}`)}
                />
              ))}
            </div>
            {revealed < content.steps.length ? (
              <button
                className={styles.reveal}
                onClick={() => onInteraction({ revealedStepCount: revealed + 1 }, true)}
              >
                Predict the transformation, then reveal <ChevronRight aria-hidden="true" />
              </button>
            ) : (
              <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'conclusion')}>
                <Lightbulb aria-hidden="true" />
                <div>
                  <strong>Conclusion</strong>
                  <p>
                    <PetrosNarratedText
                      text={content.conclusion}
                      targetKey={petrosLessonTarget(block.id, 'conclusion')}
                    />
                  </p>
                </div>
              </div>
            )}
            {!completed && revealed >= content.steps.length && (
              <CompleteButton onClick={onComplete}>I can justify each step</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'diagram') {
    const expanded = block.interactionState.diagramExpanded === true;
    const edited = isRecord(block.interactionState.diagramNodeLabels)
      ? block.interactionState.diagramNodeLabels
      : {};
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <AnimatedDiagram
              blockId={block.id}
              content={content}
              labels={edited}
              interactionState={block.interactionState}
              expanded={expanded}
              completed={completed}
              onInteraction={onInteraction}
              onEdit={(nodeId, label) =>
                onInteraction({
                  diagramNodeLabels: {
                    ...edited,
                    [nodeId]: label,
                  },
                })
              }
            />
            <button
              className={styles.reveal}
              aria-pressed={expanded}
              onClick={() => onInteraction({ diagramExpanded: !expanded }, true)}
            >
              {expanded ? 'Fit diagram to block' : 'Open diagram larger'}{' '}
              <ChevronRight aria-hidden="true" />
            </button>
            <details className={styles.feedbackWhy}>
              <summary>Nonvisual description</summary>
              <p>{content.altText}</p>
              <pre>{content.fallbackText}</pre>
            </details>
            {!completed && (
              <CompleteButton
                onClick={onComplete}
                disabled={content.diagramType === 'concept_map' && block.interactionState.diagramBuilt !== true}
              >
                {content.diagramType === 'concept_map' && block.interactionState.diagramBuilt !== true
                  ? 'Build every connection to continue'
                  : 'Keep this edited diagram in the session'}
              </CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'contrast_case') {
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <div className={styles.contrastGrid}>
              {[content.left, content.right].map((item, index) => (
                <section
                  data-petros-target={petrosLessonTarget(block.id, index === 0 ? 'left' : 'right')}
                  key={item.label}
                >
                  <strong>{item.label}</strong>
                  <p>{item.prompt}</p>
                  <small>{item.method}</small>
                </section>
              ))}
            </div>
            <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'key-distinction')}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>Key distinction</strong>
                <p>
                  <PetrosNarratedText
                    text={content.keyDistinction}
                    targetKey={petrosLessonTarget(block.id, 'key-distinction')}
                  />
                </p>
              </div>
            </div>
            {!completed && (
              <CompleteButton onClick={onComplete}>I can tell the cases apart</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'misconception_demolition') {
    return (
      <>
        <blockquote className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'misconception')}>
          {content.misconception}
        </blockquote>
        {questions}
        {recovered ? (
          <>
            <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'correction')}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>Correction</strong>
                <p>
                  <PetrosNarratedText
                    text={content.correction}
                    targetKey={petrosLessonTarget(block.id, 'correction')}
                  />
                </p>
              </div>
            </div>
            <div className={styles.grounding} data-petros-target={petrosLessonTarget(block.id, 'evidence')}>
              <strong>Evidence</strong>
              {content.evidence.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            {!completed && (
              <CompleteButton onClick={onComplete}>Update this intuition</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'socratic_probe') {
    return (
      <>
        <p className={styles.helper}>
          Probe {content.probeNumber} of 2 · Petros explains after the cap.
        </p>
        {questions}
        {recovered && content.probeNumber === 2 && (
          <div className={styles.keyIdea} data-petros-target={petrosLessonTarget(block.id, 'explanation')}>
            <Lightbulb aria-hidden="true" />
            <div>
              <strong>Direct explanation</strong>
              <p>
                <PetrosNarratedText
                  text={content.explanationAfterCap}
                  targetKey={petrosLessonTarget(block.id, 'explanation')}
                />
              </p>
            </div>
          </div>
        )}
        {!completed && (
          <CompleteButton onClick={onComplete} disabled={!recovered}>
            Finish this probe
          </CompleteButton>
        )}
      </>
    );
  }
  if (content.type === 'apply_to_your_world') {
    return (
      <>
        {questions}
        {recovered ? (
          <>
            <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'prompt')}>
              <PetrosNarratedText
                text={content.prompt}
                targetKey={petrosLessonTarget(block.id, 'prompt')}
              />
            </p>
            <ul data-petros-target={petrosLessonTarget(block.id, 'examples')}>
              {content.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
            {content.examShape && (
              <div className={styles.finalCheck} data-petros-target={petrosLessonTarget(block.id, 'exam-shape')}>
                <strong>Exam-shaped response</strong>
                <p>{content.examShape}</p>
              </div>
            )}
            {!completed && (
              <CompleteButton onClick={onComplete}>I found a use for it</CompleteButton>
            )}
          </>
        ) : (
          <TeachingLocked />
        )}
      </>
    );
  }
  if (content.type === 'artifact_commit') {
    const selected = Array.isArray(block.interactionState.selectedProposalIds)
      ? block.interactionState.selectedProposalIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const declined = block.interactionState.artifactsDeclined === true;
    return (
      <>
        <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'prompt')}>
          <PetrosNarratedText
            text={content.prompt}
            targetKey={petrosLessonTarget(block.id, 'prompt')}
          />
        </p>
        <div className={styles.choiceGrid}>
          {content.proposals.map((proposal) => {
            const active = selected.includes(proposal.id);
            return (
              <button
                key={proposal.id}
                role="checkbox"
                aria-checked={active}
                data-selected={active}
                disabled={completed || declined}
                onClick={() =>
                  onInteraction(
                    {
                      selectedProposalIds: active
                        ? selected.filter((id) => id !== proposal.id)
                        : [...selected, proposal.id],
                      artifactsDeclined: false,
                    },
                    true,
                  )
                }
              >
                <strong>{proposal.label}</strong>
                <small>
                  {proposal.kind.replace('_', ' ')} · {proposal.preview}
                </small>
              </button>
            );
          })}
        </div>
        {!completed && (
          <button
            className={styles.hintButton}
            onClick={() =>
              onInteraction({ selectedProposalIds: [], artifactsDeclined: true }, true)
            }
          >
            Save nothing from these proposals
          </button>
        )}
        <p className={styles.helper}>
          This block records your session choice. The review bundle below lets you edit each item;
          only its separate save action adds anything to your products.
        </p>
        {!completed && (
          <CompleteButton onClick={onComplete} disabled={!declined && selected.length === 0}>
            Confirm this artifact choice
          </CompleteButton>
        )}
      </>
    );
  }
  if (content.type === 'forward_link') {
    return (
      <>
        <div className={styles.forwardLink} data-petros-target={petrosLessonTarget(block.id, 'connection')}>
          <Flag aria-hidden="true" />
          <div>
            <strong>
              <PetrosNarratedText
                text={content.nextConcept}
                targetKey={petrosLessonTarget(block.id, 'connection')}
              />
            </strong>
            <p>
              <PetrosNarratedText
                text={content.connection}
                targetKey={petrosLessonTarget(block.id, 'connection')}
                startWord={buildPetrosSpeechTimeline(content.nextConcept).length}
              />
            </p>
          </div>
        </div>
        <div className={styles.finalCheck} data-petros-target={petrosLessonTarget(block.id, 'open-question')}>
          <strong>Unfinished thread</strong>
          <p>
            <PetrosNarratedText
              text={content.openQuestion}
              targetKey={petrosLessonTarget(block.id, 'open-question')}
            />
          </p>
        </div>
        {!completed && (
          <CompleteButton onClick={onComplete}>Park this for next time</CompleteButton>
        )}
      </>
    );
  }
  if (content.type !== 'synthesis') return null;
  return (
    <>
      {questions}
      {recovered ? (
        <>
          <p className={styles.prompt} data-petros-target={petrosLessonTarget(block.id, 'prompt')}>
            <PetrosNarratedText
              text={content.prompt}
              targetKey={petrosLessonTarget(block.id, 'prompt')}
            />
          </p>
          <p className={styles.helper} data-petros-target={petrosLessonTarget(block.id, 'tightening')}>
            {content.tighteningGuidance}
          </p>
          {content.forwardLink && (
            <div className={styles.forwardLink} data-petros-target={petrosLessonTarget(block.id, 'forward-link')}>
              <Flag aria-hidden="true" /> {content.forwardLink}
            </div>
          )}
        </>
      ) : (
        <TeachingLocked />
      )}
      {completed ? (
        <div className={styles.submitted}>
          <Check aria-hidden="true" /> Synthesis recorded
        </div>
      ) : (
        <CompleteButton onClick={onComplete} disabled={!recovered}>
          {hasRemainingCheckpoint ? 'Save verified response and continue' : 'Finish the session'}
        </CompleteButton>
      )}
    </>
  );
}

function QuestionStack({
  block,
  onInteraction,
  onAnswer,
  onHint,
  submittingQuestionId,
  hintingQuestionId,
}: {
  block: PetrosSessionBlock;
  onInteraction: (patch: Record<string, unknown>, immediate?: boolean) => void;
  onAnswer: (
    questionId: string,
    answer: string,
    confidence: 'sure' | 'think_so' | 'guessing',
    responseTimeMs: number,
  ) => void;
  onHint: (questionId: string) => void;
  submittingQuestionId: string | null;
  hintingQuestionId: string | null;
}) {
  const drafts = isRecord(block.interactionState.questionDrafts)
    ? block.interactionState.questionDrafts
    : {};
  const confidences = isRecord(block.interactionState.questionConfidence)
    ? block.interactionState.questionConfidence
    : {};
  return (
    <div className={styles.questionStack} aria-label="Question attempts">
      {block.questions.map((question) => (
        <QuestionCard
          key={question.id}
          blockId={block.id}
          question={question}
          draft={typeof drafts[question.id] === 'string' ? String(drafts[question.id]) : ''}
          confidence={
            isConfidence(confidences[question.id])
              ? (confidences[question.id] as 'sure' | 'think_so' | 'guessing')
              : null
          }
          submitting={submittingQuestionId === question.id}
          hinting={hintingQuestionId === question.id}
          onDraft={(answer) =>
            onInteraction({
              questionDrafts: { ...drafts, [question.id]: answer },
            })
          }
          onConfidence={(confidence) =>
            onInteraction(
              {
                questionConfidence: {
                  ...confidences,
                  [question.id]: confidence,
                },
              },
              true,
            )
          }
          onSubmit={(answer, confidence, responseTimeMs) =>
            onAnswer(question.id, answer, confidence, responseTimeMs)
          }
          onHint={() => onHint(question.id)}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  blockId,
  question,
  draft,
  confidence,
  submitting,
  hinting,
  onDraft,
  onConfidence,
  onSubmit,
  onHint,
}: {
  blockId: string;
  question: PetrosStudentQuestionState;
  draft: string;
  confidence: 'sure' | 'think_so' | 'guessing' | null;
  submitting: boolean;
  hinting: boolean;
  onDraft: (answer: string) => void;
  onConfidence: (confidence: 'sure' | 'think_so' | 'guessing') => void;
  onSubmit: (
    answer: string,
    confidence: 'sure' | 'think_so' | 'guessing',
    responseTimeMs: number,
  ) => void;
  onHint: () => void;
}) {
  const shownAt = useRef(Date.now());
  const attempt = question.attempts.at(-1);
  const locked = question.locked || !question.active;
  const label =
    question.purpose === 'guess_first'
      ? 'Quick check'
      : question.purpose === 'reworded_success'
        ? 'One more try'
        : question.purpose === 'equivalent_retry'
          ? 'Try another way'
          : 'Check your recall';
  const answerId = `petros-answer-${question.id}`;
  return (
    <details
      className={styles.questionCard}
      data-petros-target={petrosLessonTarget(blockId, `question:${question.id}`)}
      data-locked={locked}
      data-purpose={question.purpose}
      open={locked ? undefined : true}
    >
      <summary className={locked ? styles.questionHistorySummary : styles.activeQuestionSummary}>
        {locked ? (
          <>
            <span>{label}</span>
            <strong>{attempt?.correctness === 'correct' ? 'Answered correctly' : 'Previous attempt'}</strong>
            <small>Review</small>
          </>
        ) : (
          'Current question'
        )}
      </summary>
      <div className={styles.questionCardBody}>
        <span className={styles.questionLabel}>{label}<em>{question.purpose === 'guess_first' ? '+10 XP if it lands' : 'Retrieval checkpoint'}</em></span>
        <p className={styles.questionPrompt}>{question.prompt}</p>
        <div className={styles.responseField}>
          {question.responseType === 'single_choice' ? (
            <>
              <span className={styles.responseLabel}>Choose an answer</span>
              <div className={styles.choiceGrid} role="radiogroup" aria-label="Answer choices">
                {question.choices?.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={(attempt?.rawAnswer ?? draft) === choice.id}
                    disabled={locked || submitting}
                    data-selected={(attempt?.rawAnswer ?? draft) === choice.id}
                    onClick={() => onDraft(choice.id)}
                  >
                    {(attempt?.rawAnswer ?? draft) === choice.id && <Check aria-hidden="true" />}
                    {choice.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label className={styles.responseLabel} htmlFor={answerId}>Your answer</label>
              <textarea
                id={answerId}
                maxLength={4000}
                disabled={locked || submitting}
                value={attempt?.rawAnswer ?? draft}
                onChange={(event) => onDraft(event.target.value)}
                placeholder="Write your answer…"
              />
            </>
          )}
        </div>

      {!locked && (
        <>
          <div className={styles.responseFooter}>
            <div className={styles.confidence} role="radiogroup" aria-label="How confident are you?">
              <span>Confidence</span>
              <div>
                {(
                  [
                    ['sure', 'Sure'],
                    ['think_so', 'Think so'],
                    ['guessing', 'Guessing'],
                  ] as const
                ).map(([value, text]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={confidence === value}
                    data-selected={confidence === value}
                    onClick={() => onConfidence(value)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.questionControls}>
            <button
              type="button"
              className={styles.hintButton}
              disabled={hinting || submitting}
              aria-busy={hinting}
              data-loading-indicator={hinting || undefined}
              onClick={onHint}
            >
              {hinting ? <LoaderCircle aria-hidden="true" /> : <Lightbulb aria-hidden="true" />}
              {hinting ? 'Preparing hint…' : 'Hint'}
            </button>
            <button
              type="button"
              className={styles.commitAnswer}
              disabled={!draft.trim() || !confidence || submitting}
              aria-busy={submitting}
              data-loading-indicator={submitting || undefined}
              onClick={() =>
                confidence && onSubmit(draft, confidence, Math.max(0, Date.now() - shownAt.current))
              }
            >
              {submitting ? <LoaderCircle aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              {submitting ? 'Checking…' : 'Check answer'}
            </button>
            </div>
          </div>
        </>
      )}

      {question.hints.map((hint) => (
        <div key={hint.observationId} className={styles.ladderSupport} data-kind="hint">
          <Lightbulb aria-hidden="true" />
          <div>
            <strong>Useful hint</strong>
            <p>{hint.text}</p>
          </div>
        </div>
      ))}
      {attempt && (
        <div
          className={styles.answerFeedback}
          data-correctness={attempt.correctness}
          aria-live="polite"
        >
          <div>
            <strong>
              {attempt.correctness === 'correct'
                ? 'That lands · +10 XP'
                : attempt.correctness === 'partial'
                  ? 'Part of it is there — use the nudge.'
                  : attempt.correctness === 'invalid'
                    ? 'This needs an evaluable response.'
                    : 'Not yet — Petros has a nudge.'}
            </strong>
            <span>Confidence: {attempt.confidence.replace('_', ' ')}</span>
          </div>
          <p>{attempt.feedback}</p>
          {attempt.highValueMisconception && (
            <div className={styles.calibrationNote}>
              <Brain aria-hidden="true" /> This confident miss is worth slowing down for; the
              correction is getting a deliberate moment.
            </div>
          )}
          {attempt.fragileSuccess && (
            <div className={styles.calibrationNote}>
              <RotateCcw aria-hidden="true" /> Correct with uncertainty: this target will return
              sooner for a quick recheck.
            </div>
          )}
          {attempt.recovery && (
            <div className={styles.recovery}>
              <Check aria-hidden="true" /> You stayed with the stretch and finished it on a
              successful attempt.
            </div>
          )}
          {attempt.supportText && (
            <div className={styles.ladderSupport} data-kind={attempt.supportKind}>
              <Lightbulb aria-hidden="true" />
              <div>
                <strong>{supportLabel(attempt.supportKind)}</strong>
                <p>{attempt.supportText}</p>
              </div>
            </div>
          )}
          {attempt.why.length > 0 && (
            <details className={styles.feedbackWhy}>
              <summary>Why?</summary>
              <ul>
                {attempt.why.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      </div>
    </details>
  );
}

function InstitutionalPolicyPanel({ document }: { document: PetrosLearningSessionDocument }) {
  const api = useStudentApi();
  const policy = document.institutionalPolicy!;
  const [acknowledged, setAcknowledged] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [breakPoint, setBreakPoint] = useState('I am still stuck at the step shown in the latest attempt.');
  const [nextStep, setNextStep] = useState('Please check the broken step and suggest one short practice example.');
  const [handoff, setHandoff] = useState<{ id: string; status: string } | null>(null);
  const [homeworkCorrected, setHomeworkCorrected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assignmentContext = document.sourceContext?.assignmentContext && typeof document.sourceContext.assignmentContext === 'object' && !Array.isArray(document.sourceContext.assignmentContext)
    ? document.sourceContext.assignmentContext as Record<string, unknown>
    : null;
  const classId = typeof document.sourceContext?.classId === 'string'
    ? document.sourceContext.classId
    : typeof assignmentContext?.classId === 'string' ? assignmentContext.classId : null;
  const subjectId = typeof document.sourceContext?.subjectId === 'string'
    ? document.sourceContext.subjectId
    : typeof assignmentContext?.subjectId === 'string' ? assignmentContext.subjectId : null;
  const offerHandoff = policy.handoffEnabled && document.observationSummary.activeWrongAttemptCount >= policy.handoffOfferAfterFailedRepairCount && classId && subjectId;
  const institutionalDecision = document.sourceContext?.institutionalDecision && typeof document.sourceContext.institutionalDecision === 'object' && !Array.isArray(document.sourceContext.institutionalDecision)
    ? document.sourceContext.institutionalDecision as Record<string, unknown>
    : null;
  const homeworkDecision = institutionalDecision?.homework && typeof institutionalDecision.homework === 'object' && !Array.isArray(institutionalDecision.homework)
    ? institutionalDecision.homework as Record<string, unknown>
    : null;
  const assignmentId = typeof homeworkDecision?.assignmentId === 'string'
    ? homeworkDecision.assignmentId
    : typeof assignmentContext?.assignmentId === 'string' ? assignmentContext.assignmentId : null;

  async function acknowledge() {
    setBusy(true); setError('');
    try {
      await api.post(`/student/petros/institutional/sessions/${document.id}/disclosure/acknowledge`, {});
      setAcknowledged(true);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  async function createHandoff() {
    if (!classId || !subjectId) return;
    setBusy(true); setError('');
    try {
      const attempts = document.blocks.flatMap((block) => block.questions.flatMap((question) => question.attempts));
      const row = await api.post<{ id: string; status: string }>('/student/petros/institutional/handoffs', {
        sessionId: document.id,
        classId,
        subjectId,
        summary: {
          concept: document.topic,
          goal: document.currentGoal,
          whatWasTried: document.blocks.map((block) => block.content.title).slice(-6),
          observedBreakPoint: breakPoint,
          evidence: attempts.slice(-6).map((attempt) => ({ label: `${attempt.correctness} attempt after ${attempt.supportKind.replaceAll('_', ' ')}`, sourceEventId: attempt.observationId })),
          usefulTeacherNextStep: nextStep,
        },
        idempotencyKey: newIdempotencyKey(),
      });
      setHandoff(row);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  async function correctHomework() {
    if (!assignmentId) return;
    setBusy(true); setError('');
    try {
      await api.post(`/student/petros/institutional/sessions/${document.id}/homework-correction`, {
        assignmentId,
        correctionReason: 'This question is not asking for the assigned answer.',
        idempotencyKey: newIdempotencyKey(),
      });
      setHomeworkCorrected(true);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  async function act(action: 'consent' | 'deliver' | 'cancel') {
    if (!handoff) return;
    setBusy(true); setError('');
    try {
      const row = await api.post<{ id: string; status: string }>(`/student/petros/institutional/handoffs/${handoff.id}`, { action, idempotencyKey: newIdempotencyKey() });
      setHandoff(row);
    } catch (caught) { setError(formatApiError(caught)); }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.policyDisclosure} aria-label="Petros institution policy disclosure">
      <div className={styles.policyTop}>
        <header className={styles.policyHeader}>
          <span><ShieldCheck aria-hidden="true" /></span>
          <div>
            <strong>Privacy and learning rules</strong>
            <p>Material approved by your institution only · hints for active homework · Voice is optional.</p>
          </div>
        </header>
        {!acknowledged ? (
          <button disabled={busy} onClick={() => void acknowledge()}>Got it</button>
        ) : (
          <span className={styles.policyAcknowledged} role="status"><Check aria-hidden="true" /> Acknowledged</span>
        )}
      </div>
      <details className={styles.privacyDetails}>
        <summary>Who can see information from this session?</summary>
        <div>
          <p><strong>Your teacher</strong>{audienceAccess(policy.disclosure.visibleToTeacher, policy.disclosure.teacherRetentionDays, policy.disclosure.teacherPurpose)}</p>
          <p><strong>A linked parent or guardian</strong>{audienceAccess(policy.disclosure.visibleToParent, policy.disclosure.parentRetentionDays, policy.disclosure.parentPurpose)}</p>
          <p><strong>Never shared</strong>{excludedAccess(policy.disclosure.excludedByPlatform)}</p>
          <p><strong>Session settings</strong>These rules will not change halfway through this session.</p>
        </div>
      </details>
      {homeworkDecision?.mode === 'guided_homework' && homeworkDecision.correctionAllowed === true && assignmentId ? (
        <div>
          <p>{homeworkCorrected ? 'Homework match corrected. Normal teaching applies from the next move.' : 'Wrong match? You can correct it without exposing your answer.'}</p>
          {!homeworkCorrected ? <button type="button" disabled={busy} onClick={() => void correctHomework()}>This is not related homework</button> : null}
        </div>
      ) : null}
      {offerHandoff ? (
        <div>
          <p><strong>Would you like to hand this to your teacher?</strong> This is optional. You review the summary before anything is delivered.</p>
          {!handoffOpen && !handoff ? <button onClick={() => setHandoffOpen(true)}>Preview teacher handoff</button> : null}
          {handoffOpen && !handoff ? <div>
            <label>Where it broke<textarea value={breakPoint} maxLength={700} onChange={(event) => setBreakPoint(event.target.value)} /></label>
            <label>Useful next step<textarea value={nextStep} maxLength={700} onChange={(event) => setNextStep(event.target.value)} /></label>
            <button disabled={busy} onClick={() => void createHandoff()}><Send aria-hidden="true" /> Prepare summary</button>
            <button onClick={() => setHandoffOpen(false)}>Not now</button>
          </div> : null}
          {handoff?.status === 'preview' ? <div role="status"><p>Summary prepared. It has not been sent.</p><button disabled={busy} onClick={() => void act('consent')}>I consent to this summary</button><button onClick={() => void act('cancel')}>Cancel</button></div> : null}
          {handoff?.status === 'consented' ? <div role="status"><p>Consent recorded. Delivery is still your choice.</p><button disabled={busy} onClick={() => void act('deliver')}>Queue for my teacher</button><button onClick={() => void act('cancel')}>Cancel</button></div> : null}
          {handoff?.status === 'queued' ? <div role="status"><p>Queued. You can withdraw it before delivery.</p><button disabled={busy} onClick={() => void act('cancel')}>Withdraw before delivery</button></div> : null}
          {['delivered', 'read'].includes(handoff?.status ?? '') ? <span role="status">Teacher handoff: {handoff?.status}.</span> : null}
        </div>
      ) : null}
      {error ? <span role="alert">{error}</span> : null}
    </section>
  );
}

function TeachingLocked() {
  return null;
}

function AnswerCheckPreparing({ busy }: { busy: boolean }) {
  return (
    <div className={styles.teachingLocked} role="status" aria-live="polite">
      {busy ? <LoaderCircle aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}
      <strong>{busy ? 'Preparing a question…' : 'Answer check ready.'}</strong>
    </div>
  );
}

function DetourBanner({ detour }: { detour: PetrosDetour }) {
  const title =
    detour.status === 'pending'
      ? 'Question added to the next PLAN'
      : detour.status === 'rejoined'
        ? detour.action === 'answer_now'
          ? 'Question answered · back to the lesson'
          : 'Detour complete · back to the main goal'
        : detour.status === 'parked'
          ? 'Question parked deliberately'
          : detour.status === 'clarifying'
            ? 'Petros needs a sharper version of this question'
            : detour.action === 'answer_now'
              ? 'Petros paused to answer you'
            : 'This question changed the route';
  return (
    <section className={styles.detour} data-status={detour.status} aria-live="polite">
      <div>
        <MessageSquareText aria-hidden="true" />
        <div>
          <p>STRUCTURED DETOUR</p>
          <h2>{title}</h2>
        </div>
      </div>
      <blockquote>{detour.question}</blockquote>
      {detour.acknowledgement && <p>{detour.acknowledgement}</p>}
      {detour.routeChange && (
        <div className={styles.routeChange}>
          <Flag aria-hidden="true" />
          <span>
            <strong>{detour.action === 'answer_now' ? 'Paused point' : 'Route change'}</strong>
            {detour.routeChange}
          </span>
        </div>
      )}
      {detour.returnPlan && (
        <div className={styles.returnPlan}>
          <RotateCcw aria-hidden="true" />
          <span>
            <strong>Return plan</strong>
            {detour.returnPlan}
          </span>
        </div>
      )}
    </section>
  );
}

function BlockActions({
  block,
  onSaveArtifact,
  onReexplain,
  adaptingLevel,
  adaptationDisabled,
  sessionPaused,
  sessionClosed,
  topic,
}: {
  block: PetrosSessionBlock;
  onSaveArtifact: (content: PetrosArtifactContent) => Promise<PetrosSavedArtifact>;
  onReexplain: (level: 'simpler' | 'deeper') => void;
  adaptingLevel: 'simpler' | 'deeper' | null;
  adaptationDisabled: boolean;
  sessionPaused: boolean;
  sessionClosed: boolean;
  topic: string;
}) {
  const draft = artifactDraftFor(block, topic);
  const noteSaved = typeof block.interactionState.noteArtifactId === 'string';
  const flashcardSaved = typeof block.interactionState.flashcardArtifactId === 'string';
  const [flashcardOpen, setFlashcardOpen] = useState(false);
  const [front, setFront] = useState(draft.flashcard.front);
  const [back, setBack] = useState(draft.flashcard.back);
  const [saving, setSaving] = useState<'note' | 'flashcard' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [savedDestination, setSavedDestination] = useState('');
  const [saveError, setSaveError] = useState('');

  const saveNote = async () => {
    if (noteSaved || saving) return;
    setSaving('note');
    setSaveError('');
    setFeedback('');
    setSavedDestination('');
    try {
      const saved = await onSaveArtifact(draft.note);
      setFeedback('Saved to Notes');
      setSavedDestination(`/notes#petros-note-${saved.id}`);
    } catch (caught) {
      setSaveError(formatApiError(caught));
    } finally {
      setSaving(null);
    }
  };

  const saveFlashcard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (flashcardSaved || saving || !front.trim() || !back.trim()) return;
    setSaving('flashcard');
    setSaveError('');
    setFeedback('');
    setSavedDestination('');
    try {
      const saved = await onSaveArtifact({
        ...draft.flashcard,
        title: front.trim().slice(0, 200),
        front: front.trim().slice(0, 2_000),
        back: back.trim().slice(0, 4_000),
      });
      setFlashcardOpen(false);
      setFeedback('Flashcard added to your Petros deck');
      setSavedDestination(`/flashcards#artifact-${saved.id}`);
    } catch (caught) {
      setSaveError(formatApiError(caught));
    } finally {
      setSaving(null);
    }
  };

  const explanationLabel = (level: 'simpler' | 'deeper') => {
    if (adaptingLevel === level) return level === 'simpler' ? 'Preparing simpler…' : 'Preparing deeper…';
    if (sessionClosed) return level === 'simpler' ? 'Continue simpler' : 'Continue deeper';
    if (sessionPaused) return level === 'simpler' ? 'Resume & explain simpler' : 'Resume & explain deeper';
    return level === 'simpler' ? 'Explain simpler' : 'Explain deeper';
  };

  return (
    <div className={styles.actionStudio}>
      <div className={styles.actionCluster} data-tone="keep">
        <span className={styles.actionClusterIcon}><FilePenLine aria-hidden="true" /></span>
        <div>
          <strong>Keep this</strong>
          <div className={styles.actionPills}>
            <button
              type="button"
              data-active={noteSaved || undefined}
              disabled={noteSaved || saving !== null}
              aria-busy={saving === 'note'}
              data-loading-indicator={saving === 'note' || undefined}
              onClick={() => void saveNote()}
            >
              {saving === 'note' ? (
                <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
              ) : noteSaved ? (
                <Check aria-hidden="true" />
              ) : (
                <FilePenLine aria-hidden="true" />
              )}
              {saving === 'note' ? 'Saving…' : noteSaved ? 'Saved to notes' : 'Save to notes'}
            </button>
            <button
              type="button"
              data-active={flashcardSaved || undefined}
              disabled={flashcardSaved || saving !== null}
              aria-expanded={flashcardOpen}
              onClick={() => setFlashcardOpen((open) => !open)}
            >
              {flashcardSaved ? <Check aria-hidden="true" /> : <CreditCard aria-hidden="true" />}
              {flashcardSaved ? 'Flashcard added' : 'Make a flashcard'}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.actionCluster} data-tone="adapt">
        <span className={styles.actionClusterIcon}><Sparkles aria-hidden="true" /></span>
        <div>
          <strong>Change the explanation</strong>
          <div className={styles.actionPills}>
            <button
              type="button"
              disabled={adaptationDisabled || adaptingLevel !== null}
              aria-busy={adaptingLevel === 'simpler'}
              data-loading-indicator={adaptingLevel === 'simpler' || undefined}
              onClick={() => onReexplain('simpler')}
            >
              {adaptingLevel === 'simpler' ? (
                <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
              ) : (
                <Lightbulb aria-hidden="true" />
              )}
              {explanationLabel('simpler')}
            </button>
            <button
              type="button"
              disabled={adaptationDisabled || adaptingLevel !== null}
              aria-busy={adaptingLevel === 'deeper'}
              data-loading-indicator={adaptingLevel === 'deeper' || undefined}
              onClick={() => onReexplain('deeper')}
            >
              {adaptingLevel === 'deeper' ? (
                <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
              ) : (
                <Layers3 aria-hidden="true" />
              )}
              {explanationLabel('deeper')}
            </button>
          </div>
        </div>
      </div>

      {flashcardOpen && !flashcardSaved && (
        <form className={styles.flashcardSheet} onSubmit={(event) => void saveFlashcard(event)}>
          <div className={styles.flashcardSheetHead}>
            <span><CreditCard aria-hidden="true" /></span>
            <div>
              <strong>New flashcard</strong>
              <small>Edit both sides before adding it.</small>
            </div>
          </div>
          <label>
            Front
            <input
              value={front}
              maxLength={2_000}
              disabled={saving === 'flashcard'}
              onChange={(event) => setFront(event.target.value)}
            />
          </label>
          <label>
            Back
            <textarea
              value={back}
              maxLength={4_000}
              disabled={saving === 'flashcard'}
              onChange={(event) => setBack(event.target.value)}
            />
          </label>
          <div className={styles.flashcardSheetActions}>
            <button type="button" disabled={saving === 'flashcard'} onClick={() => setFlashcardOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={saving === 'flashcard' || !front.trim() || !back.trim()} aria-busy={saving === 'flashcard'} data-loading-indicator={saving === 'flashcard' || undefined}>
              {saving === 'flashcard' ? (
                <LoaderCircle className={styles.adaptingIcon} aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {saving === 'flashcard' ? 'Adding…' : 'Add flashcard'}
            </button>
          </div>
        </form>
      )}

      {(feedback || saveError) && (
        <p className={styles.actionFeedback} data-error={saveError ? 'true' : undefined} role="status">
          {saveError || feedback}
          {!saveError && savedDestination ? <Link href={savedDestination}>Open it now <ArrowRight aria-hidden="true" /></Link> : null}
        </p>
      )}
    </div>
  );
}

function artifactDraftFor(block: PetrosSessionBlock, topic: string) {
  const title = block.content.title.trim().slice(0, 200) || topic.trim().slice(0, 200);
  const body = artifactBodyFor(block).slice(0, 4_000)
    || block.whyThis.trim().slice(0, 4_000)
    || title;
  const tag = topic.trim().slice(0, 80) || 'Petros';
  return {
    note: {
      kind: 'note' as const,
      title,
      body,
      tags: [tag],
    },
    flashcard: {
      kind: 'flashcard' as const,
      title,
      front: `What should you remember about “${title}”?`.slice(0, 2_000),
      back: body,
      hint: null,
      explanation: null,
      tags: [tag],
    },
  };
}

const ARTIFACT_BODY_FIELDS = new Set([
  'reveal',
  'firstLayer',
  'keyIdea',
  'explanation',
  'summary',
  'correction',
  'tighteningGuidance',
  'connection',
  'fallbackText',
]);

function artifactBodyFor(block: PetrosSessionBlock) {
  const parts: string[] = [];
  const visit = (value: unknown, key = '') => {
    if (parts.join(' ').length >= 4_000) return;
    if (typeof value === 'string' && ARTIFACT_BODY_FIELDS.has(key) && value.trim()) {
      const clean = value.trim().replace(/\s+/g, ' ');
      if (!parts.includes(clean)) parts.push(clean);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 5)) visit(item, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        visit(child, childKey);
      }
    }
  };
  visit(block.content);
  return parts.slice(0, 3).map((part) => /[.!?]$/.test(part) ? part : `${part}.`).join(' ');
}

function Grounding({
  content,
}: {
  content: Extract<PetrosTeachingBlockContent, { type: 'layered_explanation' | 'worked_example' }>;
}) {
  if (!content.sourceGrounding.length) return null;
  return (
    <div className={styles.grounding}>
      <strong>Grounded in</strong>
      {content.sourceGrounding.map((source) => (
        <span key={`${source.label}-${source.reference ?? ''}`}>
          {source.label}
          {source.reference ? ` · ${source.reference}` : ''}
        </span>
      ))}
    </div>
  );
}

function CompleteButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button className={styles.completeButton} disabled={disabled} onClick={onClick} aria-label={ariaLabel}>
      {children}
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function Step({
  number,
  title,
  body,
  prediction,
  visible,
  targetKey,
}: {
  number: number;
  title: string;
  body: string;
  prediction?: string;
  visible: boolean;
  targetKey?: string;
}) {
  return (
    <div className={styles.step} data-visible={visible} data-petros-target={visible ? targetKey : undefined}>
      <span>{number}</span>
      {visible ? (
        <div>
          <strong>
            {targetKey ? (
              <PetrosNarratedText text={title} targetKey={targetKey} />
            ) : title}
          </strong>
          {prediction && <em>{prediction}</em>}
          <p>
            {targetKey ? (
              <PetrosNarratedText
                text={body}
                targetKey={targetKey}
                startWord={buildPetrosSpeechTimeline(title).length}
              />
            ) : body}
          </p>
        </div>
      ) : (
        <div className={styles.stepHidden}>Commit to what you think comes next.</div>
      )}
    </div>
  );
}

function BlockSkeleton({
  expected,
  slow,
  topic,
  checkpoint,
  sourceHint,
}: {
  expected: PetrosTeachingBlockContent['type'] | null;
  slow: boolean;
  topic: string;
  checkpoint: string | null;
  sourceHint: string;
}) {
  const Icon = expected ? iconFor(expected) : Brain;
  const statusLines = React.useMemo(() => [
    expected
      ? sourceHint ? `Reading ${sourceHint}…` : `Reading the verified ${topic} source…`
      : 'Choosing the next helpful step',
    `Connecting this to what you just built in ${topic}…`,
    checkpoint ? `Shaping the next move: ${checkpoint}…` : 'Choosing the next helpful step',
    expected
      ? `Checking that this ${labelFor(expected).toLowerCase()} earns its place…`
      : 'Checking the step against your session goal…',
  ], [checkpoint, expected, sourceHint, topic]);
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    setStatusIndex(0);
    const timer = window.setInterval(
      () => setStatusIndex((current) => (current + 1) % statusLines.length),
      2_200,
    );
    return () => window.clearInterval(timer);
  }, [expected, statusLines]);

  return (
    <section className={styles.blockSkeleton} role="status" aria-live="polite">
      <div className={styles.preparingPetros} aria-hidden="true">
        <span><Icon /></span>
        <i /><i /><i />
      </div>
      <div className={styles.preparingCopy}>
        <p>PETROS IS BUILDING THE NEXT MOVE</p>
        <strong>{statusLines[statusIndex]}</strong>
        <div className={styles.preparingSteps} aria-hidden="true">
          {statusLines.map((line, index) => (
            <span key={line} data-active={index === statusIndex} data-passed={index < statusIndex} />
          ))}
        </div>
      </div>
      {slow && (
        <aside>
          <Lightbulb aria-hidden="true" />
          <span>
            <strong>This is taking longer than usual.</strong>{' '}
            Your current document is safe. While I connect it, say the last idea back in one sentence—retrieval now makes the next step easier.
          </span>
        </aside>
      )}
    </section>
  );
}

function SessionLoading({ topic, subject }: { topic: string; subject: SessionSubject }) {
  const SubjectIcon = subject === 'construction-safety' ? HardHat : Network;
  return (
    <div className={styles.shell} data-subject={subject}>
      <div className={styles.loadingPage} role="status">
        <SubjectIcon aria-hidden="true" />
        <p>Resuming Petros</p>
        <h1>{topic}</h1>
        <span>Loading the saved session document…</span>
      </div>
    </div>
  );
}

function StatusBanner({
  icon: Icon,
  title,
  body,
  action,
  tone,
}: {
  icon: typeof CircleHelp;
  title: string;
  body?: string;
  action?: ReactNode;
  tone: 'warning' | 'neutral';
}) {
  return (
    <section className={styles.statusBanner} data-tone={tone}>
      <Icon aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {body ? <p>{body}</p> : null}
        {action && <div>{action}</div>}
      </div>
    </section>
  );
}

function iconFor(type: PetrosTeachingBlockContent['type']) {
  if (type === 'hook' || type === 'analogy' || type === 'misconception_demolition')
    return Lightbulb;
  if (type === 'prerequisite_check' || type === 'goal_frame' || type === 'predict_then_reveal')
    return Target;
  if (type === 'layered_explanation') return Layers3;
  if (type === 'worked_example' || type === 'story' || type === 'derivation') return BookOpen;
  if (type === 'diagram' || type === 'contrast_case') return Brain;
  if (type === 'socratic_probe' || type === 'recall_check' || type === 'apply_to_your_world')
    return MessageSquareText;
  if (type === 'artifact_commit') return FilePenLine;
  return Flag;
}

function studentFriendlyWhy(type: PetrosTeachingBlockContent['type'], fallback: string) {
  const explanations: Partial<Record<PetrosTeachingBlockContent['type'], string>> = {
    hook: 'A quick opening question helps Petros understand what stands out to you and where to begin.',
    prerequisite_check: 'This checks whether a small foundation needs strengthening before you continue.',
    goal_frame: 'A clear goal keeps this session focused on what you actually need to achieve.',
    recall_check: 'A short memory check shows what is secure and what deserves another pass.',
    worked_example: 'A worked example makes the method visible before you try it independently.',
    predict_then_reveal: 'Making a prediction first helps the explanation stick.',
    socratic_probe: 'Thinking it through in your own words gives Petros better evidence than simply showing an answer.',
    synthesis: 'Bringing the ideas together checks that the full picture makes sense.',
  };
  return explanations[type] ?? fallback;
}

function isGenericAnchor(value: string) {
  return ['question', 'hook', 'prompt', 'opening question'].includes(value.trim().toLowerCase());
}

const VISIBILITY_LABELS: Record<string, string> = {
  session_metadata: 'basic session details such as the date and duration',
  concept_and_goal: 'the topic and learning goal',
  attempt_summary: 'a summary of your attempts and progress',
  teacher_handoff: 'a support summary you explicitly choose to send',
  raw_transcript: 'the session transcript',
  private_questions: 'questions you asked privately',
  voice_recording: 'voice recordings',
  images: 'images shared in the session',
  unsaved_artifacts: 'unsaved notes and learning drafts',
};

function naturalList(items: string[]) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function audienceAccess(categories: string[], retentionDays: number, purpose: string) {
  if (categories.length === 0) return ': cannot see anything from this session.';
  const visible = naturalList(categories.map((category) => VISIBILITY_LABELS[category] ?? category.replaceAll('_', ' ')));
  const purposeText = purpose.trim().replace(/[.]+$/, '').replace(/^./, (character) => character.toLowerCase());
  return `: can see ${visible}. This is kept for up to ${retentionDays} days and used to ${purposeText}.`;
}

function excludedAccess(items: string[]) {
  const labels = items.map((item) => item
    .replace('provider or model identity', 'private AI system details')
    .replace('hidden chain-of-thought', 'Petros’s private internal reasoning')
    .replace('unsaved artifact drafts', 'notes and drafts you have not saved')
    .replace('unrelated personal history', 'unrelated personal history')
    .replace('credentials', 'passwords or sign-in details')
    .replace('internal routing data', 'internal technical routing information'));
  return `: ${naturalList(labels)}.`;
}

function labelFor(type: PetrosTeachingBlockContent['type']) {
  const labels: Record<PetrosTeachingBlockContent['type'], string> = {
    hook: 'Let’s get started',
    prerequisite_check: 'Quick foundation check',
    goal_frame: 'Your goal',
    layered_explanation: 'Step-by-step explanation',
    worked_example: 'Worked example',
    analogy: 'A helpful comparison',
    story: 'A story to remember',
    derivation: 'How it works',
    diagram: 'Visual explanation',
    predict_then_reveal: 'Make a prediction',
    contrast_case: 'Spot the difference',
    misconception_demolition: 'Clear up a common mix-up',
    socratic_probe: 'Think it through',
    recall_check: 'Quick recall',
    apply_to_your_world: 'Use it in context',
    synthesis: 'Bring it together',
    artifact_commit: 'Save what matters',
    forward_link: 'What’s next',
  };
  return labels[type];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function contextualSourceView(document: PetrosLearningSessionDocument | null, legacySource: string) {
  const context = document?.sourceContext ?? {};
  const door = typeof context.door === 'string' ? context.door : legacySource === 'result' ? 'result_repair' : 'student_portal';
  const returnHref = typeof context.returnHref === 'string' && context.returnHref.startsWith('/') ? context.returnHref : door === 'result_repair' ? '/results' : '/home';
  const returnLabel = typeof context.returnLabel === 'string' ? context.returnLabel : door === 'result_repair' ? 'Results' : 'Portal';
  const label = typeof context.label === 'string' ? context.label : '';
  const citations = Array.isArray(context.citations)
    ? context.citations.filter(isRecord).map((citation) => ({
        label: typeof citation.label === 'string' ? citation.label : 'Session source',
        page: typeof citation.page === 'number' ? citation.page : null,
        section: typeof citation.section === 'string' ? citation.section : null,
      }))
    : [];
  const policyDisclosures = Array.isArray(context.policyDisclosures)
    ? context.policyDisclosures.filter((item): item is string => typeof item === 'string')
    : ['Petros follows the permissions and source rules visible on the screen that opened this session.'];
  const copy: Record<string, { sessionLabel: string; openedFrom: string; heading: string }> = {
    result_repair: { sessionLabel: 'Repair session', openedFrom: 'your published result', heading: 'Let’s find the part worth fixing.' },
    upcoming_exam: { sessionLabel: 'Revision session', openedFrom: 'your published exam schedule', heading: 'Use the remaining time on what earns recall and marks.' },
    uploaded_document: { sessionLabel: 'Document session', openedFrom: 'your selected document', heading: 'Build the idea from the page in front of you.' },
    learning_path: { sessionLabel: 'Learning path session', openedFrom: 'your active learning path', heading: 'Take the next topic adaptively, one move at a time.' },
    assistant_handoff: { sessionLabel: 'Contextual doubt session', openedFrom: 'the assistant offer you accepted', heading: 'Continue from your question without repeating it.' },
    snap_question: { sessionLabel: 'Photographed doubt session', openedFrom: 'your confirmed question photo', heading: 'Start at the point where you are stuck.' },
    handwriting: { sessionLabel: 'Handwriting repair', openedFrom: 'your confirmed handwritten lines', heading: 'Repair the first logical break, then reattempt.' },
    voice: { sessionLabel: 'Voice session', openedFrom: 'an optional turn-based microphone session', heading: 'Speak, generate, and keep every essential detail in text.' },
    five_minute: { sessionLabel: 'Five-minute session', openedFrom: 'your finite five-minute choice', heading: 'One concept, four moves, a deliberate close.' },
    student_portal: { sessionLabel: 'Learning session', openedFrom: 'your student portal', heading: 'Work on one clear learning goal.' },
  };
  return {
    ...(copy[door] ?? copy.student_portal!),
    returnHref,
    returnLabel,
    contextLine: label,
    citations,
    policyDisclosures,
  };
}

function isConfidence(value: unknown): value is 'sure' | 'think_so' | 'guessing' {
  return value === 'sure' || value === 'think_so' || value === 'guessing';
}

function supportLabel(kind: string) {
  if (kind === 'missing_step') return 'Specific missing step';
  if (kind === 'worked_solution') return 'Full worked solution · now earn the reworded success';
  if (kind === 'stuck_path') return 'A legitimate next step';
  return 'Useful hint';
}
