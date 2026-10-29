'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, BookOpen, Check, ChevronLeft, CircleCheck, Headphones,
  Info, Lightbulb, Menu, MessageCircle, Pause, Play, Send, X,
} from 'lucide-react';
import type {
  PetrosDocumentTeachingAction,
  PetrosDocumentTeachingScene,
  PetrosLearningSessionDocument,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import { usePetrosVoice } from './use-petros-voice';
import { PetrosVoiceControls } from './petros-voice-controls';
import { DocumentActivity } from './petros-document-activity';
import { MathExpression, MathText } from './petros-math';
import styles from './petros-document-teaching.module.css';

const PetrosRig = dynamic(
  () => import('@/features/learning-studio/petros-rig').then((module) => module.PetrosRig),
  { ssr: false },
);

type Session = PetrosLearningSessionDocument;
const PETROS_PRESENTATION_VERSION = 'petros.presentation.v1' as const;
type Action = PetrosDocumentTeachingAction extends infer T
  ? T extends PetrosDocumentTeachingAction
    ? Omit<T, 'idempotencyKey' | 'expectedVersion'>
    : never
  : never;

function scenePurpose(scene: PetrosDocumentTeachingScene) {
  if (scene.purpose) return scene.purpose;
  if (scene.phase === 'concrete_opening') return 'teaching' as const;
  if (scene.phase === 'visual_explanation') return 'exploration' as const;
  if (scene.phase === 'guided_application') return 'guided_practice' as const;
  if (scene.phase === 'independent_check') return 'independent_check' as const;
  return 'connection_review' as const;
}

const purposeCopy = {
  teaching: ['Learn', 'Build the idea before you are asked to use it.'],
  exploration: ['Explore', 'Change something and notice what stays true.'],
  guided_practice: ['Practice with support', 'Use the idea once with help close by.'],
  independent_check: ['Check your understanding', 'Try a fresh example without the worked answer.'],
  connection_review: ['Connect', 'Explain what transfers to a different situation.'],
} as const;

function StructuredSceneContent({ scene }: { scene: PetrosDocumentTeachingScene }) {
  if (!scene.content?.length) return <p><MathText>{scene.explanation}</MathText></p>;
  return <div className={styles.structuredContent}>{scene.content.map((segment, index) => segment.kind === 'math'
    ? <MathExpression key={`${segment.tex}-${index}`} value={segment.tex} display={segment.display} />
    : <span key={`${segment.value}-${index}`}><MathText>{segment.value}</MathText></span>)}</div>;
}

export function PetrosDocumentTeaching({ sessionId }: { sessionId?: string }) {
  const api = useStudentApi();
  const [session, setSession] = useState<Session | null>(null);
  const doc = useRef<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const [diagnostic, setDiagnostic] = useState('');
  const [exploration, setExploration] = useState<Record<string, string | number | boolean>>({});
  const explorationDirty = useRef(false);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const [question, setQuestion] = useState('');
  const [askReply, setAskReply] = useState('');
  const [panel, setPanel] = useState<'outline' | 'help' | 'source' | null>('outline');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'failed'>('saved');
  const retryBody = useRef<{ signature: string; body: Record<string, unknown> } | null>(null);
  const lastNarratedScene = useRef('');
  const lastPresentationCheckpoint = useRef('');
  const commandQueue = useRef<Promise<void>>(Promise.resolve());
  const voice = usePetrosVoice((text) => {
    setQuestion(text);
    setPanel('help');
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const compact = window.matchMedia('(max-width: 1279px)');
    const syncPanel = () => setPanel((current) => compact.matches
      ? current === 'outline' ? null : current
      : current ?? 'outline');
    syncPanel();
    compact.addEventListener('change', syncPanel);
    return () => compact.removeEventListener('change', syncPanel);
  }, []);
  const closePanel = () => setPanel(typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1279px)').matches ? null : 'outline');

  const apply = useCallback((next: Session, options?: { preserveDraft?: boolean }) => {
    doc.current = next;
    setSession(next);
    const teaching = next.documentTeaching;
    if (!teaching) return;
    const scene = teaching.plan.scenes[teaching.scene]!;
    if (!options?.preserveDraft) {
      const savedDraft = teaching.scenes[scene.id]?.draft ?? '';
      draftRef.current = savedDraft;
      setDraft(savedDraft);
    }
    setDiagnostic(teaching.diagnosticAnswer ?? '');
    setAskReply(teaching.scenes[scene.id]?.reply ?? '');
    setExploration(teaching.scenes[scene.id]?.exploration ?? {});
    explorationDirty.current = false;
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    const abort = new AbortController();
    setLoading(true);
    api.get<Session>(`/student/petros/sessions/${sessionId}`, abort.signal)
      .then(apply)
      .catch((caught) => { if (!abort.signal.aborted) setError(formatApiError(caught)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [api, apply, sessionId]);

  const teaching = session?.documentTeaching;
  const scene = teaching ? teaching.plan.scenes[teaching.scene]! : null;
  const progress = scene && teaching ? teaching.scenes[scene.id]! : null;

  const send = useCallback((action: Action) => {
    const execute = async () => {
      const current = doc.current;
      if (!current?.documentTeaching) return;
      const signature = JSON.stringify({ id: current.id, action });
      const body = retryBody.current?.signature === signature
        ? retryBody.current.body
        : { ...action, idempotencyKey: newIdempotencyKey(), expectedVersion: current.version };
      retryBody.current = { signature, body };
      const foreground = action.action !== 'save' && action.action !== 'explore';
      if (foreground) setBusy(true);
      if (action.action === 'save') setSaveStatus('saving');
      setError('');
      try {
        const next = await api.post<Session>(`/student/petros/sessions/${current.id}/document-teaching`, body);
        retryBody.current = null;
        apply(next, { preserveDraft: action.action === 'save' || action.action === 'explore' });
        if (action.action === 'save') setSaveStatus('saved');
      } catch (caught) {
        setError(formatApiError(caught));
        if (action.action === 'save') setSaveStatus('failed');
      } finally {
        if (foreground) setBusy(false);
      }
    };
    const queued = commandQueue.current.then(execute, execute);
    commandQueue.current = queued;
    return queued;
  }, [api, apply]);

  useEffect(() => {
    if (!teaching?.mode || !scene || !progress || session?.status !== 'active' || draft === progress.draft) return;
    const timer = window.setTimeout(() => void send({ action: 'save', scene: teaching.scene, draft }), 650);
    return () => window.clearTimeout(timer);
  }, [draft, progress, scene, send, session?.status, teaching]);

  useEffect(() => {
    if (!teaching || !scene || !explorationDirty.current || session?.status !== 'active') return;
    const timer = window.setTimeout(() => {
      if (!explorationDirty.current) return;
      explorationDirty.current = false;
      void send({ action: 'explore', scene: teaching.scene, values: exploration });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [exploration, scene, send, session?.status, teaching]);

  const updateDraft = (value: string) => {
    draftRef.current = value;
    setDraft(value);
    setSaveStatus('saving');
  };
  const saveDraft = async () => {
    if (teaching && scene && draftRef.current !== progress?.draft) {
      await send({ action: 'save', scene: teaching.scene, draft: draftRef.current });
    }
  };
  const saveExploration = async () => {
    if (teaching && explorationDirty.current) {
      explorationDirty.current = false;
      await send({ action: 'explore', scene: teaching.scene, values: exploration });
    }
  };
  const navigate = async (index: number) => {
    if (!teaching) return;
    voiceRef.current.stopSpeaking();
    await saveDraft();
    await saveExploration();
    await send({ action: 'navigate', scene: index });
  };
  const advance = async (skip = false) => {
    voiceRef.current.stopSpeaking();
    await saveDraft();
    await saveExploration();
    await send({ action: 'advance', skip });
  };
  const complete = async () => {
    if (!teaching) return;
    voiceRef.current.stopSpeaking();
    await saveExploration();
    await send({ action: 'complete', scene: teaching.scene });
  };
  const submit = async () => {
    if (teaching && draft.trim()) {
      await saveDraft();
      await saveExploration();
      await send({ action: 'answer', scene: teaching.scene, answer: draft.trim() });
    }
  };
  const speak = () => {
    if (scene) void voice.speak(`${scene.introduction} ${scene.explanation}`);
  };

  useEffect(() => {
    if (!scene || teaching?.mode !== 'voice' || session?.status !== 'active') return;
    const signature = `${session.id}:${scene.id}`;
    if (lastNarratedScene.current === signature) return;
    lastNarratedScene.current = signature;
    void voice.speak(`${scene.introduction} ${scene.explanation}`);
  }, [scene, session?.id, session?.status, teaching?.mode, voice]);

  useEffect(() => {
    if (!scene || !teaching?.mode || !session) return;
    const beatId = scene.presentation?.beats[0]?.id ?? `scene:${scene.id}`;
    const signature = `${session.id}:${scene.id}:${beatId}:${teaching.mode}`;
    if (lastPresentationCheckpoint.current === signature) return;
    lastPresentationCheckpoint.current = signature;
    const execute = async () => {
      const current = doc.current;
      if (!current) return;
      try {
        const next = await api.post<Session>(
          `/student/petros/sessions/${current.id}/presentation`,
          {
            expectedVersion: current.version,
            idempotencyKey: newIdempotencyKey(),
            checkpoint: {
              presentationVersion: PETROS_PRESENTATION_VERSION,
              unitId: scene.presentation?.unitId ?? scene.id,
              beatId,
              mode: teaching.mode === 'voice' ? 'voice' : 'quiet',
            },
          },
        );
        apply(next, { preserveDraft: true });
      } catch {
        lastPresentationCheckpoint.current = '';
        setSaveStatus('failed');
      }
    };
    const queued = commandQueue.current.then(execute, execute);
    commandQueue.current = queued;
  }, [api, apply, scene, session, teaching?.mode]);
  const togglePause = async () => {
    if (!session) return;
    voiceRef.current.stopSpeaking();
    await saveDraft();
    await saveExploration();
    setBusy(true);
    try {
      const next = await api.post<Session>(
        `/student/petros/sessions/${session.id}/${session.status === 'paused' ? 'resume' : 'pause'}`,
        { idempotencyKey: newIdempotencyKey() },
      );
      apply(next);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setBusy(false);
    }
  };

  const diagnosticView = Boolean(teaching && !teaching.diagnosticComplete);
  const currentFeedback = progress?.attempts.at(-1);
  const sourcePages = useMemo(() => scene?.sourceRefs.map((ref) => ref.page) ?? [], [scene]);

  if (loading) return <StudioMessage eyebrow="Opening your studio" title="Preparing the workspace…" body="Your source, activities, and saved position are being restored." loading />;
  if (error && !session) return <StudioMessage title="We need another moment" body={error} href="/petros" />;
  if (!session || !teaching || !scene || !progress) return <StudioMessage title="No lesson is open" body="Choose a teacher-shared document, then select Start learning." href="/petros" />;

  if (session.status === 'closed') {
    const outcomes = Object.values(teaching.scenes);
    const count = (value: typeof outcomes[number]['outcome']) => outcomes.filter((item) => item.outcome === value).length;
    return <main className={styles.reviewPage}><section className={styles.reviewCard}>
      <span className={styles.reviewMark}><CircleCheck /></span>
      <p className={styles.kicker}>Lesson review</p>
      <h1>You’ve built a first pass at <MathText>{teaching.plan.title}</MathText></h1>
      <p>Your work is saved by how you engaged with each idea. This is a study record, not a claim of long-term mastery.</p>
      <div className={styles.reviewGrid}>
        <ReviewStat value={count('explored')} label="Explored" />
        <ReviewStat value={count('independent')} label="Independent" />
        <ReviewStat value={count('supported')} label="With help" />
        <ReviewStat value={count('skipped') + count('unresolved') + count('unseen')} label="To revisit" />
      </div>
      <div className={styles.reviewActions}><Link className={styles.primary} href="/petros">Continue to learning path <ArrowRight /></Link>
        <Link className={styles.secondary} href="/materials">Back to material</Link>
      </div>
    </section></main>;
  }

  if (!teaching.mode) return <StudioMessage eyebrow="Ready to learn" title={teaching.plan.objectives[0] ?? teaching.plan.title} body={`${teaching.plan.overview} Choose narration or quiet study. You can switch later.`} action={<><button className={styles.primary} type="button" aria-label="Start learning" disabled={busy} onClick={() => void send({ action: 'mode', mode: 'voice' })}><Headphones /> Learn with Petros</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => void send({ action: 'mode', mode: 'text' })}><BookOpen /> Read quietly</button></>} href="/materials" />;

  const purpose = scenePurpose(scene);
  const [purposeLabel, purposeDescription] = purposeCopy[purpose];
  const responseKind = scene.response?.kind ?? (purpose === 'teaching' || purpose === 'exploration' ? 'none' : scene.responseType);
  const requiresResponse = responseKind !== 'none';
  const checked = progress.outcome === 'independent' || progress.outcome === 'supported';
  const isLast = teaching.scene === teaching.plan.scenes.length - 1;

  return <main className={styles.shell}>
    <header className={styles.studioHeader}>
      <Link href="/materials" className={styles.backLink}><ChevronLeft /> Back to material</Link>
      <div className={styles.lessonIdentity}><span>Petros studio</span><strong><MathText>{teaching.plan.title}</MathText></strong></div>
      <div className={styles.headerActions}>
        <span className={styles.saveState} data-state={saveStatus}>{saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Couldn’t save'}</span>
        <button type="button" onClick={speak} disabled={voice.speaking || voice.preparing} aria-label="Read this idea aloud"><Headphones /> <span>Audio</span></button>
        <button ref={helpButtonRef} type="button" onClick={() => { const closing = panel === 'help'; if (closing) closePanel(); else setPanel('help'); if (closing) window.requestAnimationFrame(() => helpButtonRef.current?.focus()); }} aria-expanded={panel === 'help'}><MessageCircle /> <span>Ask Petros</span></button>
      </div>
    </header>

    <div className={styles.studioBody}>
      {panel !== null && <button className={styles.panelBackdrop} type="button" aria-label="Close lesson panel" onClick={closePanel} />}
      <aside className={styles.sidePanel} data-open={panel !== null} aria-label={panel === 'outline' ? 'Lesson outline' : panel === 'help' ? 'Petros help' : 'Source references'}>
        <div className={styles.panelHeader}>
          <strong>{panel === 'help' ? 'Ask Petros' : panel === 'source' ? 'Source' : 'Lesson outline'}</strong>
          <button type="button" onClick={() => { const restoreHelp = panel === 'help'; closePanel(); if (restoreHelp) window.requestAnimationFrame(() => helpButtonRef.current?.focus()); }} aria-label="Close panel"><X /></button>
        </div>
        {panel === 'outline' && <nav className={styles.outline}>
          <p>{teaching.plan.scenes.length} ideas · about {Math.max(5, teaching.plan.scenes.length * 3)} min</p>
          <ol>{teaching.plan.scenes.map((item, index) => {
            const itemProgress = teaching.scenes[item.id];
            return <li key={item.id}><button type="button" disabled={busy || index > teaching.unlocked} data-current={index === teaching.scene} onClick={() => void navigate(index)}><span>{itemProgress?.outcome === 'independent' || itemProgress?.outcome === 'supported' || itemProgress?.outcome === 'explored' ? <Check /> : index + 1}</span><span><small>{purposeCopy[scenePurpose(item)][0]}</small><strong><MathText>{item.title}</MathText></strong></span></button></li>;
          })}</ol>
          <details className={styles.about}><summary><Info /> About this lesson</summary><p>Petros uses checked answers and requested help to adjust support. Reading and exploring are not graded.</p></details>
        </nav>}
        {panel === 'source' && <div className={styles.sourcePanel}>
          <p>This idea is grounded in the pages below.</p>
          {scene.sourceRefs.map((ref) => <div key={ref.page}><BookOpen /><span><strong>Page {ref.page}</strong>{ref.quote && <small><MathText>{ref.quote}</MathText></small>}</span></div>)}
          {!teaching.plan.sourceComplete && <p className={styles.notice}>Some pages are still being processed. This lesson uses only the source available so far.</p>}
        </div>}
        {panel === 'help' && <div className={styles.helpPanel}>
          <PetrosVoiceControls voice={voice} paused={session.status === 'paused'} /><div className={styles.petrosIntro}><PetrosRig state={voice.speaking ? 'speak' : voice.listening ? 'listen' : 'rest'} /><span><strong>Petros</strong><small>Here when you want a hand</small></span></div>
          <div className={styles.quickHelp}>
            <button type="button" disabled={busy} onClick={() => void send({ action: 'help', kind: 'hint' })}><Lightbulb /> Show a hint</button>
            <button type="button" disabled={busy} onClick={() => void send({ action: 'help', kind: 'example' })}>See a worked example</button>
            <button type="button" disabled={busy} onClick={() => void send({ action: 'help', kind: 'simpler' })}>Explain it more simply</button>
            <button type="button" disabled={busy} onClick={() => void send({ action: 'help', kind: 'deeper' })}>Explain this visual</button>
          </div>
          {progress.help !== 'none' && <div className={styles.helpReply}><strong>{progress.help === 'hint' ? 'A small hint' : progress.help === 'example' ? 'Worked example' : 'Another way to see it'}</strong><MathText>{progress.help === 'hint' ? scene.hint : progress.help === 'example' ? progress.reply ?? scene.example : progress.reply ?? scene.explanation}</MathText></div>}
          <label className={styles.askComposer}><span>Ask about this idea…</span><textarea value={question} onChange={(event) => { if (voice.listening || voice.transcribing) voice.cancelListening(); setQuestion(event.target.value); }} rows={3} /></label>
          <div className={styles.composerActions}><button type="button" onClick={() => { if (voice.listening) voice.stopListening(); else { voice.stopSpeaking(); voice.startListening(); } }}>{voice.listening ? 'Stop recording' : 'Use mic'}</button><button className={styles.primary} type="button" disabled={!question.trim() || busy} onClick={() => void send({ action: 'ask', question: question.trim() })}><Send /> Ask</button></div>
          {askReply && <div className={styles.helpReply}><MathText>{askReply}</MathText></div>}
        </div>}
      </aside>

      <article className={styles.workspace}>
        <button className={styles.mobileOutline} type="button" onClick={() => setPanel('outline')}><Menu /> Lesson outline</button>
        {session.status === 'paused' && <div className={styles.paused} role="status"><Pause /><span><strong>Paused. Your place is saved.</strong><small>Resume when you’re ready.</small></span><button className={styles.primary} type="button" onClick={() => void togglePause()}><Play /> Resume lesson</button></div>}
        <header className={styles.sceneHeader}>
          <div className={styles.sceneMeta}><span>{purposeLabel}</span><span>Idea {teaching.scene + 1} of {teaching.plan.scenes.length}</span></div>
          <h1><MathText>{diagnosticView ? 'Choose where to begin' : scene.title}</MathText></h1>
          <p className={styles.purpose}>{diagnosticView ? 'A short prerequisite check can adjust the starting point. You can skip it without penalty.' : purposeDescription}</p>
          {!diagnosticView && <button className={styles.sourceButton} type="button" onClick={() => setPanel('source')}><BookOpen /> View source · {sourcePages.map((page) => `p. ${page}`).join(', ')}</button>}
        </header>

        {diagnosticView ? <section className={styles.practiceCard}>
          <span className={styles.cardLabel}>Optional starting point</span>
          <h2><MathText>{teaching.plan.diagnostic.prompt}</MathText></h2>
          {teaching.plan.diagnostic.responseType === 'choice' && teaching.plan.diagnostic.choices.length
            ? <div className={styles.choices}>{teaching.plan.diagnostic.choices.map((choice) => <label className={styles.choice} key={choice.id}><input type="radio" name="lesson-diagnostic" checked={diagnostic === choice.id} onChange={() => setDiagnostic(choice.id)} /><MathText>{choice.label}</MathText></label>)}</div>
            : <textarea className={styles.answer} value={diagnostic} onChange={(event) => setDiagnostic(event.target.value)} placeholder="A short answer is enough…" />}
          <div className={styles.cardActions}><button className={styles.secondary} type="button" disabled={busy} onClick={() => void send({ action: 'diagnostic', answer: '' })}>Start with the explanation</button><button className={styles.primary} type="button" disabled={!diagnostic.trim() || busy} onClick={() => void send({ action: 'diagnostic', answer: diagnostic.trim() })}>Use my answer <ArrowRight /></button></div>
        </section> : <>
          <section className={styles.teachingCopy}><p className={styles.intro}><MathText>{scene.introduction}</MathText></p><StructuredSceneContent scene={scene} /></section>
          <div className={styles.teachingStage}>
            <section className={styles.activitySurface} data-purpose={purpose} data-petros-target={scene.petrosAnchorId ?? `scene:${scene.id}`}>
              <DocumentActivity scene={scene} exploration={exploration} response={draft} onResponse={updateDraft} onExplore={(values) => { explorationDirty.current = true; setExploration((current) => ({ ...current, ...values })); }} disabled={busy || session.status !== 'active'} />
            </section>
            <aside className={styles.petrosTeachingDock} aria-label="Petros teaching position">
              <PetrosRig state={session.status === 'paused' ? 'paused' : voice.speaking ? 'speak' : requiresResponse ? 'rest' : 'point'} pointAngle={-24} />
              <span>Petros</span>
            </aside>
          </div>
          {requiresResponse && <section className={styles.practiceCard}>
            <span className={styles.cardLabel}>{purpose === 'independent_check' ? 'Fresh check' : purpose === 'guided_practice' ? 'Your turn · help is available' : 'Make the connection'}</span>
            <h2><MathText>{scene.question}</MathText></h2>
            {responseKind === 'choice' && scene.choices.length ? <div className={styles.choices}>{scene.choices.map((choice) => <label className={styles.choice} key={choice.id}><input type="radio" name={`scene-${scene.id}`} checked={draft === choice.id} onChange={() => updateDraft(choice.id)} /><MathText>{choice.label}</MathText></label>)}</div>
              : responseKind === 'ordering' || responseKind === 'classification' || responseKind === 'missing_step' ? <p className={styles.embeddedResponse}>Complete the activity above, then check your answer.</p>
                : <><textarea className={styles.answer} value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={scene.response && 'placeholder' in scene.response ? scene.response.placeholder : responseKind === 'expression' ? 'Type an expression, for example x^2 + C' : responseKind === 'numeric' ? 'Type a number and unit' : 'Explain your thinking in your own words…'} />{responseKind === 'expression' && <div className={styles.expressionTools}><span>Preview</span><MathExpression value={draft || '\\text{Your expression}'} /><div>{['^', 'sqrt()', '+ C'].map((symbol) => <button key={symbol} type="button" onClick={() => updateDraft(`${draft}${draft ? ' ' : ''}${symbol}`)}>{symbol}</button>)}</div></div>}</>}
            {currentFeedback && <div className={styles.feedback} data-result={currentFeedback.correctness} role="status"><strong>{currentFeedback.correctness === 'correct' ? 'That reasoning works.' : currentFeedback.correctness === 'partial' ? 'You have the main direction.' : 'One part needs another look.'}</strong><p><MathText>{currentFeedback.feedback}</MathText></p></div>}
            <div className={styles.inlineHelp}><button type="button" onClick={() => { setPanel('help'); void send({ action: 'help', kind: 'hint' }); }}><Lightbulb /> Show a hint</button>{currentFeedback && !checked && <button type="button" onClick={() => { setPanel('help'); void send({ action: 'help', kind: 'example' }); }}>See a worked example</button>}</div>
          </section>}
        </>}
        {error && <p className={styles.error} role="alert">{error} {saveStatus === 'failed' && <button type="button" onClick={() => void saveDraft()}>Retry save</button>}</p>}
      </article>
    </div>

    {!diagnosticView && <footer className={styles.studioFooter}>
      <button className={styles.secondary} type="button" disabled={busy || teaching.scene === 0} onClick={() => void navigate(teaching.scene - 1)}><ChevronLeft /> Previous</button>
      <div className={styles.footerProgress}><span>{teaching.scene + 1} / {teaching.plan.scenes.length}</span><div><i style={{ width: `${((teaching.scene + 1) / teaching.plan.scenes.length) * 100}%` }} /></div></div>
      <div className={styles.footerActions}><button className={styles.pauseButton} type="button" disabled={busy} onClick={() => void togglePause()}>{session.status === 'paused' ? <Play /> : <Pause />}<span>{session.status === 'paused' ? 'Resume' : 'Pause'}</span></button>
        {requiresResponse && !checked && <button className={styles.deferButton} type="button" disabled={busy} onClick={() => void advance(true)}>Try this later</button>}
        {requiresResponse && !checked ? <button className={styles.primary} type="button" disabled={!draft.trim() || busy || session.status !== 'active'} onClick={() => void submit()}>Check answer <Check /></button>
          : requiresResponse ? <button className={styles.primary} type="button" disabled={busy} onClick={() => void advance(false)}>{isLast ? 'Finish lesson' : 'Next idea'} <ArrowRight /></button>
            : <button className={styles.primary} type="button" disabled={busy || session.status !== 'active'} onClick={() => void complete()}>{isLast ? 'Finish lesson' : 'Continue'} <ArrowRight /></button>}
      </div>
    </footer>}
  </main>;
}

function StudioMessage({ eyebrow, title, body, loading, href, action }: { eyebrow?: string; title: string; body: string; loading?: boolean; href?: string; action?: React.ReactNode }) {
  return <main className={styles.welcome}><section className={styles.welcomeCard}>{loading && <span className={styles.loader} />}{eyebrow && <p className={styles.kicker}>{eyebrow}</p>}<h1><MathText>{title}</MathText></h1><p>{body}</p><div className={styles.welcomeActions}>{action}{href && <Link className={styles.secondary} href={href}>Back to materials</Link>}</div></section></main>;
}

function ReviewStat({ value, label }: { value: number; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}
