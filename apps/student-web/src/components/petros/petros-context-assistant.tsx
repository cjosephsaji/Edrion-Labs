'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Focus, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import type {
  PetrosAssistantAnswer,
  PetrosLearningSessionDocument,
  PetrosSessionIntent,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import styles from './petros-context-assistant.module.css';

const SUGGESTIONS = ['What is this card?', 'Why does this matter?', 'Help me act on this'];
type Placement = { attached: boolean; x: number; y: number; side: 'left' | 'right'; bubbleSide: 'left' | 'right' };
type TargetContext = { title: string; message: string; sourceId?: string; href?: string } | null;

export function PetrosContextAssistant({ route, studentName }: { route: string; studentName?: string }) {
  const api = useStudentApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PetrosAssistantAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [placement, setPlacement] = useState<Placement>({ attached: false, x: 0, y: 0, side: 'right', bubbleSide: 'left' });
  const [targetContext, setTargetContext] = useState<TargetContext>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const visible = !route.startsWith('/petros/session') && !route.includes('/attempt');
  const firstName = studentName?.split(' ')[0] || 'there';
  const isHome = route === '/home';

  const close = useCallback(() => {
    if (starting) return;
    setOpen(false);
    setAnswer(null);
    setError('');
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [starting]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !starting) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open, starting]);

  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let activeTarget: HTMLElement | null = null;
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());

    function update() {
      const target = document.querySelector<HTMLElement>('[data-petros-target="primary"]');
      if (activeTarget !== target) {
        if (activeTarget) {
          delete activeTarget.dataset.petrosActive;
          resizeObserver?.unobserve(activeTarget);
        }
        activeTarget = target;
        if (activeTarget) {
          activeTarget.dataset.petrosActive = 'true';
          resizeObserver?.observe(activeTarget);
        }
      }

      const nextTargetContext: TargetContext = target ? {
        title: target.dataset.petrosTitle || 'This deserves a look',
        message: target.dataset.petrosMessage || 'I can help you work out the next step.',
        ...(target.dataset.petrosSourceId ? { sourceId: target.dataset.petrosSourceId } : {}),
        ...(target.dataset.petrosHref ? { href: target.dataset.petrosHref } : {}),
      } : null;
      setTargetContext((current) =>
        current?.title === nextTargetContext?.title &&
        current?.message === nextTargetContext?.message &&
        current?.sourceId === nextTargetContext?.sourceId &&
        current?.href === nextTargetContext?.href
          ? current
          : nextTargetContext,
      );

      if (!target || window.innerWidth < 800) {
        setPlacement((current) => current.attached ? { ...current, attached: false } : current);
        return;
      }

      const rect = target.getBoundingClientRect();
      const inView = rect.bottom > 118 && rect.top < window.innerHeight - 48;
      if (!inView) {
        setPlacement((current) => current.attached ? { ...current, attached: false } : current);
        return;
      }

      const width = isHome ? 144 : 116;
      const height = isHome ? 184 : 152;
      const gap = 14;
      const rightX = rect.right + gap;
      const leftX = rect.left - width - gap;
      const side: Placement['side'] = rightX + width <= window.innerWidth - 16 ? 'right' : 'left';
      const rawX = side === 'right' ? rightX : leftX;
      const rawY = rect.bottom - height * 0.8;
      const x = Math.max(12, Math.min(window.innerWidth - width - 12, rawX));
      const y = Math.max(108, Math.min(window.innerHeight - height - 14, rawY));
      const bubbleSide: Placement['bubbleSide'] = side === 'left'
        ? x >= 310 ? 'left' : 'right'
        : window.innerWidth - (x + width) >= 310 ? 'right' : 'left';

      setPlacement({ attached: true, x, y, side, bubbleSide });
    }

    function schedule() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    }

    const main = document.querySelector('main');
    const mutationObserver = main ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(main!, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const timers = [0, 300, 900, 1800].map((delay) => window.setTimeout(schedule, delay));

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      if (activeTarget) delete activeTarget.dataset.petrosActive;
    };
  }, [isHome, route, visible]);

  if (!visible) return null;

  async function ask() {
    if (loading || question.trim().length < 2) return;
    setLoading(true);
    setAnswer(null);
    setError('');
    try {
      const response = await api.post<PetrosAssistantAnswer>('/student/petros/assistant', {
        question: question.trim(),
        route,
        ...(targetContext?.sourceId ? { sourceId: targetContext.sourceId } : {}),
        ...(targetContext ? {
          selectedCard: {
            title: targetContext.title,
            description: targetContext.message,
            ...(targetContext.href ? { href: targetContext.href } : {}),
          },
        } : {}),
        idempotencyKey: newIdempotencyKey(),
      });
      setAnswer(response);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    if (!answer?.offer || starting) return;
    setStarting(true);
    setError('');
    try {
      const resolveKey = newIdempotencyKey();
      const intent = await api.post<PetrosSessionIntent>('/student/petros/intents/resolve', {
        door: 'assistant_handoff',
        sourceId: answer.offer.sourceId,
        idempotencyKey: resolveKey,
        timeBudgetSeconds: answer.offer.approximateMinutes * 60,
        question: question.trim(),
        route,
        language: 'en',
        accessibility: [],
      });
      const started = await api.post<{
        intent: PetrosSessionIntent;
        session: PetrosLearningSessionDocument;
      }>(`/student/petros/intents/${intent.id}/start`, { idempotencyKey: newIdempotencyKey() });
      router.push(`/petros/session?session=${started.session.id}`);
    } catch (caught) {
      setError(formatApiError(caught));
      setStarting(false);
    }
  }

  const companionTitle = targetContext ? `This one, ${firstName}.` : `Hey ${firstName}!`;
  const companionMessage = targetContext
    ? `${targetContext.title} — ${targetContext.message}`
    : 'Want me to help you figure out the next move?';
  const companionStyle = placement.attached ? {
    '--petros-x': `${placement.x}px`,
    '--petros-y': `${placement.y}px`,
  } as CSSProperties : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={styles.companion}
        data-home={isHome || undefined}
        data-attached={placement.attached || undefined}
        data-side={placement.side}
        data-bubble-side={placement.bubbleSide}
        style={companionStyle}
        aria-label="Talk to Petros"
        aria-haspopup="dialog"
      >
        {placement.attached && targetContext ? (
          <span className={styles.speechBubble}>
            <strong>{companionTitle}</strong>
            <span>{companionMessage}</span>
            <small>Tap me and we’ll make a plan.</small>
          </span>
        ) : null}
        <span className={styles.characterStage}>
          <Image
            src="/petros/petros-pointing.png"
            alt=""
            width={724}
            height={760}
            className={styles.character}
            priority={isHome}
            unoptimized
          />
          <span className={styles.presenceDot} aria-hidden="true" />
        </span>
        <span className={styles.nameplate}><strong>Petros</strong><small>Your study sidekick</small></span>
      </button>

      {open ? (
        <div className={styles.layer}>
          <button type="button" className={styles.backdrop} onClick={close} aria-label="Close Petros" />
          <section
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="petros-assistant-title"
            className={styles.dialog}
          >
            <header className={styles.header}>
              <span className={styles.dialogCharacter} aria-hidden="true">
                <Image src="/petros/petros-pointing.png" alt="" width={724} height={760} unoptimized />
              </span>
              <div className={styles.headerCopy}>
                <p><Sparkles aria-hidden="true" /> Petros · your study sidekick</p>
                <h2 id="petros-assistant-title">What’s up, {firstName}?</h2>
                <span>I know this screen and the academic records connected to you.</span>
              </div>
              <button type="button" onClick={close} disabled={starting} className={styles.close} aria-label="Close Petros"><X aria-hidden="true" /></button>
            </header>

            <div className={styles.body} data-has-answer={answer ? 'true' : undefined}>
              {targetContext ? (
                <section className={styles.focusStrip} aria-label="Current Petros focus">
                  <span><Focus aria-hidden="true" /></span>
                  <p><small>We’re talking about</small><strong>{targetContext.title}</strong></p>
                  <p>{targetContext.message}</p>
                </section>
              ) : null}

              {answer ? (
                <section className={styles.answer} aria-live="polite">
                  <div className={styles.answerHeading}>
                    <span><Image src="/petros/petros-pointing.png" alt="" width={724} height={760} unoptimized /></span>
                    <p>{answer.contextLabel.endsWith('· Demo') ? 'Demo Petros · no AI charge' : 'Petros says'}</p>
                  </div>
                  <p className={styles.answerText}>{answer.answer}</p>
                  {answer.offer ? (
                    <div className={styles.offer}>
                      <p><strong>Want to work through it together?</strong><span>{answer.offer.description}</span></p>
                      <small>About {answer.offer.approximateMinutes} minutes · I’ll carry this question into the session</small>
                      <div>
                        <button type="button" onClick={() => setAnswer(null)} disabled={starting}>Not right now</button>
                        <button type="button" onClick={() => void accept()} disabled={starting}>
                          {starting ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
                          {starting ? 'Getting things ready…' : 'Let’s do it'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {!answer ? (
                <section className={styles.opening}>
                  <p>{targetContext ? `I’m watching ${targetContext.title} right now. Ask me why it matters, or pick a shortcut.` : 'Ask me about what you’re looking at, or let’s work out what to do next.'}</p>
                  <div className={styles.suggestions} aria-label="Suggested questions">
                    {SUGGESTIONS.map((suggestion) => (
                      <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className={styles.composer}>
                <label className={styles.questionLabel}>
                  {answer ? 'Ask a follow-up' : 'Tell me what’s on your mind'}
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={answer ? 2 : 3}
                    maxLength={2000}
                    placeholder={targetContext ? `Ask about “${targetContext.title}”…` : 'Ask about this page, plan your next move, or explain something…'}
                  />
                </label>
                <button type="button" onClick={() => void ask()} disabled={loading || starting || question.trim().length < 2} className={styles.askButton}>
                  {loading ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {loading ? 'Petros is thinking…' : answer ? 'Ask follow-up' : 'Send to Petros'}
                </button>
                <p className={styles.usageNote}>Nothing is sent—and no AI request is made—until you press Send.</p>
              </section>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
