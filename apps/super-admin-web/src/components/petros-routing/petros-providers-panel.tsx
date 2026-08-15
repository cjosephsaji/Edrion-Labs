'use client';
import { useState } from 'react';
import {
  Activity,
  Cloud,
  Gauge,
  KeyRound,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Badge, Button, Card, Input, Label, Select, cn } from '@edrion/ui';
import type { PetrosAiProviderDto } from '@edrion/api-client';
import { useSavePetrosModel, useSavePetrosProvider, useTestPetrosProvider } from '@edrion/api-client';

const ADAPTERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai_compatible', label: 'OpenAI-compatible' },
  { value: 'self_hosted', label: 'Self-hosted' },
];
const CAPABILITIES = [
  'text',
  'vision',
  'audio_input',
  'audio_output',
  'speech_to_text',
  'text_to_speech',
  'audio_streaming',
  'ocr',
  'handwriting',
  'structured_output',
  'tools',
  'streaming',
  'image_generation',
  'code_generation',
  'reasoning',
  'embeddings',
];

export function PetrosProvidersPanel({ providers }: { providers: PetrosAiProviderDto[] }) {
  const saveProvider = useSavePetrosProvider();
  const saveModel = useSavePetrosModel();
  const test = useTestPetrosProvider();
  const [providerForm, setProviderForm] = useState<Partial<PetrosAiProviderDto> & { apiKey?: string } | null>(null);
  const [modelProvider, setModelProvider] = useState<PetrosAiProviderDto | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  async function togglePause(provider: PetrosAiProviderDto) {
    try {
      await saveProvider.mutateAsync({
        id: provider.id,
        key: provider.key,
        displayName: provider.displayName,
        adapterType: provider.adapterType,
        baseUrl: provider.baseUrl,
        enabled: provider.enabled,
        paused: !provider.paused,
        priority: provider.priority,
        dailyBudgetMicros: provider.dailyBudgetMicros,
        monthlyBudgetMicros: provider.monthlyBudgetMicros,
        capabilities: provider.capabilities,
        metadata: provider.metadata,
        version: provider.version,
        reason: provider.paused ? 'Resume Petros provider' : 'Temporarily pause Petros provider',
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update provider.'); }
  }

  async function testConnection(provider: PetrosAiProviderDto) {
    setTestResult((current) => ({ ...current, [provider.id]: 'Testing…' }));
    try {
      const result = await test.mutateAsync(provider.id);
      setTestResult((current) => ({ ...current, [provider.id]: result.ok ? `Connected in ${result.latencyMs} ms · ${result.models.length} models visible` : result.error ?? 'Connection failed' }));
    } catch (error) { setTestResult((current) => ({ ...current, [provider.id]: error instanceof Error ? error.message : 'Connection failed' })); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end"><div><h2 className="text-lg font-semibold text-text-primary">Provider fleet</h2><p className="mt-1 max-w-2xl text-sm text-text-secondary">Credentials stay encrypted on the server. Pause a provider globally without touching individual function routes.</p></div><Button onClick={() => setProviderForm({ enabled: true, paused: false, priority: 100, capabilities: ['text', 'structured_output'], metadata: {} })}><Plus className="h-4 w-4" /> Add provider</Button></div>
      {message && <div className="rounded-lg border border-warning/20 bg-warning-soft px-4 py-2 text-sm text-warning">{message}</div>}
      <div className="grid gap-4 2xl:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id} className={cn('overflow-hidden', provider.paused && 'opacity-75')}>
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">{provider.adapterType === 'self_hosted' ? <Server className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-text-primary">{provider.displayName}</h3><ProviderStatus provider={provider} /></div><div className="mt-1 truncate text-xs text-text-muted">{provider.adapterType.replace(/_/g, ' ')} · {provider.baseUrl ?? 'Default API endpoint'}</div></div></div>
              <button onClick={() => setProviderForm(provider)} className="rounded-lg p-2 text-text-muted hover:bg-background-secondary hover:text-text-primary" aria-label={`Edit ${provider.displayName}`}><ShieldCheck className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4"><Metric label="Credential" value={provider.credentialConfigured ? provider.credentialHint ?? 'Configured' : 'Missing'} icon={KeyRound} /><Metric label="Latency" value={provider.latencyMs == null ? 'Not tested' : `${provider.latencyMs} ms`} icon={Gauge} /><Metric label="Models" value={String(provider.models.length)} icon={Sparkles} /><Metric label="Priority" value={String(provider.priority)} icon={Activity} /></div>
            <div className="p-5">
              <div className="mb-3 flex flex-wrap gap-1.5">{provider.capabilities.slice(0, 7).map((capability) => <Badge key={capability} tone="neutral">{capability.replace(/_/g, ' ')}</Badge>)}{provider.capabilities.length > 7 && <Badge tone="neutral">+{provider.capabilities.length - 7}</Badge>}</div>
              {provider.models.length ? <div className="overflow-hidden rounded-lg border border-border"><div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-background-secondary px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted"><span>Model</span><span>Context</span><span>Capabilities</span></div>{provider.models.slice(0, 6).map((model) => <div key={model.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t border-border px-3 py-2.5 text-xs"><div><span className="font-semibold text-text-primary">{model.displayName}</span><span className="ml-2 text-text-muted">{model.modelKey}</span></div><span className="text-text-muted">{model.contextWindow ? compact(model.contextWindow) : '—'}</span><span className="text-text-muted">{model.capabilities.length}</span></div>)}</div> : <div className="rounded-lg border border-dashed border-border-strong p-4 text-center text-xs text-text-muted">No models added yet.</div>}
              <div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="secondary" size="sm" onClick={() => testConnection(provider)} loading={test.isPending}><RefreshCw className="h-3.5 w-3.5" /> Test connection</Button><Button variant="secondary" size="sm" onClick={() => setModelProvider(provider)}><Plus className="h-3.5 w-3.5" /> Add model</Button><Button variant="ghost" size="sm" onClick={() => togglePause(provider)}>{provider.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{provider.paused ? 'Resume' : 'Pause'}</Button>{testResult[provider.id] && <span className="text-xs text-text-muted">{testResult[provider.id]}</span>}</div>
            </div>
          </Card>
        ))}
        {providers.length === 0 && <Card className="col-span-full p-10 text-center"><Cloud className="mx-auto h-8 w-8 text-text-muted" /><h3 className="mt-3 font-semibold text-text-primary">No providers configured</h3><p className="mt-1 text-sm text-text-muted">Add the first provider, then register its available models and capabilities.</p></Card>}
      </div>
      {providerForm && <ProviderDialog initial={providerForm} onClose={() => setProviderForm(null)} onSave={async (payload) => { await saveProvider.mutateAsync(payload); setProviderForm(null); }} loading={saveProvider.isPending} />}
      {modelProvider && <ModelDialog provider={modelProvider} onClose={() => setModelProvider(null)} onSave={async (payload) => { await saveModel.mutateAsync(payload); setModelProvider(null); }} loading={saveModel.isPending} />}
    </div>
  );
}

