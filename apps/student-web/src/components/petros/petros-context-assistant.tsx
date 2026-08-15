'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, MessageSquareText, Sparkles, X } from 'lucide-react';
import type {
  PetrosAssistantAnswer,
  PetrosLearningSessionDocument,
  PetrosSessionIntent,
} from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';

const APPROPRIATE_ROUTES = ['/home', '/results', '/exams', '/calendar', '/materials', '/documents', '/learning-path'];

export function PetrosContextAssistant({ route }: { route: string }) {
  const api = useStudentApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PetrosAssistantAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const visible = APPROPRIATE_ROUTES.some((allowed) => route === allowed || route.startsWith(`${allowed}/`));

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !starting) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, starting]);

  if (!visible) return null;

  function close() {
    if (starting) return;
    setOpen(false);
    setAnswer(null);
    setError('');
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function ask() {
    if (loading || question.trim().length < 2) return;
    setLoading(true);
    setAnswer(null);
    setError('');
    try {
      const response = await api.post<PetrosAssistantAnswer>('/student/petros/assistant', {
        question: question.trim(),
        route,
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1f604a] px-4 py-3 text-sm font-bold text-white shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 min-[921px]:bottom-7 min-[921px]:right-8"
        aria-haspopup="dialog"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" /> Ask Petros
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-end bg-black/40 p-0 min-[700px]:items-center min-[700px]:p-6">
          <button type="button" className="absolute inset-0" onClick={close} aria-label="Close contextual assistant" />
          <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="petros-assistant-title" className="relative max-h-[88dvh] w-full overflow-auto bg-[var(--s-card)] shadow-2xl min-[700px]:w-[460px]">
            <header className="flex items-start gap-3 border-b border-[var(--s-bd1)] bg-[#eef6f2] p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center bg-[#dcece5] text-[#1f604a]"><MessageSquareText aria-hidden="true" /></span>
              <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#557066]">Contextual assistant</p><h2 id="petros-assistant-title" className="mt-1 text-lg font-semibold">Ask about this screen</h2><p className="mt-1 text-xs text-[var(--s-muted)]">Quick questions stay here. A teaching session starts only if you accept a clear offer.</p></div>
              <button type="button" onClick={close} disabled={starting} className="grid min-h-11 min-w-11 place-items-center" aria-label="Close assistant"><X aria-hidden="true" /></button>
            </header>
            <div className="space-y-4 p-5">
              <label className="block text-xs font-bold uppercase tracking-[.08em] text-[var(--s-muted)]">Your question<textarea value={question} onChange={(event) => { setQuestion(event.target.value); setAnswer(null); }} rows={3} maxLength={2000} placeholder="Ask about what is visible here…" className="mt-2 w-full border border-[var(--s-bd2)] bg-[var(--s-page)] p-3 text-sm font-normal normal-case tracking-normal" /></label>
              <button type="button" onClick={() => void ask()} disabled={loading || starting || question.trim().length < 2} className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-[#1f604a] px-4 py-2 font-bold text-white disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}{loading ? 'Answering from this screen…' : 'Ask'}</button>
              {answer ? (
                <section className="border border-[var(--s-bd1)] bg-[var(--s-surface2)] p-4" aria-live="polite">
                  <p className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--s-faint)]">{answer.mode === 'quick_answer' ? 'Quick answer' : 'A session may help'}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--s-ink)]">{answer.answer}</p>
                  {answer.offer ? (
                    <div className="mt-4 border-l-4 border-[#1f604a] bg-[var(--s-card)] p-3">
                      <p className="text-sm font-semibold">{answer.offer.description}</p>
                      <p className="mt-1 text-xs text-[var(--s-muted)]">About {answer.offer.approximateMinutes} minutes · question and screen context transfer once</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setAnswer(null)} disabled={starting} className="min-h-11 border border-[var(--s-bd2)] px-4 py-2 font-semibold">No, keep it quick</button>
                        <button type="button" onClick={() => void accept()} disabled={starting} className="inline-flex min-h-11 items-center gap-2 bg-[#1f604a] px-4 py-2 font-semibold text-white">{starting ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}{starting ? 'Transferring context…' : 'Accept and start session'}</button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {error ? <p className="text-sm text-[var(--s-danger)]" role="alert">{error}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
