'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Clock3, EyeOff, Pin, PinOff } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  StatCard,
} from '@edrion/ui';
import { useFormat } from '@/lib/format';
import { useAttention } from '@/lib/attention';
import type { DashboardStat, DashboardWidget, WidgetData } from '@/lib/types';

/**
 * Renders a widget by its DATA TYPE, not by its id. A widget the API adds that reuses an existing
 * type therefore needs no change here; an unrecognised type renders nothing rather than throwing,
 * so an API deploy can safely lead a web deploy.
 */
export function WidgetCard({
  widget,
  editing,
  onHide,
  onTogglePin,
}: {
  widget: DashboardWidget;
  editing: boolean;
  onHide: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const body = renderBody(widget.data);
  if (!body) return null;

  return (
    <Card className={widget.size === 'lg' ? 'xl:col-span-3' : widget.size === 'md' ? 'xl:col-span-2' : ''}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{widget.title}</span>
            {widget.pinned && !editing && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </CardTitle>
          {widget.description && <CardDescription>{widget.description}</CardDescription>}
        </div>
        {editing && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onTogglePin(widget.id)}
              aria-label={widget.pinned ? `Unpin ${widget.title}` : `Pin ${widget.title}`}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-primary-soft hover:text-primary"
            >
              {widget.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onHide(widget.id)}
              aria-label={`Hide ${widget.title}`}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function renderBody(data: WidgetData) {
  switch (data.type) {
    case 'stats':
      return <StatsBody stats={data.stats} />;
    case 'list':
      return <ListBody items={data.items} />;
    case 'comparison':
      return <ComparisonBody rows={data.rows} />;
    case 'activity':
      return <ActivityBody items={data.items} />;
    case 'attention':
      return <AttentionBody />;
    default:
      // Unknown type from a newer API. Skip it rather than crash the whole dashboard.
      return null;
  }
}

function StatsBody({ stats }: { stats: DashboardStat[] }) {
  const fmt = useFormat();
  const value = (s: DashboardStat) => (s.format === 'money' ? fmt.money(Number(s.value)) : s.value);
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
      {stats.map((s) => (
        <StatCard key={s.key} label={s.label} value={value(s)} hint={s.hint} />
      ))}
    </div>
  );
}

function ListBody({ items }: { items: Array<{ id: string; title: string; subtitle?: string; badge?: string }> }) {
  if (items.length === 0) return <EmptyNote>Nothing here right now.</EmptyNote>;
  return (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between gap-3 rounded-lg px-1 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{i.title}</p>
            {i.subtitle && <p className="truncate text-xs text-text-muted">{i.subtitle}</p>}
          </div>
          {i.badge && <Badge tone="neutral">{i.badge}</Badge>}
        </li>
      ))}
    </ul>
  );
}

function ComparisonBody({ rows }: { rows: Array<{ id: string; name: string; value: number }> }) {
  if (rows.length === 0) return <EmptyNote>No campuses in this scope.</EmptyNote>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="truncate font-medium text-text-primary">{r.name}</span>
            <span className="shrink-0 text-text-muted">{r.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(8, Math.round((r.value / max) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityBody({ items }: { items: Array<{ id: string; title: string; description: string; at: string }> }) {
  if (items.length === 0) return <EmptyNote>No recent activity in this scope.</EmptyNote>;
  return (
    <ul className="relative space-y-1 before:absolute before:left-[0.6875rem] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
      {items.map((a) => (
        <li
          key={a.id}
          className="relative flex items-start gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-primary-soft/35"
        >
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary-soft text-primary">
            <Clock3 className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">{a.title}</p>
            <p className="truncate text-xs text-text-muted">{a.description}</p>
          </div>
          <span className="shrink-0 text-xs text-text-muted">{formatWhen(a.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Attention Centre read-out. Fetches independently of the dashboard payload — /portal/attention
 * already filters its categories by the caller's permissions, so a category the user can't see
 * arrives as `no_access` and is dropped here.
 */
function AttentionBody() {
  const router = useRouter();
  const { data, isLoading } = useAttention();
  const cats = (data?.categories ?? []).filter((c) => c.status === 'ok');
  const top = cats.filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 4);

  if (isLoading) return <Skeleton className="h-20 rounded-xl" />;
  if (top.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-4 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-text-primary">No urgent actions found</p>
          <p className="text-sm text-text-muted">Your active scope has no open attention items.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {top.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => router.push('/attention')}
            className="rounded-xl border border-border bg-surface p-4 text-left shadow-xs transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-text-primary">{c.label}</p>
              <Badge tone="danger">{c.count}</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-text-muted">{c.description}</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => router.push('/attention')}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
      >
        Open Attention Centre <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
