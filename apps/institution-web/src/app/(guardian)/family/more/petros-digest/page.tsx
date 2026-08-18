'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookHeart, Eye, Languages, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { useMe } from '@/lib/guardian/hooks';
import { api, ApiError } from '@/lib/guardian/api';
import { Button, Card, EmptyState, ErrorState, Pill, Section, Skeleton } from '@/components/guardian/ui';

type Digest = {
  id: string;
  studentId: string;
  sourcePeriod: { start: string; end: string };
  language: string;
  status: string;
  content: { sourcePeriod: { start: string; end: string }; language: string; uncertainty: string; sections: Array<{ key: string; heading: string; body: string }>; privacyNotice: string };
  rawContentExcluded: true;
  deliveredAt: string | null;
  errorCode: string | null;
};
type DigestPreference = { studentId: string; optedOut: boolean; language: string; deliveryChannels: Array<'portal' | 'email'> };

export default function PetrosDigestPage() {
  const me = useMe();
  const student = me.data?.children[0];
  const [digests, setDigests] = useState<Digest[]>([]);
  const [preview, setPreview] = useState<Digest | null>(null);
  const [optedOut, setOptedOut] = useState(false);
  const [language, setLanguage] = useState('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const period = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86_400_000);
    return { periodStart: start.toISOString(), periodEnd: end.toISOString() };
  }, []);

  const load = useCallback(async (studentId: string) => {
    try {
      const [nextDigests, preference] = await Promise.all([
        api.get<Digest[]>(`/petros/students/${studentId}/digests`),
        api.get<DigestPreference>(`/petros/students/${studentId}/digest-preferences`),
      ]);
      setDigests(nextDigests);
      setOptedOut(preference.optedOut);
      setLanguage(preference.language);
    }
    catch (caught) { setError(errorMessage(caught)); }
  }, []);
  useEffect(() => { if (student) void load(student.studentId); }, [load, student]);

  async function savePreference(nextOptedOut = optedOut) {
    if (!student) return;
    setBusy(true); setError('');
    try {
      await api.put('/petros/digest-preferences', { studentId: student.studentId, optedOut: nextOptedOut, language, deliveryChannels: ['portal'] });
      setOptedOut(nextOptedOut); setMessage(nextOptedOut ? 'Petros digests are opted out.' : 'Digest preferences saved.');
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }
  async function command(action: 'preview' | 'send' | 'retry' | 'cancel', digestId?: string) {
    if (!student) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const row = await api.post<Digest | { status: 'opted_out'; message: string }>('/petros/digests', { studentId: student.studentId, ...period, language, action, ...(digestId ? { digestId } : {}), idempotencyKey: crypto.randomUUID() });
      if ('message' in row) setMessage(row.message);
      else { if (action === 'preview') setPreview(row); setMessage(action === 'send' ? 'Digest queued for the selected delivery channel.' : `Digest ${action} updated.`); }
      await load(student.studentId);
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  if (me.isLoading) return <Skeleton className="h-96" />;
  if (me.error) return <ErrorState message={(me.error as Error).message} />;
  if (!student) return <EmptyState title="No child linked" hint="Your institution must link a child before a digest can be shown." />;
  const shown = preview ?? digests[0] ?? null;
  return <div className="space-y-5">
    <div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand"><BookHeart size={16} /> Petros learning digest</p><h1 className="mt-1 text-xl font-bold">A limited learning summary for {student.firstName}</h1><p className="mt-1 text-sm text-muted">It covers the named source period and never includes raw sessions, private questions, calibration judgements, teacher-only notes or ability labels.</p></div>
    {error ? <div role="alert"><ErrorState message={error} /></div> : null}{message ? <Card className="border-brand/30 bg-brand/5" ><p role="status" className="text-sm">{message}</p></Card> : null}
    <Section title="Preferences and privacy"><Card className="space-y-4"><label className="flex items-center justify-between gap-3"><span><b className="block text-sm">Receive Petros digests</b><span className="text-xs text-muted">Portal delivery only in this fixture</span></span><input aria-label="Receive Petros digests" type="checkbox" checked={!optedOut} onChange={(event) => void savePreference(!event.target.checked)} className="h-5 w-5 accent-brand" /></label><label className="block text-sm"><span className="flex items-center gap-2"><Languages size={16} /> Digest language</span><select value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-card px-3"><option value="en">English</option><option value="hi">Hindi</option></select></label><Button variant="ghost" disabled={busy} onClick={() => void savePreference()}>{busy ? 'Saving…' : 'Save preferences'}</Button></Card></Section>
    <Section title="Preview and send"><Card className="space-y-3"><p className="text-xs text-muted">Source period: {new Date(period.periodStart).toLocaleDateString()} – {new Date(period.periodEnd).toLocaleDateString()} · uncertainty is always stated.</p><div className="grid gap-2 sm:grid-cols-2"><Button variant="ghost" disabled={busy || optedOut} onClick={() => void command('preview')}><span className="flex items-center justify-center gap-2"><Eye size={16} /> Preview</span></Button><Button disabled={busy || optedOut} onClick={() => void command('send')}><span className="flex items-center justify-center gap-2"><Send size={16} /> Send</span></Button></div></Card></Section>
    {shown ? <DigestCard digest={shown} onRetry={() => void command('retry', shown.id)} onCancel={() => void command('cancel', shown.id)} busy={busy} /> : <EmptyState icon={<ShieldCheck />} title="No digest yet" hint="Preview the current period to inspect exactly what is permitted." />}
    <Section title="History"><div className="space-y-2">{digests.map((row) => <Card key={row.id} className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{new Date(row.sourcePeriod.start).toLocaleDateString()} – {new Date(row.sourcePeriod.end).toLocaleDateString()}</p><p className="text-xs text-muted">{row.language} · {row.deliveredAt ? `delivered ${new Date(row.deliveredAt).toLocaleString()}` : row.status}</p></div><Pill tone={row.status === 'delivered' ? 'good' : row.status === 'failed' ? 'bad' : 'neutral'}>{row.status}</Pill></Card>)}</div></Section>
  </div>;
}

function DigestCard({ digest, onRetry, onCancel, busy }: { digest: Digest; onRetry: () => void; onCancel: () => void; busy: boolean }) {
  return <Section title="Digest content"><Card className="space-y-4"><div className="flex items-center justify-between gap-3"><Pill tone="brand">{digest.status}</Pill><span className="text-xs text-muted">{digest.language}</span></div>{digest.content.sections.map((section) => <div key={section.key}><h2 className="text-sm font-semibold capitalize">{section.heading}</h2><p className="mt-1 text-sm text-muted">{section.body}</p></div>)}<p className="rounded-xl bg-line/30 p-3 text-xs text-muted">Uncertainty: {digest.content.uncertainty}</p><p className="text-xs text-muted">{digest.content.privacyNotice}</p>{digest.status === 'failed' ? <Button variant="ghost" disabled={busy} onClick={onRetry}><span className="flex items-center justify-center gap-2"><RefreshCw size={16} /> Retry delivery</span></Button> : null}{['preview','queued','failed'].includes(digest.status) ? <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button> : null}</Card></Section>;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? `${error.message}${error.correlationId ? ` (reference ${error.correlationId})` : ''}` : error instanceof Error ? error.message : 'The digest request failed.';
}
