'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { BookOpen, ChevronRight, CirclePause, MessageCircle, Play, RotateCcw, Sparkles } from 'lucide-react';
import { ActionButton } from '@/components/design-system/action-button';
import { TeachingTargetRegistry } from '@/features/learning-studio/target-registry';
import { PresentationController, primaryPlaybackControl } from '../presentation-controller';
import { TeachingCanvas } from '../canvas/teaching-canvas';
import { SourceInspector } from '../source-inspector';
import { FloatingCompanion } from './floating-companion';
import narrationAssets from '../../../../public/petros/audio/spoken-fixtures.json';
import { useVoicePreview } from '../voice/use-voice-preview';
import { TeachingVoiceControls } from '../voice/teaching-voice-controls';
import { VoicePreview } from '../voice/voice-preview';
import { resolveCompanionCue } from '../companion/companion-controller';
import manifest from '../../../../public/petros/v2/rig/manifest.json';
import { fixtureDialogue, fixtureFeedback } from './playground-adapter';
import { PLAYGROUND_SCENARIOS } from './playground-scenarios';
import { revealWorkspaceTarget } from './workspace-scroll';
import type { PublicTeachingFixture } from './teaching-fixtures';
import styles from './companion-playground.module.css';

const CLOUD_SAMPLES = [
  { id: 'lesson', label: 'Current lesson', text: '' },
  { id: 'status', label: 'Two-word status', text: 'Source checked.' },
  { id: 'short', label: 'Short sentence', text: 'Your place is saved.' },
  { id: 'two', label: 'Two sentences', text: 'This arrow connects the two ideas. Its label describes their relationship.' },
  { id: 'long', label: 'Long paragraph', text: 'The diagram records the relationship shown in this public example. Select a node or arrow to inspect its meaning, then ask about that element. During your turn, you can revise the permitted labels and connections. Your changes stay in this local practice copy when you pause to ask a question, and you can continue from the same teaching checkpoint afterward.' },
  { id: 'empty', label: 'Empty content', text: '' },
] as const;

export function CompanionPlayground({ ownerId }: { ownerId: string }) {
  const [fixtureId, setFixtureId] = useState(PLAYGROUND_SCENARIOS[0]!.id);
  const [selectionReady, setSelectionReady] = useState(false);
  useEffect(() => {
    try { const saved = localStorage.getItem(`petros.m0p.selection:${ownerId}`); if (PLAYGROUND_SCENARIOS.some(f => f.id === saved)) setFixtureId(saved!); } catch { /* Optional device storage. */ }
    setSelectionReady(true);
  }, [ownerId]);
  useEffect(() => { if (selectionReady) { try { localStorage.setItem(`petros.m0p.selection:${ownerId}`, fixtureId); } catch { /* Optional device storage. */ } } }, [fixtureId, ownerId, selectionReady]);
  const fixture = PLAYGROUND_SCENARIOS.find(f => f.id === fixtureId)!;
  return <section className={styles.playground} aria-label="Petros Companion Playground">
    <header className={styles.header}><div><p className={styles.eyebrow}><Sparkles size={14} /> PETROS</p><h1>Learning together</h1></div><span className={styles.badge}>Public practice · demo feedback</span></header>
    <a href="/verification/petros-v2/companion">Inspect the original Petros poses</a>
    <nav className={styles.scenarios} aria-label="Teaching demonstrations">{PLAYGROUND_SCENARIOS.map(f => <button key={f.id} aria-pressed={f.id === fixtureId} onClick={() => setFixtureId(f.id)}>{f.title}</button>)}</nav>
    <TeachingTargetRegistry><Scenario key={`${ownerId}:${fixture.id}`} fixture={fixture} ownerId={ownerId} /></TeachingTargetRegistry>
  </section>;
}

function createFixturePresentation(fixture: PublicTeachingFixture) {
  const controller = new PresentationController(fixture.timeline);
  controller.configureNarration(narrationAssets.segments.filter(segment => fixture.timeline.beats.some(beat => beat.id === segment.beatId)).map(segment => ({ ...segment, mimeType: 'audio/mpeg' as const, provenance: 'approved-local-fixture' as const })));
  controller.setNarrationEnabled(false);
  return controller;
}

