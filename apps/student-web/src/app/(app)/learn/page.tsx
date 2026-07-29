'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import {
  useCalendar,
  useHome,
  usePath,
  useRevisionQueue,
  useStreaks,
} from '@/lib/hooks';
import { usePersona } from '@/lib/persona';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import type { LearnGoal } from '@/components/learn/session/learn-visual';
import { LEARN_GOAL_LABELS } from '@/components/learn/session/learn-visual';
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

function greetingLine(fullName?: string): string {
  const first = fullName?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${time}, ${first}`;
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

const GOALS: Array<{ id: LearnGoal; hint?: string }> = [
  { id: 'continue' },
  { id: 'learn' },
  { id: 'practice' },
  { id: 'revise' },
  { id: 'quick' },
  { id: 'from_notes' },
];

export default function LearnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = usePersona();
  const [intentText, setIntentText] = useState('');
  const [goal, setGoal] = useState<LearnGoal>('learn');
  const [leaving, setLeaving] = useState(false);

  const { data: streaks } = useStreaks();
  const { data: path } = usePath();
  const { data: revision } = useRevisionQueue();
  const { data: home } = useHome();
  const { data: calendar } = useCalendar();

  const resumeTile = home?.tiles.find((t) => t.key === 'continue_learning');
  const hasResumable =
    resumeTile?.route.startsWith('/learn/session/') && resumeTile.title !== 'Continue learning';

  const dueRevision =
    revision?.queue.filter((q) => q.freshness === 'due' || q.freshness === 'fading') ?? [];
  const goalDone = streaks?.weeklyGoal.done ?? 0;
  const goalTotal = streaks?.weeklyGoal.target ?? 3;
  const goalLeft = Math.max(goalTotal - goalDone, 0);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayEvents = useMemo(
    () => calendar?.days.find((d) => d.date === todayIso)?.events ?? [],
    [calendar, todayIso],
  );

  const isInst = me?.kind === 'institutional';
  const isIndie = me?.kind === 'independent';

  useEffect(() => {
    const q = searchParams.get('q') ?? searchParams.get('topic');
    if (q) setIntentText(q);
    const g = searchParams.get('goal') as LearnGoal | null;
    if (g && g in LEARN_GOAL_LABELS) setGoal(g);
  }, [searchParams]);

  const openLesson = (text: string, nextGoal: LearnGoal) => {
    const trimmed = text.trim();
    if (!trimmed && nextGoal !== 'continue' && nextGoal !== 'revise' && nextGoal !== 'from_notes') {
      return;
    }

    if (nextGoal === 'continue') {
      router.push(resumeTile?.route ?? '/learn/path');
      return;
    }
    if (nextGoal === 'revise') {
      router.push('/learn/revision');
      return;
    }
    if (nextGoal === 'from_notes') {
      router.push('/library');
      return;
    }
    if (nextGoal === 'quick') {
      // Quick stays a non-session path for now (stubbed API).
      setLeaving(true);
      router.push(`/learn/session/new?q=${encodeURIComponent(trimmed)}&goal=quick`);
      return;
    }

    // Instant transition — before any network. Door, not page load.
    setLeaving(true);
    const qs = new URLSearchParams({ q: trimmed, goal: nextGoal });
    router.push(`/learn/session/new?${qs.toString()}`);
  };

  const handleSubmit = () => {
    openLesson(intentText, goal);
  };

  return (
    <div
      className={`relative mx-auto max-w-[1130px] px-5 py-8 pb-24 md:px-10 md:py-[34px] md:pb-[90px] ${
        leaving ? 'pointer-events-none opacity-40 transition-opacity duration-200' : 'animate-st-block-in'
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-[radial-gradient(ellipse_at_20%_0%,_rgba(30,122,94,0.10),_transparent_55%)]"
      />

      <div className="relative flex flex-wrap items-start gap-6">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2">
            <PetrosMark />
            <Eyebrow>{formatGreetingEyebrow(me)}</Eyebrow>
          </div>
          <PageTitle className="mt-2">{greetingLine(me?.fullName)}</PageTitle>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-st-muted">
            {isInst
              ? `You're ${goalLeft} topics from your weekly goal. Tell Petros what to teach — the lesson starts immediately.`
              : `${goalDone} of ${goalTotal} topics this week. Ask anything, or pick a goal below.`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {streaks?.showStreak && (
            <div className="flex items-center gap-2 rounded-[14px] border border-st-bd1 bg-st-card/90 px-4 py-2.5 backdrop-blur-sm">
              <Flame size={17} className="text-st-success" fill="currentColor" aria-hidden />
              <div>
                <p className="font-mono-ui text-sm font-semibold text-st-accentDeep">
                  {streaks.streakDays} days
                </p>
                <p className="text-[10px] text-st-faint">streak · real work only</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2.5 rounded-[14px] border border-st-bd1 bg-st-card/90 py-2 pl-2 pr-4 backdrop-blur-sm">
            <WeeklyGoalRing done={goalDone} target={goalTotal} />
            <div>
              <p className="text-[13px] font-semibold text-st-ink">
                {goalDone} of {goalTotal} topics
              </p>
              <p className="text-[10.5px] text-st-faint">weekly goal · set by you</p>
            </div>
          </div>
        </div>
      </div>

      {/* One composition: brand + ask + goals */}
      <section className="relative mt-9 rounded-[22px] border border-st-bd1 bg-st-card p-5 shadow-[0_20px_50px_-36px_rgba(23,37,31,0.35)] md:mt-11 md:p-7">
        <Eyebrow color="accent">ASK PETROS</Eyebrow>
        <h2 className="mt-2 font-display text-[clamp(1.35rem,2.4vw,1.7rem)] font-semibold tracking-[-0.015em] text-st-ink">
          What should we learn?
        </h2>

        <div className="relative mt-4">
          <input
            value={intentText}
            onChange={(e) => setIntentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask anything, or tell Petros what you want to learn…"
            className="w-full rounded-[16px] border border-st-bd2 bg-st-page/70 py-4 pl-4 pr-16 text-[15px] text-st-ink outline-none transition placeholder:text-st-faint focus:border-st-accentBd focus:bg-st-card focus:shadow-[0_0_0_4px_rgba(30,122,94,0.12)]"
            autoComplete="off"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <KbdHint />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {GOALS.map((item) => {
            if (item.id === 'continue' && !hasResumable) return null;
            if (item.id === 'from_notes' && !isIndie) return null;
            const selected = goal === item.id;
            return (
              <PillChip
                key={item.id}
                variant={selected ? 'primary' : undefined}
                onClick={() => {
                  setGoal(item.id);
                  if (item.id === 'continue' || item.id === 'revise' || item.id === 'from_notes') {
                    openLesson(intentText, item.id);
                  }
                }}
              >
                {LEARN_GOAL_LABELS[item.id]}
              </PillChip>
            );
          })}
          {isInst && (
            <PillChip onClick={() => router.push('/lab/mock-exams/new')}>Prepare for exam</PillChip>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!intentText.trim() && goal !== 'continue'}
            onClick={handleSubmit}
            className="rounded-full bg-gradient-to-br from-[#0C3F31] to-[#155844] px-5 py-2.5 text-sm font-semibold text-[#F6F3E9] shadow-[0_12px_28px_-16px_rgba(12,63,49,0.75)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            Start lesson
          </button>
          <p className="text-xs text-st-faint">
            {goal === 'practice'
              ? 'Mostly problems, light exposition.'
              : goal === 'revise'
                ? 'Opens with retrieval, short and focused.'
                : goal === 'quick'
                  ? 'A direct answer — not a full lesson.'
                  : 'Teaching from the ground up.'}
          </p>
        </div>
      </section>

      {hasResumable && resumeTile && (
        <Link
          href={resumeTile.route}
          className="mt-7 flex flex-wrap items-center gap-6 rounded-[18px] bg-gradient-to-br from-[#0C3F31] to-[#155844] p-6 shadow-[0_16px_36px_-20px_rgba(12,63,49,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-20px_rgba(12,63,49,0.65)] md:p-7"
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
        className={`mt-8 grid gap-5 ${isInst ? 'lg:grid-cols-[1fr_340px]' : 'lg:grid-cols-[1fr_300px]'}`}
      >
        <div className="flex flex-col gap-5">
          {isInst && (
            <div className="rounded-[18px] border border-st-bd1 bg-st-card">
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
            </div>
          )}

          {isIndie && (
            <div className="rounded-[18px] border border-st-bd1 bg-st-card p-5">
              <Eyebrow>THIS WEEK — SET BY YOU</Eyebrow>
              <p className="mt-2 font-display text-xl font-semibold text-st-ink">
                {goalDone} of {goalTotal} topics
              </p>
              <p className="mt-1 text-sm text-st-muted">Track your self-paced goals week by week.</p>
              <Link href="/learn/path" className="mt-3 inline-block text-sm font-semibold text-st-success">
                Edit goals →
              </Link>
            </div>
          )}

          {path?.items && path.items.length > 0 && (
            <div className="rounded-[18px] border border-st-bd1 bg-st-card p-5">
              <Eyebrow>YOUR PATH</Eyebrow>
              <p className="mt-2 font-display text-xl font-semibold text-st-ink">Where you are</p>
              <div className="mt-3 space-y-2">
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
            </div>
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

          <div className="rounded-[18px] border border-st-bd1 bg-st-card p-5">
            <div className="flex items-center gap-1.5">
              <PetrosMark />
              <Eyebrow color="amber">PETROS NOTICED</Eyebrow>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-st-muted">
              Specific observations from your learning will land here — never generic encouragement.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/learn/path" className="text-sm font-semibold text-st-accent">
                Learning path →
              </Link>
              <Link href="/history" className="text-sm font-semibold text-st-accent">
                Session history →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
