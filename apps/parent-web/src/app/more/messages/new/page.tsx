'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMe, usePost } from '@/lib/hooks';
import { Card, Button, Skeleton } from '@/components/ui';

const CATEGORIES = ['general', 'callback_request', 'class_teacher_note', 'fees_query', 'transport_query', 'health_query'];

export default function NewMessagePage() {
  const me = useMe();
  const router = useRouter();
  const create = usePost<{ studentId: string; category: string; subject: string; body: string }>('/messages/threads', ['/messages/threads']);
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState('general');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  if (me.isLoading) return <Skeleton className="h-64" />;
  const sid = studentId || me.data?.children[0]?.studentId || '';

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Message the school</h1>
      <Card className="space-y-3">
        <select value={sid} onChange={(e) => setStudentId(e.target.value)} className="w-full rounded-xl border border-line px-3 py-3 text-sm">
          {me.data?.children.map((c) => <option key={c.studentId} value={c.studentId}>{c.firstName} {c.lastName}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-line px-3 py-3 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
        </select>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded-xl border border-line px-3 py-3 text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your message…" rows={4} className="w-full rounded-xl border border-line px-3 py-3 text-sm" />
        <Button
          disabled={create.isPending || !subject || !body}
          onClick={() => create.mutate({ studentId: sid, category, subject, body }, { onSuccess: () => router.push('/inbox') })}
        >
          {create.isPending ? 'Sending…' : 'Send message'}
        </Button>
      </Card>
    </div>
  );
}
