'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStudentApi } from '@/lib/api-client';
import { PetrosRepairSession } from '@/components/petros/petros-repair-session';
import { PetrosSessionShell } from './petros-session-shell';
/** The URL never selects an engine. A failed V2 load cannot fall through to V1. */
export function PetrosSessionDispatch({ sessionId }: { sessionId?: string }) {
  const api = useStudentApi(),
    [engine, setEngine] = useState<'v1' | 'v2' | null>(null),
    [error, setError] = useState(false);
  const router = useRouter(),
    pathname = usePathname();
  useEffect(() => {
    if (!sessionId) return;
    const abort = new AbortController();
    setEngine(null);
    setError(false);
    void api
      .get<{ engine: 'v1' | 'v2' }>(`/student/petros/v2/sessions/${sessionId}/engine`, abort.signal)
      .then((r) => setEngine(r.engine))
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [api, sessionId]);
  useEffect(() => {
    if (engine === 'v2' && pathname === '/petros/session')
      router.replace(`/petros/v2/session?session=${sessionId}`);
    if (engine === 'v1' && pathname === '/petros/v2/session')
      router.replace(`/petros/session?session=${sessionId}`);
  }, [engine, pathname, router, sessionId]);
  if (!sessionId) return <PetrosRepairSession topic="this learning goal" source="portal" />;
  if (error)
    return (
      <main className="p-8">
        <h1>This saved lesson is unavailable.</h1>
        <p>Check your account and connection, then reload.</p>
      </main>
    );
  if (!engine)
    return (
      <p role="status" className="p-8">
        Opening your saved lesson…
      </p>
    );
  if (
    (engine === 'v2' && pathname === '/petros/session') ||
    (engine === 'v1' && pathname === '/petros/v2/session')
  )
    return (
      <p role="status" className="p-8">
        Opening your learning workspace…
      </p>
    );
  return engine === 'v2' ? (
    <PetrosSessionShell sessionId={sessionId} />
  ) : (
    <PetrosRepairSession topic="this learning goal" source="portal" sessionId={sessionId} />
  );
}
