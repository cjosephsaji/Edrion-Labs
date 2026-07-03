'use client';
import { useState } from 'react';
import { useGet, usePost } from '@/lib/hooks';
import { Card, Pill, Skeleton, EmptyState, Button } from '@/components/ui';
import { AlertOctagon } from 'lucide-react';

const TABS = ['Alerts', 'Notices', 'Messages', 'Consents'] as const;
type Tab = (typeof TABS)[number];

export default function InboxPage() {
  const [tab, setTab] = useState<Tab>('Alerts');
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Inbox</h1>
      <div className="flex gap-1 bg-line/50 rounded-xl p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${tab === t ? 'bg-surface shadow-sm text-brand' : 'text-muted'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Alerts' && <Alerts />}
      {tab === 'Notices' && <Notices />}
      {tab === 'Messages' && <Messages />}
      {tab === 'Consents' && <Consents />}
    </div>
  );
}

function Alerts() {
  const { data, isLoading } = useGet<{ items: Array<{ id: string; type: string; title: string; body: string | null; deepLink: string | null; readAt: string | null }> }>('/notifications');
  const read = usePost<{ id: string }>((b) => `/notifications/${b.id}/read`, ['/notifications', '/me']);
  if (isLoading) return <Skeleton className="h-40" />;
  const emergency = data?.items.find((i) => i.type === 'emergency_broadcast' && !i.readAt);
  return (
    <div className="space-y-2">
      {emergency && (
        <Card className="bg-bad/10 border-bad/40">
          <div className="flex items-start gap-2"><AlertOctagon className="text-bad shrink-0" size={20} /><div><p className="font-bold text-bad text-sm">{emergency.title}</p><p className="text-sm">{emergency.body}</p></div></div>
        </Card>
      )}
      {data?.items.length ? data.items.map((n) => (
        <a key={n.id} href={n.deepLink ?? '#'} onClick={() => read.mutate({ id: n.id })}>
          <Card className={n.readAt ? '' : 'border-brand/40'}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-sm font-medium">{n.title}</p>{n.body && <p className="text-xs text-muted">{n.body}</p>}</div>
              {!n.readAt && <span className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />}
            </div>
          </Card>
        </a>
      )) : <EmptyState title="No notifications" />}
    </div>
  );
}

function Notices() {
  const { data, isLoading } = useGet<{ items: Array<{ id: string; title: string; body: string; priority: string; requiresAcknowledgement: boolean; read: boolean; acknowledged: boolean }> }>('/notices');
  const ack = usePost<{ id: string }>((b) => `/notices/${b.id}/acknowledge`, ['/notices', '/me']);
  const read = usePost<{ id: string }>((b) => `/notices/${b.id}/read`, ['/notices', '/me']);
  if (isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-2">
      {data?.items.length ? data.items.map((n) => (
        <Card key={n.id} className={n.read ? '' : 'border-brand/40'} >
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">{n.title}</p>{n.priority === 'important' && <Pill tone="warn">Important</Pill>}</div>
          <p className="text-sm text-muted mt-1">{n.body}</p>
          <div className="mt-2">
            {n.requiresAcknowledgement
              ? (n.acknowledged ? <Pill tone="good">Acknowledged</Pill> : <Button variant="ghost" disabled={ack.isPending} onClick={() => ack.mutate({ id: n.id })}>Acknowledge</Button>)
              : (!n.read && <Button variant="ghost" onClick={() => read.mutate({ id: n.id })}>Mark read</Button>)}
          </div>
        </Card>
      )) : <EmptyState title="No notices" />}
    </div>
  );
}

function Messages() {
  const { data, isLoading } = useGet<{ items: Array<{ id: string; subject: string; category: string; status: string }> }>('/messages/threads');
  if (isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-2">
      {data?.items.length ? data.items.map((t) => (
        <Card key={t.id} className="flex items-center justify-between">
          <div><p className="text-sm font-medium">{t.subject}</p><p className="text-xs text-muted">{t.category.replace(/_/g, ' ')}</p></div>
          <Pill tone={t.status === 'answered' ? 'good' : t.status === 'closed' ? 'neutral' : 'brand'}>{t.status}</Pill>
        </Card>
      )) : <EmptyState title="No messages" hint="Start a conversation from More › Message the school." />}
    </div>
  );
}

function Consents() {
  const { data, isLoading } = useGet<{ items: Array<{ id: string; title: string; description: string | null; responses: Array<{ studentId: string; response: string }> }> }>('/consents');
  const me = useGet<{ children: Array<{ studentId: string; firstName: string }> }>('/me');
  const respond = usePost<{ id: string; studentId: string; response: string }>((b) => `/consents/${b.id}/respond`, ['/consents', '/me']);
  if (isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-2">
      {data?.items.length ? data.items.map((c) => (
        <Card key={c.id} className="space-y-2">
          <p className="text-sm font-semibold">{c.title}</p>
          {c.description && <p className="text-xs text-muted">{c.description}</p>}
          {me.data?.children.map((ch) => {
            const done = c.responses.find((r) => r.studentId === ch.studentId);
            return (
              <div key={ch.studentId} className="flex items-center justify-between">
                <span className="text-sm">{ch.firstName}</span>
                {done ? <Pill tone="good">{done.response}</Pill> : (
                  <span className="flex gap-2">
                    <button className="text-good text-sm font-semibold" onClick={() => respond.mutate({ id: c.id, studentId: ch.studentId, response: 'yes' })}>Yes</button>
                    <button className="text-bad text-sm font-semibold" onClick={() => respond.mutate({ id: c.id, studentId: ch.studentId, response: 'no' })}>No</button>
                  </span>
                )}
              </div>
            );
          })}
        </Card>
      )) : <EmptyState title="No pending consents" />}
    </div>
  );
}