function Scenario({ fixture, ownerId }: { fixture: PublicTeachingFixture; ownerId: string }) {
  const [controller, setController] = useState(() => createFixturePresentation(fixture));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [reducedMotion, setReducedMotion] = useState(false), [question, setQuestion] = useState(''), [typing, setTyping] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'student' | 'petros'; text: string }>>([]);
  const [reply, setReply] = useState<string | null>(null), [storageMessage, setStorageMessage] = useState(''), [error, setError] = useState('');
  const [replyKey, setReplyKey] = useState(0);
  const [checkingSource, setCheckingSource] = useState(false);
  const [sourceCheck, setSourceCheck] = useState<string | null>(null);
  const [pointingEnabled, setPointingEnabled] = useState(true), [assessmentSafe, setAssessmentSafe] = useState(false);
  const [cloudSample, setCloudSample] = useState('lesson');
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const voiceSession = useVoicePreview(controller, setMicrophoneActive, true);
  const voicePhase = voiceSession.phase;
  const cancelVoice = voiceSession.cancel;
  const acceptTranscript = useCallback((text: string) => {
    setQuestion(text); setReply(null); setCloudSample('lesson');
    // Focus without firing the typed interruption handler and cancelling a valid transcript.
    requestAnimationFrame(() => questionInput.current?.focus({ preventScroll: true }));
  }, []);
  const workspaceContent = useRef<HTMLDivElement>(null);
  const workspaceHeading = useRef<HTMLDivElement>(null);
  const learningArea = useRef<HTMLDivElement>(null), contextColumn = useRef<HTMLElement>(null);
  const parking = useRef<HTMLDivElement>(null), compactParking = useRef<HTMLDivElement>(null);
  const [petrosHeight, setPetrosHeight] = useState(156);
  const playback = useRef<HTMLDivElement>(null);
  const response = useRef<HTMLElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const conversationLog = useRef<HTMLDivElement>(null);
  const sourceCheckResult = useRef<HTMLDivElement>(null);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const responseAttention = useRef<{ controller: PresentationController; id: string } | null>(null);
  const key = `petros.m0p.fixture.v1:${ownerId}:${fixture.id}`;
  useEffect(() => {
    try { const saved = localStorage.getItem(key); if (saved) { controller.restore(saved); setStorageMessage('Restored your local checkpoint. Playback is paused.'); } }
    catch { setStorageMessage('The saved checkpoint could not be restored. This example starts fresh.'); }
    return () => controller.dispose();
  }, [controller, key]);
  useEffect(() => { controller.setNarrationEnabled(narrationEnabled && !assessmentSafe); if (assessmentSafe) cancelVoice(); }, [controller, narrationEnabled, assessmentSafe, cancelVoice]);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches || document.documentElement.dataset.reducedMotion === 'true');
    const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    update(); query.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    controller.configure({ reducedMotion, save: checkpoint => {
      try { localStorage.setItem(key, checkpoint); setStorageMessage('Local checkpoint saved on this device.'); }
      catch { setStorageMessage('Device storage is unavailable. Work remains in this tab until you leave.'); }
    } });
    if (reducedMotion) controller.pause();
  }, [controller, key, reducedMotion]);
  useEffect(() => {
    const stop = () => { if (document.visibilityState === 'hidden') controller.pause(); };
    const leave = () => controller.pause();
    document.addEventListener('visibilitychange', stop); window.addEventListener('pagehide', leave);
    return () => { document.removeEventListener('visibilitychange', stop); window.removeEventListener('pagehide', leave); };
  }, [controller]);
  const beat = fixture.timeline.beats[state.index]!;
  const primary = primaryPlaybackControl(state);
  const selected = state.canvas.elements.find(e => e.id === state.selectedId);
  const selectedLabel = selected?.kind === 'node' ? selected.text : selected?.kind === 'edge' ? `${state.canvas.elements.find(e => e.id === selected.from)?.label ?? selected.from} → ${selected.text} → ${state.canvas.elements.find(e => e.id === selected.to)?.label ?? selected.to}` : selected?.label;
  const sample = CLOUD_SAMPLES.find(item => item.id === cloudSample)!;
  const cue = microphoneActive && !assessmentSafe ? { mode: 'listening' as const, gesture: 'neutral' as const, targetId: null, caption: 'Microphone recording is active. Stop when you’re ready.' }
    : state.speech.preview && !assessmentSafe ? { mode: state.speech.preview.paused ? 'paused' as const : state.speech.phase === 'speaking' ? 'teaching' as const : 'thinking' as const, gesture: 'neutral' as const, targetId: null, caption: state.speech.preview.paused ? 'Audio is paused. Your place is saved.' : state.speech.phase === 'speaking' ? state.speech.preview.caption : state.speech.phase === 'stalled' ? 'Audio is waiting for data…' : 'Preparing audio…' }
    : cloudSample !== 'lesson' && state.status !== 'playing' && !typing && !checkingSource && !assessmentSafe
    ? { mode: 'paused' as const, gesture: 'neutral' as const, targetId: null, caption: sample.text }
    : checkingSource && !assessmentSafe ? { mode: 'thinking' as const, gesture: 'neutral' as const, targetId: state.selectedId, caption: 'Checking this local fixture’s source…' } : resolveCompanionCue(state, beat.action.cue, typing, reply, assessmentSafe);
  const invitation = state.canvas.invitation, open = invitation && !invitation.submitted && state.progress === 1;
  const invitationId = invitation?.id, responseSubmitted = invitation?.submitted;
  const lastElementId = state.canvas.elements.at(-1)?.id;
  const stepFinished = state.progress === 1;
  const sourceEpoch = useRef(0);
  useEffect(() => () => { sourceEpoch.current++; }, [controller]);
  useEffect(() => { setSourceCheck(null); }, [state.selectedId, controller]);
  useEffect(() => {
    if (!open || !invitationId || responseAttention.current?.controller === controller && responseAttention.current.id === invitationId) return;
    const frame = requestAnimationFrame(() => {
      const target = response.current, scrollport = learningArea.current ?? workspaceContent.current;
      if (!target || !scrollport) return;
      responseAttention.current = { controller, id: invitationId };
      const card = target.closest<HTMLElement>('[data-element-id]');
      const input = card?.querySelector<HTMLInputElement>('input:not(:disabled)') ?? target.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
      input?.focus({ preventScroll: true });
      revealWorkspaceTarget(card ?? target, scrollport, playback.current, reducedMotion ? 'auto' : 'smooth', workspaceHeading.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, invitationId, controller, reducedMotion]);
  useEffect(() => {
    const workspace = workspaceContent.current;
    if (!workspace || open) return;
    // Follow acknowledged teaching boundaries without scrolling while a student types or drags.
    let target: HTMLElement | null | undefined;
    if (error) target = errorNotice.current;
    else target = state.feedback ? feedback.current
      : Array.from(workspace.querySelectorAll<HTMLElement>('[data-element-id]')).find(element => element.dataset.elementId === (state.selectedId ?? lastElementId));
    if (document.activeElement?.matches('input, textarea, select') || fixture.id === 'cloud-drawing' && !error && !state.feedback) return;
    if (!target) return;

    const scrollport = learningArea.current ?? workspace;
    let frame = requestAnimationFrame(() => revealWorkspaceTarget(target, scrollport, playback.current, reducedMotion ? 'auto' : 'smooth', workspaceHeading.current));
    let priorHeight = target.getBoundingClientRect().height;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const height = target.getBoundingClientRect().height;
      if (height === priorHeight) return;
      priorHeight = height;
      cancelAnimationFrame(frame);
      // Keep a growing text card visible without restarting a smooth scroll on every frame.
      frame = requestAnimationFrame(() => revealWorkspaceTarget(target, scrollport, playback.current, 'auto', workspaceHeading.current));
    });
    observer?.observe(target);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [state.selectedId, lastElementId, invitationId, responseSubmitted, state.feedback, error, reducedMotion, stepFinished, fixture.id, open, petrosHeight]);
  useEffect(() => {
    // The empty conversation prompt is not a new reply. In particular, a replay
    // must reveal its teaching target instead of scrolling down to this prompt.
    if (!sourceCheck && !checkingSource && !messages.length) return;
    const target = sourceCheck || checkingSource ? sourceCheckResult.current : conversationLog.current?.lastElementChild as HTMLElement | null;
    const panel = contextColumn.current;
    if (!target || !panel) return;
    const frame = requestAnimationFrame(() => {
      if (innerWidth <= 920 && workspaceContent.current) revealWorkspaceTarget(panel, workspaceContent.current, playback.current, 'auto', workspaceHeading.current);
      revealWorkspaceTarget(target, panel, playback.current, reducedMotion ? 'auto' : 'smooth', workspaceHeading.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, sourceCheck, checkingSource, reducedMotion]);
  const equation = state.canvas.elements.find(e => e.id === 'slope-answer');
  const run = (fn: () => void) => { try { fn(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'This operation is unavailable.'); } };
  function interrupt() {
    controller.interrupt(); setReply(null); setCloudSample('lesson');
    sourceEpoch.current++; setCheckingSource(false);
    window.dispatchEvent(new Event('petros:show-context'));
    requestAnimationFrame(() => {
      questionInput.current?.focus({ preventScroll: true });
      if (questionInput.current && contextColumn.current) {
        if (innerWidth <= 920 && workspaceContent.current) revealWorkspaceTarget(contextColumn.current, workspaceContent.current, playback.current, 'auto', workspaceHeading.current);
        revealWorkspaceTarget(questionInput.current, contextColumn.current, playback.current, reducedMotion ? 'auto' : 'smooth', workspaceHeading.current);
      }
    });
  }
  function ask(event: FormEvent) {
    event.preventDefault(); if (!question.trim()) return;
    controller.interrupt(); setCloudSample('lesson');
    sourceEpoch.current++; setCheckingSource(false);
    const answer = fixtureDialogue(fixture, question, state.selectedId, state.canvas);
    setError('');
    setMessages(current => [...current, { role: 'student' as const, text: question }, { role: 'petros' as const, text: answer.text }].slice(-12));
    setReply(answer.text); setReplyKey(current => current + 1); setQuestion(''); setTyping(false);
  }
  async function inspectSource() {
    controller.interrupt(); setTyping(false); setCheckingSource(true); setSourceCheck(null); setCloudSample('lesson');
    const epoch = ++sourceEpoch.current;
    // Real local lookup scheduled for the next paint, with no provider or private source access.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    if (epoch !== sourceEpoch.current) return;
    const selected = state.canvas.elements.find(e => e.id === state.selectedId);
    const text = selected?.kind === 'text' ? selected.text : null;
    const found = text && fixture.source.paragraphs.some(p => p.includes(text));
    const textResult = found ? 'That selected passage appears exactly in this public source. It is highlighted in the preview.' : `I checked “${fixture.source.title}”, the local source for this example. The source preview shows its scope and assumptions.`;
    setReply(textResult); setSourceCheck(textResult); setError('');
    setCheckingSource(false);
  }
  function reset(replay = false) {
    controller.configure({ reducedMotion }); controller.dispose();
    try { localStorage.removeItem(key); } catch { /* In-memory reset still works. */ }
    const next = createFixturePresentation(fixture); next.configure({ reducedMotion }); next.setNarrationEnabled(narrationEnabled && !assessmentSafe);
    if (replay) next.play();
    setController(next);
    sourceEpoch.current++; setCheckingSource(false); setTyping(false); setCloudSample('lesson');
    setMessages([]); setReply(null); setQuestion(''); setError(''); setSourceCheck(null); setStorageMessage('New local practice copy.');
  }
  const studentResponse = invitation && (open || invitation.submitted) && <section ref={response} className={styles.response} aria-label="Student response">
    <h3>{invitation.prompt}</h3>
    <label htmlFor={`reason-${fixture.id}`}>Explain your reasoning</label><textarea id={`reason-${fixture.id}`} rows={1} maxLength={2000} value={state.explanation} disabled={!open} placeholder="How does this step work?" onChange={e => controller.setExplanation(e.target.value)} />
    <ActionButton disabled={!open || (equation?.kind === 'equation' && !equation.value.trim())} onClick={() => run(() => controller.submit((canvas, explanation) => fixtureFeedback(fixture, canvas, explanation)))}>{invitation.submitted ? 'Response saved locally' : 'Submit demonstration response'}</ActionButton>
    {state.feedback && <div ref={feedback} className={styles.feedback} role="status"><strong>Demonstration-only feedback</strong><p>{state.feedback}</p><small>No assessment, mastery, or learning evidence was written.</small></div>}
  </section>;
  return <section className={styles.workspace} aria-label={fixture.title}>
    <div ref={workspaceHeading} className={styles.workspaceHeading} data-workspace-heading data-petros-expanded={petrosHeight > 100}><h2>{fixture.title}</h2><span className={styles.stepCount}>Step {state.index + 1} / {fixture.timeline.beats.length}</span><div ref={compactParking} className={styles.compactParking} /></div>
    <div ref={workspaceContent} className={styles.workspaceContent} role="region" aria-label="Teaching workspace content" tabIndex={0}>
      <div className={styles.lessonGrid}>
        <div ref={learningArea} className={styles.learningArea} role="region" aria-label="Learning canvas content" tabIndex={0}><TeachingCanvas state={state} controller={controller} response={studentResponse} run={run} onAsk={interrupt} reducedMotion={reducedMotion} />
          {error && <p ref={errorNotice} className={styles.error} role="alert">{error} Your existing work is preserved.</p>}
        </div>
        <div className={styles.referenceArea}>
          <div ref={parking} className={styles.petrosParking} style={{ height: petrosHeight }} />
          <aside ref={contextColumn} className={styles.contextColumn} aria-label="Lesson companion and reference" tabIndex={0}
            onPointerDownCapture={event => {
              // Preserve input focus until the clicked panel control runs.
              if (event.button === 0 && document.activeElement === questionInput.current && (event.target as Element).closest('button, summary, [role="button"]')) event.preventDefault();
            }}>
          <section className={styles.conversation} aria-label="Conversation"><h3><BookOpen size={16} />Talk it through</h3><p className={styles.simulated}>Simulated dialogue · public fixture replies</p>
            <div className={styles.selectionContext} role="status" aria-live="polite" data-selected-id={selected?.id ?? ''} data-selection-revision={state.canvas.revision}>{selectedLabel ? <><span>Asking about: <strong>{selectedLabel}</strong></span><button onClick={() => controller.select(null)} aria-label="Clear selected teaching element">Clear</button></> : <span>Select a teaching element to ask about it.</span>}</div>
            <div ref={conversationLog} className={styles.messages} role="log" aria-label="Fixture conversation">{messages.length ? messages.map((message, i) => <div key={i} data-role={message.role}><span>{message.role === 'student' ? 'You' : 'Petros · simulated'}</span><p>{message.text}</p></div>) : <p>Select an element and ask about it.</p>}</div>
            <form onSubmit={ask}><label htmlFor={`question-${fixture.id}`}>Your question</label><textarea id={`question-${fixture.id}`} ref={questionInput} value={question} rows={2} maxLength={2000} placeholder="Why does this step work?" onFocus={() => { controller.interrupt(); sourceEpoch.current++; setCheckingSource(false); setCloudSample('lesson'); setTyping(true); }} onBlur={() => setTyping(false)} onChange={e => setQuestion(e.target.value)} />
              <ActionButton type="submit" disabled={!question.trim()}>Send question</ActionButton>
            </form>
            <TeachingVoiceControls controller={controller} state={state} session={voiceSession} reply={reply} replyKey={replyKey} narrationEnabled={narrationEnabled} disabled={assessmentSafe} onTranscript={acceptTranscript} />
          </section>
          <SourceInspector fixture={fixture} canvas={state.canvas} selectedId={state.selectedId} select={controller.select} />
          <div className={styles.sourceActions}><ActionButton variant="secondary" disabled={checkingSource} onClick={() => void inspectSource()}>Check local source</ActionButton></div>
          {(checkingSource || sourceCheck) && <div ref={sourceCheckResult} className={styles.feedback} role="status" aria-label="Source check result"><strong>{checkingSource ? 'Checking local source…' : 'Local source checked'}</strong>{sourceCheck && <p>{sourceCheck}</p>}</div>}
          <VoicePreview controller={controller} session={voiceSession} disabled={assessmentSafe} publicReply={reply} onTranscript={acceptTranscript} />
          <details className={styles.capabilities} data-internal-inspector><summary>Internal inspector</summary>
            <label htmlFor={`cloud-sample-${fixture.id}`}>Cloud sizing preview</label><select id={`cloud-sample-${fixture.id}`} value={cloudSample} onChange={event => { controller.interrupt(); setTyping(false); setCloudSample(event.target.value); }}>{CLOUD_SAMPLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><p>Public layout samples only. The lesson checkpoint and conversation controls stay in place.</p>
            <p>Rig: {manifest.version}. Whole authored poses only. Speech: {state.speech.phase}. Epoch: {state.epoch}. Active action: {beat.action.actionId}.</p>
            <label><input type="checkbox" checked={pointingEnabled} onChange={e => setPointingEnabled(e.target.checked)} /> Enable supported directional poses</label>
            <label><input type="checkbox" checked={assessmentSafe} onChange={e => setAssessmentSafe(e.target.checked)} /> Preview assessment-safe neutral companion</label>
            <p>Unsupported: {manifest.unsupported.join(', ')}. Missing or clipped targets use neutral plus the existing canvas highlight. Idle uses restrained whole-image movement; the speaking overlay is a fixed-timer approximation, not lip synchronization. Offline public fixture narration uses semantic beat boundaries, with no phoneme or word timing. Internal Voice Preview requires a separately authorized isolated route.</p>
          </details>
          </aside>
        </div>
      </div>
    </div>
    <FloatingCompanion cue={cue} canvas={state.canvas} state={state} presentation={controller} harborHeight={petrosHeight} disabledCapabilities={pointingEnabled ? undefined : ['directional-pointing']} assessmentSafe={assessmentSafe} microphoneActive={microphoneActive} voicePhase={voicePhase} reducedMotion={reducedMotion} generating={state.status === 'playing' || checkingSource || microphoneActive || Boolean(state.speech.preview)} workspace={workspaceContent} parking={parking} compactParking={compactParking} playback={playback} onHeight={setPetrosHeight} />
      <div ref={playback} className={styles.playback} aria-label="Playback controls">
        <div className={styles.transport}>
          {primary.blocked ? <span className={styles.turnState} role="status" aria-describedby={`playback-blocked-${fixture.id}`}>Your turn</span> : <ActionButton title={primary.label} onClick={() => run(() => { if (state.status === 'playing') controller.pause(); else { if (state.status === 'complete') { reset(true); return; } setReply(null); setTyping(false); controller.play(); } })}>{state.status === 'playing' ? <CirclePause size={15} /> : state.status === 'complete' ? <RotateCcw size={15} /> : <Play size={15} />}{primary.label}</ActionButton>}
          <ActionButton variant="secondary" onClick={() => run(() => { setReply(null); controller.step(); })} disabled={Boolean(open) || state.status === 'complete'}><ChevronRight size={15} />{state.progress < 1 ? 'Finish step' : 'Next step'}</ActionButton>
          {!selected && <ActionButton variant="secondary" onClick={interrupt}><MessageCircle size={15} />Ask Petros</ActionButton>}
          <button className={styles.restart} aria-label="Restart fixture" title="Restart fixture" onClick={() => reset()}><RotateCcw size={14} /><span>Restart fixture</span></button>
        </div>
        <div className={styles.caption} role="status" aria-live="polite"><span data-audio-mode title="Offline synthetic demonstration voice; no provider charge">{state.speech.phase === 'speaking' ? 'Speaking' : narrationEnabled && !assessmentSafe ? 'Local narration' : 'Text-only mode'}</span>{state.speech.reason && <p>{state.speech.reason}</p>}<p id={`playback-blocked-${fixture.id}`}>{primary.blocked ? 'Edit the invited elements and submit your response to continue.' : state.canvas.elements.length ? state.speech.caption ?? beat.action.cue.caption : fixture.summary}</p></div>
        <div className={styles.playbackMeta}><label className={styles.motion}><input type="checkbox" checked={narrationEnabled} disabled={assessmentSafe} onChange={event => setNarrationEnabled(event.target.checked)} />Narration enabled</label><label className={styles.motion}><input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true')} />Reduce motion · show complete steps</label><p className={styles.storage} role="status">{storageMessage}</p></div>
      </div>
  </section>;
}
