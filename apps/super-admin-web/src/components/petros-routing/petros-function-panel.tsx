'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Beaker,
  Check,
  Filter,
  GitBranch,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge, Button, Card, Input, Label, Select, cn } from '@edrion/ui';
import type { PetrosAiFunctionDto, PetrosAiProviderDto } from '@edrion/api-client';
import { useConfigurePetrosFunction, usePreviewPetrosRoute } from '@edrion/api-client';

interface EditableRoute {
  key: string;
  providerId: string;
  modelId: string;
  tier: number;
  trafficPercent: number;
  enabled: boolean;
}

const TIER_LABEL = ['Primary route', 'Secondary fallback', 'Third fallback'];
const INPUT_TYPES = ['text', 'image', 'audio', 'document'];
const RESPONSE_FORMATS = ['structured_teaching_block', 'json', 'text', 'svg', 'image', 'audio'];

export function PetrosFunctionPanel({ functions, providers }: { functions: PetrosAiFunctionDto[]; providers: PetrosAiProviderDto[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(functions[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  useEffect(() => {
    if (!selectedId && functions[0]) setSelectedId(functions[0].id);
    if (selectedId && !functions.some((fn) => fn.id === selectedId)) setSelectedId(functions[0]?.id ?? null);
  }, [functions, selectedId]);
  const categories = useMemo(() => ['All', ...new Set(functions.map((fn) => fn.category))], [functions]);
  const visible = functions.filter((fn) =>
    (category === 'All' || fn.category === category) &&
    `${fn.displayName} ${fn.key} ${fn.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = functions.find((fn) => fn.id === selectedId) ?? visible[0];

  return (
    <div className="grid min-h-[42rem] gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Card className="overflow-hidden xl:sticky xl:top-14 xl:h-[calc(100vh-8rem)]">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between"><div><div className="text-sm font-semibold text-text-primary">Function registry</div><div className="mt-0.5 text-xs text-text-muted">{functions.length} capabilities auto-registered</div></div><Badge tone="primary" dot>Live</Badge></div>
          <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search functions…" className="pl-9" /></div>
          <div className="mt-2 flex items-center gap-2"><Filter className="h-3.5 w-3.5 text-text-muted" /><Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 text-xs" options={categories.map((item) => ({ value: item, label: item }))} /></div>
        </div>
        <div className="scrollbar-thin max-h-[34rem] overflow-y-auto xl:max-h-none xl:flex-1">
          {visible.map((fn) => {
            const primary = fn.routes.filter((route) => route.tier === 0 && route.enabled);
            const configured = primary.length > 0;
            return (
              <button key={fn.id} onClick={() => setSelectedId(fn.id)} className={cn('w-full border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-background-secondary', selected?.id === fn.id && 'bg-primary-soft/70 shadow-[inset_3px_0_0_var(--primary)]')}>
                <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold leading-5 text-text-primary">{fn.displayName}</span><span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', !fn.enabled ? 'bg-text-muted' : configured ? 'bg-success' : 'bg-warning')} /></div>
                <div className="mt-1 truncate text-xs text-text-muted">{fn.category} · {fn.key}</div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-text-secondary">{configured ? <><GitBranch className="h-3 w-3" /> {primary.map((route) => route.modelName).join(' / ')}</> : <><AlertTriangle className="h-3 w-3 text-warning" /> Needs a primary route</>}</div>
              </button>
            );
          })}
        </div>
      </Card>
      {selected ? <FunctionEditor key={`${selected.id}:${selected.version}:${selected.routes.length}`} fn={selected} providers={providers} /> : <Card className="flex items-center justify-center p-10 text-sm text-text-muted">Select a registered function.</Card>}
    </div>
  );
}

function FunctionEditor({ fn, providers }: { fn: PetrosAiFunctionDto; providers: PetrosAiProviderDto[] }) {
  const configure = useConfigurePetrosFunction();
  const preview = usePreviewPetrosRoute();
  const [enabled, setEnabled] = useState(fn.enabled);
  const [inputs, setInputs] = useState(fn.allowedInputTypes);
  const [responseFormat, setResponseFormat] = useState(fn.responseFormat);
  const [settings, setSettings] = useState(fn.settings);
  const [routes, setRoutes] = useState<EditableRoute[]>(fn.routes.map((route) => ({ key: route.id, providerId: route.providerId, modelId: route.modelId, tier: route.tier, trafficPercent: route.trafficPercent, enabled: route.enabled })));
  const [reason, setReason] = useState('Update Petros function routing');
  const [message, setMessage] = useState('');
  const [previewModality, setPreviewModality] = useState(fn.allowedInputTypes[0] ?? 'text');
  const [previewDifficulty, setPreviewDifficulty] = useState('0.4');

  const routedModels = routes.flatMap((route) => providers.find((provider) => provider.id === route.providerId)?.models.filter((model) => model.id === route.modelId) ?? []);
  const supportsReasoning = routedModels.some((model) => model.capabilities.includes('reasoning'));

  function addRoute(tier: number) {
    const provider = providers.find((candidate) => candidate.enabled && !candidate.paused && candidate.models.some((model) => model.enabled));
    const model = provider?.models.find((candidate) => candidate.enabled);
    if (!provider || !model) return setMessage('Add an enabled provider and model first.');
    setRoutes((current) => [...current, { key: crypto.randomUUID(), providerId: provider.id, modelId: model.id, tier, trafficPercent: current.some((route) => route.tier === tier) ? 0 : 100, enabled: true }]);
  }

  function updateRoute(key: string, patch: Partial<EditableRoute>) {
    setRoutes((current) => current.map((route) => route.key === key ? { ...route, ...patch } : route));
  }

  function changeProvider(route: EditableRoute, providerId: string) {
    const model = providers.find((provider) => provider.id === providerId)?.models.find((candidate) => candidate.enabled);
    updateRoute(route.key, { providerId, modelId: model?.id ?? '' });
  }

  async function save() {
    setMessage('');
    try {
      await configure.mutateAsync({
        id: fn.id,
        enabled,
        allowedInputTypes: inputs,
        responseFormat,
        requiredCapabilities: fn.requiredCapabilities,
        settings,
        routes: routes.map(({ key: _key, ...route }) => ({ ...route, overrides: {} })),
        reason,
        version: fn.version,
      });
      setMessage('Function routing saved and active.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this function.');
    }
  }

  async function testRoute() {
    setMessage('');
    try {
      await preview.mutateAsync({
        functionKey: fn.key,
        inputModality: previewModality,
        difficultyLevel: Number(previewDifficulty),
        estimatedTokens: 1_200,
        previousFailures: Number(previewDifficulty) > 0.7 ? 2 : 0,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not preview the route.');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-[linear-gradient(90deg,var(--surface-elevated),var(--primary-soft))] p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div><div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone="primary">{fn.category}</Badge><code className="rounded bg-background-secondary px-2 py-0.5 text-[11px] text-text-muted">{fn.key}</code></div><h2 className="text-xl font-semibold text-text-primary">{fn.displayName}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-text-secondary">{fn.description}</p></div>
            <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2"><div><div className="text-xs font-semibold text-text-primary">Function enabled</div><div className="text-[11px] text-text-muted">Immediately affects routing</div></div><Toggle checked={enabled} onChange={setEnabled} /></label>
          </div>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-5">
            <SectionHeading icon={GitBranch} title="Execution routes" copy="Tier 0 is primary. Multiple models in a tier create a controlled traffic split." />
            {[0, 1, 2].map((tier) => {
              const tierRoutes = routes.filter((route) => route.tier === tier);
              const total = tierRoutes.filter((route) => route.enabled).reduce((sum, route) => sum + route.trafficPercent, 0);
              return (
                <div key={tier} className="rounded-xl border border-border bg-background-secondary/55 p-3">
                  <div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-semibold text-text-primary">{TIER_LABEL[tier]}</div><div className={cn('text-[11px]', tierRoutes.length && total !== 100 ? 'text-danger' : 'text-text-muted')}>{tierRoutes.length ? `${total}% assigned${total === 100 ? '' : ' · must total 100%'}` : tier === 0 ? 'Required before this function can run' : 'Optional'}</div></div><Button variant="ghost" size="sm" onClick={() => addRoute(tier)}><Plus className="h-3.5 w-3.5" /> Add model</Button></div>
                  <div className="space-y-2">
                    {tierRoutes.length === 0 && <div className="rounded-lg border border-dashed border-border-strong p-4 text-center text-xs text-text-muted">No {tier === 0 ? 'primary route' : 'fallback'} configured.</div>}
                    {tierRoutes.map((route) => {
                      const provider = providers.find((candidate) => candidate.id === route.providerId);
                      return (
                        <div key={route.key} className="grid items-end gap-2 rounded-lg border border-border bg-surface p-3 md:grid-cols-[1fr_1fr_6rem_auto]">
                          <div><Label className="text-xs">Provider</Label><Select value={route.providerId} onChange={(e) => changeProvider(route, e.target.value)} options={providers.map((item) => ({ value: item.id, label: `${item.displayName}${item.paused ? ' (paused)' : ''}` }))} /></div>
                          <div><Label className="text-xs">Model</Label><Select value={route.modelId} onChange={(e) => updateRoute(route.key, { modelId: e.target.value })} options={(provider?.models ?? []).map((model) => ({ value: model.id, label: model.displayName }))} /></div>
                          <div><Label className="text-xs">Traffic %</Label><Input type="number" min={0} max={100} value={route.trafficPercent} onChange={(e) => updateRoute(route.key, { trafficPercent: Number(e.target.value) })} /></div>
                          <Button aria-label="Remove route" variant="ghost" size="icon" onClick={() => setRoutes((current) => current.filter((item) => item.key !== route.key))}><Trash2 className="h-4 w-4 text-danger" /></Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="space-y-3">
            <div className="rounded-xl border border-border bg-background-secondary p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted"><ShieldCheck className="h-4 w-4 text-primary" /> Contract</div><dl className="mt-3 space-y-3 text-xs"><Row label="Prompt" value={fn.activePromptVersion} /><Row label="Schema" value={fn.activeSchemaVersion} /><Row label="Output" value={responseFormat.replace(/_/g, ' ')} /><Row label="Source" value={fn.source} /></dl></div>
            <div className="rounded-xl border border-primary/15 bg-primary-soft/60 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4" /> Student experience</div><p className="mt-2 text-xs leading-5 text-text-secondary">Provider names, model names, failures and fallback activity remain hidden. This configuration only changes how Petros executes.</p></div>
          </aside>
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeading icon={Settings2} title="Function limits & generation" copy="These limits travel with this capability, regardless of which provider handles it." />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Maximum input tokens" value={settings.maxInputTokens} onChange={(value) => setSettings({ ...settings, maxInputTokens: value })} />
          <NumberField label="Maximum output tokens" value={settings.maxOutputTokens} onChange={(value) => setSettings({ ...settings, maxOutputTokens: value })} />
          <NumberField label="Temperature" value={settings.temperature} step="0.1" onChange={(value) => setSettings({ ...settings, temperature: value })} />
          <NumberField label="Timeout (ms)" value={settings.timeoutMs} onChange={(value) => setSettings({ ...settings, timeoutMs: value })} />
          <NumberField label="Maximum retries" value={settings.maxRetries} onChange={(value) => setSettings({ ...settings, maxRetries: value })} />
          <OptionalNumberField label="Daily request limit" value={settings.dailyRequestLimit} onChange={(value) => setSettings({ ...settings, dailyRequestLimit: value })} />
          <OptionalNumberField label="Monthly request limit" value={settings.monthlyRequestLimit} onChange={(value) => setSettings({ ...settings, monthlyRequestLimit: value })} />
          <OptionalNumberField label="Max cost / request (USD)" value={microsToUsd(settings.maxCostPerRequestMicros)} step="0.01" onChange={(value) => setSettings({ ...settings, maxCostPerRequestMicros: usdToMicros(value) })} />
          <OptionalNumberField label="Max cost / student (USD)" value={microsToUsd(settings.maxCostPerStudentMicros)} step="0.01" onChange={(value) => setSettings({ ...settings, maxCostPerStudentMicros: usdToMicros(value) })} />
          <OptionalNumberField label="Institution monthly requests" value={settings.maxInstitutionUsage} onChange={(value) => setSettings({ ...settings, maxInstitutionUsage: value })} />
          {supportsReasoning && <div><Label>Reasoning level</Label><Select value={settings.reasoningLevel ?? 'medium'} onChange={(e) => setSettings({ ...settings, reasoningLevel: e.target.value })} options={['none', 'low', 'medium', 'high'].map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) }))} /></div>}
          <div><Label>Response format</Label><Select value={responseFormat} onChange={(e) => setResponseFormat(e.target.value)} options={RESPONSE_FORMATS.map((value) => ({ value, label: value.replace(/_/g, ' ') }))} /></div>
        </div>
        <div className="mt-5 grid gap-4 border-t border-border pt-5 lg:grid-cols-3">
          <div><Label>Allowed inputs</Label><div className="flex flex-wrap gap-2">{INPUT_TYPES.map((type) => <button key={type} type="button" onClick={() => setInputs((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold', inputs.includes(type) ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-muted')}><span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', inputs.includes(type) ? 'border-primary bg-primary text-white' : 'border-border-strong')}>{inputs.includes(type) && <Check className="h-2.5 w-2.5" />}</span>{type}</button>)}</div></div>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3"><Toggle checked={settings.streaming} onChange={(streaming) => setSettings({ ...settings, streaming })} /><div><div className="text-sm font-semibold text-text-primary">Streaming</div><div className="text-xs text-text-muted">Stream supported teaching blocks as they arrive.</div></div></label>
          <label className="flex items-start gap-3 rounded-lg border border-border p-3"><Toggle checked={settings.caching} onChange={(caching) => setSettings({ ...settings, caching })} /><div><div className="text-sm font-semibold text-text-primary">Response caching</div><div className="text-xs text-text-muted">Reuse safe, version-keyed output where suitable.</div></div></label>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div className="max-w-2xl"><SectionHeading icon={Beaker} title="Route preview" copy="Dry-run context through the live rules, health gates, budget policy and traffic split. No provider request is made." /><div className="mt-4 flex flex-wrap gap-3"><div><Label className="text-xs">Input modality</Label><Select value={previewModality} onChange={(e) => setPreviewModality(e.target.value)} options={inputs.map((value) => ({ value, label: value }))} /></div><div><Label className="text-xs">Difficulty (0–1)</Label><Input className="w-32" type="number" min={0} max={1} step="0.1" value={previewDifficulty} onChange={(e) => setPreviewDifficulty(e.target.value)} /></div><Button variant="secondary" onClick={testRoute} loading={preview.isPending}><Zap className="h-4 w-4" /> Preview decision</Button></div></div>{preview.data && <div className="min-w-[18rem] rounded-xl border border-success/20 bg-success-soft p-4"><div className="text-xs font-semibold uppercase tracking-wide text-success">Selected route</div><div className="mt-1 text-sm font-semibold text-text-primary">{preview.data.selected.providerName} · {preview.data.selected.modelName}</div><div className="mt-2 text-xs text-text-secondary">{preview.data.explanation.join(' → ')}</div></div>}</div>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-col items-stretch justify-between gap-3 rounded-xl border border-border bg-surface/95 p-3 shadow-lg backdrop-blur md:flex-row md:items-center"><div className="min-w-0"><div className={cn('truncate text-xs', message.toLowerCase().includes('saved') ? 'text-success' : 'text-text-muted')}>{message || 'Changes are audited and take effect on the next Petros request.'}</div><Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-8 min-w-[18rem]" aria-label="Reason for change" /></div><Button onClick={save} loading={configure.isPending} disabled={!reason.trim() || inputs.length === 0}><Settings2 className="h-4 w-4" /> Save function routing</Button></div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, copy }: { icon: typeof Settings2; title: string; copy: string }) {
  return <div><div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon className="h-4 w-4" /></span>{title}</div><p className="ml-9 mt-0.5 text-xs leading-5 text-text-muted">{copy}</p></div>;
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) { return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border-strong')}><span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} /></button>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3"><dt className="text-text-muted">{label}</dt><dd className="truncate font-medium capitalize text-text-primary">{value}</dd></div>; }
function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <div><Label>{label}</Label><Input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>; }
function OptionalNumberField({ label, value, onChange, step }: { label: string; value?: number; onChange: (value: number | undefined) => void; step?: string }) { return <div><Label>{label}</Label><Input type="number" min={0} step={step} value={value ?? ''} placeholder="No limit" onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></div>; }
function microsToUsd(value?: number) { return value == null ? undefined : value / 1_000_000; }
function usdToMicros(value?: number) { return value == null ? undefined : Math.round(value * 1_000_000); }
