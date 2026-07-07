'use client';
import { useCalendar } from '@/lib/hooks';
import { MonthGrid, AgendaList } from '@/components/institutional/MonthGrid';
import { CountdownCard } from '@/components/institutional/CountdownCard';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function CalendarPage() {
  const { data, isLoading } = useCalendar();

  const todayEvents = data?.days.find((d) => d.date === new Date().toISOString().slice(0, 10))?.events ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        eyebrow={<Eyebrow>CALENDAR</Eyebrow>}
        title="Calendar"
        subtitle="Exams, due dates, and your school schedule in one view."
      />

      {isLoading ? (
        <div className="mt-8 h-48 shimmer rounded-[15px]" />
      ) : (
        <>
          {data?.nextExam && (
            <div className="mt-6">
              <CountdownCard
                days={data.nextExam.days}
                dateLabel={data.nextExam.dateLabel}
                title={data.nextExam.title}
                sub={data.nextExam.sub}
              />
            </div>
          )}

          <Card className="mt-6" eyebrow="MONTH" noPadding>
            <div className="p-4">
              <MonthGrid days={data?.days ?? []} />
            </div>
          </Card>

          <div className="mt-6">
            <Eyebrow>TODAY</Eyebrow>
            {todayEvents.length > 0 ? (
              <div className="mt-3 rounded-[15px] border border-st-bd1 bg-st-card p-4">
                <AgendaList events={todayEvents} />
              </div>
            ) : (
              <EmptyState
                className="mt-3"
                eyebrow="CLEAR DAY"
                title="Nothing on today"
                description="Events from homework, exams, and your timetable appear here."
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