function ProviderDialog({ initial, onClose, onSave, loading }: { initial: Partial<PetrosAiProviderDto> & { apiKey?: string }; onClose: () => void; onSave: (payload: any) => Promise<void>; loading: boolean }) {
  const [form, setForm] = useState({
    id: initial.id,
    key: initial.key ?? '', displayName: initial.displayName ?? '', adapterType: initial.adapterType ?? 'openai', baseUrl: initial.baseUrl ?? '', apiKey: '',
    enabled: initial.enabled ?? true, paused: initial.paused ?? false, priority: initial.priority ?? 100,
    dailyBudgetUsd: initial.dailyBudgetMicros == null ? '' : String(initial.dailyBudgetMicros / 1_000_000),
    monthlyBudgetUsd: initial.monthlyBudgetMicros == null ? '' : String(initial.monthlyBudgetMicros / 1_000_000),
    capabilities: initial.capabilities ?? ['text', 'structured_output'], metadata: initial.metadata ?? {}, version: initial.version ?? 0,
  });
  const [error, setError] = useState('');
  async function submit() {
    if (looksLikeProviderCredential(form.key)) {
      setError('That looks like a secret API key. Use a public identifier such as "groq" here, then paste the secret into the encrypted API key field.');
      return;
    }
    try { await onSave({ id: form.id, key: form.key, displayName: form.displayName, adapterType: form.adapterType, baseUrl: form.baseUrl || null, apiKey: form.apiKey || undefined, enabled: form.enabled, paused: form.paused, priority: Number(form.priority), dailyBudgetMicros: form.dailyBudgetUsd === '' ? null : Math.round(Number(form.dailyBudgetUsd) * 1_000_000), monthlyBudgetMicros: form.monthlyBudgetUsd === '' ? null : Math.round(Number(form.monthlyBudgetUsd) * 1_000_000), capabilities: form.capabilities, metadata: form.metadata, version: form.version, reason: form.id ? 'Update Petros provider configuration' : 'Add Petros provider' }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save provider.'); }
  }
  return <Overlay title={form.id ? 'Edit provider' : 'Add provider'} onClose={onClose}><div className="grid gap-4 sm:grid-cols-2"><Field label="Display name" value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} /><Field label="Provider identifier (public)" value={form.key} onChange={(key) => setForm({ ...form, key: key.toLowerCase().replace(/\s+/g, '-') })} placeholder="e.g. groq" hint="A short public slug—not the API key." /><div><Label>Adapter family</Label><Select value={form.adapterType} onChange={(e) => setForm({ ...form, adapterType: e.target.value })} options={ADAPTERS} /></div><Field label="Base URL (optional)" value={form.baseUrl} onChange={(baseUrl) => setForm({ ...form, baseUrl })} placeholder="Use provider default" /><Field label={form.id ? 'Rotate secret API key' : 'Secret API key (encrypted)'} value={form.apiKey} onChange={(apiKey) => setForm({ ...form, apiKey })} type="password" placeholder={form.id ? 'Leave blank to keep current' : 'Paste the provider secret here'} hint="Encrypted on the server and never returned by the API." /><Field label="Priority" value={String(form.priority)} onChange={(priority) => setForm({ ...form, priority: Number(priority) })} type="number" /><Field label="Daily budget (USD)" value={form.dailyBudgetUsd} onChange={(dailyBudgetUsd) => setForm({ ...form, dailyBudgetUsd })} type="number" placeholder="No limit" /><Field label="Monthly budget (USD)" value={form.monthlyBudgetUsd} onChange={(monthlyBudgetUsd) => setForm({ ...form, monthlyBudgetUsd })} type="number" placeholder="No limit" /></div><CapabilityPicker values={form.capabilities} onChange={(capabilities) => setForm({ ...form, capabilities })} /><div className="mt-4 flex gap-4"><CheckLabel checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} label="Enabled" /><CheckLabel checked={form.paused} onChange={(paused) => setForm({ ...form, paused })} label="Paused" /></div>{error && <p className="mt-3 text-sm text-danger">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={loading} disabled={!form.displayName || !form.key}><ShieldCheck className="h-4 w-4" /> Save provider</Button></div></Overlay>;
}

function ModelDialog({ provider, onClose, onSave, loading }: { provider: PetrosAiProviderDto; onClose: () => void; onSave: (payload: any) => Promise<void>; loading: boolean }) {
  const [form, setForm] = useState({ modelKey: '', displayName: '', contextWindow: '', maxOutputTokens: '', inputUsd: '', outputUsd: '', cachedUsd: '', capabilities: provider.capabilities, custom: true });
  const [error, setError] = useState('');
  async function submit() { try { await onSave({ providerId: provider.id, modelKey: form.modelKey, displayName: form.displayName || form.modelKey, enabled: true, custom: form.custom, capabilities: form.capabilities, contextWindow: form.contextWindow ? Number(form.contextWindow) : null, maxOutputTokens: form.maxOutputTokens ? Number(form.maxOutputTokens) : null, pricing: { inputPerMillionMicros: usdMicros(form.inputUsd), outputPerMillionMicros: usdMicros(form.outputUsd), cachedInputPerMillionMicros: usdMicros(form.cachedUsd) }, providerOptions: {}, version: 0, reason: 'Add model to Petros provider' }); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save model.'); } }
  return <Overlay title={`Add model · ${provider.displayName}`} onClose={onClose}><div className="grid gap-4 sm:grid-cols-2"><Field label="Model ID" value={form.modelKey} onChange={(modelKey) => setForm({ ...form, modelKey })} placeholder="e.g. gemini-2.5-flash" hint="The provider's model name, not a credential." /><Field label="Display name" value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} placeholder="Shown only to admins" /><Field label="Context window" value={form.contextWindow} onChange={(contextWindow) => setForm({ ...form, contextWindow })} type="number" /><Field label="Maximum output tokens" value={form.maxOutputTokens} onChange={(maxOutputTokens) => setForm({ ...form, maxOutputTokens })} type="number" /><Field label="Input / 1M tokens (USD)" value={form.inputUsd} onChange={(inputUsd) => setForm({ ...form, inputUsd })} type="number" /><Field label="Output / 1M tokens (USD)" value={form.outputUsd} onChange={(outputUsd) => setForm({ ...form, outputUsd })} type="number" /><Field label="Cached input / 1M (USD)" value={form.cachedUsd} onChange={(cachedUsd) => setForm({ ...form, cachedUsd })} type="number" /></div><CapabilityPicker values={form.capabilities} onChange={(capabilities) => setForm({ ...form, capabilities })} />{error && <p className="mt-3 text-sm text-danger">{error}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={loading} disabled={!form.modelKey}><Plus className="h-4 w-4" /> Add model</Button></div></Overlay>;
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-xl"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-primary">Petros provider management</div><h3 className="mt-1 text-lg font-semibold text-text-primary">{title}</h3></div><button onClick={onClose} className="rounded-lg p-2 text-text-muted hover:bg-background-secondary"><X className="h-4 w-4" /></button></div>{children}</div></div>; }
function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Gauge }) { return <div className="bg-background-secondary/70 p-3"><div className="flex items-center gap-1 text-[11px] text-text-muted"><Icon className="h-3 w-3" /> {label}</div><div className="mt-1 truncate text-xs font-semibold text-text-primary">{value}</div></div>; }
function ProviderStatus({ provider }: { provider: PetrosAiProviderDto }) { const status = provider.paused ? 'Paused' : !provider.enabled ? 'Disabled' : provider.healthStatus === 'healthy' ? 'Healthy' : provider.healthStatus === 'down' ? 'Unavailable' : 'Not tested'; const tone = status === 'Healthy' ? 'success' : status === 'Unavailable' ? 'danger' : status === 'Paused' ? 'warning' : 'neutral'; return <Badge tone={tone} dot>{status}</Badge>; }
function Field({ label, value, onChange, type = 'text', placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; hint?: string }) { return <div><Label>{label}</Label><Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />{hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}</div>; }
function CapabilityPicker({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) { return <div className="mt-5"><Label>Capabilities</Label><div className="flex flex-wrap gap-2">{CAPABILITIES.map((capability) => <button key={capability} type="button" onClick={() => onChange(values.includes(capability) ? values.filter((item) => item !== capability) : [...values, capability])} className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', values.includes(capability) ? 'border-primary bg-primary-soft text-primary' : 'border-border text-text-muted')}>{capability.replace(/_/g, ' ')}</button>)}</div></div>; }
function CheckLabel({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) { return <label className="flex items-center gap-2 text-sm font-semibold text-text-primary"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" /> {label}</label>; }
function compact(value: number) { return new Intl.NumberFormat('en', { notation: 'compact' }).format(value); }
function usdMicros(value: string) { return value === '' ? undefined : Math.round(Number(value) * 1_000_000); }
function looksLikeProviderCredential(value: string) { return /^(?:sk[-_]|gsk_|aiza|aq\.)/i.test(value.trim()); }
