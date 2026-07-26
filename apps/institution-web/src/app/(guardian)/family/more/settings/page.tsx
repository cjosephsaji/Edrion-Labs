'use client';
import { useMe, usePost } from '@/lib/guardian/hooks';
import { Card, Section, Skeleton } from '@/components/guardian/ui';
import { Select } from '@edrion/ui';

const CHANNELS = ['email', 'push', 'sms', 'whatsapp'] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SettingsPage() {
  const me = useMe();
  const save = usePost<Record<string, unknown>>('/preferences', ['/me']);
  if (me.isLoading) return <Skeleton className="h-64" />;
  const prefs = me.data?.preferences;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Settings</h1>

      <Section title="Notification channels">
        <Card className="space-y-3">
          {CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center justify-between">
              <span className="text-sm capitalize">{ch}</span>
              <input
                type="checkbox"
                defaultChecked={!!prefs?.channels?.[ch]}
                onChange={(e) => save.mutate({ channels: { [ch]: e.target.checked } })}
                className="w-5 h-5 accent-brand"
              />
            </label>
          ))}
        </Card>
      </Section>

      <Section title="Weekly digest">
        <Card className="space-y-2">
          <label className="flex items-center justify-between">
            <span className="text-sm">Digest enabled</span>
            <input type="checkbox" defaultChecked={prefs?.digestEnabled} onChange={(e) => save.mutate({ digestEnabled: e.target.checked })} className="w-5 h-5 accent-brand" />
          </label>
          <div>
            <p className="text-sm mb-1">Digest day</p>
            <Select value={String(prefs?.digestDay ?? 1)} onChange={(e) => save.mutate({ digestDay: Number(e.target.value) })} className="w-full rounded-xl" options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
          </div>
        </Card>
      </Section>

      <Section title="Quiet hours">
        <Card>
          <p className="text-xs text-muted">Safety and medical alerts always come through, even during quiet hours.</p>
        </Card>
      </Section>

      <p className="text-center text-sm text-muted py-4">Signed in as {me.data?.guardian.email}</p>
    </div>
  );
}
