export interface CalendarEventRow {
  id: string;
  version: number;
  kind: 'exam' | 'holiday' | 'event';
  title: string;
  detail: string | null;
  startsOn: string;
  endsOn: string | null;
  timeLabel: string | null;
  audience: Record<string, unknown>;
  status: 'draft' | 'published';
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
}
