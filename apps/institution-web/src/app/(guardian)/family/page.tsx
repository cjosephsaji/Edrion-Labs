'use client';
import Link from 'next/link';
import { useMe, useDashboard } from '@/lib/guardian/hooks';
import { money } from '@/lib/guardian/api';
import { resolveGuardianDeepLink } from '@/lib/guardian/paths';
import { Card, Section, Pill, Skeleton, EmptyState, ErrorState } from '@/components/guardian/ui';
import { AlertTriangle, ArrowRight, Award, CalendarDays, CreditCard, MessageSquareText, ShieldCheck, Trophy } from 'lucide-react';

export default function HomePage() {
  const me = useMe();
  const child = me.data?.children[0];
  const dash = useDashboard(child?.studentId);

  if (me.isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-32" /><Skeleton className="h-24" /></div>;
  if (me.error) return <ErrorState message={(me.error as Error).message} />;
  if (!child) return <EmptyState title="No children linked" hint="Contact your institution to link your account to your child." />;

  const d = dash.data;
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-soft">
        <p className="text-sm text-muted">Hello{me.data ? `, ${me.data.guardian.fullName.split(' ')[0]}` : ''}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{child.firstName} {child.lastName}</h1>
        <p className="mt-1 text-sm font-medium text-muted">{child.className}</p>
      </div>

      {dash.isLoading && <Skeleton className="h-40" />}

      {d && d.needsAttention.length > 0 && (
        <Section title="Needs your attention">
          <div className="space-y-2">
            {d.needsAttention.map((n, i) => (
              <Link key={i} href={resolveGuardianDeepLink(n.deepLink)}>
                <Card className="flex items-start gap-3 border-warn/40 bg-warn/5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn/10 text-warn">
                    <AlertTriangle size={18} />
                  </span>
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
        <div className={`grid gap-3 ${!child.hiddenSections?.includes('attendance') && d.attendance ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {!child.hiddenSections?.includes('attendance') && d.attendance ? (
            <Link href={`/family/child/${child.studentId}/attendance`}>
              <Card className="min-h-[116px]">
                <span className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand">
                  <ShieldCheck size={18} />
                </span>
                <p className="text-xs text-muted">Attendance (30d)</p>
                <p className="text-2xl font-bold">{d.attendance.last30Pct ?? '—'}%</p>
              </Card>
            </Link>
          ) : null}
          <Link href="/family/fees">
            <Card className="min-h-[116px]">
              <span className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand">
                <CreditCard size={18} />
              </span>
              <p className="text-xs text-muted">Outstanding fees</p>
              <p className="text-2xl font-bold">{money(d.outstandingFees.totalMinor)}</p>
            </Card>
          </Link>
        </div>
      )}

      {d && d.recognitions.length > 0 && (
        <Section title="Celebrate">
          <Card className="bg-brand/5 border-brand/30">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand/10 text-brand">
                <Trophy size={22} />
              </span>
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
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                <MessageSquareText size={18} />
              </span>
              <p className="text-sm">{p.text}</p>
            </Card>
          ))}
        </Section>
      )}

      {d && d.notices.length > 0 && (
        <Section title="Latest notices" action={<Link href="/family/inbox" className="text-xs text-brand">All</Link>}>
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
        <Link href="/family/more/ptm">
          <Card className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
              <CalendarDays size={18} />
            </span>
            <div><p className="text-sm font-semibold">{d.activePtm.title}</p><p className="text-xs text-muted">Book a slot</p></div>
          </Card>
        </Link>
      )}

      <Link href={`/family/child/${child.studentId}`} className="block">
        <Card className="flex items-center justify-between">
          <span className="font-semibold text-brand flex items-center gap-2"><Award size={18} /> Open {child.firstName}’s full hub</span>
          <ArrowRight className="h-4 w-4 text-muted" />
        </Card>
      </Link>
    </div>
  );
}
