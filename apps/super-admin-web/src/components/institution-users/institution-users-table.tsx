'use client';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { StatusBadge } from '@edrion/ui';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';
import type { InstitutionUserListItemDto } from '@edrion/api-client';

const ROLE_NAME = new Map(INSTITUTION_DEFAULT_ROLES.map((r) => [r.key, r.name]));
export function roleLabel(key: string): string {
  return ROLE_NAME.get(key) ?? key.replace(/_/g, ' ');
}

/** Shared directory table — used by the global directory and the institution detail tab. */
export function InstitutionUsersTable({ users }: { users: InstitutionUserListItemDto[] }) {
  const router = useRouter();
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
          <th className="px-4">User</th>
          <th className="px-4">Roles</th>
          <th className="px-4">Campuses</th>
          <th className="px-4">Status</th>
          <th className="px-4">Security</th>
          <th className="px-4 text-right">Last login</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {users.map((u) => (
          <tr
            key={u.id}
            className="h-table-row cursor-pointer transition-colors hover:bg-background-secondary"
            onClick={() => router.push(`/institution-users/${u.id}`)}
          >
            <td className="px-4">
              <div className="font-medium text-text-primary">{u.fullName}</div>
              <div className="text-xs text-text-muted">{u.email}</div>
            </td>
            <td className="px-4 text-text-secondary">
              {u.roleKeys.length ? u.roleKeys.map(roleLabel).join(', ') : <span className="text-text-muted">—</span>}
            </td>
            <td className="px-4 text-text-secondary">{u.campusCount}</td>
            <td className="px-4">
              <StatusBadge status={u.status} />
            </td>
            <td className="px-4">
              {u.mfaEnrolled ? (
                <span className="inline-flex items-center gap-1 text-xs text-success">
                  <ShieldCheck className="h-3.5 w-3.5" /> MFA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-warning">
                  <ShieldAlert className="h-3.5 w-3.5" /> {u.requireMfa ? 'MFA required' : 'No MFA'}
                </span>
              )}
            </td>
            <td className="px-4 text-right text-text-muted">
              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
