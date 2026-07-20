'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorState, PermissionDenied, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import {
  type BaseRequestType,
  type RequestTypeOverride,
  useRequestTypeConfig,
  useRequestTypeConfigMutation,
} from '@/lib/requests';

export default function RequestTypesSettingsPage() {
  const { can } = usePermissions();
  const config = useRequestTypeConfig();
  const overrides = new Map((config.data?.overrides.items ?? []).map((item) => [item.typeKey, item]));

  if (!can('student_portal.manage')) {
    return <><Topbar title="Request types" /><div className="p-6"><PermissionDenied description="You don’t have permission to configure request types." /></div></>;
  }

  return <>
    <Topbar title="Request types" />
    <div className="page-enter mx-auto w-full max-w-5xl space-y-5 p-5">
      <div className="flex items-center gap-2 text-sm text-text-muted"><Link href="/settings">Settings</Link><span>/</span><Link href="/settings/student-portal">Student portal</Link><span>/</span><span className="text-text-primary">Request types</span></div>
      <div><h1 className="text-2xl font-semibold text-text-primary">Request types</h1><p className="mt-1 text-sm text-text-secondary">Enable request forms and set their routing and expected working days.</p></div>
      {config.isLoading && <Skeleton className="h-56" />}
      {config.isError && <ErrorState title="Could not load request types" description="Try again in a moment." />}
      {config.data && <Card className="overflow-hidden p-0"><div className="hidden grid-cols-[1.4fr_.7fr_1fr_.8fr_auto] gap-3 border-b border-border bg-surface px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted md:grid"><span>Type</span><span>Enabled</span><span>Routed to</span><span>SLA days</span><span /></div>{config.data.baseTypes.map((type) => <RequestTypeRow key={type.key} type={type} override={overrides.get(type.key)} />)}</Card>}
    </div>
  </>;
}

function RequestTypeRow({ type, override }: { type: BaseRequestType; override?: RequestTypeOverride }) {
  const mutation = useRequestTypeConfigMutation();
  const [enabled, setEnabled] = useState(override?.enabled ?? type.enabled);
  const [role, setRole] = useState(override?.routingRoleOverride ?? (type.key === 'document_request' ? 'registrar' : 'teacher'));
  const [sla, setSla] = useState(String(override?.slaDaysOverride ?? type.slaDays));
  const [saved, setSaved] = useState(false);
  useEffect(() => { setEnabled(override?.enabled ?? type.enabled); setRole(override?.routingRoleOverride ?? (type.key === 'document_request' ? 'registrar' : 'teacher')); setSla(String(override?.slaDaysOverride ?? type.slaDays)); }, [override, type]);

  async function save() {
    await mutation.mutateAsync({
      id: override?.id,
      body: {
        ...(!override ? { typeKey: type.key } : {}),
        enabled,
        routingRoleOverride: role,
        slaDaysOverride: Number(sla),
        ...(override ? { version: override.version } : {}),
      },
    });
    setSaved(true); window.setTimeout(() => setSaved(false), 1500);
  }

  return <div className="grid gap-3 border-b border-border px-5 py-4 last:border-0 md:grid-cols-[1.4fr_.7fr_1fr_.8fr_auto] md:items-center"><div><p className="font-semibold text-text-primary">{type.label}</p><p className="text-xs text-text-muted">{type.category}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{enabled ? 'On' : 'Off'}</label><select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-lg border border-border bg-surface-elevated px-2 text-sm"><option value="teacher">Teacher</option><option value="faculty_advisor">Faculty advisor</option><option value="registrar">Registrar</option><option value="campus_admin">Campus admin</option></select><input aria-label={`${type.label} SLA days`} type="number" min={0} max={365} value={sla} onChange={(e) => setSla(e.target.value)} className="h-9 w-24 rounded-lg border border-border bg-surface-elevated px-3 text-sm" /><Button size="sm" onClick={save} loading={mutation.isPending}>{saved ? 'Saved ✓' : 'Save'}</Button>{mutation.isError && <p role="alert" className="text-xs text-danger md:col-span-5">Couldn’t save this request type. Refresh and try again.</p>}</div>;
}
