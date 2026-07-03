'use client';
import Link from 'next/link';
import { useMe, useDashboard } from '@/lib/hooks';
import { money } from '@/lib/api';
import { Card, Section, Pill, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { AlertTriangle, Award, CalendarDays, MessageSquareText, Trophy } from 'lucide-react';

export default function HomePage() {
  const me = useMe();
  const child = me.data?.children[0];
  const dash = useDashboard(child?.studentId);

  if (me.isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-32" /><Skeleton className="h-24" /></div>;
  if (me.error) return <ErrorState message={(me.error as Error).message} />;
  if (!child) return <EmptyState title="No children linked" hint="Ask your school to link your account to your child." />;

  const d = dash.data;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">Hello{me.data ? `, ${me.data.guardian.fullName.split(' ')[0]}` : ''} 👋</p>
        <h1 className="text-xl font-bold">{child.firstName} {child.lastName} · <span className="text-muted font-medium">{child.className}</span></h1>
      </div>

      {dash.isLoading && <Skeleton className="h-40" />}

      {d && d.needsAttention.length > 0 && (
        <Section title="Needs your attention">
          <div className="space-y-2">
            {d.needsAttention.map((n, i) => (
              <Link key={i} href={n.deepLink ?? '#'}>
                <Card className="flex items-start gap-3 border-warn/40 bg-warn/5">
                  <AlertTriangle className="text-warn shrink-0 mt-0.5" size={20} />
                  <div>
                    <p className="font-semibold text-sm">{n.title}</p>
                    {n.detail && <p className="text-sm text-muted">{n.detail}</p>}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {d && (
        <div className="grid grid-cols-2 gap-3">
          <Link href={`/child/${child.studentId}/attendance`}>
            <Card>
              <p className="text-xs text-muted">Attendance (30d)</p>
              <p className="text-2xl font-bold">{d.attendance.last30Pct ?? '—'}%</p>
            </Card>
          </Link>
          <Link href="/fees">
            <Card>
              <p className="text-xs text-muted">Outstanding fees</p>
              <p className="text-2xl font-bold">{money(d.outstandingFees.totalMinor)}</p>
            </Card>
          </Link>
        </div>
      )}

      {d && d.recognitions.length > 0 && (
        <Section title="Celebrate 🎉">
          <Card className="bg-brand/5 border-brand/30">
            <div className="flex items-center gap-3">
              <Trophy className="text-brand" size={24} />
              <div>
                <p className="font-semibold">{d.recognitions[0]!.title}</p>
                <Pill tone="brand">{d.recognitions[0]!.type}</Pill>
              </div>
            </div>
          </Card>
        </Section>
      )}

      {d && d.conversationPrompts.length > 0 && (
        <Section title="Talk about">
          {d.conversationPrompts.map((p, i) => (
            <Card key={i} className="flex items-center gap-3">
              <MessageSquareText className="text-brand shrink-0" size={20} />
              <p className="text-sm">{p.text}</p>
            </Card>
          ))}
        </Section>
      )}

      {d && d.notices.length > 0 && (
        <Section title="Latest notices" action={<Link href="/inbox" className="text-xs text-brand">All</Link>}>
          <div className="space-y-2">
            {d.notices.slice(0, 3).map((n) => (
              <Card key={n.id} className="flex items-center justify-between">
                <p className="text-sm font-medium">{n.title}</p>
                {n.priority === 'important' && <Pill tone="warn">Important</Pill>}
              </Card>
            ))}
          </div>
        </Section>
      )}

      {d && d.activePtm && (
        <Link href="/more/ptm">
          <Card className="flex items-center gap-3">
            <CalendarDays className="text-brand" size={20} />
            <div><p className="text-sm font-semibold">{d.activePtm.title}</p><p className="text-xs text-muted">Book a slot</p></div>
          </Card>
        </Link>
      )}

      <Link href={`/child/${child.studentId}`} className="block">
        <Card className="flex items-center justify-between">
          <span className="font-semibold text-brand flex items-center gap-2"><Award size={18} /> Open {child.firstName}’s full hub</span>
          <span className="text-muted">›</span>
        </Card>
      </Link>
    </div>
  );
}
