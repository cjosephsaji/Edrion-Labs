'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Filter } from 'lucide-react';
import { Badge, DetailPanel, PermissionDenied, Skeleton, type DetailSection } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useScope } from '@/lib/scope';
import { useAttention, type AttentionCategory, type AttentionItem, type AttentionSeverity } from '@/lib/attention';

const SEV_CLASS: Record<AttentionSeverity, string> = {
  high: 'bg-danger-soft text-danger border-danger/15',
  medium: 'bg-warning-soft text-warning border-warning/15',
  low: 'bg-background-secondary text-text-secondary border-border',
};
const SEV_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
const SEV_TONE: Record<AttentionSeverity, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

export default function AttentionPage() {
  const { can } = usePermissions();
  const { activeLabel } = useScope();
  const { data, isLoading, isError } = useAttention();
  const [minSeverity, setMinSeverity] = useState<'all' | AttentionSeverity>('all');
  const [viewing, setViewing] = useState<{ category: string; item: AttentionItem } | null>(null);

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const totalActions = categories.filter((c) => c.status === 'ok').reduce((n, c) => n + c.count, 0);

  if (!can('portal.dashboard.view')) {
    return (
      <>
        <Topbar title="Attention Centre" />
        <div className="p-6"><PermissionDenied description="You don’t have permission to view the Attention Centre." /></div>
      </>
    );
  }

  const severityAllowed = (s: AttentionSeverity) => minSeverity === 'all' || SEV_ORDER[s] <= SEV_ORDER[minSeverity];

  return (
    <>
      <Topbar title="Attention Centre" />
      <div className="page-enter flex flex-1 flex-col gap-5 p-5 lg:p-6">
        <section className="rounded-2xl border border-border bg-surface/85 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Focused triage</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[0.01em] text-text-primary">Attention Centre</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              Where <span className="font-medium text-text-primary">{activeLabel}</span> needs action right now, grouped by operational area.
            </p>
            {!isLoading && !isError && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone={totalActions > 0 ? 'danger' : 'success'} dot>
                  {totalActions} item{totalActions === 1 ? '' : 's'} open
                </Badge>
                <Badge tone="neutral">{categories.filter((c) => c.status === 'ok').length} monitored areas</Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-elevated p-1 shadow-xs">
            <Filter className="ml-2 h-3.5 w-3.5 text-text-muted" />
            {(['all', 'high', 'medium', 'low'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setMinSeverity(s)}
                className={'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ' + (minSeverity === s ? 'bg-primary text-primary-foreground shadow-xs' : 'text-text-secondary hover:bg-primary-soft hover:text-primary')}
              >
                {s === 'all' ? 'All' : `${s}+`}
              </button>
            ))}
          </div>
        </div>
        </section>

        {isError && <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">Couldn’t load the Attention Centre. Retry in a moment.</div>}
        {isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {!isLoading && categories.filter((c) => c.status !== 'no_access').map((c) => (
            <CategoryCard key={c.key} category={c} severityAllowed={severityAllowed} onOpen={(item) => setViewing({ category: c.label, item })} />
          ))}
        </div>
      </div>

      <DetailPanel
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.item.title ?? ''}
        description={viewing?.category}
        sections={viewing ? itemDetail(viewing.item) : []}
      />
    </>
  );
}

function CategoryCard({ category, severityAllowed, onOpen }: { category: AttentionCategory; severityAllowed: (s: AttentionSeverity) => boolean; onOpen: (item: AttentionItem) => void }) {
  const items = category.items.filter((i) => severityAllowed(i.severity)).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return (
    <section className="flex min-h-[18rem] flex-col rounded-xl border border-border bg-surface-elevated shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md">
      <header className="flex items-start justify-between gap-3 border-b border-border bg-surface p-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-text-primary">{category.label}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{category.description}</p>
        </div>
        {category.status === 'ok' && (
          <Badge tone={category.count > 0 ? 'danger' : 'success'} dot={category.count > 0} className="shrink-0">
            {category.count}
          </Badge>
        )}
      </header>

      <div className="flex-1 p-3">
        {category.status === 'not_yet_available' ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-text-muted">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background-secondary">
              <Clock className="h-4 w-4" />
            </span>
            <span>{category.message ?? 'Coming soon.'}</span>
          </div>
        ) : category.count === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-text-primary">Nothing needs attention here</p>
              <p className="text-xs text-text-muted">This area is clear for the selected scope.</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-text-muted">No items match this severity filter.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <button onClick={() => onOpen(item)} className="flex w-full items-start gap-3 rounded-xl border border-border/80 bg-surface px-3 py-3 text-left shadow-xs transition-[background-color,border-color,box-shadow] hover:border-border-strong hover:bg-primary-soft/35 hover:shadow-sm">
                  <span className={'mt-0.5 rounded-lg border p-1.5 ' + SEV_CLASS[item.severity]}><AlertTriangle className="h-3.5 w-3.5" /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-text-primary">{item.title}</span>
                    {item.subtitle && <span className="truncate text-xs text-text-muted">{item.subtitle}</span>}
                    <span className="mt-2"><Badge tone={SEV_TONE[item.severity]}>{item.severity}</Badge></span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
                </button>
              </li>
            ))}
            {category.count > items.length && (
              <li className="px-2 py-1.5 text-xs text-text-muted">+{category.count - items.length} more not shown</li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

function itemDetail(item: AttentionItem): DetailSection[] {
  const metaFields = Object.entries(item.meta ?? {})
    .filter(([, v]) => v !== null && ['string', 'number', 'boolean'].includes(typeof v))
    .map(([k, v]) => ({ label: k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()), value: String(v) }));
  return [
    {
      title: 'Item',
      fields: [
        { label: 'Title', value: item.title },
        { label: 'Detail', value: item.subtitle, full: true },
        { label: 'Severity', value: item.severity },
        ...metaFields,
      ],
    },
  ];
}
