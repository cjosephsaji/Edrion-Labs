'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** Old start route — send people home with their query preserved. */
export default function LearnSessionStartRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const q = params.get('q') ?? params.get('topic') ?? '';
    const goal = params.get('goal') ?? 'learn';
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (goal) qs.set('goal', goal);
    router.replace(`/learn${qs.toString() ? `?${qs}` : ''}`);
  }, [params, router]);

  return (
    <main className="mx-auto flex min-h-[50dvh] max-w-lg items-center justify-center px-6 text-sm text-st-muted">
      Returning to Learn…
    </main>
  );
}
