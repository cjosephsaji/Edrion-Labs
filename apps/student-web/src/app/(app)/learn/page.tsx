'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import {
  useCalendar,
  useCreatePath,
  useCreateSession,
  useHome,
  useIntent,
  usePath,
  useRevisionQueue,
  useStreaks,
} from '@/lib/hooks';
import { useAskQuick } from '@/lib/hooks/useQuick';
import { usePersona } from '@/lib/persona';
import { intentPreviewLabel, isAmbiguousIntent } from '@/lib/intent-preview';
import { useStudentClient } from '@/lib/student-client';
import type { IntentResponseDto } from '@edrion/schemas';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Eyebrow,
  KbdHint,
  PageTitle,
  PetrosMark,
  PillChip,
  ProgressSegments,
} from '@/components/ui/primitives';
import { OrchestratorLearnEntry } from '@/components/edrion-learn/OrchestratorLearnEntry';

function formatGreetingEyebrow(me: ReturnType<typeof usePersona>['me']): string {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(new Date()).toUpperCase();
  if (me?.kind === 'institutional') {
    const parts = [day];
    if (me.student?.className) parts.push(me.student.className.toUpperCase());
    if (me.student?.curriculumLabel) parts.push(me.student.curriculumLabel.toUpperCase());
    return parts.join(' · ');
  }
  return `${day} · INDEPENDENT · SELF-PACED`;
}

function greetingName(fullName?: string): string {
  const first = fullName?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const time =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${time}, ${first} 👋`;
}

function WeeklyGoalRing({ done, target }: { done: number; target: number }) {
  const pct = target > 0 ? Math.min(done / target, 1) : 0;
  const dash = pct * 119.38;
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden>
      <circle cx="23" cy="23" r="19" fill="none" stroke="var(--st-surface2)" strokeWidth="5" />
      <circle
        cx="23"
        cy="23"
        r="19"
        fill="none"
        stroke="var(--st-accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${dash} 200`}
        transform="rotate(-90 23 23)"
      />
      <text
        x="23"
        y="27.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="600"
        fill="var(--st-accentDeep)"
        fontFamily="IBM Plex Mono, monospace"
      >
        {done}
      </text>
    </svg>
  );
}

