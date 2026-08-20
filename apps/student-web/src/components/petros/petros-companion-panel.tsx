'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,

  ExternalLink,
  LoaderCircle,
  Minus,
  Send,
  Sparkles,
  Target,

} from 'lucide-react';
import type {
  PetrosActionResult,
  PetrosCompanionBlock,
  PetrosCompanionMessage,
  PetrosCompanionThread,
  PetrosCompanionTurnResult,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import { usePetrosCompanion } from './petros-companion-context';
import styles from './petros-companion-panel.module.css';

type ActionState = Record<string, { status: PetrosActionResult['status']; message: string } | undefined>;

export function PetrosCompanionPanel({ studentName }: { studentName?: string }) {
  const api = useStudentApi();
  const router = useRouter();
  const companion = usePetrosCompanion();
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  /*
   * The student's own message, echoed locally the instant they press send.
   * Without this their words vanish from the screen for the whole turn — several
   * seconds of staring at an empty log wondering whether it registered.
   */
  const [pending, setPending] = useState<PetrosCompanionMessage | null>(null);
  const [error, setError] = useState('');
  const [actions, setActions] = useState<ActionState>({});
  const [busyProposal, setBusyProposal] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const { open, setOpen, support, label, reason, focus, messages, threadId } = companion;
  const firstName = studentName?.split(' ')[0] || 'there';
  const hidden = support === 'hidden';

  // Restore the live thread once, so a reload continues the same conversation.
  useEffect(() => {
    if (restored || hidden) return;
    setRestored(true);
    void api
      .get<{ thread: PetrosCompanionThread | null }>('/student/petros/companion/thread')
      .then((result) => {
        const thread = result?.thread;
        if (thread?.id && Array.isArray(thread.messages)) {
          companion.setThread(thread.id, thread.messages);
        }
      })
      .catch(() => undefined);
  }, [api, companion, hidden, restored]);

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    const starter = companion.consumePendingQuestion();
    if (starter) setQuestion(starter);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [companion, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  useEffect(() => {
    const log = logRef.current;
    // `scrollTo` is absent in jsdom and in older embedded webviews.
    if (typeof log?.scrollTo === 'function') {
      log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, sending, pending]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setSending(true);
      setError('');
      setQuestion('');
      setPending({
        id: `pending-${Date.now()}`,
        threadId: threadId ?? 'pending',
        role: 'student',
        blocks: [{ type: 'text', text: message }],
        route: companion.route,
        surface: companion.surface,
        focusRef: companion.focusRef,
        createdAt: new Date().toISOString(),
      });
      try {
        const result = await api.post<PetrosCompanionTurnResult>('/student/petros/companion/turns', {
          ...(threadId ? { threadId } : {}),
          message,
          route: companion.route,
          surface: companion.surface,
          ...(companion.focusRef ? { focusRef: companion.focusRef } : {}),
          visibleCandidates: companion.candidates,
          idempotencyKey: newIdempotencyKey(),
        });
        if (!threadId) companion.setThread(result.threadId, [result.studentMessage, result.reply]);
        else companion.appendMessages([result.studentMessage, result.reply]);
      } catch (caught) {
        setError(formatApiError(caught));
        setQuestion(message);
      } finally {
        // Cleared either way: on success the server's own copy replaces it, on failure
        // the text goes back in the composer where the student can retry it.
        setPending(null);
        setSending(false);
      }
    },
    [api, companion, sending, threadId],
  );

  const decide = useCallback(
    async (proposalId: string, decision: 'confirm' | 'decline') => {
      if (busyProposal) return;
      setBusyProposal(proposalId);
      setError('');
      try {
        const result = await api.post<PetrosActionResult>(
          `/student/petros/companion/actions/${proposalId}/decision`,
          { decision, idempotencyKey: newIdempotencyKey() },
        );
        setActions((current) => ({
          ...current,
          [proposalId]: { status: result.status, message: result.message },
        }));
        if (result.status === 'executed' && result.href) router.push(result.href);
      } catch (caught) {
        setError(formatApiError(caught));
      } finally {
        setBusyProposal(null);
      }
    },
    [api, busyProposal, router],
  );

  const suggestions = useMemo(() => {
    if (support !== 'supported') return ['What can you help me with?'];
    if (focus) {
      return [
        `Why does ${truncate(focus.title, 32)} matter?`,
        'What should I do about it first?',
        'Plan some time for this',
      ];
    }
    return ['What should I work on next?', 'Plan my day', 'What is due soonest?'];
  }, [focus, support]);

  if (hidden) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={styles.launcher}
        data-open={open || undefined}
        aria-label="Open Petros"
        aria-expanded={open}
        aria-controls="petros-companion-panel"
      >
        <span className={styles.launcherAvatar}>
          <Image src="/petros/petros-pointing.png" alt="" width={724} height={760} unoptimized />
        </span>
        <span className={styles.launcherCopy}>
          <strong>Petros</strong>
          <small>{focus ? truncate(focus.title, 26) : 'Ask about this screen'}</small>
        </span>
        {focus ? <span className={styles.launcherDot} aria-hidden="true" /> : null}
      </button>

      <section
        id="petros-companion-panel"
        ref={panelRef}
        className={styles.panel}
        data-open={open || undefined}
        role="complementary"
        aria-label="Petros study companion"
        aria-hidden={!open}
      >
        <header className={styles.header}>
          <span className={styles.headerMark} aria-hidden="true">
            <Image src="/petros/petros-pointing.png" alt="" width={724} height={760} unoptimized />
          </span>
          <div className={styles.headerCopy}>
            <p>
              <Sparkles aria-hidden="true" /> Petros
            </p>
            <h2>{support === 'supported' ? label : 'Off this screen'}</h2>
          </div>
          <button type="button" onClick={close} className={styles.headerButton} aria-label="Minimise Petros">
            <Minus aria-hidden="true" />
          </button>
        </header>

        {support === 'supported' ? (
          <div className={styles.focusBar} data-empty={focus ? undefined : 'true'}>
            <Target aria-hidden="true" />
            {focus ? (
              <>
                <p>
                  <small>Talking about</small>
                  <strong>{focus.title}</strong>
                </p>
                <button type="button" onClick={() => companion.select(null)}>
                  Clear
                </button>
              </>
            ) : (
              <p>
                <small>Nothing selected</small>
                <strong>Use “Ask Petros” on any card to pin it here</strong>
              </p>
            )}
          </div>
        ) : (
          <p className={styles.unavailable}>{reason ?? 'I cannot read this screen.'}</p>
        )}

        <div className={styles.log} ref={logRef} aria-live="polite" aria-atomic="false">
          {messages.length === 0 ? (
            <div className={styles.opening}>
              <p>
                Hey {firstName}. I can see your work, deadlines and results — pick something on the
                page and I will work from its exact record.
              </p>
            </div>
          ) : null}

          {[...messages, ...(pending ? [pending] : [])].map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              actions={actions}
              busyProposal={busyProposal}
              onDecide={decide}
              onSuggestion={(text) => void send(text)}
            />
          ))}

          {sending ? (
            <p className={styles.thinking}>
              <LoaderCircle aria-hidden="true" /> Petros is thinking…
            </p>
          ) : null}
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {!sending && messages.length === 0 ? (
          <div className={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            void send(question);
          }}
        >
          <label className="sr-only" htmlFor="petros-composer">
            Message Petros
          </label>
          <textarea
            id="petros-composer"
            ref={composerRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(question);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={focus ? `Ask about “${truncate(focus.title, 28)}”…` : 'Ask Petros anything…'}
          />
          <button type="submit" disabled={sending || question.trim().length < 2} aria-label="Send to Petros">
            {sending ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Send aria-hidden="true" />}
          </button>
        </form>
      </section>

      {open ? <button type="button" className={styles.scrim} onClick={close} aria-label="Close Petros" /> : null}
    </>
  );
}

function MessageBubble({
  message,
  actions,
  busyProposal,
  onDecide,
  onSuggestion,
}: {
  message: PetrosCompanionMessage;
  actions: ActionState;
  busyProposal: string | null;
  onDecide: (proposalId: string, decision: 'confirm' | 'decline') => void;
  onSuggestion: (text: string) => void;
}) {
  const mine = message.role === 'student';
  return (
    <article
      className={styles.message}
      data-role={message.role}
      data-pending={message.id.startsWith('pending-') || undefined}
    >
      {mine ? null : (
        <span className={styles.messageMark} aria-hidden="true">
          <Image src="/petros/petros-pointing.png" alt="" width={724} height={760} unoptimized />
        </span>
      )}
      <div className={styles.messageBody}>
        {(message.blocks ?? []).map((block, index) => (
          <Block
            key={`${message.id}-${index}`}
            block={block}
            actions={actions}
            busyProposal={busyProposal}
            onDecide={onDecide}
            onSuggestion={onSuggestion}
          />
        ))}
      </div>
    </article>
  );
}

function Block({
  block,
  actions,
  busyProposal,
  onDecide,
  onSuggestion,
}: {
  block: PetrosCompanionBlock;
  actions: ActionState;
  busyProposal: string | null;
  onDecide: (proposalId: string, decision: 'confirm' | 'decline') => void;
  onSuggestion: (text: string) => void;
}) {
  switch (block.type) {
    case 'text':
      return <p className={styles.text}>{block.text}</p>;

    case 'source':
      return block.href ? (
        <a className={styles.source} href={block.href}>
          <ExternalLink aria-hidden="true" />
          {block.label}
        </a>
      ) : (
        <span className={styles.source}>{block.label}</span>
      );

    case 'navigation':
      return (
        <a className={styles.navigation} href={block.href}>
          {block.label}
          <ArrowRight aria-hidden="true" />
        </a>
      );

    case 'status':
      return (
        <p className={styles.status} data-tone={block.tone}>
          {block.label}
        </p>
      );

    case 'suggested_replies':
      return (
        <div className={styles.replies}>
          {block.replies.map((reply) => (
            <button key={reply.id} type="button" onClick={() => onSuggestion(reply.payload)}>
              {reply.label}
            </button>
          ))}
        </div>
      );

    case 'plan_preview':
      return (
        <div className={styles.plan}>
          <strong>{block.title}</strong>
          <ol>
            {block.steps.map((step, index) => (
              <li key={`${step.label}-${index}`}>
                <span>{step.label}</span>
                {step.when ? <small>{step.when}</small> : null}
              </li>
            ))}
          </ol>
        </div>
      );

    case 'session_offer':
      return (
        <div className={styles.plan}>
          <strong>{block.title}</strong>
          <small>About {block.minutes} minutes</small>
        </div>
      );

    case 'action_proposal': {
      const settled = actions[block.proposalId];
      const busy = busyProposal === block.proposalId;
      return (
        <div className={styles.proposal} data-settled={settled?.status}>
          <p className={styles.proposalTitle}>{block.title}</p>
          <ul>
            {block.preview.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {settled ? (
            <p className={styles.proposalSettled}>
              {settled.status === 'executed' ? <Check aria-hidden="true" /> : null}
              {settled.message}
            </p>
          ) : (
            <div className={styles.proposalActions}>
              <button type="button" onClick={() => onDecide(block.proposalId, 'decline')} disabled={busy}>
                Not now
              </button>
              <button
                type="button"
                data-primary="true"
                onClick={() => onDecide(block.proposalId, 'confirm')}
                disabled={busy}
              >
                {busy ? <LoaderCircle className={styles.spin} aria-hidden="true" /> : <Check aria-hidden="true" />}
                {block.confirmationRequired ? 'Confirm' : 'Open'}
              </button>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
