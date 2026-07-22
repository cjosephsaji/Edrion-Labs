'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CreateLearnSessionInput } from '@edrion/schemas';
import { useCreateEdrionLearnSession } from '@/lib/hooks/useEdrionLearnSession';

export default function StartLearnSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createSession = useCreateEdrionLearnSession();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;

    const pathItemId = searchParams.get('pathItemId');
    const entryPoint = searchParams.get('entryPoint');
    const reportCardEntryId = searchParams.get('reportCardEntryId');
    const examScheduleId = searchParams.get('examScheduleId');

    if (!pathItemId && !entryPoint) {
      router.replace('/learn');
      return;
    }

    started.current = true;

    let payload: CreateLearnSessionInput;

    if (pathItemId) {
      payload = {
        entryPoint: 'learning_path',
        pathItemId,
        goal: 'acquisition',
        idempotencyKey: crypto.randomUUID(),
      };
    } else if (entryPoint === 'bad_result' && reportCardEntryId) {
      payload = {
        entryPoint: 'bad_result',
        reportCardEntryId,
        idempotencyKey: crypto.randomUUID(),
      };
    } else if (
      (entryPoint === 'upcoming_exam' || entryPoint === 'prep_countdown') &&
      examScheduleId
    ) {
      payload = {
        entryPoint,
        examScheduleId,
        idempotencyKey: crypto.randomUUID(),
      };
    } else {
      router.replace('/learn');
      return;
    }

    void createSession
      .mutateAsync(payload)
      .then((session) => router.replace(`/learn/session/${session.id}`))
      .catch(() => router.replace('/learn'));
  }, [createSession, router, searchParams]);

  return (
    <div className="mx-auto max-w-[640px] px-4 py-16 text-center">
      <div className="mx-auto h-24 w-full max-w-sm animate-pulse rounded-[15px] bg-st-surface2 motion-reduce:animate-none" />
      <p className="mt-4 text-sm text-st-muted">Starting your lesson…</p>
      {createSession.isError && (
        <Link href="/learn" className="mt-4 inline-block text-sm font-semibold text-st-accent">
          Back to Learn
        </Link>
      )}
    </div>
  );
}
