'use client';
import { useState } from 'react';
import type { AskInput } from '@edrion/schemas';
import { X } from 'lucide-react';
import { useAsk } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';

type AskPetrosDrawerProps = {
  open: boolean;
  onClose: () => void;
  context: AskInput['context'];
  initialQuestion?: string;
};

export function AskPetrosDrawer({ open, onClose, context, initialQuestion }: AskPetrosDrawerProps) {
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [conversation, setConversation] = useState<{ q: string; a: string }[]>([]);
  const ask = useAsk();

  if (!open) return null;

  const submit = async () => {
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion('');
    const res = await ask.mutateAsync({
      context,
      question: q,
      conversation,
    });
    setConversation((prev) => [...prev, { q, a: res.answer }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40">
      <div className="max-h-[80dvh] overflow-hidden rounded-t-2xl border border-st-bd1 bg-st-card shadow-xl">
        <div className="flex items-center justify-between border-b border-st-bd1 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold tracking-wide text-st-faint">ASK PETROS</p>
            <p className="text-sm font-semibold text-st-ink">{context.contextLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-st-muted hover:bg-st-surface2">
            <X size={20} />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3">
          {conversation.map((turn, i) => (
            <div key={i} className="space-y-2">
              <p className="rounded-xl bg-st-accentSoft px-3 py-2 text-sm text-st-ink">{turn.q}</p>
              <p className="rounded-xl bg-st-surface2 px-3 py-2 text-sm text-st-muted">{turn.a}</p>
            </div>
          ))}
          {ask.isPending && <p className="text-sm text-st-muted">Petros is thinking…</p>}
        </div>
        <div className="border-t border-st-bd1 p-4">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything about this…"
            className="w-full rounded-xl border border-st-bd1 bg-st-page p-3 text-sm"
            rows={2}
          />
          <PillButton onClick={submit} disabled={ask.isPending || !question.trim()} className="mt-2 w-full">
            Ask
          </PillButton>
        </div>
      </div>
    </div>
  );
}
