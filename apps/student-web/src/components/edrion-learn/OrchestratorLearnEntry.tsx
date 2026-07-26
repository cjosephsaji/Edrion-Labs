'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStudentClient } from '@/lib/student-client';

/** Flag-gated orchestrator entry (P1.5 minimal). Full block UI ships in P1.6. */
export function OrchestratorLearnEntry() {
  const client = useStudentClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSession() {
    setBusy(true);
    setError(null);
    try {
      const data = await client.request<{ session: { id: string } }>('/edrion-learn/sessions', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ entryPoint: 'goal', topicKey: 'general-topic', timeBudgetMinutes: 15 }),
      });
      window.location.href = `/learn/session/${data.session.id}?orchestrator=1`;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start session');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Guided study (beta)</h2>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        Adaptive teaching session when your school enables the orchestrator.
      </p>
      {error ? <p className="mt-2 text-xs text-[var(--status-danger)]">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSession()}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Starting…' : 'Start guided session'}
        </button>
        <Link href="/learn/revision" className="rounded-full px-3 py-2 text-xs text-[var(--text-secondary)]">
          Revision instead
        </Link>
      </div>
    </section>
  );
}
