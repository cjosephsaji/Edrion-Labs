export interface CalendarEventRow {
  id: string;
  version: number;
  eventTypeId: string | null;
  type: string;
  title: string;
  description: string | null;
  startsOn: string;
  endsOn: string | null;
  startTime: string | null;
  endTime: string | null;
  status: 'draft' | 'published';
  createdAt: string;
}

export interface CalendarEventTypeRow {
  id: string;
  key: string;
  label: string;
  color: string;
  isSystem: boolean;
  version: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
}
