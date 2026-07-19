'use client';

import { useMemo } from 'react';
import type { Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type { InstitutionScope } from '@/lib/types';
import type { ListParams } from '@/lib/academics';
import type { CalendarEventTypeRow } from '@/lib/calendar-events-types';
import { CALENDAR_SWATCHES } from '@edrion/schemas';

const PERMISSIONS: ResourcePermissions = {
  view: 'calendar_events.view',
  create: 'calendar_events.manage',
  update: 'calendar_events.manage',
  delete: 'calendar_events.manage',
};

const SWATCH_OPTIONS = CALENDAR_SWATCHES.map((c) => ({
  value: c,
  label: c.charAt(0).toUpperCase() + c.slice(1),
}));

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function useList(_resource: string, _params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['calendar', 'event-types', scopeKey(scope)],
    queryFn: async () => {
      const items = await client.get<CalendarEventTypeRow[]>(
        '/portal/calendar/event-types',
        scope,
      );
      return { items, total: items.length };
    },
    placeholderData: keepPreviousData,
  });
}

function useMutations(_resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post('/portal/calendar/event-types', scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/calendar/event-types/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/calendar/event-types/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export default function CalendarTypesSettingsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'key',
        label: 'Key',
        type: 'text',
        required: true,
        placeholder: 'e.g. sports_day',
        help: 'Lowercase snake_case. Fixed after create for system types.',
      },
      { name: 'label', label: 'Label', type: 'text', required: true },
      {
        name: 'color',
        label: 'Colour',
        type: 'select',
        required: true,
        options: SWATCH_OPTIONS,
      },
    ],
    [],
  );

  const columns = useMemo<Column<CalendarEventTypeRow>[]>(
    () => [
      {
        key: 'label',
        header: 'Label',
        render: (r) => <span className="font-medium">{r.label}</span>,
      },
      {
        key: 'key',
        header: 'Key',
        render: (r) => <span className="font-mono text-xs text-text-muted">{r.key}</span>,
      },
      {
        key: 'color',
        header: 'Colour',
        render: (r) => <span className="capitalize">{r.color}</span>,
      },
      {
        key: 'isSystem',
        header: 'System',
        render: (r) => (r.isSystem ? 'Yes' : '—'),
      },
    ],
    [],
  );

  return (
    <ResourceManager<CalendarEventTypeRow>
      resource="calendar/event-types"
      title="Calendar event types"
      noun="event type"
      columns={columns}
      fields={fields}
      defaultSortBy="label"
      defaultSortDir="asc"
      searchable={false}
      permissions={PERMISSIONS}
      useList={useList}
      useMutations={useMutations}
      rowLabel={(r) => r.label}
      toFormValues={(r) => ({
        key: r.key,
        label: r.label,
        color: r.color,
      })}
      createInitialValues={{ color: 'green' }}
    />
  );
}
