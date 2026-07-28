'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CreateLearnSessionInput, SessionGoal } from '@edrion/schemas';
import { useCreateEdrionLearnSession } from '@/lib/hooks/useEdrionLearnSession';
import { redirectIfSessionActive } from '@/lib/learn/session-active';

function resolveGoal(searchParams: URLSearchParams): SessionGoal {
  const explicit = searchParams.get('goal');
  if (explicit === 'revision' || explicit === 'remediation' || explicit === 'acquisition') {
    return explicit;
  }
  // Individual-tier doors: revision when within 14 days of an exam, else acquisition.
  const daysUntil = Number(searchParams.get('daysUntilExam') ?? '');
  if (Number.isFinite(daysUntil) && daysUntil >= 0 && daysUntil < 14) return 'revision';
  if (searchParams.get('entryPoint') === 'prep_countdown') return 'revision';
  if (searchParams.get('entryPoint') === 'bad_result') return 'remediation';
  return 'acquisition';
}

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
    const topicKey = searchParams.get('topicKey') ?? undefined;
    const budget = Number(searchParams.get('budget') ?? '');

    if (!pathItemId && !entryPoint && !topicKey) {
      router.replace('/learn');
      return;
    }

    started.current = true;
    const goal = resolveGoal(searchParams);
    const timeBudgetMinutes =
      Number.isFinite(budget) && budget >= 5
        ? budget
        : entryPoint === 'prep_countdown'
          ? 20
          : undefined;

    let payload: CreateLearnSessionInput;

    if (pathItemId) {
      payload = {
        entryPoint: 'learning_path',
        pathItemId,
        goal,
        timeBudgetMinutes,
        idempotencyKey: crypto.randomUUID(),
      };
    } else if (entryPoint === 'bad_result' && reportCardEntryId) {
      payload = {
        entryPoint: 'bad_result',
        reportCardEntryId,
        goal: 'remediation',
        timeBudgetMinutes,
        idempotencyKey: crypto.randomUUID(),
      };
    } else if (
      (entryPoint === 'upcoming_exam' || entryPoint === 'prep_countdown') &&
      examScheduleId
    ) {
      payload = {
        entryPoint,
        examScheduleId,
        goal,
        timeBudgetMinutes: timeBudgetMinutes ?? (entryPoint === 'prep_countdown' ? 20 : undefined),
        idempotencyKey: crypto.randomUUID(),
      };
    } else if (topicKey) {
      payload = {
        entryPoint: (entryPoint as CreateLearnSessionInput['entryPoint']) ?? 'goal',
        topicKey,
        goal,
        timeBudgetMinutes,
        idempotencyKey: crypto.randomUUID(),
      };
    } else {
      router.replace('/learn');
      return;
    }

    void createSession
      .mutateAsync(payload)
      .then((session) => router.replace(`/learn/session/${session.id}`))
      .catch((err) => {
        if (!redirectIfSessionActive(err, router)) router.replace('/learn');
      });
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
