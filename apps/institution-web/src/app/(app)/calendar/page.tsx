'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Settings2 } from 'lucide-react';
import {
  Button,
  Dialog,
  Input,
  Label,
  MonthGrid,
  Select,
  WeekGrid,
  addDays,
  addMonths,
  addWeeks,
  startOfWeek,
  toISODate,
  useToast,
  type MonthGridItem,
} from '@edrion/ui';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/app-shell/topbar';
import { usePortalClient, formatPortalError } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type { InstitutionScope } from '@/lib/types';
import type { CalendarEventTypeRow } from '@/lib/calendar-events-types';
import { usePermissions } from '@/lib/permissions';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

interface CalendarItemDto {
  id: string;
  source: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  typeKey: string | null;
  color: string | null;
  detail: string | null;
  editable: boolean;
  href: string | null;
  meta: Record<string, unknown>;
}

type ViewMode = 'month' | 'week' | 'agenda';

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function monthEnd(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return toISODate(new Date(y, m, 0));
}

export default function CalendarPage() {
  const router = useRouter();
  const client = usePortalClient();
  const { scope, activeLabel } = useScope();
  const { can } = usePermissions();
  const canManage = can('calendar_events.manage');
  const { say } = useToast();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => toISODate(new Date()));
  const [view, setView] = useState<ViewMode>('month');
  const [sources, setSources] = useState({
    events: true,
    exams: true,
    assignments: true,
  });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalendarItemDto | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    eventTypeId: '',
    startsOn: '',
    endsOn: '',
    startTime: '',
    endTime: '',
    description: '',
    status: 'published',
  });

  const weekStart = startOfWeek(cursor, 1);
  const rangeFrom = view === 'week' ? weekStart : monthStart(cursor);
  const rangeTo = view === 'week' ? addDays(weekStart, 6) : monthEnd(cursor);

  const year = Number(monthStart(cursor).slice(0, 4));
  const month = Number(monthStart(cursor).slice(5, 7));

  const sourceParam = Object.entries(sources)
    .filter(([, on]) => on)
    .map(([k]) => k)
    .join(',');

  const { data: types } = useQuery({
    queryKey: ['calendar', 'event-types', scopeKey(scope)],
    queryFn: () => client.get<CalendarEventTypeRow[]>('/portal/calendar/event-types', scope),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', 'unified', scopeKey(scope), rangeFrom, rangeTo, sourceParam],
    queryFn: () =>
      client.get<{ items: CalendarItemDto[] }>(
        `/portal/calendar?from=${rangeFrom}&to=${rangeTo}&sources=${sourceParam}`,
        scope,
      ),
    placeholderData: keepPreviousData,
  });

  const filteredItems = useMemo(() => {
    const list = data?.items ?? [];
    if (!typeFilter) return list;
    return list.filter((it) => it.typeKey === typeFilter || it.source !== 'events');
  }, [data, typeFilter]);

  const gridItems: MonthGridItem[] = useMemo(
    () =>
      filteredItems.map((it) => ({
        id: it.id,
        title: it.title,
        date: it.date,
        endDate: it.endDate,
        color: it.color,
        editable: it.editable,
      })),
    [filteredItems],
  );

  const label =
    view === 'week'
      ? `${weekStart} → ${rangeTo}`
      : new Date(year, month - 1, 1).toLocaleString(undefined, {
          month: 'long',
          year: 'numeric',
        });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post('/portal/calendar-events', scope, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      say('Event created');
      setCreateDate(null);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/calendar-events/${id}`, scope, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      say('Event updated');
      setDetail(null);
      setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/calendar-events/${id}`, scope, { version }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      say('Event deleted');
      setDetail(null);
      setEditing(false);
    },
  });

  function shiftCursor(dir: -1 | 1) {
    setCursor((c) => (view === 'week' ? addWeeks(c, dir) : addMonths(monthStart(c), dir)));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') shiftCursor(-1);
      if (e.key === 'ArrowRight') shiftCursor(1);
      if (e.key === 't' || e.key === 'T') setCursor(toISODate(new Date()));
      if ((e.key === 'n' || e.key === 'N') && canManage) openCreate(toISODate(new Date()));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openCreate/shiftCursor close over latest state
  }, [canManage, types, view]);

  function openCreate(iso: string) {
    if (!canManage) return;
    setEditing(false);
    setDetail(null);
    setCreateDate(iso);
    setDraft({
      title: '',
      eventTypeId: types?.[0]?.id ?? '',
      startsOn: iso,
      endsOn: '',
      startTime: '',
      endTime: '',
      description: '',
      status: 'published',
    });
  }

  function openEdit(item: CalendarItemDto) {
    const typeId = types?.find((t) => t.key === item.typeKey)?.id ?? types?.[0]?.id ?? '';
    setEditing(true);
    setCreateDate(null);
    setDraft({
      title: item.title,
      eventTypeId: typeId,
      startsOn: item.date,
      endsOn: item.endDate ?? '',
      startTime: item.startTime ?? '',
      endTime: item.endTime ?? '',
      description: item.detail ?? '',
      status: String(item.meta?.status ?? 'published'),
    });
  }

  async function submitCreate() {
    if (!draft.title.trim() || !draft.eventTypeId || !draft.startsOn) return;
    try {
      await create.mutateAsync({
        title: draft.title.trim(),
        eventTypeId: draft.eventTypeId,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn || null,
        startTime: draft.startTime || null,
        endTime: draft.endTime || null,
        description: draft.description || null,
        status: draft.status,
      });
    } catch (err) {
      say(formatPortalError(err));
    }
  }

  async function submitEdit() {
    if (!detail?.editable || !draft.title.trim() || !draft.eventTypeId || !draft.startsOn) return;
    const id = detail.id.replace(/^events:/, '');
    const version = Number(detail.meta?.version ?? 0);
    try {
      await update.mutateAsync({
        id,
        body: {
          title: draft.title.trim(),
          eventTypeId: draft.eventTypeId,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn || null,
          startTime: draft.startTime || null,
          endTime: draft.endTime || null,
          description: draft.description || null,
          status: draft.status,
          version,
        },
      });
    } catch (err) {
      say(formatPortalError(err));
    }
  }

  function onItemClick(it: MonthGridItem) {
    const raw = filteredItems.find((x) => x.id === it.id);
    if (!raw) return;
    if (raw.href && !raw.editable) {
      window.location.href = raw.href;
      return;
    }
    setEditing(false);
    setDetail(raw);
  }

  const formFields = (
    <>
      <div>
        <Label>Title</Label>
        <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
      </div>
      <div>
        <Label>Type</Label>
        <Select
          value={draft.eventTypeId}
          onChange={(e) => setDraft((d) => ({ ...d, eventTypeId: e.target.value }))}
          options={(types ?? []).map((t) => ({ value: t.id, label: t.label }))}
          placeholder="Select type"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Starts</Label>
          <Input
            type="date"
            value={draft.startsOn}
            onChange={(e) => setDraft((d) => ({ ...d, startsOn: e.target.value }))}
          />
        </div>
        <div>
          <Label>Ends</Label>
          <Input
            type="date"
            value={draft.endsOn}
            onChange={(e) => setDraft((d) => ({ ...d, endsOn: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start time</Label>
          <Input
            type="time"
            value={draft.startTime}
            onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))}
          />
        </div>
        <div>
          <Label>End time</Label>
          <Input
            type="time"
            value={draft.endTime}
            onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))}
          />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
      </div>
    </>
  );

  return (
    <>
      <Topbar
        title="Calendar"
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push('/calendar-events')}>
              <List className="mr-1.5 h-4 w-4" />
              Table view
            </Button>
            {canManage ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => router.push('/settings/calendar-types')}>
                <Settings2 className="mr-1.5 h-4 w-4" />
                Types
              </Button>
            ) : null}
            {canManage ? (
              <Button type="button" size="sm" onClick={() => openCreate(toISODate(new Date()))}>
                <Plus className="mr-1.5 h-4 w-4" />
                New event
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="page-enter flex flex-1 flex-col gap-4 p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            Viewing <span className="font-medium text-text-primary">{activeLabel}</span>
            <span className="mx-2 text-text-muted">·</span>
            <span className="text-text-muted">Events, exams, and assignments</span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border bg-surface-elevated p-0.5 shadow-xs">
              {(['month', 'week', 'agenda'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                    view === mode
                      ? 'bg-primary-soft font-medium text-text-primary'
                      : 'text-text-muted hover:bg-background-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setView(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-elevated px-1 py-1 shadow-xs">
              <Button type="button" variant="ghost" size="icon" aria-label="Previous" onClick={() => shiftCursor(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[10rem] px-1 text-center text-sm font-medium text-text-primary">{label}</span>
              <Button type="button" variant="ghost" size="icon" aria-label="Next" onClick={() => shiftCursor(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setCursor(toISODate(new Date()))}>
              <CalendarDays className="mr-1.5 h-4 w-4" />
              Today
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2.5 shadow-xs">
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-text-muted">Sources</span>
          {(
            [
              ['events', 'Events'],
              ['exams', 'Exams'],
              ['assignments', 'Assignments'],
            ] as const
          ).map(([key, labelText]) => (
            <button
              key={key}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                sources[key]
                  ? 'border-primary/30 bg-primary-soft font-medium text-text-primary'
                  : 'border-transparent text-text-muted hover:bg-background-secondary hover:text-text-primary'
              }`}
              onClick={() => setSources((s) => ({ ...s, [key]: !s[key] }))}
            >
              {labelText}
            </button>
          ))}
          {types && types.length > 0 ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <span className="mr-1 text-xs font-medium uppercase tracking-wide text-text-muted">Types</span>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  !typeFilter
                    ? 'border-primary/30 bg-primary-soft font-medium text-text-primary'
                    : 'border-transparent text-text-muted hover:bg-background-secondary hover:text-text-primary'
                }`}
                onClick={() => setTypeFilter(null)}
              >
                All
              </button>
              {types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
                    typeFilter === t.key
                      ? 'border-primary/30 bg-primary-soft font-medium text-text-primary'
                      : 'border-transparent text-text-muted hover:bg-background-secondary hover:text-text-primary'
                  }`}
                  onClick={() => setTypeFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </>
          ) : null}
        </div>

        {isLoading && !data ? (
          <p className="text-sm text-text-muted">Loading calendar…</p>
        ) : view === 'month' ? (
          <MonthGrid
            year={year}
            month={month}
            items={gridItems}
            today={toISODate(new Date())}
            onDayClick={(iso) => openCreate(iso)}
            onItemClick={onItemClick}
          />
        ) : view === 'week' ? (
          <WeekGrid
            weekOf={cursor}
            items={gridItems}
            today={toISODate(new Date())}
            onDayClick={(iso) => openCreate(iso)}
            onItemClick={onItemClick}
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface-elevated shadow-xs">
            {filteredItems.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-text-muted">Nothing in this range.</li>
            ) : (
              filteredItems.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-soft/30"
                    onClick={() => onItemClick(it)}
                  >
                    <div>
                      <p className="font-medium text-text-primary">{it.title}</p>
                      <p className="text-xs text-text-muted">
                        {it.date}
                        {it.endDate && it.endDate !== it.date ? ` → ${it.endDate}` : ''}
                        {it.startTime ? ` · ${it.startTime}` : ''}
                        {it.typeKey ? ` · ${it.typeKey}` : ` · ${it.source}`}
                      </p>
                    </div>
                    <span className="text-xs capitalize text-text-muted">{it.source}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <Dialog open={!!createDate} onClose={() => setCreateDate(null)} title="New calendar event">
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-lg font-semibold text-text-primary">New event</h2>
          {formFields}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreateDate(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitCreate()} loading={create.isPending}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!detail}
        onClose={() => {
          setDetail(null);
          setEditing(false);
        }}
        title={detail?.title ?? 'Event'}
      >
        {detail ? (
          <div className="flex flex-col gap-3 p-4">
            {editing && detail.editable ? (
              <>
                <h2 className="text-lg font-semibold text-text-primary">Edit event</h2>
                {formFields}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void submitEdit()} loading={update.isPending}>
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-text-primary">{detail.title}</h2>
                <p className="text-sm text-text-muted">
                  {detail.date}
                  {detail.endDate && detail.endDate !== detail.date ? ` → ${detail.endDate}` : ''}
                  {detail.startTime
                    ? ` · ${detail.startTime}${detail.endTime ? `–${detail.endTime}` : ''}`
                    : ' · All day'}
                </p>
                {detail.detail ? <p className="text-sm text-text-secondary">{detail.detail}</p> : null}
                <p className="text-xs capitalize text-text-muted">
                  {detail.source}
                  {detail.typeKey ? ` · ${detail.typeKey}` : ''}
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  {detail.href ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        window.location.href = detail.href!;
                      }}
                    >
                      Open
                    </Button>
                  ) : null}
                  {detail.editable && canManage ? (
                    <>
                      <Button type="button" variant="secondary" onClick={() => openEdit(detail)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => {
                          const version = Number(detail.meta?.version ?? 0);
                          const id = detail.id.replace(/^events:/, '');
                          void remove.mutateAsync({ id, version }).catch((err) => say(formatPortalError(err)));
                        }}
                        loading={remove.isPending}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDetail(null);
                      setEditing(false);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
