'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMe, useGet } from '@/lib/hooks';
import { Card, Skeleton } from '@/components/ui';
import { CalendarCheck, GraduationCap, HeartPulse, Award, Bus, BookOpen, BedDouble, ShieldCheck, FileText, MessageCircleHeart } from 'lucide-react';

const items = [
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'results', label: 'Results & Exams', icon: GraduationCap },
  { key: 'health', label: 'Health', icon: HeartPulse },
  { key: 'behavior', label: 'Behaviour & Awards', icon: Award },
  { key: 'transport', label: 'Transport', icon: Bus },
  { key: 'library', label: 'Library', icon: BookOpen },
  { key: 'hostel', label: 'Hostel', icon: BedDouble, boarderOnly: true },
  { key: 'pickup', label: 'Pickup & Gate', icon: ShieldCheck },
  { key: 'documents', label: 'Documents', icon: FileText },
] as const;

export default function ChildHub() {
  const { studentId } = useParams<{ studentId: string }>();
  const { data: me } = useMe();
  const child = me?.children.find((c) => c.studentId === studentId);
  const disclosure = useGet<{ counselorDisplayName: string; contactNote: string }>(`/students/${studentId}/counseling-disclosure`, { retry: false });

  if (!me) return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-full bg-brand/15 text-brand text-lg font-bold grid place-items-center">{child?.firstName[0]}</span>
        <div>
          <h1 className="text-lg font-bold">{child?.firstName} {child?.lastName}</h1>
          <p className="text-sm text-muted">{child?.className} · {child?.admissionNo}</p>
        </div>
      </div>

      {child?.hiddenSections && child.hiddenSections.length > 0 && (
        <Card className="bg-canvas border-line text-xs text-muted">Some sections are not shown for your account: {child.hiddenSections.join(', ')}.</Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items
          .filter((it) => !('boarderOnly' in it && it.boarderOnly) || child?.isBoarder)
          .filter((it) => !child?.hiddenSections?.includes(it.key))
          .map((it) => (
            <Link key={it.key} href={`/child/${studentId}/${it.key}`}>
              <Card className="flex flex-col gap-2 h-24 justify-center">
                <it.icon className="text-brand" size={22} />
                <span className="text-sm font-semibold">{it.label}</span>
              </Card>
            </Link>
          ))}
      </div>

      {disclosure.data && (
        <Card className="bg-brand/5 border-brand/30">
          <div className="flex items-start gap-3">
            <MessageCircleHeart className="text-brand shrink-0" size={20} />
            <div>
              <p className="font-semibold text-sm">Counselor contact</p>
              <p className="text-sm">{disclosure.data.counselorDisplayName}</p>
              <p className="text-sm text-muted mt-0.5">{disclosure.data.contactNote}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
