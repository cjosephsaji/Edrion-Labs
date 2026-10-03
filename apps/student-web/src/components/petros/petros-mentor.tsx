'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  Clock3,
  Coffee,
  Compass,
  LoaderCircle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Send,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type {
  PetrosActionResult,
  PetrosCompanionMessage,
  PetrosCompanionTurnResult,
  PetrosMentorDecision,
  PetrosMentorFeedback,
  PetrosMentorPreferences,
  PetrosMentorPriority,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import { PetrosProgramWorkspaceCompanion } from './petros-program-workspace';
import { PetrosDoorButton } from './petros-door-button';
import {
  usePetrosCompanion,
  type PetrosLessonInterruption,
} from './petros-companion-context';
import type {
  PetrosLessonNarrationSegment,
  PetrosLessonPausePoint,
} from './petros-lesson-narration';
import {
  PETROS_LESSON_PROGRESS_EVENT,
  type PetrosLessonProgress,
} from './petros-narrated-text';
import {
  calculatePetrosPlacement,
  findPetrosTarget,
  petrosGuidePanelSide,
  petrosEntityTarget,
  type PetrosPlacement,
  type PetrosPointDirection,
} from './petros-spatial';
import { buildPetrosSpeechTimeline, usePetrosVoice } from './use-petros-voice';
import { usePetrosConnectivityMode } from './use-petros-connectivity-mode';
import styles from './petros-mentor.module.css';

const QUERY_KEY = ['student', 'petros', 'mentor'];
type GuideStep = { key: string; text: string; href?: string; openExplore?: boolean };
type Guide = { steps: GuideStep[]; index: number; auto: boolean; tour: boolean };
type DiagramNarration = { diagramId: string; step: number; targetKey: string; text: string };
type SessionPulse = {
  mastered: number;
  total: number;
  xp: number;
  streak: number;
  flashcards: number;
  elapsedLabel: string;
  paceLabel: string;
};
type View = 'buddy' | 'plan' | 'settings';
type ActionState = Record<string, { status: PetrosActionResult['status']; message: string } | undefined>;
type GuideItem = {
  entityType: PetrosMentorPriority['entityType'];
  entityId?: string | null;
  reason?: string | null;
};

type SessionReaction = {
  kind: 'reading' | 'thinking' | 'correct' | 'retry' | 'checkpoint' | 'celebrate';
  label: string;
};

const PAGE_HINTS: Record<string, string> = {
  '/home': 'Your real priorities live here. I compare deadlines with what you still need to learn.',
  '/learn': 'This is your learning workspace. I can start or continue one focused session from here.',
  '/materials': 'Your teacher files and study resources are here. I’ll point to the fastest useful source.',
  '/progress': 'This is your evidence-based progress. Untouched is not the same as weak.',
  '/assignments': 'Here are your assignments. Choose one to open or ask about.',
  '/homework': 'Here is your homework. Choose one to open or ask about.',
  '/exams': 'Your exam dates and syllabus are here. We can turn one into a focused revision route.',
  '/attendance': 'Here is attendance. I’ll point to the subject that actually needs attention.',
  '/timetable': 'This is your schedule. We can find the next class or a realistic study gap.',
  '/calendar': 'Deadlines and study blocks meet here.',
  '/results': 'These are your published results. We’ll use the specific feedback, not label your ability.',
  '/notes': 'Your teachers’ notes are here. I can take you to the relevant one.',
  '/flashcards': 'Your saved flashcards and due reviews are here.',
};

const POSES: Record<
  'idle' | 'listening' | 'thinking' | 'talking' | `point-${PetrosPointDirection}`,
  string
> = {
  idle: '/petros/states/petros-idle.png',
  listening: '/petros/states/petros-listening.png',
  thinking: '/petros/states/petros-thinking.png',
  talking: '/petros/states/petros-talking.png',
  'point-left': '/petros/states/petros-point-left.png',
  'point-right': '/petros/states/petros-point-right.png',
  'point-up': '/petros/states/petros-point-up.png',
  'point-down': '/petros/states/petros-point-down.png',
};

function replyText(message: PetrosCompanionMessage | null | undefined) {
  return (message?.blocks ?? [])
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .trim();
}

function explicitMovementRequest(message: string) {
  return /\b(show|take|open|go|where|find|follow|teach|learn|continue|start)\b/i.test(message);
}

function safeHref(href: string) {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');
}

function SyncedSpeech({
  text,
  spokenText,
  speaking,
  activeWordIndex,
  activeLineIndex,
}: {
  text: string;
  spokenText: string;
  speaking: boolean;
  activeWordIndex: number;
  activeLineIndex: number;
}) {
  const words = useMemo(() => buildPetrosSpeechTimeline(text), [text]);
  const synced = speaking && spokenText === text;
  const lines = words.reduce<Array<Array<{ word: typeof words[number]; index: number }>>>((all, word, index) => {
    (all[word.lineIndex] ??= []).push({ word, index });
    return all;
  }, []);
  if (!synced) return <div className={styles.speech} aria-live="polite">{text}</div>;
  return (
    <div className={styles.speech} aria-live="polite" aria-label={text} data-synced="true">
      {lines.map((line, lineIndex) => (
        <span
          className={styles.speechLine}
          data-active={synced && lineIndex === activeLineIndex || undefined}
          data-petros-target={`speech-line:${lineIndex}`}
          key={`${lineIndex}-${line[0]?.word.text ?? ''}`}
        >
          {line.map(({ word, index }) => (
            <span
              className={styles.speechWord}
              data-active={synced && index === activeWordIndex || undefined}
              key={`${index}-${word.text}`}
            >
              {word.text}{' '}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

export function PetrosMentor(props: {
  studentId: string;
  navigation: Array<{ href: string; label: string }>;
  onExplore: () => void;
  onCloseExplore: () => void;
  guideHost?: HTMLElement | null;
  perchHost?: HTMLElement | null;
}) {
  const { studentId, navigation, onExplore, onCloseExplore } = props;
  const api = useStudentApi();
  const { mode: connectivityMode, ready: connectivityReady } = usePetrosConnectivityMode();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const companion = usePetrosCompanion();
  const [expanded, setExpanded] = useState(false);
  const [wide, setWide] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState({ autoRead: false, voice: 'cedar' as 'cedar' | 'marin', language: 'en' });
  const autoRead = voiceSettings.autoRead && connectivityReady && connectivityMode !== 'low_bandwidth';
  const [transcriptReady, setTranscriptReady] = useState(false);
  const [view, setView] = useState<View>('buddy');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [minutes, setMinutes] = useState(45);
  const [energy, setEnergy] = useState<'normal' | 'low'>('normal');
  const [planNotice, setPlanNotice] = useState('');
  const [guide, setGuide] = useState<Guide | null>(null);
  const [guidePanelSide, setGuidePanelSide] = useState<'left' | 'right'>('right');
  const [targetKey, setTargetKey] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PetrosPlacement | null>(null);
  const [moving, setMoving] = useState(false);
  const [actions, setActions] = useState<ActionState>({});
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [localReply, setLocalReply] = useState<PetrosCompanionMessage | null>(null);
  const [answeringDoubt, setAnsweringDoubt] = useState(false);
  const [lessonInterruption, setLessonInterruption] = useState<PetrosLessonInterruption | null>(null);
  const [lessonSegmentIndex, setLessonSegmentIndex] = useState(0);
  const [lessonSegmentId, setLessonSegmentId] = useState('');
  const [resumingDoubt, setResumingDoubt] = useState(false);
  const [diagramNarration, setDiagramNarration] = useState<DiagramNarration | null>(null);
  const [sessionPulse, setSessionPulse] = useState<SessionPulse | null>(null);
  const [sessionReaction, setSessionReaction] = useState<SessionReaction | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const interactionRef = useRef(0);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptedRef = useRef({ key: '', at: 0 });
  const spokenGuideRef = useRef('');
  const spokenLessonRef = useRef('');
  const lessonNarrationRef = useRef<PetrosLessonNarrationSegment[]>([]);
  const lessonPlayerRef = useRef<(index: number, startWord?: number) => void>(() => undefined);
  const lessonPlaybackRef = useRef(0);
  const lessonSpeechStartWordRef = useRef(0);
  const lessonPauseRef = useRef<{
    point: PetrosLessonPausePoint;
    resumeSpeech: boolean;
    diagram?: DiagramNarration;
  } | null>(null);
  const lessonDetourIdsRef = useRef<string[]>([]);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const decision = useQuery({
    queryKey: [...QUERY_KEY, studentId],
    queryFn: () => api.get<PetrosMentorDecision>('/student/petros/companion/mentor'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const data = decision.data;
  const lead = data?.priorities[0];
  const inLearningSession = pathname.startsWith('/petros/session');
  const lessonSummary = inLearningSession ? companion.page?.summary : null;
  const lessonNarration = useMemo(
    () => inLearningSession
      ? companion.page?.narration?.length
        ? companion.page.narration
        : lessonSummary
          ? [{
              id: 'legacy-summary',
              blockId: '',
              targetKey: 'lesson:current',
              label: 'current lesson',
              text: lessonSummary,
            }]
          : []
      : [],
    [companion.page?.narration, inLearningSession, lessonSummary],
  );
  lessonNarrationRef.current = lessonNarration;
  const activeLessonSegment = lessonNarration.find((segment) => segment.id === lessonSegmentId)
    ?? lessonNarration[lessonSegmentIndex]
    ?? lessonNarration[0]
    ?? null;
  const activeLessonSegmentIndex = activeLessonSegment
    ? Math.max(0, lessonNarration.findIndex((segment) => segment.id === activeLessonSegment.id))
    : 0;
  const latestReply = localReply ?? (inLearningSession ? null : [...companion.messages].reverse().find((message) => message.role === 'petros' && message.route === companion.route)) ?? null;
  const step = guide?.steps[guide.index];
  const paused = Boolean(data?.preferences.mutedUntil && Date.parse(data.preferences.mutedUntil) > Date.now());
  const hidden = companion.support === 'hidden';

  const voice = usePetrosVoice(useCallback((text: string) => {
    setInput(text);
    setTranscriptReady(true);
    setExpanded(true);
    setView('buddy');
    inputRef.current?.focus();
  }, []), voiceSettings);
  const stopSpeaking = voice.stopSpeaking;
  useEffect(() => {
    if (connectivityMode === 'low_bandwidth') {
      lessonPlaybackRef.current += 1;
      stopSpeaking();
    }
  }, [connectivityMode, stopSpeaking]);
  const [mouthOpen, setMouthOpen] = useState(false);

  useEffect(() => {
    if (!voice.speaking) {
      setMouthOpen(false);
      return undefined;
    }
    setMouthOpen(true);
    const timer = window.setInterval(() => setMouthOpen((current) => !current), 135);
    return () => window.clearInterval(timer);
  }, [voice.speaking]);

  useEffect(() => {
    if (!inLearningSession || !activeLessonSegment || lessonInterruption || diagramNarration) return;
    const detail: PetrosLessonProgress = {
      targetKey: activeLessonSegment.targetKey,
      wordIndex: lessonSpeechStartWordRef.current + Math.max(0, voice.activeWordIndex),
      speaking: voice.speaking,
    };
    window.dispatchEvent(new CustomEvent(PETROS_LESSON_PROGRESS_EVENT, { detail }));
    return () => {
      window.dispatchEvent(new CustomEvent(PETROS_LESSON_PROGRESS_EVENT, {
        detail: { ...detail, speaking: false } satisfies PetrosLessonProgress,
      }));
    };
  }, [activeLessonSegment, diagramNarration, inLearningSession, lessonInterruption, voice.activeWordIndex, voice.speaking]);

  const playLessonSegment = useCallback((index: number, startWord = 0) => {
    const segment = lessonNarrationRef.current[index];
    if (!segment) return;
    const words = buildPetrosSpeechTimeline(segment.text);
    const safeStart = Math.max(0, Math.min(startWord, Math.max(0, words.length - 1)));
    const spoken = words.slice(safeStart).map((word) => word.text).join(' ').trim();
    if (!spoken) return;
    const playback = ++lessonPlaybackRef.current;
    lessonSpeechStartWordRef.current = safeStart;
    setLessonSegmentIndex(index);
    setLessonSegmentId(segment.id);
    setTargetKey(segment.targetKey);
    setExpanded(true);
    setView('buddy');
    companion.setOpen(true);
    void voice.speak(spoken, {
      onEnded: () => {
        if (playback !== lessonPlaybackRef.current || lessonDetourIdsRef.current.length) return;
        const nextIndex = index + 1;
        if (!lessonNarrationRef.current[nextIndex]) return;
        window.setTimeout(() => lessonPlayerRef.current(nextIndex, 0), 120);
      },
    });
  }, [companion, voice]);
  lessonPlayerRef.current = playLessonSegment;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`petros:voice:${studentId}`) ?? 'null');
      if (stored) setVoiceSettings({
        autoRead: stored.autoRead === true,
        voice: stored.voice === 'marin' ? 'marin' : 'cedar',
        language: ['en', 'hi', 'ml', 'ta', 'te', 'kn', 'auto'].includes(stored.language) ? stored.language : 'en',
      });
    } catch { /* Preferences are optional when storage is unavailable. */ }
  }, [studentId]);

  const updateVoiceSettings = (patch: Partial<typeof voiceSettings>) => {
    voice.stopSpeaking();
    const next = { ...voiceSettings, ...patch };
    setVoiceSettings(next);
    try { localStorage.setItem(`petros:voice:${studentId}`, JSON.stringify(next)); } catch { /* Keep the in-memory choice. */ }
  };

  const closeConversation = () => {
    interactionRef.current += 1;
    lessonPlaybackRef.current += 1;
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
    voice.cancelListening();
    voice.stopSpeaking();
    voice.clearError();
    setError('');
    setExpanded(false);
    setWide(false);
    setGuide(null);
    setTargetKey(null);
    companion.setOpen(false);
    onCloseExplore();
    setView('buddy');
  };

  const save = useCallback(async (path: string, value: unknown, method: 'post' | 'put' = 'post') => {
    setBusy(true);
    setError('');
    try {
      const result = await api[method]<PetrosMentorDecision>(`/student/petros/companion/mentor/${path}`, value);
      queryClient.setQueryData([...QUERY_KEY, studentId], result);
      return result;
    } catch (caught) {
      setError(formatApiError(caught));
      return null;
    } finally {
      setBusy(false);
    }
  }, [api, queryClient, studentId]);

  const preferences = useCallback((patch: Partial<PetrosMentorPreferences>) => data && save('preferences', { ...data.preferences, ...patch }, 'put'), [data, save]);
  const feedback = useCallback((item: PetrosMentorPriority, choice: PetrosMentorFeedback['decision']) => save('feedback', { key: item.key, decision: choice }), [save]);
  const buildPlan = useCallback(async () => {
    setPlanNotice('');
    const result = await save('plan', { minutes, energy, availability: [] });
    if (!result) return;
    setPlanNotice(result.plan.length
      ? `Your ${minutes}-minute route is ready. Start with the first step below.`
      : `Your ${minutes}-minute limit was saved, but there is no open study task to put in a route right now.`);
  }, [energy, minutes, save]);

  const showTarget = useCallback((key: string) => {
    setTargetKey(key);
    const target = findPetrosTarget(key);
    const reduced = document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || data?.preferences.animate === false;
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }, [data?.preferences.animate]);

  const guideTo = useCallback((href: string, item?: GuideItem, auto = true) => {
    if (!safeHref(href)) return;
    const savedWork = href === '/petros/artifacts';
    const destination = navigation.find((entry) => savedWork ? entry.href === '/materials' : href === entry.href || href.startsWith(`${entry.href}/`));
    const target = item ? petrosEntityTarget(item.entityType, item.entityId ?? null) : null;
    const destinationPath = href.split('?')[0]!;
    const detailSteps: GuideStep[] = /^\/assignments\/[^/]+$/.test(href)
      ? [
          { key: 'assignment:brief', text: 'Start with the assignment instructions.' },
          { key: 'assignment:submission', text: 'Your submission controls are here.' },
        ]
      : /^\/homework\/[^/]+$/.test(href)
        ? [{ key: 'homework:questions', text: 'These are the homework questions.' }]
        : [];
    companion.setOpen(false);
    setExpanded(true);
    setView('buddy');
    if (pathname === destinationPath) {
      const key = target ?? `page:${pathname}`;
      setGuide({
        steps: [{ key, text: item?.reason ?? PAGE_HINTS[destination?.href ?? href] ?? 'Right here. This is the part you asked for.' }, ...detailSteps.filter((entry) => findPetrosTarget(entry.key))],
        index: 0,
        auto: false,
        tour: false,
      });
      showTarget(key);
      return;
    }
    if (!destination) {
      router.push(href);
      setGuide({ steps: [{ key: target ?? `page:${destinationPath}`, text: item?.reason ?? 'I brought you here. Look at this part.' }, ...detailSteps], index: 0, auto: false, tour: false });
      return;
    }
    const steps: GuideStep[] = [
      { key: 'nav:explore', text: 'Follow me. We start with Explore.', openExplore: true },
      { key: `directory:${destination.href}`, text: `There — ${destination.label}. I’ll open it.`, href: savedWork ? '/materials' : href },
      ...(savedWork ? [{ key: 'library:saved', text: 'Your saved notes and study work are here. This is the door.', href }] : []),
      { key: target ?? `page:${destinationPath}`, text: item?.reason ?? PAGE_HINTS[destination.href] ?? `We’re in ${destination.label}. This is what you asked for.` },
      ...detailSteps,
    ];
    setGuide({ steps, index: 0, auto, tour: false });
    showTarget('nav:explore');
  }, [companion, navigation, pathname, router, showTarget]);

  const tour = useCallback(() => {
    const pages = ['/timetable', '/assignments', '/homework', '/learn'].filter((href) => navigation.some((item) => item.href === href));
    const steps: GuideStep[] = [{ key: 'nav:explore', text: 'I live across this portal. Let me show you the useful places.', openExplore: true }];
    for (const href of pages) {
      const label = navigation.find((item) => item.href === href)?.label ?? href;
      steps.push({ key: `directory:${href}`, text: `This is ${label}.`, href }, { key: `page:${href}`, text: PAGE_HINTS[href] ?? 'This page is part of your learning route.' });
    }
    setGuide({ steps, index: 0, auto: false, tour: true });
    setExpanded(true);
    setView('buddy');
    showTarget('nav:explore');
  }, [navigation, showTarget]);

  const advanceGuide = useCallback(async () => {
    if (!guide || !step) return;
    if (guide.index >= guide.steps.length - 1) {
      if (guide.tour) await preferences({ tourCompleted: true });
      setGuide(null);
      setTargetKey(null);
      onCloseExplore();
      return;
    }
    if (step.openExplore) onExplore();
    if (step.href) { onCloseExplore(); router.push(step.href); }
    const index = guide.index + 1;
    setGuide({ ...guide, index });
    showTarget(guide.steps[index]!.key);
  }, [guide, onCloseExplore, onExplore, preferences, router, showTarget, step]);

  useEffect(() => {
    if (!guide?.auto || !step || (!step.openExplore && !step.href)) return;
    const timer = window.setTimeout(() => void advanceGuide(), step.openExplore ? 850 : 1_150);
    return () => window.clearTimeout(timer);
  }, [advanceGuide, guide?.auto, step]);

  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || sending) return;
    const interaction = ++interactionRef.current;
    setSending(true);
    setExpanded(true);
    setView('buddy');
    setInput('');
    setTranscriptReady(false);
    setError('');
    companion.setOpen(true);
    try {
      if (inLearningSession && companion.page?.onAsk) {
        // A learner interruption owns the floor immediately. Do not let the prior narration
        // continue underneath the question or advance the original explanation.
        let pausePoint = lessonPauseRef.current?.point;
        if (
          !pausePoint &&
          diagramNarration &&
          activeLessonSegment &&
          /^[0-9a-f-]{36}$/i.test(activeLessonSegment.blockId)
        ) {
          const absoluteWordIndex = Math.max(0, voice.activeWordIndex);
          pausePoint = {
            blockId: activeLessonSegment.blockId,
            segmentId: `${activeLessonSegment.blockId}:diagram:${diagramNarration.step}`,
            targetKey: diagramNarration.targetKey,
            label: `diagram step ${diagramNarration.step + 1}`,
            spokenText: diagramNarration.text,
            wordIndex: absoluteWordIndex,
          };
          lessonPauseRef.current = {
            point: pausePoint,
            resumeSpeech: voice.speaking,
            diagram: diagramNarration,
          };
        } else if (!pausePoint && activeLessonSegment && /^[0-9a-f-]{36}$/i.test(activeLessonSegment.blockId)) {
          const absoluteWordIndex = lessonSpeechStartWordRef.current + Math.max(0, voice.activeWordIndex);
          pausePoint = {
            blockId: activeLessonSegment.blockId,
            segmentId: activeLessonSegment.id,
            targetKey: activeLessonSegment.targetKey,
            label: activeLessonSegment.label,
            spokenText: activeLessonSegment.text,
            wordIndex: absoluteWordIndex,
          };
          lessonPauseRef.current = {
            point: pausePoint,
            resumeSpeech: voice.speaking && !lessonInterruption && !diagramNarration,
          };
        }
        lessonPlaybackRef.current += 1;
        voice.stopSpeaking();
        if (diagramNarration) {
          window.dispatchEvent(new CustomEvent('petros:diagram-stop', {
            detail: { diagramId: diagramNarration.diagramId },
          }));
          setDiagramNarration(null);
        }
        setLocalReply(null);
        setAnsweringDoubt(true);
        try {
          const interruption = pausePoint
            ? await companion.page.onAsk(message, pausePoint)
            : await companion.page.onAsk(message);
          lessonDetourIdsRef.current = [...lessonDetourIdsRef.current, interruption.detourId];
          setLessonInterruption(interruption);
          if (autoRead && interaction === interactionRef.current) {
            void voice.speak(interruption.answer);
          }
        } finally {
          setAnsweringDoubt(false);
        }
        return;
      }
      const result = await api.post<PetrosCompanionTurnResult>('/student/petros/companion/turns', {
        ...(companion.threadId ? { threadId: companion.threadId } : {}),
        message,
        route: companion.route,
        surface: companion.surface,
        ...(companion.focusRef ? { focusRef: companion.focusRef } : {}),
        visibleCandidates: companion.candidates,
        idempotencyKey: newIdempotencyKey(),
      });
      if (!companion.threadId) companion.setThread(result.threadId, [result.studentMessage, result.reply]);
      else companion.appendMessages([result.studentMessage, result.reply]);
      setLocalReply(result.reply);
      const spoken = replyText(result.reply);
      if (spoken && autoRead && interaction === interactionRef.current) void voice.speak(spoken);
      const navigationBlock = result.reply.blocks.find((block): block is Extract<typeof block, { type: 'navigation' }> => block.type === 'navigation' && safeHref(block.href));
      if (navigationBlock && explicitMovementRequest(message) && interaction === interactionRef.current) navigationTimerRef.current = setTimeout(() => guideTo(navigationBlock.href), 650);
    } catch (caught) {
      setError(formatApiError(caught));
      setInput(message);
    } finally {
      setSending(false);
    }
  }, [activeLessonSegment, api, autoRead, companion, diagramNarration, guideTo, inLearningSession, lessonInterruption, sending, voice]);

  useEffect(() => {
    const askSelectedElement = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      if (detail?.question) void send(detail.question);
    };
    window.addEventListener('petros:workspace-question', askSelectedElement);
    return () => window.removeEventListener('petros:workspace-question', askSelectedElement);
  }, [send]);

  const resumeLessonAfterQuestion = useCallback(async () => {
    if (!lessonInterruption || !companion.page?.onResumeQuestion || resumingDoubt) return;
    setResumingDoubt(true);
    setError('');
    lessonPlaybackRef.current += 1;
    voice.stopSpeaking();
    try {
      for (const detourId of lessonDetourIdsRef.current) {
        await companion.page.onResumeQuestion(detourId);
      }
      const pause = lessonPauseRef.current;
      lessonDetourIdsRef.current = [];
      lessonPauseRef.current = null;
      setLessonInterruption(null);
      if (pause) {
        if (pause.diagram) {
          setDiagramNarration(pause.diagram);
          setTargetKey(pause.point.targetKey);
          if (pause.resumeSpeech) {
            const remainder = buildPetrosSpeechTimeline(pause.point.spokenText)
              .slice(pause.point.wordIndex)
              .map((word) => word.text)
              .join(' ')
              .trim();
            if (remainder && connectivityMode !== 'low_bandwidth') void voice.speak(remainder, {
              onEnded: () => window.dispatchEvent(new CustomEvent('petros:diagram-resume', {
                detail: { diagramId: pause.diagram!.diagramId, step: pause.diagram!.step },
              })),
              onError: () => window.dispatchEvent(new CustomEvent('petros:diagram-resume', {
                detail: { diagramId: pause.diagram!.diagramId, step: pause.diagram!.step },
              })),
            });
          }
          return;
        }
        const index = lessonNarrationRef.current.findIndex((segment) => segment.id === pause.point.segmentId);
        const safeIndex = index >= 0 ? index : 0;
        setLessonSegmentIndex(safeIndex);
        setLessonSegmentId(lessonNarrationRef.current[safeIndex]?.id ?? '');
        setTargetKey(pause.point.targetKey);
        if (pause.resumeSpeech && connectivityMode !== 'low_bandwidth') lessonPlayerRef.current(safeIndex, pause.point.wordIndex);
      } else {
        setTargetKey('lesson:current');
      }
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setResumingDoubt(false);
    }
  }, [companion.page, connectivityMode, lessonInterruption, resumingDoubt, voice]);

  const decide = useCallback(async (proposalId: string, choice: 'confirm' | 'decline') => {
    if (busyProposal) return;
    setBusyProposal(proposalId);
    setError('');
    try {
      const result = await api.post<PetrosActionResult>(`/student/petros/companion/actions/${proposalId}/decision`, { decision: choice, idempotencyKey: newIdempotencyKey() });
      setActions((current) => ({ ...current, [proposalId]: { status: result.status, message: result.message } }));
      if (result.status === 'executed' && result.href) {
        if (result.actionKey === 'navigate.open') guideTo(result.href);
        else { if (autoRead) void voice.speak('Let’s get started.'); router.push(result.href); }
      }
      if (result.status === 'executed' && (result.actionKey === 'planner.create' || result.actionKey === 'planner.update')) await queryClient.invalidateQueries({ queryKey: ['student', 'calendar'] });
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusyProposal(null);
    }
  }, [api, autoRead, busyProposal, guideTo, queryClient, router, voice]);

  useEffect(() => {
    if (!companion.guideRequest) return;
    const request = companion.guideRequest;
    companion.clearGuideRequest();
    guideTo(request.href);
  }, [companion, guideTo]);

  useEffect(() => {
    if (!companion.open) return;
    setExpanded(true);
    const starter = companion.consumePendingQuestion();
    if (starter) { setInput(starter); setView('buddy'); }
    if (companion.focus) setTargetKey(petrosEntityTarget(companion.focus.entityType, companion.focus.entityId ?? null));
  }, [companion]);

  useEffect(() => { void decision.refetch(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLocalReply(null);
    setLessonInterruption(null);
    setSessionReaction(null);
    if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
    setLessonSegmentIndex(0);
    setLessonSegmentId('');
    lessonDetourIdsRef.current = [];
    lessonPauseRef.current = null;
    lessonPlaybackRef.current += 1;
    spokenLessonRef.current = '';
  }, [pathname]);
  useEffect(() => { if (data?.planInput) { setMinutes(data.planInput.minutes); setEnergy(data.planInput.energy); } }, [data?.planInput]);

  useEffect(() => {
    if (inLearningSession || !data || paused || !data.proactiveAllowed || companion.open || guide) return;
    const level = data.preferences.guidance;
    const deadlineIn = lead?.deadlineAt ? Date.parse(lead.deadlineAt) - Date.now() : null;
    const soon = level === 'normal' && deadlineIn !== null && deadlineIn > 0 && deadlineIn <= 3 * 86_400_000;
    const eligible = level === 'full' || lead?.urgency === 'critical' || lead?.urgency === 'high' || soon;
    const key = `${lead?.key ?? 'quiet'}:${lead?.urgency ?? 'low'}`;
    const typing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
    const gap = lead?.urgency === 'critical' ? 60_000 : level === 'full' ? 120_000 : 600_000;
    if (eligible && !typing && key !== promptedRef.current.key && Date.now() - promptedRef.current.at > gap) {
      promptedRef.current = { key, at: Date.now() };
      setExpanded(true);
      setTargetKey(petrosEntityTarget(lead?.entityType ?? null, lead?.entityId ?? null));
    }
  }, [companion.open, data, guide, inLearningSession, lead, paused]);

  const bubbleOpen = expanded || Boolean(guide) || companion.open;
  const activeSpeechTarget = voice.speaking && voice.activeLineIndex >= 0
    ? `speech-line:${voice.activeLineIndex}`
    : null;
  const lessonTeachingTarget = inLearningSession && activeLessonSegment && !lessonInterruption && voice.speaking
    ? activeLessonSegment.targetKey
    : null;
  const spatialKey = step?.key
    ?? diagramNarration?.targetKey
    ?? lessonTeachingTarget
    ?? (inLearningSession ? null : activeSpeechTarget ?? targetKey);

  useEffect(() => {
    if (hidden) return;
    let active: HTMLElement | null = null;
    let frame = 0;
    let scrolled = false;
    const measure = () => {
      frame = 0;
      const viewport = { width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight };
      const character = viewport.width < 700 ? { width: 92, height: 123 } : { width: 124, height: 165 };
      const headerBottom = document.querySelector('.portal-header')?.getBoundingClientRect().bottom ?? 8;
      let element = spatialKey ? findPetrosTarget(spatialKey) : null;
      if (!element && spatialKey) element = findPetrosTarget(`page:${pathname}`);
      if (active && active !== element) delete active.dataset.petrosActive;
      active = element;
      if (element && spatialKey) element.dataset.petrosActive = 'true';
      if (element && (step || diagramNarration || lessonTeachingTarget) && !scrolled && !spatialKey?.startsWith('page:')) {
        scrolled = true;
        const reduced = data?.preferences.animate === false || document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }
      const target = element?.getBoundingClientRect() ?? { left: viewport.width - 2, right: viewport.width - 1, top: viewport.height - 2, bottom: viewport.height - 1, width: 1, height: 1 };
      const nextGuideSide = guide ? petrosGuidePanelSide(target, viewport.width) : 'right';
      if (nextGuideSide !== guidePanelSide) setGuidePanelSide(nextGuideSide);
      const compactPanelWidth = Math.min(360, viewport.width - 24);
      const reserveGuidePanel = Boolean(guide && viewport.width >= 700);
      const mobileGuidePanelHeight = guide && viewport.width < 700
        ? Math.min(viewport.height * 0.42, 340) + 92
        : null;
      const next = calculatePetrosPlacement(target, viewport, character, {
        topInset: headerBottom + 8,
        bottomInset: mobileGuidePanelHeight
          ?? (viewport.width < 921 && !pathname.startsWith('/petros/session') ? 76 : 12),
        leftInset: reserveGuidePanel && nextGuideSide === 'left' ? compactPanelWidth + 32 : undefined,
        rightInset: reserveGuidePanel && nextGuideSide === 'right' ? compactPanelWidth + 32 : undefined,
        previous: placement,
      });
      setPlacement((current) => {
        if (current && Math.abs(current.x - next.x) < 1 && Math.abs(current.y - next.y) < 1 && current.point === next.point) return current;
        if (current) {
          setMoving(data?.preferences.animate !== false);
          if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
          moveTimerRef.current = setTimeout(() => setMoving(false), 760);
        }
        return next;
      });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      if (active) delete active.dataset.petrosActive;
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
    // Placement is the prior location for scoring, not a re-measure trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bubbleOpen, data?.preferences.animate, diagramNarration, guide, guidePanelSide, hidden, lessonTeachingTarget, pathname, spatialKey, step, view, wide]);

  useEffect(() => () => {
    if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
  }, []);
  useEffect(() => {
    if (!step || spokenGuideRef.current === `${guide?.index}:${step.text}`) return;
    spokenGuideRef.current = `${guide?.index}:${step.text}`;
    if (guide?.auto && autoRead) void voice.speak(step.text);
  }, [autoRead, guide?.auto, guide?.index, step, voice]);
  useEffect(() => {
    if (!inLearningSession || !lessonNarration.length) return;
    const key = lessonNarration[0]!.blockId || `${companion.page?.title}:${lessonNarration[0]!.id}`;
    if (spokenLessonRef.current === key) return;
    spokenLessonRef.current = key;
    lessonPlaybackRef.current += 1;
    lessonPauseRef.current = null;
    lessonDetourIdsRef.current = [];
    setLessonInterruption(null);
    setLessonSegmentIndex(0);
    setLessonSegmentId(lessonNarration[0]!.id);
    setLocalReply(null);
    setTargetKey(lessonNarration[0]!.targetKey);
    if (autoRead) setExpanded(true);
    if (autoRead) window.setTimeout(() => lessonPlayerRef.current(0, 0), 0);
  }, [autoRead, companion.page?.title, inLearningSession, lessonNarration]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<SessionPulse>).detail;
      if (detail && Number.isFinite(detail.mastered) && Number.isFinite(detail.total)) {
        setSessionPulse(detail);
      }
    };
    window.addEventListener('petros:session-pulse', update);
    return () => window.removeEventListener('petros:session-pulse', update);
  }, []);

  useEffect(() => {
    const react = (event: Event) => {
      const detail = (event as CustomEvent<SessionReaction & { durationMs?: number }>).detail;
      if (!detail?.kind || !detail.label) return;
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
      setSessionReaction({ kind: detail.kind, label: detail.label });
      if (detail.durationMs !== 0) {
        reactionTimerRef.current = window.setTimeout(
          () => setSessionReaction(null),
          Math.max(1_200, detail.durationMs ?? 2_800),
        );
      }
    };
    window.addEventListener('petros:session-reaction', react);
    return () => {
      window.removeEventListener('petros:session-reaction', react);
      if (reactionTimerRef.current) window.clearTimeout(reactionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onDiagramStep = (event: Event) => {
      const detail = (event as CustomEvent<DiagramNarration>).detail;
      if (!detail?.diagramId || !detail.targetKey || !detail.text) return;
      if (lessonDetourIdsRef.current.length) return;
      setDiagramNarration(detail);
      setLessonInterruption(null);
      setExpanded(true);
      setView('buddy');
      companion.setOpen(true);
      setTargetKey(detail.targetKey);
      if (connectivityMode === 'low_bandwidth') return;
      voice.stopSpeaking();
      void voice.speak(detail.text, {
        onEnded: () => window.dispatchEvent(new CustomEvent('petros:diagram-advance', {
          detail: { diagramId: detail.diagramId, step: detail.step },
        })),
        onError: () => window.dispatchEvent(new CustomEvent('petros:diagram-advance', {
          detail: { diagramId: detail.diagramId, step: detail.step },
        })),
      });
    };
    const onDiagramStop = (event: Event) => {
      const detail = (event as CustomEvent<{ diagramId?: string }>).detail;
      if (!diagramNarration || detail?.diagramId && diagramNarration.diagramId !== detail.diagramId) return;
      voice.stopSpeaking();
      setTargetKey('lesson:current');
      setDiagramNarration(null);
    };
    window.addEventListener('petros:diagram-step', onDiagramStep);
    window.addEventListener('petros:diagram-stop', onDiagramStop);
    return () => {
      window.removeEventListener('petros:diagram-step', onDiagramStep);
      window.removeEventListener('petros:diagram-stop', onDiagramStop);
    };
  }, [companion, connectivityMode, diagramNarration, voice]);

  useEffect(() => {
    const interruptWorkspace = () => {
      lessonPlaybackRef.current += 1;
      voice.stopSpeaking();
      setDiagramNarration(null);
    };
    window.addEventListener('petros:workspace-interrupt', interruptWorkspace);
    return () => window.removeEventListener('petros:workspace-interrupt', interruptWorkspace);
  }, [voice]);

  const pose = useMemo<keyof typeof POSES>(() => {
    if (voice.listening) return 'listening';
    if (sending || voice.transcribing || voice.preparing || busy || decision.isLoading) return 'thinking';
    if (sessionReaction?.kind === 'thinking') return 'thinking';
    if (sessionReaction?.kind === 'retry') return 'listening';
    if (sessionReaction && ['correct', 'checkpoint', 'celebrate'].includes(sessionReaction.kind)) return 'point-up';
    if ((diagramNarration || lessonTeachingTarget) && placement && !bubbleOpen) return `point-${placement.point}`;
    if (voice.speaking) return 'talking';
    if (spatialKey && placement && (!bubbleOpen || guide)) return `point-${placement.point}`;
    return 'idle';
  }, [bubbleOpen, busy, decision.isLoading, diagramNarration, guide, lessonTeachingTarget, placement, sending, sessionReaction, spatialKey, voice]);
  const avatarState = voice.listening
    ? 'listening'
    : sending || voice.transcribing || voice.preparing || busy || decision.isLoading
      ? 'thinking'
      : answeringDoubt
        ? 'answering-doubt'
        : inLearningSession
          ? 'teaching'
          : 'idle';

  const thoughts = useMemo(() => {
    if (!(sending || voice.transcribing || decision.isLoading)) return [];
    if (voice.transcribing) return ['Listening back…', 'Turning speech into words…'];
    return [lead?.deadlineAt ? 'Checking deadlines…' : 'Checking your portal…', data?.learning ? 'Looking at progress…' : 'Finding what matters…', 'Building the fastest useful next step…'];
  }, [data?.learning, decision.isLoading, lead?.deadlineAt, sending, voice.transcribing]);

  const contextualText = lessonInterruption?.answer || diagramNarration?.text || activeLessonSegment?.text || replyText(latestReply) || lessonSummary || (companion.focus
    ? `I’m beside ${companion.focus.title}. What do you want to know?`
    : paused
      ? 'I’m taking a quiet moment. Your normal academic reminders still work.'
      : decision.isError
        ? 'I cannot check priorities right now, but I can still help you navigate.'
        : data?.message ?? 'What’s up?');

  const bubbleText = step?.text ?? (voice.listening
    ? 'I’m listening… say it naturally.'
    : voice.transcribing
      ? 'Got it. Give me a second.'
      : sending
        ? inLearningSession ? 'Working on your question about this lesson…' : 'Checking your portal context…'
        : contextualText);

  useEffect(() => { bodyRef.current?.scrollTo?.({ top: 0 }); }, [bubbleText, view]);

  useEffect(() => {
    if (!bubbleOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeConversation(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (hidden) return null;
  const characterStyle = placement ? ({ '--petros-x': `${placement.x}px`, '--petros-y': `${placement.y}px` } as CSSProperties) : undefined;
  // An open conversation owns the character. Keep it in the panel header instead of letting
  // lesson targeting float it across (or on top of) the panel and page content.
  const characterDocked = bubbleOpen && !guide;
  const character = (
    <div className={styles.characterWrap} data-docked={characterDocked || undefined} style={characterDocked ? undefined : characterStyle}>
      <button id="petros-mentor-toggle" type="button" className={styles.character} onClick={() => { if (bubbleOpen) closeConversation(); else { setExpanded(true); companion.setOpen(true); } }} aria-label={bubbleOpen ? 'Let Petros idle' : 'Talk to Petros'} aria-expanded={bubbleOpen} aria-controls="petros-conversation">
        {pose === 'talking' ? (
          <>
            <Image className={styles.mouthFrame} data-visible={!mouthOpen || undefined} src={POSES.idle} alt="" aria-hidden="true" width={384} height={512} priority unoptimized />
            <Image className={styles.mouthFrame} data-visible={mouthOpen || undefined} src={POSES.talking} alt="" aria-hidden="true" width={384} height={512} priority unoptimized />
          </>
        ) : (
          <Image key={pose} src={POSES[pose]} alt="Petros, your animated learning buddy" width={384} height={512} priority unoptimized />
        )}
        <span className={styles.groundShadow} aria-hidden="true" />
      </button>
      {!characterDocked && sessionReaction ? (
        <span className={styles.reactionChip} role="status">{sessionReaction.label}</span>
      ) : null}
      {!characterDocked && inLearningSession ? (
        <button
          type="button"
          className={styles.mobileCompanionLabel}
          onClick={() => { setExpanded(true); companion.setOpen(true); }}
          aria-label="Open Petros for this lesson"
          aria-controls="petros-conversation"
        >
          <strong>Petros</strong>
          <span>{sessionReaction?.label ?? 'Beside you for this step'}</span>
        </button>
      ) : null}
      {!bubbleOpen ? <button type="button" className={styles.mic} onClick={() => { setExpanded(true); void voice.startListening(); }} aria-label="Start voice conversation"><Mic aria-hidden="true" /></button> : null}
    </div>
  );

  return (
    <div className={styles.agent} data-conversation={bubbleOpen ? 'open' : 'closed'} data-guide={guide ? 'true' : undefined} data-learning={inLearningSession || undefined} data-size={wide ? 'wide' : 'normal'} data-animate={data?.preferences.animate !== false} data-moving={(!bubbleOpen || guide) && moving || undefined} data-pose={pose} data-reaction={sessionReaction?.kind ?? (inLearningSession ? 'reading' : undefined)} data-avatar-state={avatarState} data-voice-phase={voice.phase} data-mouth={voice.speaking ? mouthOpen ? 'open' : 'closed' : 'rest'} aria-label="Petros, your portal learning buddy">
      {!bubbleOpen && thoughts.length ? (
        <div className={styles.thoughts} style={characterStyle} aria-live="polite">
          {thoughts.map((thought, index) => <span key={thought} style={{ '--thought-index': index } as CSSProperties}>{thought}</span>)}
        </div>
      ) : null}

      {bubbleOpen ? (
        <section id="petros-conversation" className={styles.bubble} data-guide-side={guide ? guidePanelSide : undefined} aria-label="Petros speech">
          <header className={styles.bubbleHeader}>
            {!guide ? character : null}
            <div className={styles.identity}><strong>Petros</strong><span>{inLearningSession ? 'Here for this lesson' : 'Your learning companion'}</span></div>
            {inLearningSession && sessionPulse ? (
              <div className={styles.sessionPulse} aria-label="Current session momentum">
                <span><strong>{sessionPulse.mastered}/{sessionPulse.total}</strong> mastered</span>
                <span><strong>{sessionPulse.xp}</strong> XP</span>
                <span><strong>{sessionPulse.streak}</strong> streak · <strong>{sessionPulse.flashcards}</strong> cards</span>
                <span><strong>{sessionPulse.elapsedLabel}</strong> {sessionPulse.paceLabel}</span>
              </div>
            ) : null}
            <div className={styles.headerActions}>
              <button type="button" onClick={() => setWide((current) => !current)} aria-label={wide ? 'Restore conversation size' : 'Expand conversation'} title={wide ? 'Restore size' : 'More room'}>{wide ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}</button>
              <button type="button" onClick={closeConversation} aria-label="Close Petros conversation" title="Close (Esc)"><X aria-hidden="true" /></button>
            </div>
          </header>

          <div ref={bodyRef} className={styles.bubbleBody} tabIndex={0} aria-label="Petros reply">
            <PetrosProgramWorkspaceCompanion />
            {view === 'buddy' ? <>
              <p className={styles.contextLabel}>{guide ? 'Portal walkthrough' : diagramNarration ? 'Explaining this diagram' : inLearningSession ? companion.page?.title ?? 'Current lesson' : 'Let’s work through it'}</p>
              {lessonInterruption ? (
                <blockquote className={styles.studentQuestion}>
                  <span>You asked</span>
                  {lessonInterruption.question}
                </blockquote>
              ) : null}
              <SyncedSpeech
                text={bubbleText}
                spokenText={voice.spokenText}
                speaking={voice.speaking}
                activeWordIndex={voice.activeWordIndex}
                activeLineIndex={voice.activeLineIndex}
              />
              <div className={styles.audioControls}>
                <button
                  type="button"
                  disabled={sending || voice.listening || voice.transcribing}
                  onClick={() => {
                    if (voice.speaking || voice.preparing) {
                      lessonPlaybackRef.current += 1;
                      voice.stopSpeaking();
                    } else if (inLearningSession && activeLessonSegment && !lessonInterruption && !diagramNarration) {
                      lessonPlayerRef.current(activeLessonSegmentIndex, 0);
                    } else {
                      void voice.speak(bubbleText);
                    }
                  }}
                >
                  {voice.preparing ? <LoaderCircle aria-hidden="true" /> : voice.speaking ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                  {voice.preparing ? 'Cancel audio' : voice.speaking ? 'Stop audio' : 'Read aloud'}
                </button>
                <span>AI-generated voice · {autoRead ? 'Auto-read on' : 'Only when you ask'}</span>
              </div>
              {lessonInterruption ? (
                <div className={styles.understandingCheck} role="group" aria-label="Check understanding">
                  <strong>Does that answer your question?</strong>
                  <button type="button" className={styles.primary} disabled={resumingDoubt} onClick={() => void resumeLessonAfterQuestion()}>
                    {resumingDoubt ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                    {resumingDoubt ? 'Returning…' : 'Yes — resume the lesson'}
                  </button>
                  <button type="button" onClick={() => void send('Show me one concrete example of that.')}>Show me an example</button>
                  <button type="button" onClick={() => void send('Quiz me on that with one quick question.')}>Quiz me on that</button>
                  <button type="button" onClick={() => inputRef.current?.focus()}>My own follow-up</button>
                  <small>{lessonInterruption.returnPlan}</small>
                </div>
              ) : null}
            </> : null}
            {guide ? (
              <div className={styles.guideControls}>
                <span>{guide.index + 1} / {guide.steps.length}</span>
                {!guide.auto ? <button type="button" onClick={() => showTarget(step!.key)}>Point again</button> : null}
                {!guide.auto ? <button type="button" className={styles.primary} onClick={() => void advanceGuide()}>{guide.index === guide.steps.length - 1 ? 'Done' : 'Follow'}<ArrowRight aria-hidden="true" /></button> : <span>Moving with you…</span>}
                <button type="button" onClick={() => { setGuide(null); setTargetKey(null); onCloseExplore(); }}>Stop</button>
              </div>
            ) : view === 'buddy' ? (
              <>
                <ReplyActions message={latestReply} route={companion.route} actions={actions} busyProposal={busyProposal} onDecide={(id, choice) => void decide(id, choice)} onNavigate={(href) => guideTo(href)} onReply={(text) => void send(text)} />
                {!inLearningSession && !latestReply && companion.focus?.href ? (
                  <div className={styles.priorityActions}>
                    <button type="button" className={styles.primary} onClick={() => guideTo(companion.focus!.href!, {
                      entityType: companion.focus!.entityType,
                      ...(companion.focus!.entityId ? { entityId: companion.focus!.entityId } : {}),
                      reason: companion.focus!.summary ?? null,
                    })}>Take me there<ArrowRight aria-hidden="true" /></button>
                  </div>
                ) : !inLearningSession && !latestReply && lead && !paused ? (
                  <div className={styles.priorityActions}>
                    <button type="button" className={styles.primary} onClick={() => { if (autoRead) void voice.speak(lead.reason); guideTo(lead.href, lead); }}>Take me there<ArrowRight aria-hidden="true" /></button>
                    {lead.entityId && (lead.kind === 'exam' || lead.kind === 'practice') ? <PetrosDoorButton door={lead.kind === 'exam' ? 'upcoming_exam' : 'reflection_action'} sourceId={lead.entityId} label={`Start ${energy === 'low' ? 15 : Math.min(minutes, 25)}-minute session`} timeBudgetSeconds={(energy === 'low' ? 15 : Math.min(minutes, 25)) * 60} /> : null}
                    <button type="button" onClick={() => { setMinutes(20); setPlanNotice(''); setView('plan'); }}>I only have 20 min</button>
                    <button type="button" disabled={busy} onClick={() => void feedback(lead, 'postponed')}>Later</button>
                  </div>
                ) : null}
              </>
            ) : view === 'plan' ? (
              <div className={styles.planner}>
                <label>Time I actually have<input type="number" min={5} max={240} value={minutes} onChange={(event) => { setMinutes(Number(event.target.value)); setPlanNotice(''); }} /></label>
                <label>Energy<select value={energy} onChange={(event) => { setEnergy(event.target.value as 'normal' | 'low'); setPlanNotice(''); }}><option value="normal">Ready to focus</option><option value="low">Keep it tiny</option></select></label>
                <button type="button" className={styles.primary} disabled={busy || minutes < 5 || minutes > 240} aria-busy={busy} onClick={() => void buildPlan()}>{busy ? 'Building it…' : `Build a ${minutes}-minute route`}<ArrowRight aria-hidden="true" /></button>
                {planNotice ? <p className={styles.planNotice} role="status">{planNotice}</p> : null}
                {data?.plan.length ? <ol>{data.plan.slice(0, 4).map((block) => <li key={block.key}><span>{block.kind === 'break' ? <Coffee aria-hidden="true" /> : <Clock3 aria-hidden="true" />}</span><div><strong>{block.title}</strong><small>{block.minutes} min</small></div>{block.href ? <button type="button" onClick={() => guideTo(block.href!, data.priorities.find((item) => item.key === block.priorityKey))}>Start</button> : null}</li>)}</ol> : null}
                <button type="button" onClick={() => setView('buddy')}>Back</button>
              </div>
            ) : (
              <div className={styles.settings}>
                <h2>Make Petros work for you</h2>
                <label className={styles.selectLabel}>Speaking voice<select value={voiceSettings.voice} onChange={(event) => updateVoiceSettings({ voice: event.target.value as 'cedar' | 'marin' })}><option value="cedar">Cedar</option><option value="marin">Marin</option></select></label>
                <button type="button" onClick={() => voice.speaking || voice.preparing ? voice.stopSpeaking() : void voice.speak('Hi, I’m Petros. We can take this one step at a time. Ask a question whenever you need a hand.')} disabled={voice.listening || voice.transcribing}>{voice.speaking || voice.preparing ? 'Stop preview' : 'Preview voice'}</button>
                <label><input type="checkbox" checked={voiceSettings.autoRead} disabled={connectivityMode === 'low_bandwidth'} onChange={(event) => updateVoiceSettings({ autoRead: event.target.checked })} />Read replies aloud automatically</label>
                {connectivityMode === 'low_bandwidth' && <p role="status">Automatic speech is paused in low-bandwidth mode. You can still request voice manually.</p>}
                <label className={styles.selectLabel}>I speak in<select value={voiceSettings.language} onChange={(event) => updateVoiceSettings({ language: event.target.value })}><option value="en">English</option><option value="hi">Hindi</option><option value="ml">Malayalam</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="kn">Kannada</option><option value="auto">Detect automatically</option></select></label>
                <p className={styles.voiceDisclosure}>Audio is AI-generated. The microphone records only when you press it. Review and edit what I heard before sending.</p>
                <span>How much should I step in?</span>
                <div>{(['full', 'normal', 'minimal'] as const).map((level) => <button type="button" key={level} aria-pressed={data?.preferences.guidance === level} disabled={busy || !data} onClick={() => void preferences({ guidance: level })}>{level}</button>)}</div>
                <label><input type="checkbox" checked={data?.preferences.animate ?? true} disabled={busy || !data} onChange={(event) => void preferences({ animate: event.target.checked })} />Smooth character movement</label>
                <button type="button" disabled={busy || !data} onClick={() => void preferences({ mutedUntil: paused ? null : new Date(Date.now() + 60 * 60_000).toISOString() })}>{paused ? <Volume2 aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? 'Resume guidance' : 'Quiet for an hour'}</button>
                <button type="button" onClick={tour}><Compass aria-hidden="true" />Portal tour</button>
                <button type="button" onClick={() => setView('buddy')}>Back</button>
              </div>
            )}
          </div>
          <footer className={styles.bubbleFooter}>
            {error || voice.error ? <p className={styles.error} role="alert">{error || voice.error}</p> : null}
            {view === 'buddy' ? <>
              {transcriptReady ? <p className={styles.heard}>Check what I heard below, then send.</p> : null}
              {voice.listening || voice.transcribing ? <p className={styles.recordingStatus} role="status">{voice.listening ? 'Recording · press the microphone to finish' : 'Transcribing your recording…'}<button type="button" onClick={voice.cancelListening}>Cancel</button></p> : null}
              <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(input); }}>
                <label className="sr-only" htmlFor="petros-direct-input">Talk to Petros</label>
                <textarea ref={inputRef} id="petros-direct-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!voice.listening && !voice.transcribing) void send(input); } }} placeholder={inLearningSession ? 'Ask about this lesson…' : companion.focus ? `Ask about ${companion.focus.title}…` : 'Ask a question or tell me what you need…'} maxLength={2_000} rows={2} />
                <div className={styles.composerActions}><span>Enter to send · Shift + Enter for a new line</span><button type="button" disabled={voice.transcribing || sending} data-listening={voice.listening || undefined} onClick={() => void voice.startListening()} aria-label={voice.listening ? 'Stop listening' : 'Talk to Petros'}>{voice.listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}</button><button type="submit" className={styles.primary} disabled={sending || voice.listening || voice.transcribing || input.trim().length < 2} aria-label="Send to Petros">{sending ? <LoaderCircle aria-hidden="true" /> : <Send aria-hidden="true" />}</button></div>
              </form>
            </> : null}
            <div className={styles.utilityActions}>
              <button type="button" aria-pressed={view === 'plan'} onClick={() => setView(view === 'plan' ? 'buddy' : 'plan')}><Clock3 aria-hidden="true" />My time</button>
              <button type="button" aria-pressed={view === 'settings'} onClick={() => setView(view === 'settings' ? 'buddy' : 'settings')}><Settings2 aria-hidden="true" />Settings</button>
              {!data?.preferences.tourCompleted ? <button type="button" onClick={tour}><Compass aria-hidden="true" />Show me around</button> : null}
            </div>
          </footer>
        </section>
      ) : null}

      {!bubbleOpen || guide ? character : null}
    </div>
  );
}

function ReplyActions({ message, route, actions, busyProposal, onDecide, onNavigate, onReply }: {
  message: PetrosCompanionMessage | null;
  route: string;
  actions: ActionState;
  busyProposal: string | null;
  onDecide: (id: string, decision: 'confirm' | 'decline') => void;
  onNavigate: (href: string) => void;
  onReply: (text: string) => void;
}) {
  if (!message) return null;
  return (
    <div className={styles.replyActions}>
      {message.blocks.map((block, index) => {
        if (block.type === 'navigation') return <button type="button" className={styles.primary} key={`${block.type}-${index}`} onClick={() => onNavigate(block.href)}>{block.label}<ArrowRight aria-hidden="true" /></button>;
        if (block.type === 'session_offer') return <div className={styles.sessionOffer} key={`${block.type}-${index}`}><span className={styles.offer}><Clock3 aria-hidden="true" />{block.title} · about {block.minutes} min</span><PetrosDoorButton door={block.door} sourceId={block.intentPreviewRef} question={block.question} route={block.route || route} label="Plan this lesson" timeBudgetSeconds={block.minutes * 60} /></div>;
        if (block.type === 'plan_preview') return <ol className={styles.replyPlan} key={`${block.type}-${index}`}>{block.steps.slice(0, 5).map((item) => <li key={item.label}>{item.label}{item.when ? <small>{item.when}</small> : null}</li>)}</ol>;
        if (block.type === 'suggested_replies') return <div className={styles.suggestions} key={`${block.type}-${index}`}>{block.replies.map((reply) => <button type="button" key={reply.id} onClick={() => onReply(reply.payload)}>{reply.label}</button>)}</div>;
        if (block.type === 'action_proposal') {
          const settled = actions[block.proposalId];
          const proposalBusy = busyProposal === block.proposalId;
          return <div className={styles.proposal} key={block.proposalId}><strong>{block.title}</strong>{block.preview.length ? <ul>{block.preview.slice(0, 4).map((line) => <li key={line}>{line}</li>)}</ul> : null}{settled ? <p><Check aria-hidden="true" />{settled.message}</p> : <div><button type="button" disabled={proposalBusy} onClick={() => onDecide(block.proposalId, 'decline')}>Not now</button><button type="button" className={styles.primary} disabled={proposalBusy} onClick={() => onDecide(block.proposalId, 'confirm')}>{proposalBusy ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}{block.confirmationRequired ? 'Confirm' : 'Let’s go'}</button></div>}</div>;
        }
        return null;
      })}
    </div>
  );
}
