'use client';
import { useState } from 'react';
import { Card, Badge, TableSkeleton, EmptyState, ErrorState, Button } from '@edrion/ui';
import { usePlatformRoles, type RoleWithMetaDto } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';

export default function PlatformRolesPage() {
  const { data, isLoading, isError } = usePlatformRoles();

  return (
    <>
      <Topbar title="Platform Roles" />
      <div className="page-enter space-y-5 p-6">
        <p className="text-sm text-text-muted">
          Roles are bags of permission keys — the API checks keys, never role names. The permission
          catalogue is the source of truth; membership is editable from an employee&apos;s Roles action.
        </p>

        {isLoading ? (
          <TableSkeleton />
        ) : isError || !data ? (
          <ErrorState description="Could not load platform roles. Confirm the API is running on :3001." />
        ) : data.items.length === 0 ? (
          <EmptyState title="No roles" description="No platform roles are defined." />
        ) : (
          <div className="space-y-3">
            {data.items.map((role) => (
              <RoleCard key={role.id} role={role} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function RoleCard({ role }: { role: RoleWithMetaDto }) {
  const [open, setOpen] = useState(false);
  const isWildcard = role.permissionKeys.includes('*');
  const shown = open ? role.permissionKeys : role.permissionKeys.slice(0, 8);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-md font-semibold text-text-primary">{role.name}</h2>
            {role.isSystem && <Badge tone="neutral">System</Badge>}
          </div>
          <p className="font-mono text-xs text-text-muted">{role.key}</p>
          {role.description && <p className="mt-1 text-sm text-text-secondary">{role.description}</p>}
        </div>
        <div className="text-right text-sm text-text-muted">
          <div>{role.memberCount} members</div>
          <div>{isWildcard ? 'all permissions' : `${role.permissionKeys.length} permissions`}</div>
        </div>
      </div>

      {!isWildcard && role.permissionKeys.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {shown.map((k) => (
              <span
                key={k}
                className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-text-secondary"
              >
                {k}
              </span>
            ))}
          </div>
          {role.permissionKeys.length > 8 && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpen((v) => !v)}>
              {open ? 'Show fewer' : `Show all ${role.permissionKeys.length}`}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
