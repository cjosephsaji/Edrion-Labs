'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  boundEngineInput, effectiveEngineParameters, engineDuration, engineProgramSchema, engineResolvedViewsSchema, engineSnapshotSchema,
  projectEngineSpatialPoint, type EngineAction, type EngineCommand, type EngineProgram, type EngineResolvedView, type EngineSnapshot,
} from '@edrion/schemas';
import { formatApiError, StudentApiError, useStudentApi, type PetrosPredictionAssistance,
  type PetrosPredictionChallenge, type PetrosPredictionEvaluation } from '@/lib/api-client';
import styles from './petros-program-workspace.module.css';
import { PetrosWorkspaceNoteSave } from './petros-workspace-note-save';
import { PetrosPreparedVisual } from './petros-teaching-block-renderer';

type WorkspaceGet =
  | { status: 'ready'; program: EngineProgram }
  | { status: 'available'; snapshot: EngineSnapshot; replayed?: boolean; receipt?: { operationId: string; commandHash: string; checkpointId: string };
      checkpoints?: Array<{ id: string; version: number; branchId: string; parentCheckpointId: string | null; createdAt: string }>;
      recovery?: { acknowledgedExperimentVersion: number; unacknowledgedInterval: string } }
  | { status: 'unavailable'; reason?: string };
type Active = { sessionId: string; blockId: string };
type View = EngineResolvedView;
type SceneState = { snapshot: EngineSnapshot; views: View[] };
type WorkerReply = { id: number; ok: boolean; snapshot?: EngineSnapshot; views?: View[]; error?: string };
type PredictionPending =
  | { kind: 'issue'; requestId: string; modelId: string }
  | { kind: 'answer'; requestId: string; challengeId: string; predictedValue: number; assistance: PetrosPredictionAssistance };
type NarrationCursor = { beat: number; character: number; offset: number; playing: boolean; boundaryReceived: boolean; token: number };

const workspacePath = ({ sessionId, blockId }: Active) =>
  `/student/petros/sessions/${encodeURIComponent(sessionId)}/blocks/${encodeURIComponent(blockId)}/workspace`;
const newUuid = () => crypto.randomUUID();

type WorkspaceContext = {
  active: Active | null;
  snapshot: EngineSnapshot | null;
  readyProgram: EngineProgram | null;
  scene: SceneState | null;
  comparison: SceneState | null;
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  questionDraft: string;
  setQuestionDraft: (value: string) => void;
  predictionChallenge: PetrosPredictionChallenge | null;
  predictionEvaluation: PetrosPredictionEvaluation | null;
  predictionPending: PredictionPending | null;
  predictionStatus: string;
  predictionValue: string;
  setPredictionValue: (value: string) => void;
  predictionAssistance: PetrosPredictionAssistance;
  setPredictionAssistance: (value: PetrosPredictionAssistance) => void;
  checkpoints: Array<{ id: string; version: number; branchId: string }>;
  loading: boolean;
  busy: boolean;
  prefersReducedMotion: boolean;
  allowContinuousMotion: boolean;
  setAllowContinuousMotion: (value: boolean) => void;
  status: string;
  pending: EngineCommand | null;
  narration: NarrationCursor;
  activate: (active: Active) => void;
  act: (action: EngineAction, target: string, purpose: string, trigger?: HTMLElement) => Promise<boolean>;
  retry: () => Promise<void>;
  abandonPending: () => void;
  recover: () => Promise<void>;
  previewAt: (time: number) => void;
  issuePrediction: (modelId: string) => Promise<void>;
  answerPrediction: (predictedValue: number, assistance: PetrosPredictionAssistance) => Promise<void>;
  retryPrediction: () => Promise<void>;
  resetPrediction: () => void;
  speak: (text: string, beat: number, character: number, offset: number) => boolean;
  stopNarration: () => NarrationCursor;
};
const Context = createContext<WorkspaceContext | null>(null);

function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('Petros workspace requires its app provider');
  return context;
}

