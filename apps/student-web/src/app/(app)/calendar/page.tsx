'use client';
import { useCalendar } from '@/lib/hooks';
import { MonthGrid, AgendaList } from '@/components/institutional/MonthGrid';
import { CountdownCard } from '@/components/institutional/CountdownCard';
import { Card } from '@/components/ui/card';

export default function CalendarPage() {
  const { data, isLoading } = useCalendar();

  const todayEvents = data?.days.find((d) => d.date === new Date().toISOString().slice(0, 10))?.events ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <h1 className="font-display text-2xl font-semibold text-st-ink">Calendar</h1>

      {isLoading ? (
        <div className="mt-8 h-48 shimmer rounded-2xl" />
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

          <Card className="mt-6">
            <MonthGrid days={data?.days ?? []} />
          </Card>

          <div className="mt-6">
            <p className="text-xs font-semibold text-st-faint">TODAY</p>
            <div className="mt-2">
              <AgendaList events={todayEvents} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
