'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AskInput } from '@edrion/schemas';
import { Pin, X } from 'lucide-react';
import { useAskStreamClient, usePinAsk } from '@/lib/hooks/useAsk';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PetrosMark } from '@/components/ui/primitives';
import type { SseConnection } from '@/lib/student-client';
import { LearnHandoffCard, shouldShowLearnHandoff } from '@/components/edrion-learn/LearnHandoffCard';

type AskPetrosDrawerProps = {
  open: boolean;
  onClose: () => void;
  context: AskInput['context'];
  /** When set on open, Petros asks and answers automatically without user input. */
  initialQuestion?: string;
  onPinned?: () => void;
};

function canPin(context: AskInput['context']): boolean {
  return context.kind === 'session' || context.kind === 'concept' || context.kind === 'practice';
}

function drawerTitle(context: AskInput['context']): string {
  if (context.kind === 'visual_node') return 'Ask about this idea';
  return 'Ask Petros';
}

export function AskPetrosDrawer({
  open,
  onClose,
  context,
  initialQuestion,
  onPinned,
}: AskPetrosDrawerProps) {
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState<{ q: string; a: string }[]>([]);
  const [pinnedTurns, setPinnedTurns] = useState<Set<number>>(new Set());
  const [streaming, setStreaming] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [partialAnswer, setPartialAnswer] = useState('');
  const { streamAsk } = useAskStreamClient();
  const pinAsk = usePinAsk();
  const esRef = useRef<SseConnection | null>(null);
  const conversationRef = useRef(conversation);
  const streamingRef = useRef(false);
  const lastAutoAskedRef = useRef<string | null>(null);

  conversationRef.current = conversation;
  streamingRef.current = streaming;

  const submitQuestion = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || streamingRef.current) return;

      setQuestion('');
      setPendingQuestion(trimmed);
      setStreaming(true);
      setPartialAnswer('');
      esRef.current?.close();

      let answer = '';
      const es = streamAsk(
        { context, question: trimmed, conversation: conversationRef.current },
        {
          onMessage: (frame) => {
            const data = frame.data;
            if (typeof data === 'string' && data === '[DONE]') {
              setStreaming(false);
              setPartialAnswer('');
              setPendingQuestion(null);
              setConversation((prev) => [...prev, { q: trimmed, a: answer }]);
              esRef.current = null;
              return;
            }
            const event = data as {
              type?: string;
              delta?: string;
              answer?: string;
              refused?: boolean;
              refusalNote?: string;
            };
            if (event.type === 'text_delta' && event.delta) {
              answer += event.delta;
              setPartialAnswer(answer);
            } else if (event.type === 'done') {
              if (event.answer) answer = event.answer;
              if (event.refused && event.refusalNote) answer = event.refusalNote;
            }
          },
          onError: () => {
            setStreaming(false);
            setPartialAnswer('');
            setPendingQuestion(null);
            esRef.current = null;
          },
        },
      );
      esRef.current = es;
    },
    [context, streamAsk],
  );

  useEffect(() => {
    if (!open) {
      lastAutoAskedRef.current = null;
      return;
    }
    const q = initialQuestion?.trim();
    if (!q || q === lastAutoAskedRef.current) return;
    lastAutoAskedRef.current = q;
    submitQuestion(q);
  }, [open, initialQuestion, submitQuestion]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  if (!open) return null;

  const pinEnabled = canPin(context);

  const handlePin = async (turnIndex: number, q: string, a: string) => {
    if (!pinEnabled || pinnedTurns.has(turnIndex) || pinAsk.isPending) return;
    if (context.kind !== 'session' && context.kind !== 'concept' && context.kind !== 'practice') {
      return;
    }
    await pinAsk.mutateAsync({
      sessionId: context.id,
      blockAfterId: context.blockId,
      question: q,
      answer: a,
    });
    setPinnedTurns((prev) => new Set(prev).add(turnIndex));
    onPinned?.();
    onClose();
  };

  const handleManualSubmit = () => {
    submitQuestion(question);
  };

  const renderPinAction = (turnIndex: number, q: string, a: string) => {
    if (!pinEnabled || !a.trim()) return null;
    const pinned = pinnedTurns.has(turnIndex);
    return (
      <button
        type="button"
        disabled={pinned || pinAsk.isPending}
        onClick={() => void handlePin(turnIndex, q, a)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-st-violet/30 bg-st-violetSoft/40 px-3 py-2 text-xs font-semibold text-st-violet disabled:opacity-60"
      >
        <Pin size={14} />
        {pinned ? 'Pinned ✓' : 'Pin to lesson'}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 animate-st-fade-up">
      <div className="max-h-[80dvh] overflow-hidden rounded-t-2xl border border-st-amberBd bg-st-amberSoft shadow-xl animate-st-sheet-in">
        <div className="flex items-center justify-between border-b border-st-amberBd px-4 py-3">
          <div>
            <div className="flex items-center gap-1">
              <PetrosMark />
              <Eyebrow color="amber">{drawerTitle(context).toUpperCase()}</Eyebrow>
            </div>
            <p className="text-sm font-semibold text-st-amberInk">Asking about: {context.contextLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-st-amberInk hover:bg-st-card/50"
          >
            <X size={20} />
          </button>
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto bg-st-card px-4 py-3">
          {conversation.map((turn, i) => (
            <div key={i} className="space-y-2">
              <p className="rounded-xl border border-st-amberBd bg-st-amberSoft px-3 py-2 text-sm text-st-ink">
                {turn.q}
              </p>
              <p className="rounded-xl bg-st-surface2 px-3 py-2 text-sm text-st-muted">{turn.a}</p>
              {shouldShowLearnHandoff(turn.a, i) && (
                <LearnHandoffCard
                  topicKey={`chat:${context.contextLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`}
                  topicLabel={context.contextLabel}
                  studentMessage={turn.q}
                />
              )}
              {renderPinAction(i, turn.q, turn.a)}
            </div>
          ))}
          {streaming && partialAnswer && pendingQuestion && (
            <div className="space-y-2">
              <p className="rounded-xl border border-st-amberBd bg-st-amberSoft px-3 py-2 text-sm text-st-ink">
                {pendingQuestion}
              </p>
              <p className="rounded-xl bg-st-surface2 px-3 py-2 text-sm text-st-muted">{partialAnswer}</p>
            </div>
          )}
          {streaming && !partialAnswer && pendingQuestion && (
            <div className="space-y-2">
              <p className="rounded-xl border border-st-amberBd bg-st-amberSoft px-3 py-2 text-sm text-st-ink">
                {pendingQuestion}
              </p>
              <p className="text-sm text-st-muted">Petros is thinking…</p>
            </div>
          )}
        </div>
        <div className="border-t border-st-amberBd bg-st-card p-4">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this…"
            className="w-full rounded-xl border border-st-bd2 bg-st-page p-3 text-sm"
            rows={2}
          />
          <PillButton
            onClick={handleManualSubmit}
            disabled={streaming || !question.trim()}
            className="mt-2 w-full"
          >
            Ask
          </PillButton>
        </div>
      </div>
    </div>
  );
}
