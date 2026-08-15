'use client';
import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Boxes,
  Braces,
  ChevronRight,
  Gauge,
  HeartPulse,
  Network,
  Settings2,
  Sparkles,
  Waypoints,
  ClipboardList,
  BookMarked,
} from 'lucide-react';
import { Card, ErrorState, Skeleton, StatCard, cn } from '@edrion/ui';
import {
  usePetrosAiBudget,
  usePetrosAiFunctions,
  usePetrosAiOverview,
  usePetrosAiProviders,
  usePetrosAiRules,
} from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { PetrosFunctionPanel } from '@/components/petros-routing/petros-function-panel';
import { PetrosProvidersPanel } from '@/components/petros-routing/petros-providers-panel';
import { PetrosRulesPanel } from '@/components/petros-routing/petros-rules-panel';
import { PetrosUsageBudgetPanel } from '@/components/petros-routing/petros-usage-budget-panel';
import { PetrosDecisionsPanel } from '@/components/petros-routing/petros-decisions-panel';
import { PetrosTopicProfilesPanel } from '@/components/petros-routing/petros-topic-profiles-panel';

type Tab = 'functions' | 'profiles' | 'providers' | 'rules' | 'usage' | 'decisions';

const TABS: Array<{ id: Tab; label: string; icon: typeof Boxes }> = [
  { id: 'functions', label: 'AI functions', icon: Boxes },
  { id: 'profiles', label: 'Topic profiles', icon: BookMarked },
  { id: 'providers', label: 'Providers & models', icon: Network },
  { id: 'rules', label: 'Routing rules', icon: Waypoints },
  { id: 'usage', label: 'Usage & budgets', icon: BarChart3 },
  { id: 'decisions', label: 'Decision diagnostics', icon: ClipboardList },
];

export default function PetrosAiRoutingPage() {
  const [tab, setTab] = useState<Tab>('functions');
  const overview = usePetrosAiOverview();
  const providers = usePetrosAiProviders();
  const functions = usePetrosAiFunctions();
  const rules = usePetrosAiRules();
  const budget = usePetrosAiBudget();

  const loading = overview.isLoading || providers.isLoading || functions.isLoading;
  const failed = overview.isError || providers.isError || functions.isError;
  const o = overview.data;
  const budgetPct = useMemo(() => {
    if (!o?.monthlyBudgetMicros) return null;
    return Math.min(100, (o.monthlyCostMicros / o.monthlyBudgetMicros) * 100);
  }, [o]);

  return (
    <>
      <Topbar title="Petros AI Routing" actions={<span className="hidden text-xs text-text-muted md:inline">Provider-independent learning intelligence</span>} />
      <div className="page-enter space-y-5 p-4 md:p-6">
        <section className="relative overflow-hidden rounded-2xl border border-primary/15 bg-[linear-gradient(120deg,#10251d_0%,#173a2d_52%,#1c4b3a_100%)] p-5 text-white shadow-md md:p-7">
          <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full border border-white/10 bg-white/[0.035]" />
          <div className="absolute -bottom-24 right-28 h-52 w-52 rounded-full border border-white/[0.08]" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
                <Sparkles className="h-4 w-4" /> Petros control plane
              </div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">One learning system. Replaceable intelligence.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                Route every teaching capability independently by quality, cost, latency, modality and learner context. Provider details stay behind Petros and never reach students.
              </p>
            </div>
            <div className="grid min-w-[18rem] grid-cols-2 gap-2 text-xs">
              <HealthChip icon={HeartPulse} label="Provider health" value={o ? `${o.healthyProviderCount}/${o.providerCount} ready` : 'Loading'} />
              <HealthChip icon={Gauge} label="Monthly budget" value={budgetPct == null ? 'No ceiling' : `${budgetPct.toFixed(1)}% used`} />
              <HealthChip icon={Braces} label="Function registry" value={o ? `${o.functionCount} registered` : 'Loading'} />
              <HealthChip icon={Activity} label="Routing policy" value={o ? `${o.enabledRuleCount} active rules` : 'Loading'} />
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
        ) : failed || !o ? (
          <Card className="p-6"><ErrorState description="Could not load the Petros AI control plane. Apply migration 0186 and confirm the API is running." /></Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Functions configured" value={`${o.configuredFunctionCount}/${o.functionCount}`} hint="independent routes" />
            <StatCard label="30-day AI cost" value={formatUsd(o.monthlyCostMicros)} hint={o.monthlyBudgetMicros ? `of ${formatUsd(o.monthlyBudgetMicros)}` : 'no platform ceiling'} />
            <StatCard label="Average response" value={`${Math.round(o.averageResponseMs)} ms`} hint="all provider attempts" />
            <StatCard label="Failure rate" value={formatPercent(o.failureRate)} hint="before fallback" />
            <StatCard label="Fallback frequency" value={formatPercent(o.fallbackRate)} hint="requests recovered" className="col-span-2 lg:col-span-1" />
          </div>
        )}

        <div className="sticky top-0 z-20 -mx-1 overflow-x-auto border-b border-border bg-background/90 px-1 pt-1 backdrop-blur-md">
          <div className="flex min-w-max gap-1" role="tablist" aria-label="Petros routing sections">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn('relative flex items-center gap-2 rounded-t-lg px-4 py-3 text-sm font-semibold transition-colors', tab === item.id ? 'text-primary' : 'text-text-muted hover:bg-surface hover:text-text-primary')}>
                  <Icon className="h-4 w-4" /> {item.label}
                  {tab === item.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'functions' && <PetrosFunctionPanel functions={functions.data ?? []} providers={providers.data ?? []} />}
        {tab === 'profiles' && <PetrosTopicProfilesPanel />}
        {tab === 'providers' && <PetrosProvidersPanel providers={providers.data ?? []} />}
        {tab === 'rules' && <PetrosRulesPanel rules={rules.data ?? []} functions={functions.data ?? []} providers={providers.data ?? []} />}
        {tab === 'usage' && <PetrosUsageBudgetPanel budget={budget.data} loading={budget.isLoading} />}
        {tab === 'decisions' && <PetrosDecisionsPanel />}

        <footer className="flex flex-col justify-between gap-2 border-t border-border py-4 text-xs text-text-muted md:flex-row">
          <span>Petros is the product. Providers and models are private, replaceable execution engines.</span>
          <span className="flex items-center gap-1">PLAN <ChevronRight className="h-3 w-3" /> RENDER <ChevronRight className="h-3 w-3" /> OBSERVE <ChevronRight className="h-3 w-3" /> UPDATE</span>
        </footer>
      </div>
    </>
  );
}

function HealthChip({ icon: Icon, label, value }: { icon: typeof Settings2; label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur"><div className="flex items-center gap-1.5 text-white/55"><Icon className="h-3.5 w-3.5" /> {label}</div><div className="mt-1 font-semibold text-white">{value}</div></div>;
}

function formatUsd(micros: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: micros < 1_000_000 ? 2 : 0 }).format(micros / 1_000_000);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}
