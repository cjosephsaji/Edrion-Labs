'use client';

import Link from 'next/link';
import { useStudentMe } from '@/lib/hooks';
import { PetrosInflationPilot } from './petros-inflation-pilot';

function usePilotAccess() {
  const query = useStudentMe();
  const me = query.data;
  return {
    ...query,
    allowed:
      me?.kind === 'institutional' &&
      Boolean(me.studentId) &&
      (me.permissions.includes('student.learn.use') ||
        me.permissions.includes('*')),
  };
}

export function PetrosPilotEntry() {
  const { allowed } = usePilotAccess();
  if (!allowed) return null;
  return (
    <Link
      href="/petros/pilot"
      className="mb-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-emerald-950"
    >
      <span>
        <strong className="block text-lg">
          Try the Inflation Lab with Petros
        </strong>
        <span className="text-sm">
          Explore, experiment, and explain — one idea at a time.
        </span>
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export function PetrosPilotPageContent({ sessionId }: { sessionId?: string }) {
  const { allowed, isLoading, error } = usePilotAccess();
  if (isLoading)
    return (
      <p role="status" className="p-10">
        Opening your teaching stage…
      </p>
    );
  if (!allowed)
    return (
      <section className="mx-auto max-w-xl p-10">
        <h1 className="mb-4 text-2xl">Inflation Lab</h1>
        <p>
          {error
            ? 'Your portal account could not be loaded. Return to Petros and try again.'
            : 'This pilot is available through an institutional student account with Petros access.'}
        </p>
        <Link className="mt-6 inline-block underline" href="/petros">
          Back to Petros
        </Link>
      </section>
    );
  return <PetrosInflationPilot sessionId={sessionId} />;
}
