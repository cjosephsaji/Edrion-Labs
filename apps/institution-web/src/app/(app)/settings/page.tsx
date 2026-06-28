'use client';
import { useMemo } from 'react';
import { Badge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useSettingsList, useSettingsMutations } from '@/lib/settings';
import type { SettingRow } from '@/lib/admin-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'institution_settings.view',
  create: 'institution_settings.manage',
  update: 'institution_settings.manage',
  delete: 'institution_settings.manage',
};

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'academic', label: 'Academic' },
  { value: 'branding', label: 'Branding' },
  { value: 'localization', label: 'Localization' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'security', label: 'Security' },
];
const VALUE_TYPES = [
  { value: 'string', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function SettingsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
      { name: 'key', label: 'Key', type: 'text', required: true, placeholder: 'e.g. grading.scale' },
      { name: 'label', label: 'Label', type: 'text', required: true, placeholder: 'e.g. Grading scale' },
      { name: 'valueType', label: 'Value type', type: 'select', required: true, options: VALUE_TYPES },
      { name: 'value', label: 'Value', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<SettingRow>[]>(
    () => [
      { key: 'category', header: 'Category', sortable: true, render: (r) => <Badge tone="neutral">{label(CATEGORIES, r.category)}</Badge> },
      { key: 'key', header: 'Key', sortable: true, render: (r) => <span className="font-mono text-xs">{r.key}</span> },
      { key: 'label', header: 'Label', sortable: true, render: (r) => <span className="font-medium">{r.label}</span> },
      { key: 'valueType', header: 'Type', sortable: true, render: (r) => label(VALUE_TYPES, r.valueType) },
      {
        key: 'value',
        header: 'Value',
        render: (r) => <span className="line-clamp-1 max-w-[20rem] text-text-secondary">{r.value ?? '—'}</span>,
      },
    ],
    [],
  );

  return (
    <ResourceManager<SettingRow>
      resource="settings"
      title="Settings"
      noun="setting"
      columns={columns}
      fields={fields}
      defaultSortBy="category"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useSettingsList}
      useMutations={useSettingsMutations}
      rowLabel={(r) => r.label}
      toFormValues={(r) => ({
        category: r.category,
        key: r.key,
        label: r.label,
        valueType: r.valueType,
        value: r.value ?? '',
        description: r.description ?? '',
      })}
    />
  );
}
