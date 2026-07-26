'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, Pencil } from 'lucide-react';
import { ErrorState, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { WidgetCard } from '@/components/dashboard/widget-card';
import {
  useDashboardPrefs,
  usePortalDashboard,
  usePortalMe,
  usePrincipalMetrics,
  useSaveDashboardPrefs,
} from '@/lib/hooks';
import { usePermissions } from '@/lib/permissions';
import type { DashboardPrefs, PersonaKey, PortalDashboardDto } from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();
  const { data: me } = usePortalMe();
  const { can } = usePermissions();
  const { data, isLoading, isError, refetch } = usePortalDashboard();
  const metrics = usePrincipalMetrics();

  // A freshly approved institution lands here; steer its admins into the setup wizard until
  // they go live. Only admins (who can actually complete onboarding) are redirected — other
  // staff use the portal normally.
  const needsOnboarding =
    !!me && me.onboardingStatus !== 'completed' && me.institutionStatus === 'onboarding';
  useEffect(() => {
    if (needsOnboarding && can('institution_settings.manage')) {
      router.replace('/onboarding');
    }
  }, [needsOnboarding, can, router]);

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="page-enter flex flex-1 flex-col gap-6 p-5 lg:p-6">
        {me && (
          <div className="rounded-2xl border border-border bg-surface/85 p-5 shadow-sm">
            <p className="text-2xl font-semibold tracking-[0.01em] text-text-primary">
              {greeting()}, {me.fullName.split(' ')[0]}.
            </p>
            <p className="mt-1 max-w-3xl text-sm text-text-secondary">
              {data
                ? `Here is what needs attention across ${data.scopeLabel} today.`
                : `Here is what needs attention across ${me.institutionName} today.`}
            </p>
          </div>
        )}

        {isLoading && <DashboardSkeleton />}
        {isError && (
          <ErrorState
            title="Couldn’t load the dashboard"
            description="The portal API may be offline. Retry in a moment."
            action={
              <button
                onClick={() => refetch()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Retry
              </button>
            }
          />
        )}
        {data && <DashboardBody data={data} metrics={metrics.data?.items} />}
      </div>
    </>
  );
}

function DashboardBody({
  data,
  metrics,
}: {
  data: PortalDashboardDto;
  metrics?: Array<{ key: string; value: Record<string, unknown> }>;
}) {
  const { data: prefs } = useDashboardPrefs();
  const save = useSaveDashboardPrefs();
  const [editing, setEditing] = useState(false);
  const [persona, setPersona] = useState<PersonaKey | 'all'>('all');

  const current: DashboardPrefs = useMemo(
    () => prefs ?? { hidden: [], pinned: [], activePersona: null },
    [prefs],
  );

  // A persona tab is only offered when the user actually has widgets under it. A user with a single
  // persona sees no tab row at all — the switcher exists for people who wear several hats.
  const personas = data.personas;
  const showTabs = personas.length > 1;

  const visible = useMemo(
    () => (persona === 'all' ? data.widgets : data.widgets.filter((w) => w.persona === persona)),
    [data.widgets, persona],
  );

  const mutate = (next: DashboardPrefs) => save.mutate(next);
  const hide = (id: string) => mutate({ ...current, hidden: [...current.hidden, id] });
  const unhide = (id: string) => mutate({ ...current, hidden: current.hidden.filter((h) => h !== id) });
  const togglePin = (id: string) =>
    mutate({
      ...current,
      pinned: current.pinned.includes(id)
        ? current.pinned.filter((p) => p !== id)
        : [...current.pinned, id],
    });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showTabs ? (
          <div className="flex flex-wrap gap-1.5">
            <PersonaChip label="All" active={persona === 'all'} onClick={() => setPersona('all')} />
            {personas.map((p) => (
              <PersonaChip
                key={p.key}
                label={p.label}
                active={persona === p.key}
                onClick={() => setPersona(p.key)}
              />
            ))}
          </div>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-xs transition-colors hover:bg-primary-soft hover:text-primary"
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editing ? 'Done' : 'Customise'}
        </button>
      </div>

      {metrics && metrics.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.key} className="rounded-xl border border-border bg-surface/85 px-4 py-3 text-sm">
              <p className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{m.key}</p>
              <p className="mt-1 font-medium text-text-primary">{JSON.stringify(m.value)}</p>
            </div>
          ))}
        </div>
      )}

      {editing && current.hidden.length > 0 && <HiddenTray ids={current.hidden} data={data} onUnhide={unhide} />}

      {visible.length === 0 ? (
        <ErrorState
          title="Nothing to show here"
          description={
            data.widgets.length === 0
              ? 'Your roles don’t give you access to any dashboard cards yet. Ask an administrator if you expected to see something.'
              : 'Every card in this view is hidden. Use Customise to bring some back.'
          }
        />
      ) : (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {visible.map((w) => (
            <WidgetCard key={w.id} widget={w} editing={editing} onHide={hide} onTogglePin={togglePin} />
          ))}
        </section>
      )}
    </>
  );
}

/** Hidden widgets, restorable. Only ids the API returned — i.e. ones this user may still see. */
function HiddenTray({
  ids,
  data,
  onUnhide,
}: {
  ids: string[];
  data: PortalDashboardDto;
  onUnhide: (id: string) => void;
}) {
  // The hidden widget isn't in data.widgets (it wasn't hydrated), so fall back to its id for a label.
  const titleFor = (id: string) => data.widgets.find((w) => w.id === id)?.title ?? id;
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Hidden cards</p>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onUnhide(id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-primary-soft hover:text-primary"
          >
            <Eye className="h-3.5 w-3.5" />
            {titleFor(id)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonaChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary'
          : 'rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary'
      }
    >
      {label}
    </button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-64 rounded-full" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