/** One owner-scoped instance survives lesson/companion switches while AppShell stays mounted. */
export function PetrosProgramWorkspaceProvider({ children }: { children: ReactNode }) {
  const api = useStudentApi();
  const [active, setActive] = useState<Active | null>(null);
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [readyProgram, setReadyProgram] = useState<EngineProgram | null>(null);
  const [scene, setScene] = useState<SceneState | null>(null);
  const [comparison, setComparison] = useState<SceneState | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [questionDraft, setQuestionDraft] = useState('');
  const [predictionChallenge, setPredictionChallenge] = useState<PetrosPredictionChallenge | null>(null);
  const [predictionEvaluation, setPredictionEvaluation] = useState<PetrosPredictionEvaluation | null>(null);
  const [predictionPending, setPredictionPending] = useState<PredictionPending | null>(null);
  const [predictionStatus, setPredictionStatus] = useState('');
  const [predictionValue, setPredictionValue] = useState('');
  const [predictionAssistance, setPredictionAssistance] = useState<PetrosPredictionAssistance>('unknown');
  const [checkpoints, setCheckpoints] = useState<Array<{ id: string; version: number; branchId: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [allowContinuousMotion, setAllowContinuousMotion] = useState(false);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<EngineCommand | null>(null);
  const [narration, setNarration] = useState<NarrationCursor>({ beat: -1, character: 0, offset: 0, playing: false, boundaryReceived: false, token: 0 });
  const pendingRef = useRef<EngineCommand | null>(null);
  const actionChainBusy = useRef(false);
  const resumeAfterRetry = useRef(false);
  const narrationRef = useRef(narration);
  narrationRef.current = narration;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const predictionPendingRef = useRef<PredictionPending | null>(null);
  const lastAcknowledged = useRef<EngineSnapshot | null>(null);
  const draftVersion = useRef<number | null>(null);
  const sceneRef = useRef<SceneState | null>(null);
  const compareCandidate = useRef<SceneState | null>(null);
  const activeRef = useRef<Active | null>(null);
  const requestSerial = useRef(0);
  const computeSerial = useRef(0);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const requestedCompute = useRef<{ id: number; base: EngineSnapshot; time: number } | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(media.matches);
    update(); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const clearCompute = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    requestedCompute.current = null;
  }, []);

  const failCompute = useCallback((message: string) => {
    clearCompute();
    ++computeSerial.current;
    worker.current?.terminate();
    worker.current = null;
    sceneRef.current = null;
    setScene(null);
    setStatus(message);
  }, [clearCompute]);

  const startWorker = useCallback(() => {
    if (typeof Worker === 'undefined') {
      setStatus('This browser cannot run the local scene. The acknowledged data and description remain available.');
      return;
    }
    try {
      const instance = new Worker(new URL('./petros-program-worker.ts', import.meta.url));
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<WorkerReply>) => {
        const request = requestedCompute.current;
        const reply = event.data;
        if (!request || !reply || reply.id !== request.id || reply.id !== computeSerial.current) return;
        clearCompute();
        if (!reply.ok) {
          failCompute(reply.error ?? 'Scene calculation stopped. The last acknowledged state is preserved.');
          return;
        }
        try {
          boundEngineInput(reply);
          const parsed = engineSnapshotSchema.parse(reply.snapshot);
          const views = engineResolvedViewsSchema.parse(reply.views);
          if (parsed.program.programId !== request.base.program.programId ||
            parsed.program.revision !== request.base.program.revision ||
            parsed.execution.branchId !== request.base.execution.branchId ||
            parsed.execution.version !== request.base.execution.version ||
            Math.abs(parsed.execution.time - request.time) > 1e-8 ||
            views.length !== parsed.program.views.length ||
            views.some((view, index) => view.id !== parsed.program.views[index]?.id))
            throw new Error('Worker response did not match the requested scene.');
          const resolved = { snapshot: parsed, views };
          sceneRef.current = resolved; setScene(resolved);
        } catch {
          failCompute('The scene returned invalid data. The last acknowledged state is preserved.');
        }
      };
      instance.onerror = () => failCompute('Scene calculation stopped. The last acknowledged state is preserved.');
    } catch {
      failCompute('The local scene could not start. The acknowledged data and description remain available.');
    }
  }, [clearCompute, failCompute]);

  const evaluate = useCallback((base: EngineSnapshot, time: number) => {
    if (!worker.current) startWorker();
    if (!worker.current) return;
    const id = ++computeSerial.current;
    clearCompute();
    requestedCompute.current = { id, base, time };
    timer.current = setTimeout(() => {
      if (id !== computeSerial.current) return;
      failCompute('The scene reached its compute time limit. The last acknowledged state is still available.');
    }, 5000);
    worker.current.postMessage({ id, snapshot: base, time });
  }, [clearCompute, failCompute, startWorker]);

  useEffect(() => {
    startWorker();
    return () => { clearCompute(); worker.current?.terminate(); worker.current = null; };
  }, [clearCompute, startWorker]);

  const applyAcknowledged = useCallback((next: EngineSnapshot) => {
    const parsed = engineSnapshotSchema.parse(next);
    if (draftVersion.current !== parsed.draft.version) {
      setNoteDraft(parsed.draft.text);
      draftVersion.current = parsed.draft.version;
    }
    lastAcknowledged.current = parsed;
    setSnapshot(parsed);
    sceneRef.current = null;
    setScene(null);
    evaluate(parsed, parsed.execution.time);
  }, [evaluate]);

  const recover = useCallback(async () => {
    const current = activeRef.current;
    if (!current) return;
    resumeAfterRetry.current = false;
    compareCandidate.current = null;
    const serial = ++requestSerial.current;
    setLoading(true);
    try {
      const response = await api.get<WorkspaceGet>(workspacePath(current));
      if (serial !== requestSerial.current) return;
      if (response?.status === 'available') {
        setCheckpoints(response.checkpoints ?? []);
        setReadyProgram(null);
        applyAcknowledged(response.snapshot);
        if (pendingRef.current?.operationId === response.receipt?.operationId) {
          pendingRef.current = null; setPending(null);
          setStatus('Recovered the acknowledged action.');
        } else {
          setStatus('Restored the last acknowledged scene. Unacknowledged actions are not persisted.');
        }
      } else if (response?.status === 'ready') {
        setReadyProgram(engineProgramSchema.parse(response.program));
        setSnapshot(null); setScene(null); sceneRef.current = null; setCheckpoints([]);
        setStatus('A scene is ready to start.');
      } else {
        setReadyProgram(null);
        setSnapshot(null); setScene(null); sceneRef.current = null; setCheckpoints([]);
        setStatus(response?.reason ?? 'No program is available for this lesson block.');
      }
    } catch (error) {
      if (serial === requestSerial.current)
        setStatus(`${formatApiError(error)}. The last acknowledged scene remains visible.`);
    } finally {
      if (serial === requestSerial.current) { setLoading(false); setBusy(false); }
    }
  }, [api, applyAcknowledged]);

  const activate = useCallback((next: Active) => {
    const previous = activeRef.current;
    if (previous?.sessionId === next.sessionId && previous.blockId === next.blockId) return;
    activeRef.current = next; requestSerial.current++; computeSerial.current++; clearCompute(); resumeAfterRetry.current = false; compareCandidate.current = null;
    setActive(next); setSnapshot(null); setScene(null); sceneRef.current = null; setComparison(null); setCheckpoints([]); setReadyProgram(null); setPending(null); pendingRef.current = null; setBusy(false); setLoading(false); setNoteDraft(''); setQuestionDraft(''); draftVersion.current = null;
    predictionPendingRef.current = null; setPredictionPending(null); setPredictionChallenge(null); setPredictionEvaluation(null); setPredictionStatus(''); setPredictionValue(''); setPredictionAssistance('unknown');
    lastAcknowledged.current = null;
    setStatus('Loading scene…');
  }, [clearCompute]);

  useEffect(() => { if (active) void recover(); }, [active, recover]);

  const submit = useCallback(async (command: EngineCommand, keepBusy = false) => {
    const current = activeRef.current;
    if (!current) return false;
    const serial = ++requestSerial.current;
    setBusy(true); setStatus('Saving scene action…');
    try {
      const response = await api.put<WorkspaceGet>(workspacePath(current), command);
      if (activeRef.current !== current || serial !== requestSerial.current) return false;
      if (response?.status !== 'available') throw new Error('Scene response did not include an acknowledged state.');
      if (command.action.type === 'compare') {
        const before = sceneRef.current;
        setComparison(before && before.snapshot.execution.time === lastAcknowledged.current?.execution.time
          ? before : compareCandidate.current);
        compareCandidate.current = null;
      }
      applyAcknowledged(response.snapshot);
      if (response.receipt?.checkpointId) setCheckpoints(previous => [
        { id: response.receipt!.checkpointId, version: response.snapshot.execution.version, branchId: response.snapshot.execution.branchId },
        ...previous.filter(item => item.id !== response.receipt!.checkpointId),
      ].slice(0, 50));
      setReadyProgram(null);
      pendingRef.current = null; setPending(null);
      setStatus(response.replayed ? 'Action already saved; scene restored.' : 'Scene action saved.');
      return true;
    } catch (error) {
      if (activeRef.current !== current || serial !== requestSerial.current) return false;
      if (error instanceof StudentApiError && error.status === 409) {
        setStatus('The scene changed elsewhere. Recover the latest acknowledged state before trying a new action.');
      } else {
        setStatus(`The action may have saved: ${formatApiError(error)}. Retry sends the exact same command, or recover from the server.`);
      }
      return false;
    } finally { if (activeRef.current === current && serial === requestSerial.current && !keepBusy) setBusy(false); }
  }, [api, applyAcknowledged]);

  const commitAction = useCallback(async (action: EngineAction, target: string, purpose: string, keepBusy = false) => {
    const base = lastAcknowledged.current;
    if (!base && action.type !== 'create') return false;
    const command: EngineCommand = {
      schemaVersion: 'petros.engine-command.v1', programId: action.type === 'create' ? action.program.programId : base!.program.programId,
      operationId: newUuid(), expectedRevision: base?.program.revision ?? 0,
      expectedExperimentVersion: base?.execution.version ?? 0, expectedDraftVersion: base?.draft.version ?? 0,
      target: action.type === 'create' ? activeRef.current?.blockId ?? target : target, purpose, action,
    };
    pendingRef.current = command; setPending(command);
    return submit(command, keepBusy);
  }, [submit]);
  const act = useCallback(async (action: EngineAction, target: string, purpose: string, trigger?: HTMLElement) => {
    if (pendingRef.current || busy || actionChainBusy.current) { setStatus('Resolve the pending action before starting another.'); return false; }
    if (action.type === 'expand' && !lastAcknowledged.current?.presentation.expanded)
      dialogOpener.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    actionChainBusy.current = true; resumeAfterRetry.current = false; setBusy(true);
    try {
      const base = lastAcknowledged.current;
      if (!base && action.type !== 'create') return false;
      if (!base) return await commitAction(action, target, purpose, true);

      const observed = sceneRef.current;
      const observedTime = observed && observed.snapshot.execution.branchId === base.execution.branchId &&
        observed.snapshot.execution.version === base.execution.version ? observed.snapshot.execution.time : base.execution.time;
      compareCandidate.current = action.type === 'compare' ? observed : null;
      const changesIntervention = action.type === 'set_parameter' &&
        base.program.parameters.find(parameter => parameter.id === action.parameterId)?.change === 'intervene';
      const keepsPlayback = changesIntervention || action.type === 'annotate' || action.type === 'expand' ||
        action.type === 'set_speed' || action.type === 'switch_representation' ||
        (action.type === 'interrupt' && action.mode === 'continue') ||
        ('entityId' in action && ['focus', 'point_to', 'select', 'isolate', 'hide', 'reveal', 'highlight'].includes(action.type)) ||
        action.type === 'restore_view';
      const checkpointsDisplayedTime = !['create', 'seek', 'step', 'play', 'pause'].includes(action.type);
      const checkpointNeeded = checkpointsDisplayedTime && Math.abs(observedTime - base.execution.time) > 1e-8;
      const mustPauseForStructural = (action.type === 'compose' || action.type === 'replace_subprogram') && base.execution.playing;
      const shouldResume = base.execution.playing && keepsPlayback && (checkpointNeeded || mustPauseForStructural);

      if (checkpointNeeded || mustPauseForStructural) {
        const paused = await commitAction({ type: 'seek', time: checkpointNeeded ? observedTime : base.execution.time },
          'execution', 'Keep the currently displayed scene time before this action', true);
        if (!paused) { compareCandidate.current = null; return false; }
      }
      const succeeded = await commitAction(action, target, purpose, true);
      if (!succeeded) { resumeAfterRetry.current = shouldResume; return false; }
      if (shouldResume) {
        const resumed = await commitAction({ type: 'play' }, 'execution', 'Continue playback after the scene action', true);
        if (!resumed) return false;
      }
      return true;
    } finally {
      actionChainBusy.current = false;
      setBusy(false);
    }
  }, [busy, commitAction]);
  const retry = useCallback(async () => {
    if (!pendingRef.current || actionChainBusy.current) return;
    actionChainBusy.current = true; setBusy(true);
    const resume = resumeAfterRetry.current;
    try {
      const succeeded = await submit(pendingRef.current, true);
      if (succeeded && resume) {
        resumeAfterRetry.current = false;
        await commitAction({ type: 'play' }, 'execution', 'Continue playback after the retried scene action', true);
      }
    } finally { actionChainBusy.current = false; setBusy(false); }
  }, [commitAction, submit]);
  const abandonPending = useCallback(() => { pendingRef.current = null; resumeAfterRetry.current = false; compareCandidate.current = null; setPending(null); setStatus('Pending action set aside. The acknowledged scene remains visible.'); }, []);
  const previewAt = useCallback((time: number) => {
    const base = lastAcknowledged.current;
    if (base && Number.isFinite(time)) evaluate(base, time);
  }, [evaluate]);

  const runPrediction = useCallback(async (request: PredictionPending) => {
    const current = activeRef.current;
    if (!current) return;
    predictionPendingRef.current = request;
    setPredictionPending(request);
    setPredictionStatus(request.kind === 'issue' ? 'Requesting a server-set prediction prompt…' : 'Checking your prediction…');
    try {
      if (request.kind === 'issue') {
        const response = await api.issuePetrosWorkspacePrediction(current.sessionId, current.blockId, {
          requestId: request.requestId, modelId: request.modelId,
        });
        if (activeRef.current !== current || predictionPendingRef.current !== request) return;
        if (response.status !== 'challenge' || response.modelId !== request.modelId ||
          !Number.isFinite(response.targetTime) || !response.challengeId)
          throw new Error('The server returned an invalid prediction prompt.');
        setPredictionChallenge(response);
        setPredictionEvaluation(null);
        predictionPendingRef.current = null; setPredictionPending(null);
        setPredictionStatus('Prompt ready. The model outcome is still hidden.');
      } else {
        const response = await api.answerPetrosWorkspacePrediction(current.sessionId, current.blockId, {
          requestId: request.requestId, challengeId: request.challengeId,
          predictedValue: request.predictedValue, assistance: request.assistance,
        });
        if (activeRef.current !== current || predictionPendingRef.current !== request) return;
        if (response.status !== 'evaluated' || response.challenge.challengeId !== request.challengeId ||
          response.predictedValue !== request.predictedValue || !Number.isFinite(response.referenceValue) ||
          !Number.isFinite(response.tolerance) || response.masteryAdmitted !== false)
          throw new Error('The server returned an invalid prediction evaluation.');
        setPredictionEvaluation(response);
        predictionPendingRef.current = null; setPredictionPending(null);
        setPredictionStatus('Prediction checked. This is an observation; it does not establish mastery.');
      }
    } catch (error) {
      if (activeRef.current === current && predictionPendingRef.current === request)
        setPredictionStatus(`${formatApiError(error)}. Retry sends the exact same request, or refresh the scene.`);
    }
  }, [api]);

  const issuePrediction = useCallback(async (modelId: string) => {
    if (predictionPendingRef.current) return;
    setPredictionChallenge(null); setPredictionEvaluation(null);
    setPredictionValue(''); setPredictionAssistance('unknown');
    await runPrediction({ kind: 'issue', requestId: newUuid(), modelId });
  }, [runPrediction]);
  const answerPrediction = useCallback(async (predictedValue: number, assistance: PetrosPredictionAssistance) => {
    const challenge = predictionChallenge;
    if (!challenge || predictionPendingRef.current || !Number.isFinite(predictedValue)) return;
    await runPrediction({ kind: 'answer', requestId: newUuid(), challengeId: challenge.challengeId,
      predictedValue, assistance });
  }, [predictionChallenge, runPrediction]);
  const retryPrediction = useCallback(async () => {
    if (predictionPendingRef.current) await runPrediction(predictionPendingRef.current);
  }, [runPrediction]);
  const resetPrediction = useCallback(() => {
    predictionPendingRef.current = null; setPredictionPending(null); setPredictionChallenge(null); setPredictionValue(''); setPredictionAssistance('unknown');
    setPredictionEvaluation(null); setPredictionStatus('Prediction cleared. Request a new prompt from the current acknowledged scene.');
  }, []);

  const speak = useCallback((text: string, beat: number, character: number, offset: number) => {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false;
    speechSynthesis.cancel();
    const prior = narrationRef.current;
    const start = prior.beat === beat ? Math.min(text.length, prior.character) : Math.min(text.length, character);
    const token = prior.token + 1;
    const utterance = new SpeechSynthesisUtterance(text.slice(start));
    const next: NarrationCursor = { beat, character: start, offset, playing: true, boundaryReceived: false, token };
    narrationRef.current = next; setNarration(next); utteranceRef.current = utterance;
    utterance.onboundary = event => {
      if (narrationRef.current.token !== token) return;
      const characterIndex = Math.max(0, Math.min(text.length, start + event.charIndex));
      const cursor = { ...narrationRef.current, character: characterIndex,
        offset: Math.min(3600, offset + Math.max(0, event.elapsedTime)), boundaryReceived: true };
      narrationRef.current = cursor; setNarration(cursor);
    };
    utterance.onend = event => {
      if (narrationRef.current.token !== token) return;
      const cursor = { ...narrationRef.current, character: text.length,
        offset: Math.min(3600, offset + Math.max(0, event.elapsedTime)), playing: false };
      narrationRef.current = cursor; setNarration(cursor); utteranceRef.current = null;
    };
    utterance.onerror = () => {
      if (narrationRef.current.token !== token) return;
      const cursor = { ...narrationRef.current, playing: false };
      narrationRef.current = cursor; setNarration(cursor); utteranceRef.current = null;
    };
    speechSynthesis.speak(utterance);
    return true;
  }, []);
  const stopNarration = useCallback(() => {
    const cursor = narrationRef.current;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    const stopped = { ...cursor, playing: false };
    narrationRef.current = stopped; setNarration(stopped); utteranceRef.current = null;
    return stopped;
  }, []);
  useEffect(() => () => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    utteranceRef.current = null;
  }, []);

  useEffect(() => {
    if (!snapshot?.execution.playing || (prefersReducedMotion && !allowContinuousMotion) ||
      (snapshot.teaching.interrupted && snapshot.teaching.mode === 'freeze')) return;
    const started = performance.now();
    const baseTime = snapshot.execution.time;
    const limit = engineDuration(snapshot);
    let ending = false;
    const interval = window.setInterval(() => {
      const time = Math.min(limit, baseTime + (performance.now() - started) * snapshot.presentation.speed / 1000);
      previewAt(time);
      if (time >= limit && !ending) {
        ending = true; window.clearInterval(interval);
        void act({ type: 'seek', time: limit }, 'execution', 'Reach experiment end');
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [snapshot, previewAt, act, prefersReducedMotion, allowContinuousMotion]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (snapshot?.presentation.expanded && !node.open) {
      if (!dialogOpener.current)
        dialogOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      node.showModal();
      node.querySelector<HTMLElement>('button')?.focus();
    } else if (!snapshot?.presentation.expanded) {
      if (node.open) node.close();
      if (!busy) {
        const opener = dialogOpener.current;
        dialogOpener.current = null;
        if (opener) {
          // Safari may restore dialog focus before React has re-enabled the triggering
          // button. Wait until after the close and state commit, then focus that exact
          // workspace instance (never a document-wide selector).
          const afterPaint = (callback: FrameRequestCallback) => {
            if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(callback);
            else window.setTimeout(() => callback(performance.now()), 0);
          };
          afterPaint(() => afterPaint(() => {
            if (!node.open && opener.isConnected && !opener.hasAttribute('disabled'))
              opener.focus({ preventScroll: true });
          }));
        }
      }
    }
  }, [snapshot?.presentation.expanded, busy]);

  const value = useMemo<WorkspaceContext>(() => ({ active, snapshot, readyProgram, scene, comparison, noteDraft, setNoteDraft, questionDraft, setQuestionDraft, predictionChallenge, predictionEvaluation, predictionPending, predictionStatus, predictionValue, setPredictionValue, predictionAssistance, setPredictionAssistance, narration, checkpoints, loading, busy, prefersReducedMotion, allowContinuousMotion, setAllowContinuousMotion, status, pending, activate, act, retry, abandonPending, recover, previewAt, issuePrediction, answerPrediction, retryPrediction, resetPrediction, speak, stopNarration }),
    [active, snapshot, readyProgram, scene, comparison, noteDraft, questionDraft, predictionChallenge, predictionEvaluation, predictionPending, predictionStatus, predictionValue, predictionAssistance, narration, checkpoints, loading, busy, prefersReducedMotion, allowContinuousMotion, status, pending, activate, act, retry, abandonPending, recover, previewAt, issuePrediction, answerPrediction, retryPrediction, resetPrediction, speak, stopNarration]);
  return <Context.Provider value={value}>
    {children}
    <dialog id="petros-expanded-scene" ref={dialog} className={styles.dialog} aria-label="Expanded Petros scene" onCancel={event => {
      event.preventDefault(); if (!busy) void act({ type: 'expand' }, 'presentation', 'Close expanded scene');
    }}>
      {snapshot?.presentation.expanded ? <WorkspaceBody expanded /> : null}
    </dialog>
  </Context.Provider>;
}

/** Lesson and companion use this same app-level workspace state. */
export function PetrosProgramWorkspace({ sessionId, blockId }: Active) {
  const workspace = useContext(Context);
  const activate = workspace?.activate;
  useEffect(() => { activate?.({ sessionId, blockId }); }, [sessionId, blockId, activate]);
  if (!workspace) return null;
  if (workspace.active?.sessionId !== sessionId || workspace.active.blockId !== blockId) return null;
  return <WorkspaceBody />;
}

export function PetrosProgramWorkspaceCompanion() {
  const context = useContext(Context);
  if (!context) return null;
  const { active, snapshot, scene, act, status, busy, pending } = context;
  if (!active) return null;
  const selectedViews = scene?.views.filter(view => snapshot?.presentation.viewIds.includes(view.id)) ?? [];
  return <section className={styles.launcher} aria-label="Current learning scene">
    <strong>Learning scene: {snapshot?.program.title ?? status}</strong>
    {snapshot && <>
      <span>Branch {snapshot.execution.branchId.slice(0, 8)} · {((scene?.snapshot.execution.time ?? snapshot.execution.time)).toFixed(2)} s · state {snapshot.execution.version}</span>
      <details>
        <summary>Scene values (text alternative)</summary>
        <p>{snapshot.program.description.dataDescription} Current acknowledged values:</p>
        <table><thead><tr><th scope="col">Quantity</th><th scope="col">Value</th></tr></thead><tbody>
          {Object.entries(scene?.snapshot.execution.values ?? snapshot.execution.values).map(([key, value]) => <tr key={key}><th scope="row">{key}</th><td>{String(value)}</td></tr>)}
        </tbody></table>
      </details>
      <PetrosPreparedVisual text={snapshot.program.description.dataDescription}>
        {selectedViews.map(view => <SceneView key={view.id} view={view} snapshot={scene!.snapshot}
          select={entityId => void act({ type: 'select', entityId }, entityId, 'Select scene element in companion')} />)}
        <button type="button" aria-expanded={snapshot.presentation.expanded} aria-controls="petros-expanded-scene" disabled={busy || !!pending || snapshot.presentation.expanded}
          onClick={() => void act({ type: 'expand' }, 'presentation', 'Open scene beside conversation')}>
          Open expanded scene
        </button>
      </PetrosPreparedVisual>
    </>}
  </section>;
}

function WorkspaceBody({ expanded = false }: { expanded?: boolean }) {
  const { active, snapshot, readyProgram, scene, comparison, checkpoints, loading, busy, status, pending, noteDraft, setNoteDraft, questionDraft, setQuestionDraft,
    predictionChallenge, predictionEvaluation, predictionPending, predictionStatus, predictionValue, setPredictionValue, predictionAssistance,
    setPredictionAssistance, issuePrediction, answerPrediction, retryPrediction, resetPrediction,
    narration, speak, stopNarration, prefersReducedMotion, allowContinuousMotion, setAllowContinuousMotion,
    act, retry, abandonPending, recover, previewAt } = useWorkspace();
  const [timeDraft, setTimeDraft] = useState('0');
  const [parameterDrafts, setParameterDrafts] = useState<Record<string, string>>({});
  const [predictionModelId, setPredictionModelId] = useState('');
  useEffect(() => {
    setTimeDraft(String(snapshot?.execution.time ?? 0));
    setParameterDrafts(Object.fromEntries(Object.entries(snapshot?.execution.parameters ?? {}).map(([id, value]) => [id, String(value)])));
  }, [snapshot?.execution.time, snapshot?.execution.parameters]);
  useEffect(() => {
    const models = snapshot?.program.models ?? readyProgram?.models ?? [];
    if (!models.some(model => model.id === predictionModelId)) setPredictionModelId(models[0]?.id ?? '');
  }, [snapshot?.program.models, readyProgram?.models, predictionModelId]);
  const stepwiseMotion = prefersReducedMotion && !allowContinuousMotion;
  useEffect(() => {
    if (snapshot?.execution.playing && stepwiseMotion)
      void act({ type: 'pause' }, 'execution', 'Pause for reduced-motion preference');
  }, [snapshot?.execution.playing, stepwiseMotion, act]);
  if (!snapshot) return <section className={styles.workspace} aria-label="Petros program workspace">
    <p role="status">{loading ? 'Loading scene…' : status || 'The scene is not available.'}</p>
    {readyProgram && <button type="button" disabled={busy || !!pending} onClick={() => void act({ type: 'create', program: readyProgram }, 'program', 'Start reviewed scene')}>Start scene</button>}
    <button type="button" onClick={() => void recover()} disabled={loading}>Refresh scene</button>
  </section>;

  const { program, execution, presentation, teaching } = snapshot;
  const selected = program.entities.find(entity => entity.id === presentation.selectedEntityId);
  const beat = program.teachingTrack[teaching.beat];
  const currentTime = scene?.snapshot.execution.time ?? execution.time;
  const displayedParameters = effectiveEngineParameters(snapshot, currentTime);
  const send = (action: EngineAction, target: string, purpose: string) => { void act(action, target, purpose); };
  const interrupt = async (mode: 'freeze' | 'continue') => {
    const cursor = stopNarration();
    window.dispatchEvent(new Event('petros:workspace-interrupt'));
    return act({ type: 'interrupt', mode, beat: teaching.beat,
      character: cursor.beat === teaching.beat ? cursor.character : teaching.character,
      offset: Math.min(3600, cursor.beat === teaching.beat ? cursor.offset : teaching.offset) },
      'teaching', 'Student interrupted the explanation');
  };

  return <section className={styles.workspace} aria-label="Petros program workspace">
    <div className={styles.header}>
      <div><h3>{program.title}</h3><p>{program.description.summary}</p></div>
      <div className={styles.actions}>
        {!expanded && <button type="button" aria-expanded={snapshot?.presentation.expanded ?? false} aria-controls="petros-expanded-scene" onClick={event => void act({ type: 'expand' }, 'presentation', 'Expand learning scene', event.currentTarget)} disabled={busy}>Expand</button>}
        {expanded && <button type="button" aria-expanded={snapshot?.presentation.expanded ?? true} aria-controls="petros-expanded-scene" onClick={() => send({ type: 'expand' }, 'presentation', 'Return to lesson')} disabled={busy}>Return to lesson</button>}
      </div>
    </div>
    <p className={styles.caption}>{program.provenance.replaceAll('_', ' ')} · {program.assumptions.join(' · ')}</p>
    {status && <p role="status" className={`${styles.status} ${pending ? styles.limit : ''}`}>{status}</p>}
    {pending && <div className={styles.actions}>
      <button type="button" disabled={busy} onClick={() => void retry()}>Retry exact action</button>
      <button type="button" disabled={busy} onClick={() => void recover()}>Recover acknowledged state</button>
      <button type="button" disabled={busy} onClick={abandonPending}>Set action aside</button>
    </div>}
    {beat && <div className={styles.beat}>
      <p><strong>Explanation {teaching.beat + 1} of {program.teachingTrack.length}:</strong> {beat.text}</p>
      <p className={styles.caption}>Narration position: {narration.beat === teaching.beat ? narration.offset.toFixed(1) : teaching.offset.toFixed(1)} s · character {narration.beat === teaching.beat ? narration.character : teaching.character} of {beat.text.length} · {teaching.interrupted ? `Interrupted; ${teaching.mode} mode` : narration.playing ? 'Speaking' : 'Ready'}</p>
      {teaching.interrupted && narration.beat === teaching.beat && !narration.boundaryReceived && <p role="status">This browser did not report a speech boundary. Resume starts from the last confirmed text position.</p>}
      <div className={styles.actions}>
        <button type="button" onClick={() => { void speak(beat.text, teaching.beat, teaching.character, teaching.offset); }} disabled={narration.playing || teaching.interrupted}>Speak</button>
        <button type="button" onClick={() => void interrupt('freeze')}>Interrupt and freeze</button>
        <button type="button" onClick={() => void interrupt('continue')}>Interrupt; let simulation continue</button>
        {teaching.interrupted && <button type="button" onClick={() => { void (async () => {
          const resumed = await act({ type: 'resume' }, 'teaching', 'Resume explanation');
          if (resumed && beat) speak(beat.text, teaching.beat, teaching.character, teaching.offset);
        })(); }}>Resume explanation</button>}
        <button type="button" disabled={teaching.beat <= 0} onClick={() => send({ type: 'set_beat', beat: teaching.beat - 1, offset: 0 }, 'teaching', 'Previous explanation')}>Previous beat</button>
        <button type="button" disabled={teaching.beat >= program.teachingTrack.length - 1} onClick={() => send({ type: 'set_beat', beat: teaching.beat + 1, offset: 0 }, 'teaching', 'Next explanation')}>Next beat</button>
      </div>
    </div>}
    <section className={styles.beat} aria-label="Prediction check">
      <h4>Make a prediction</h4>
      <p>Petros will ask about the acknowledged model state before showing the outcome. Your response is an observation, not mastery evidence.</p>
      {!predictionChallenge && <div className={styles.actions}>
        <label>Model <select aria-label="Prediction model" value={predictionModelId} onChange={event => setPredictionModelId(event.target.value)} disabled={!!predictionPending || program.models.length === 0}>
          {program.models.map(model => <option key={model.id} value={model.id}>{model.capabilityId}</option>)}
        </select></label>
        <button type="button" disabled={busy || !!predictionPending || !predictionModelId} onClick={() => void issuePrediction(predictionModelId)}>Request prediction prompt</button>
      </div>}
      {predictionChallenge && !predictionEvaluation && <div>
        <p><strong>{predictionChallenge.prompt}</strong></p>
        <p className={styles.caption}>Prompt from saved state {predictionChallenge.experimentVersion}; branch {execution.branchId.slice(0, 8)}. The criterion and model outcome stay hidden until you submit.</p>
        <label>My prediction ({predictionChallenge.unit}) <input type="number" min={-1_000_000_000} max={1_000_000_000} step="any" value={predictionValue}
          disabled={!!predictionPending} onChange={event => setPredictionValue(event.target.value)} /></label>
        <label>Help used <select aria-label="Help used for prediction" value={predictionAssistance} disabled={!!predictionPending}
          onChange={event => setPredictionAssistance(event.target.value as PetrosPredictionAssistance)}>
          <option value="unknown">I’m not sure / prefer not to say</option><option value="none_observed">No help observed</option>
          <option value="petros_help">Petros helped</option><option value="external_declared">I used outside help</option>
        </select></label>
        <button type="button" disabled={busy || !!predictionPending || predictionValue === '' || !Number.isFinite(Number(predictionValue)) || Number(predictionValue) < -1_000_000_000 || Number(predictionValue) > 1_000_000_000}
          onClick={() => void answerPrediction(Number(predictionValue), predictionAssistance)}>Check prediction</button>
      </div>}
      {predictionPending && <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={() => void retryPrediction()}>Retry exact prediction request</button>
        <button type="button" disabled={busy} onClick={() => { resetPrediction(); void recover(); }}>Refresh scene and clear prediction</button>
      </div>}
      {predictionEvaluation && <div>
        <p><strong>{predictionEvaluation.result === 'within_tolerance' ? 'Your prediction was within the model tolerance.' : 'Your prediction was outside the model tolerance.'}</strong></p>
        <p>Prediction: {predictionEvaluation.predictedValue} {predictionEvaluation.challenge.unit}. Model value: {predictionEvaluation.referenceValue} {predictionEvaluation.challenge.unit}. Tolerance: ±{predictionEvaluation.tolerance} {predictionEvaluation.challenge.unit}.</p>
        <p>Help: {predictionEvaluation.assistance.replaceAll('_', ' ')}. Outside help remains {predictionEvaluation.externalHelp}. No mastery was admitted.</p>
        <button type="button" disabled={busy || !!predictionPending} onClick={resetPrediction}>Clear result</button>
      </div>}
      {predictionStatus && <p role="status" aria-live="polite">{predictionStatus}</p>}
    </section>
    <div className={styles.actions} aria-label="Scene time controls">
      <button type="button" disabled={busy || (stepwiseMotion && execution.time >= engineDuration(snapshot))} onClick={() => {
        if (execution.playing) void (async () => {
          if (currentTime !== execution.time) await act({ type: 'seek', time: currentTime }, 'execution', 'Keep observed time');
          await act({ type: 'pause' }, 'execution', 'Pause experiment');
        })();
        else if (stepwiseMotion) send({ type: 'step', time: Math.min(engineDuration(snapshot), currentTime + .1) }, 'execution', 'Advance one reduced-motion step');
        else send({ type: 'play' }, 'execution', 'Play experiment');
      }}>{execution.playing ? 'Pause' : stepwiseMotion ? 'Advance one step' : 'Play'}</button>
      {prefersReducedMotion && <label><input type="checkbox" checked={allowContinuousMotion} onChange={event => setAllowContinuousMotion(event.target.checked)} />Allow continuous simulation motion</label>}
      <button type="button" disabled={busy || currentTime >= engineDuration(snapshot)} onClick={() => send({ type: 'step', time: Math.min(engineDuration(snapshot), currentTime + .1) }, 'execution', 'Step experiment')}>Step</button>
      <button type="button" onClick={() => send({ type: 'seek', time: 0 }, 'execution', 'Return to first checkpoint')}>Start</button>
      <label>Time (s) <input type="number" min={0} max={engineDuration(snapshot)} step="0.1" value={timeDraft} disabled={busy || !!pending}
        onChange={event => { const raw = event.target.value; setTimeDraft(raw); if (raw.trim() === '') return; const time = Number(raw); if (Number.isFinite(time) && time >= 0 && time <= engineDuration(snapshot)) previewAt(time); }}
        onBlur={() => { const raw = timeDraft.trim(); const time = Number(raw); if (raw !== '' && Number.isFinite(time) && time >= 0 && time <= engineDuration(snapshot)) { if (time !== execution.time) send({ type: 'seek', time }, 'execution', 'Seek to selected time'); } else setTimeDraft(String(execution.time)); }} /></label>
      <label>Speed <select value={presentation.speed} onChange={event => send({ type: 'set_speed', speed: Number(event.target.value) }, 'presentation', 'Change playback speed')}>
        {[.25,.5,1,2,4].map(speed => <option key={speed} value={speed}>{speed}×</option>)}
      </select></label>
      <span>Branch {execution.branchId.slice(0, 8)} · state {execution.version}</span>
    </div>
    <div className={styles.controlGrid}>
      {program.parameters.map(parameter => <label className={styles.control} key={parameter.id}>
        {parameter.label} <small>{parameter.change} · {parameter.unit}</small>
        {parameter.type === 'boolean' ? <select disabled={busy || !!pending} value={String(displayedParameters[parameter.id])} onChange={event => send({ type: 'set_parameter', parameterId: parameter.id, value: event.target.value === 'true', unit: parameter.unit }, parameter.id, 'Change experiment parameter')}>
          <option value="true">On</option><option value="false">Off</option>
        </select> : <input type="number" min={parameter.min} max={parameter.max} step="any" value={parameterDrafts[parameter.id] ?? ''} disabled={busy || !!pending}
          onChange={event => setParameterDrafts(current => ({ ...current, [parameter.id]: event.target.value }))}
          onBlur={() => { const value = Number(parameterDrafts[parameter.id]); if (parameterDrafts[parameter.id] !== '' && Number.isFinite(value) && value >= parameter.min && value <= parameter.max)
            { if (value !== execution.parameters[parameter.id]) send({ type: 'set_parameter', parameterId: parameter.id, value, unit: parameter.unit }, parameter.id, 'Change experiment parameter'); }
            else setParameterDrafts(current => ({ ...current, [parameter.id]: String(execution.parameters[parameter.id]) })); }} />}
      </label>)}
    </div>
    <div className={styles.actions} aria-label="Representations">
      {program.views.map(view => <button type="button" key={view.id} aria-pressed={presentation.viewIds.includes(view.id)}
        onClick={() => send({ type: 'switch_representation', viewIds: [view.id] }, view.id, 'Switch representation')}>{view.title}</button>)}
      <button type="button" onClick={() => send({ type: 'switch_representation', viewIds: program.views.map(view => view.id) }, 'presentation', 'Compare linked representations')}>Show linked views</button>
    </div>
    <div className={styles.views}>
      {(scene?.views ?? program.views).filter(view => presentation.viewIds.includes(view.id)).map(view =>
        <SceneView key={view.id} view={view} snapshot={scene?.snapshot ?? snapshot} select={entityId => send({ type: 'select', entityId }, entityId, 'Select scene element')} />)}
    </div>
    {comparison && <details open><summary>Earlier comparison branch {comparison.snapshot.execution.branchId.slice(0, 8)}</summary>
      <p>Time {comparison.snapshot.execution.time.toFixed(2)} s. Model assumptions remain {comparison.snapshot.program.assumptions.join('; ')}.</p>
      <div className={styles.views}>{comparison.views.filter(view => comparison.snapshot.presentation.viewIds.includes(view.id)).map(view =>
        <SceneView key={view.id} view={view} snapshot={comparison.snapshot} select={entityId => send({ type: 'select', entityId }, entityId, 'Select scene element')} />)}</div>
    </details>}
    <details><summary>Scene data and description</summary><p>{program.description.dataDescription}</p>
      <p>Values below describe the current {scene ? 'local preview' : 'acknowledged state'} at {currentTime.toFixed(2)} seconds. Exploration alone is not learning evidence.</p>
      <table><thead><tr><th scope="col">Quantity</th><th scope="col">Value</th></tr></thead><tbody>
        {Object.entries(scene?.snapshot.execution.values ?? execution.values).map(([key,value]) => <tr key={key}><th scope="row">{key}</th><td>{String(value)}</td></tr>)}
      </tbody></table></details>
    {checkpoints.length > 1 && <details><summary>Compare experiment branches</summary>
      <ul>{checkpoints.slice(1).map(checkpoint => <li key={checkpoint.id}>
        <button type="button" onClick={() => send({ type: 'compare', checkpointId: checkpoint.id }, 'execution', 'Compare with saved experiment branch')}>
          Compare with state {checkpoint.version}, branch {checkpoint.branchId.slice(0, 8)}
        </button>
      </li>)}</ul>
    </details>}
    {selected && <div className={styles.beat}>
      <strong>Selected: {selected.label}</strong><p>{selected.description}</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => send({ type: 'isolate', entityId: selected.id }, selected.id, 'Isolate selected element')}>Isolate</button>
        <button type="button" onClick={() => send({ type: 'highlight', entityId: selected.id }, selected.id, 'Highlight selected element')}>Highlight</button>
        <button type="button" onClick={() => send({ type: 'restore_view' }, 'presentation', 'Restore all elements')}>Restore view</button>
      </div>
      <label>Question about this element <input value={questionDraft} onChange={event => setQuestionDraft(event.target.value)} placeholder="What does this show?" /></label>
      <button type="button" onClick={() => { void (async () => {
        const saved = await interrupt('freeze');
        if (saved && questionDraft.trim()) window.dispatchEvent(new CustomEvent('petros:workspace-question', { detail: { question: questionDraft.trim(), entityId: selected.id, programId: program.programId, revision: program.revision, branchId: execution.branchId, time: currentTime } }));
      })(); }}>Ask Petros</button>
    </div>}
    {active && <PetrosWorkspaceNoteSave sessionId={active.sessionId} blockId={active.blockId} snapshot={snapshot} text={noteDraft} setText={setNoteDraft}
      disabled={busy || noteDraft === snapshot.draft.text} onSave={() => send({ type: 'annotate', text: noteDraft }, 'draft', 'Save my scene notes')}
      onReconciled={() => { void recover(); }} />}
    <details><summary>Model limits and provenance</summary><ul>{snapshot.report.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul></details>
  </section>;
}

function SceneView({ view, snapshot, select }: { view: View | EngineProgram['views'][number]; snapshot: EngineSnapshot; select: (entityId: string) => void }) {
  const hidden = new Set(snapshot.presentation.hidden);
  const selected = snapshot.presentation.selectedEntityId;
  const plotData = 'plotData' in view ? view.plotData : [];
  return <figure><figcaption>{view.title}</figcaption>
    <p className={styles.caption}>{snapshot.program.description.dataDescription}</p>
    <svg className={styles.canvas} viewBox={`0 0 ${view.width} ${view.height}`} role="img" aria-label={`${view.title}. ${snapshot.program.description.summary}. Spatial depth, when present, is listed after the diagram.`}>
      {view.primitives.filter(primitive => primitive.visible && !hidden.has(primitive.entityId)).map(primitive => {
        const common = { 'data-selected': selected === primitive.entityId, onClick: () => select(primitive.entityId),
          onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(primitive.entityId); } },
          tabIndex: 0, role: 'button', 'aria-label': primitive.description };
        switch (primitive.kind) {
          case 'point': return <g key={primitive.id} {...common}><circle cx={primitive.x} cy={primitive.y} r={5} /></g>;
          case 'spatial_point': { const projected = projectEngineSpatialPoint({ x: primitive.x, y: primitive.y, z: primitive.z! });
            return <g key={primitive.id} {...common}><circle cx={projected.x} cy={projected.y} r={5} /></g>; }
          case 'line': case 'vector': { const x2 = primitive.x2 ?? primitive.x; const y2 = primitive.y2 ?? primitive.y;
            const angle = Math.atan2(y2 - primitive.y, x2 - primitive.x); const head = Math.min(8, Math.max(3, Math.hypot(x2 - primitive.x, y2 - primitive.y) * .18));
            const left = { x: x2 - head * Math.cos(angle - .48), y: y2 - head * Math.sin(angle - .48) };
            const right = { x: x2 - head * Math.cos(angle + .48), y: y2 - head * Math.sin(angle + .48) };
            return <g key={primitive.id} {...common}><line x1={primitive.x} y1={primitive.y} x2={x2} y2={y2} />{primitive.kind === 'vector' && <>
              <polyline points={`${left.x},${left.y} ${x2},${y2} ${right.x},${right.y}`} />
              <circle cx={x2} cy={y2} r={2} />
            </>}</g>; }
          case 'rect': return <g key={primitive.id} {...common}><rect x={primitive.x} y={primitive.y} width={primitive.width ?? 1} height={primitive.height ?? 1} /></g>;
          case 'plot': return <g key={primitive.id} {...common}><polyline points={primitive.points?.map(point => `${point.x},${point.y}`).join(' ') ?? ''} /></g>;
          case 'text': case 'equation': case 'readout': return <g key={primitive.id} {...common}><text x={primitive.x} y={primitive.y}>{primitive.text ?? (primitive.value === undefined ? primitive.description : `${primitive.value.toPrecision(4)} ${primitive.unit ?? ''}`)}</text></g>;
        }
      })}
    </svg>
    <ul>{view.primitives.filter(primitive => primitive.visible && !hidden.has(primitive.entityId)).map(primitive =>
      <li key={primitive.id}><button type="button" onClick={() => select(primitive.entityId)} aria-pressed={selected === primitive.entityId}>
        {primitive.description}{primitive.kind === 'spatial_point' ? `: x ${primitive.x.toPrecision(4)}, y ${primitive.y.toPrecision(4)}, depth ${primitive.z?.toPrecision(4) ?? 'not given'} (projected onto this view)` : ''}
        {primitive.value === undefined ? '' : `: ${primitive.value.toPrecision(4)} ${primitive.unit ?? ''}`}
      </button></li>)}</ul>
    {plotData.map(plot => <details key={plot.primitiveId}>
      <summary>Data for {plot.xLabel} and {plot.yLabel} ({plot.samples.length} samples)</summary>
      <p>These are model values; the drawing uses scaled screen coordinates.</p>
      <table><thead><tr><th scope="col">Time (s)</th><th scope="col">{plot.xLabel} ({plot.xUnit})</th><th scope="col">{plot.yLabel} ({plot.yUnit})</th></tr></thead><tbody>
        {plot.samples.map((sample, index) => <tr key={index}><td>{sample.time.toPrecision(5)}</td><td>{sample.x.toPrecision(5)}</td><td>{sample.y.toPrecision(5)}</td></tr>)}
      </tbody></table>
    </details>)}
  </figure>;
}
