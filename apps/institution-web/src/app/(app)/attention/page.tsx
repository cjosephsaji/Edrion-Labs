'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Clock } from 'lucide-react';
import { DetailPanel, PermissionDenied, type DetailSection } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useScope } from '@/lib/scope';
import { useAttention, type AttentionCategory, type AttentionItem, type AttentionSeverity } from '@/lib/attention';

const SEV_CLASS: Record<AttentionSeverity, string> = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warning-soft text-warning',
  low: 'bg-background-secondary text-text-secondary',
};
const SEV_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };

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
      <div className="page-enter flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-text-secondary">
              Where <span className="font-medium text-text-primary">{activeLabel}</span> needs action right now.
            </p>
            {!isLoading && !isError && (
              <p className="text-2xl font-semibold text-text-primary">{totalActions} item{totalActions === 1 ? '' : 's'} need attention</p>
            )}
          </div>
          <div className="flex gap-1">
            {(['all', 'high', 'medium', 'low'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setMinSeverity(s)}
                className={'rounded-full px-3 py-1 text-xs font-medium capitalize ' + (minSeverity === s ? 'bg-primary text-primary-foreground' : 'bg-background-secondary text-text-secondary hover:text-text-primary')}
              >
                {s === 'all' ? 'All' : `${s}+`}
              </button>
            ))}
          </div>
        </div>

        {isError && <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">Couldn’t load the Attention Centre. Retry in a moment.</div>}
        {isLoading && <p className="text-sm text-text-muted">Loading…</p>}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.filter((c) => c.status !== 'no_access').map((c) => (
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
    <section className="flex flex-col rounded-lg border border-border bg-surface-elevated">
      <header className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 className="font-semibold text-text-primary">{category.label}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{category.description}</p>
        </div>
        {category.status === 'ok' && (
          <span className={'shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold ' + (category.count > 0 ? 'bg-danger/10 text-danger' : 'bg-background-secondary text-text-muted')}>
            {category.count}
          </span>
        )}
      </header>

      <div className="flex-1 p-2">
        {category.status === 'not_yet_available' ? (
          <div className="flex items-center gap-2 p-4 text-sm text-text-muted">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{category.message ?? 'Coming soon.'}</span>
          </div>
        ) : category.count === 0 ? (
          <p className="p-4 text-sm text-text-muted">Nothing needs attention here. 🎉</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No items match this severity filter.</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id}>
                <button onClick={() => onOpen(item)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-background-secondary">
                  <span className={'rounded p-1 ' + SEV_CLASS[item.severity]}><AlertTriangle className="h-3.5 w-3.5" /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-text-primary">{item.title}</span>
                    {item.subtitle && <span className="truncate text-xs text-text-muted">{item.subtitle}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
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