export default function LearnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = usePersona();
  const [intentText, setIntentText] = useState('');
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [disambiguationText, setDisambiguationText] = useState<string | null>(null);
  const [forcedMode, setForcedMode] = useState<'quick_question' | 'learn_topic' | 'practice' | null>(null);
  const [routingStatus, setRoutingStatus] = useState<string | null>(null);
  const { data: streaks } = useStreaks();
  const { data: path } = usePath();
  const { data: revision } = useRevisionQueue();
  const { data: home } = useHome();
  const { data: calendar } = useCalendar();
  const intent = useIntent();
  const askQuick = useAskQuick();
  const createSession = useCreateSession();
  const createPath = useCreatePath();
  const client = useStudentClient();
  const previewRequestId = useRef(0);

  const resumeTile = home?.tiles.find((t) => t.key === 'continue_learning');
  const hasResumable =
    resumeTile?.route.startsWith('/learn/session/') && resumeTile.title !== 'Continue learning';

  const dueRevision = revision?.queue.filter((q) => q.freshness === 'due' || q.freshness === 'fading') ?? [];
  const goalDone = streaks?.weeklyGoal.done ?? 0;
  const goalTotal = streaks?.weeklyGoal.target ?? 3;
  const goalLeft = Math.max(goalTotal - goalDone, 0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayEvents = useMemo(
    () => calendar?.days.find((d) => d.date === todayIso)?.events ?? [],
    [calendar, todayIso],
  );

  useEffect(() => {
    const topic = searchParams.get('topic');
    if (topic) setIntentText(topic);
  }, [searchParams]);

  useEffect(() => {
    const trimmed = intentText.trim();
    if (trimmed.length < 8) {
      setPreviewLabel(null);
      return;
    }

    const requestId = ++previewRequestId.current;
    const timer = setTimeout(() => {
      void client
        .post<IntentResponseDto>('/learn/intent', { text: trimmed })
        .then((routed) => {
          if (requestId !== previewRequestId.current) return;
          setPreviewLabel(intentPreviewLabel(routed));
        })
        .catch(() => {
          if (requestId !== previewRequestId.current) return;
          setPreviewLabel(null);
        });
    }, 600);

    return () => clearTimeout(timer);
  }, [client, intentText]);

  const routeIntent = useCallback(
    async (
      text: string,
      forced?: 'quick_question' | 'learn_topic' | 'practice',
      topicGuess?: string,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      setForcedMode(null);
      setRoutingStatus(null);

      if (forced === 'quick_question') {
        setRoutingStatus('Getting your answer…');
        const quick = await askQuick.mutateAsync({ question: trimmed, from: 'home' });
        router.push(`/learn/quick/${quick.id}`);
        return;
      }

      if (forced === 'practice') {
        setRoutingStatus('Starting practice session…');
        const session = await createSession.mutateAsync({
          topicTitle: topicGuess ?? trimmed,
          source: 'refresh',
          kind: 'refresh10',
        });
        router.push(`/learn/session/${session.id}`);
        return;
      }

      if (forced === 'learn_topic') {
        if (me?.kind === 'independent') {
          setRoutingStatus('Building your path…');
          const pathResult = await createPath.mutateAsync({ goalStatement: trimmed });
          const firstItem = pathResult.items[0];
          if (!firstItem) return;
          setRoutingStatus('Starting your first session…');
          const session = await createSession.mutateAsync({
            topicTitle: firstItem.title,
            source: 'intent',
            pathItemId: firstItem.id,
          });
          router.push(`/learn/session/${session.id}`);
        } else {
          setRoutingStatus('Starting your session…');
          const session = await createSession.mutateAsync({
            topicTitle: topicGuess ?? trimmed,
            source: 'intent',
          });
          router.push(`/learn/session/${session.id}`);
        }
        return;
      }

      setRoutingStatus('Understanding what you need…');
      const routed = await intent.mutateAsync({ text: trimmed });

      switch (routed.intent) {
        case 'learn_topic': {
          if (me?.kind === 'independent') {
            setRoutingStatus('Building your path…');
            const pathResult = await createPath.mutateAsync({ goalStatement: trimmed });
            const firstItem = pathResult.items[0];
            if (!firstItem) return;
            setRoutingStatus('Starting your first session…');
            const session = await createSession.mutateAsync({
              topicTitle: firstItem.title,
              source: 'intent',
              pathItemId: firstItem.id,
            });
            router.push(`/learn/session/${session.id}`);
          } else {
            setRoutingStatus('Starting your session…');
            const session = await createSession.mutateAsync({
              topicTitle: routed.topicGuess ?? trimmed,
              source: 'intent',
            });
            router.push(`/learn/session/${session.id}`);
          }
          break;
        }
        case 'quick_question': {
          setRoutingStatus('Getting your answer…');
          const quick = await askQuick.mutateAsync({ question: trimmed, from: 'home' });
          router.push(`/learn/quick/${quick.id}`);
          break;
        }
        case 'practice': {
          setRoutingStatus('Starting practice session…');
          const session = await createSession.mutateAsync({
            topicTitle: routed.topicGuess ?? trimmed,
            source: 'refresh',
            kind: 'refresh10',
          });
          router.push(`/learn/session/${session.id}`);
          break;
        }
        case 'revise':
          router.push('/learn/revision');
          break;
        case 'prepare_exam':
          router.push('/lab/mock-exams/new');
          break;
        case 'continue':
          router.push(resumeTile?.route ?? '/learn/path');
          break;
        default:
          router.push('/learn');
      }
    },
    [askQuick, createPath, createSession, intent, me?.kind, resumeTile?.route, router],
  );

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDisambiguationText(null);

    if (isAmbiguousIntent(trimmed)) {
      setDisambiguationText(trimmed);
      setPreviewLabel(null);
      return;
    }

    await routeIntent(trimmed, forcedMode ?? undefined);
  };

  const isRouting =
    intent.isPending ||
    askQuick.isPending ||
    createSession.isPending ||
    createPath.isPending;

  const isInst = me?.kind === 'institutional';
  const isIndie = me?.kind === 'independent';

  return (
    <div className="mx-auto max-w-[1130px] px-5 py-8 pb-24 animate-st-block-in md:px-10 md:py-[34px] md:pb-[90px]">
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-[260px] flex-1">
          <Eyebrow>{formatGreetingEyebrow(me)}</Eyebrow>
          <PageTitle className="mt-2">{greetingName(me?.fullName)}</PageTitle>
          <p className="mt-2 text-[14.5px] text-st-muted">
            {isInst
              ? `You're ${goalLeft} topics from your weekly goal — today's session gets you closer.`
              : `${goalDone} of ${goalTotal} topics this week. Keep your momentum going.`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {streaks?.showStreak && (
            <div className="flex items-center gap-2 rounded-[13px] border border-st-bd1 bg-st-card px-4 py-2.5">
              <Flame size={17} className="text-st-success" fill="currentColor" aria-hidden />
              <div>
                <p className="font-mono-ui text-sm font-semibold text-st-accentDeep">
                  {streaks.streakDays} days
                </p>
                <p className="text-[10px] text-st-faint">streak · no pressure</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2.5 rounded-[13px] border border-st-bd1 bg-st-card py-2 pl-2 pr-4">
            <WeeklyGoalRing done={goalDone} target={goalTotal} />
            <div>
              <p className="text-[13px] font-semibold text-st-ink">
                {goalDone} of {goalTotal} topics
              </p>
              <p className="text-[10.5px] text-st-faint">weekly goal · counts, not scores</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 md:mt-[34px]">
        {isIndie ? (
          <div className="mb-6">
            <OrchestratorLearnEntry />
          </div>
        ) : null}
        <h2 className="font-display text-[25px] font-semibold text-st-ink">What are we doing today?</h2>
        <div className="relative mt-3.5 max-w-[730px]">
          <input
            value={intentText}
            onChange={(e) => {
              setIntentText(e.target.value);
              if (!e.target.value.trim()) {
                setPreviewLabel(null);
                setDisambiguationText(null);
              }
            }}
            placeholder="Ask anything, or tell Petros what you want to learn…"
            disabled={isRouting}
            className="w-full rounded-[14px] border-[1.5px] border-st-bd2 bg-st-card py-4 pl-[18px] pr-[92px] text-[15px] text-st-ink shadow-[0_1px_2px_rgba(23,37,31,0.04)] outline-none transition focus:border-st-accent focus:shadow-[0_0_0_3px_rgba(30,122,94,0.13)] disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit(intentText);
              }
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <KbdHint />
          </div>
        </div>

        {routingStatus && (
          <p className="mt-2 text-sm text-st-muted">{routingStatus}</p>
        )}

        {previewLabel && !disambiguationText && !forcedMode && (
          <div className="mt-2 inline-flex animate-st-fade-up items-center gap-1.5 rounded-lg border border-st-amberBd bg-st-amberSoft px-2.5 py-1.5 text-xs font-medium text-st-amberInk">
            <PetrosMark />
            {previewLabel}
          </div>
        )}

        {disambiguationText && (
          <div className="mt-3 max-w-[730px] animate-st-fade-up rounded-xl border border-st-bd2 bg-st-card p-4">
            <p className="text-sm text-st-muted">
              &ldquo;{disambiguationText}&rdquo; could go either way — what do you want?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PillChip
                variant="primary"
                onClick={() => void routeIntent(disambiguationText, 'quick_question')}
              >
                Quick answer
              </PillChip>
              <PillChip onClick={() => void routeIntent(disambiguationText, 'learn_topic')}>
                Learn it properly
              </PillChip>
            </div>
          </div>
        )}

        {forcedMode && (
          <p className="mt-2 text-sm text-st-muted">
            {forcedMode === 'learn_topic' && 'Type a topic — Petros will build a path and start your first session'}
            {forcedMode === 'quick_question' && 'Type your question — Petros will answer it directly'}
            {forcedMode === 'practice' && 'Type a topic — Petros will start a quick practice session'}
          </p>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          {hasResumable && resumeTile && (
            <PillChip variant="primary" onClick={() => router.push(resumeTile.route)}>
              ↻ Continue where I left off
            </PillChip>
          )}
          <PillChip
            variant={forcedMode === 'learn_topic' ? 'primary' : undefined}
            onClick={() => {
              setForcedMode('learn_topic');
              setDisambiguationText(null);
              document.querySelector<HTMLInputElement>('input')?.focus();
            }}
          >
            Learn something new
          </PillChip>
          <PillChip
            variant={forcedMode === 'quick_question' ? 'primary' : undefined}
            onClick={() => {
              setForcedMode('quick_question');
              setDisambiguationText(null);
              document.querySelector<HTMLInputElement>('input')?.focus();
            }}
          >
            Quick question
          </PillChip>
          <PillChip
            variant={forcedMode === 'practice' ? 'primary' : undefined}
            onClick={() => {
              setForcedMode('practice');
              setDisambiguationText(null);
              document.querySelector<HTMLInputElement>('input')?.focus();
            }}
          >
            Practice
          </PillChip>
          <PillChip onClick={() => router.push('/learn/revision')}>Revise</PillChip>
          {isInst && (
            <PillChip onClick={() => router.push('/lab/mock-exams/new')}>Prepare for exam</PillChip>
          )}
          {isIndie && <PillChip onClick={() => router.push('/library')}>Study from my notes</PillChip>}
        </div>
      </div>

      {hasResumable && resumeTile && (
        <Link
          href={resumeTile.route}
          className="mt-7 flex flex-wrap items-center gap-6 rounded-[18px] bg-gradient-to-br from-[#0C3F31] to-[#155844] p-6 shadow-[0_16px_36px_-20px_rgba(12,63,49,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-20px_rgba(12,63,49,0.65)] md:mt-7 md:p-7"
        >
          <div className="min-w-[250px] flex-1">
            <Eyebrow color="inverse" className="!text-[#9CC3B1]">
              RESUME SESSION
            </Eyebrow>
            <p className="mt-1.5 font-display text-[23px] font-semibold tracking-[-0.01em] text-[#F6F3E9]">
              {resumeTile.title}
            </p>
            <p className="mt-1.5 text-[13px] text-[#B9D2C6]">{resumeTile.meta}</p>
            <div className="mt-3.5 flex items-center gap-1.5">
              <ProgressSegments total={6} done={3} />
              <span className="ml-1.5 font-mono-ui text-[10.5px] text-[#9CC3B1]">IN PROGRESS</span>
            </div>
          </div>
          <span className="rounded-xl bg-[#F6F3E9] px-5 py-3 text-sm font-semibold text-st-accentDeep shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
            Pick up where you left off →
          </span>
        </Link>
      )}

      <div
        className={`mt-6 grid gap-5 ${isInst ? 'lg:grid-cols-[1fr_340px]' : 'lg:grid-cols-[1fr_300px]'}`}
      >
        <div className="flex flex-col gap-5">
          {isInst && (
            <Card noPadding>
              <div className="flex items-baseline gap-2 px-5 pb-3 pt-5">
                <Eyebrow>TODAY&apos;S PLAN</Eyebrow>
                <span className="ml-auto text-[11.5px] text-st-faint">From your timetable</span>
              </div>
              {todayEvents.length > 0 ? (
                <div className="flex flex-col px-2 pb-3">
                  {todayEvents.map((ev, i) => (
                    <div
                      key={`${ev.label}-${i}`}
                      className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-st-surface2"
                    >
                      <span className="w-14 shrink-0 font-mono-ui text-[10.5px] text-st-faint">
                        {ev.sourceLine.slice(0, 8)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-st-ink">{ev.label}</p>
                        <p className="text-xs text-st-faint">{ev.sourceLine}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 pb-5">
                  <EmptyState
                    eyebrow="CLEAR DAY"
                    title="Nothing scheduled yet"
                    description="Your timetable will show up here when your school adds it."
                  />
                </div>
              )}
            </Card>
          )}

          {isIndie && (
            <Card eyebrow="THIS WEEK — SET BY YOU" title={`${goalDone} of ${goalTotal} topics`}>
              <p className="text-sm text-st-muted">Track your self-paced goals week by week.</p>
              <Link href="/learn/path" className="mt-3 inline-block text-sm font-semibold text-st-success">
                Edit goals →
              </Link>
            </Card>
          )}

          {path?.items && path.items.length > 0 && (
            <Card eyebrow="EXPLORE" title="Learning path">
              <div className="space-y-2">
                {path.items.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-st-ink">{item.title}</span>
                    {item.freshness && <FreshnessChip freshness={item.freshness} />}
                  </div>
                ))}
              </div>
              <Link href="/learn/path" className="mt-3 inline-block text-sm font-semibold text-st-accent">
                View full path →
              </Link>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-[16px] border border-st-goldBd bg-st-goldSoftBg p-5">
            <Eyebrow color="gold">REVISION DUE</Eyebrow>
            {dueRevision.length > 0 ? (
              <div className="mt-3 space-y-3">
                {dueRevision.slice(0, 3).map((item) => (
                  <div key={item.topicId} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-base font-semibold text-st-goldInk">{item.title}</p>
                      <p className="text-xs text-st-muted">
                        Last touched {new Date(item.lastTouched).toLocaleDateString()}
                      </p>
                    </div>
                    <FreshnessChip freshness={item.freshness} />
                  </div>
                ))}
                <Link href="/learn/revision" className="text-sm font-semibold text-st-gold">
                  Review all →
                </Link>
              </div>
            ) : (
              <div className="mt-3">
                <p className="font-display text-base font-semibold text-st-goldInk">All caught up</p>
                <p className="mt-1 text-sm text-st-muted">No topics need revision right now.</p>
              </div>
            )}
          </div>

          <Card>
            <div className="flex items-center gap-1.5">
              <PetrosMark />
              <Eyebrow color="amber">PETROS NOTICED</Eyebrow>
            </div>
            <p className="mt-2 text-sm text-st-muted">
              Petros surfaces patterns from your learning — not grades. Check Analytics when you have
              more sessions under your belt.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/learn/path" className="text-sm font-semibold text-st-accent">
                Learning path →
              </Link>
              <Link href="/history" className="text-sm font-semibold text-st-accent">
                Session history →
              </Link>
              {isInst && (
                <Link href="/analytics" className="text-sm font-semibold text-st-accent">
                  Analytics →
                </Link>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
