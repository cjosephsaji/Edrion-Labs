'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useStudentApi } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';
export function PetrosV2Door() {
  const api = useStudentApi(),
    me = useStudentMe(),
    [available, setAvailable] = useState<{ enabled: boolean; available: boolean } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setAvailable(null);
    if (me.data?.kind === 'institutional')
      void api
        .get<{ enabled: boolean; available: boolean }>('/student/petros/v2/lessons', abort.signal)
        .then(setAvailable)
        .catch(() => undefined);
    return () => abort.abort();
  }, [api, me.data?.studentId, me.data?.kind]);
  if (!available?.enabled) return null;
  return (
    <section
      className="mx-auto mb-6 flex max-w-5xl flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--s-bd1)] bg-[var(--s-card)] p-5"
      aria-label="Teacher-released lessons"
    >
      <div>
        <h2 className="text-lg">Your teacher’s lessons</h2>
        <p className="text-sm text-[var(--s-muted)]">
          {available.available
            ? 'Learn at your own pace and return to your saved work.'
            : 'This lesson isn’t available yet.'}
        </p>
      </div>
      {available.available ? (
        <Link
          href="/petros/v2"
          className="rounded-lg bg-[var(--s-accentDeep)] px-5 py-3 text-sm text-white"
        >
          Open lessons →
        </Link>
      ) : null}
    </section>
  );
}
