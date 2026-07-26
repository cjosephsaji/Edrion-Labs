'use client';
import { Badge } from '@edrion/ui';
import { roleLabel, useRoleLabelMap } from '@/lib/role-labels';

/** Role keys as labelled badges (e.g. "Department Head", not `department_head`). */
export function RoleBadges({
  roleKeys,
  tone = 'neutral',
}: {
  roleKeys: string[];
  tone?: 'neutral' | 'info' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const labels = useRoleLabelMap();
  if (roleKeys.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {roleKeys.map((k) => (
        <Badge key={k} tone={tone}>
          {roleLabel(k, labels)}
        </Badge>
      ))}
    </span>
  );
}

/** Comma-separated role labels for table cells. */
export function RoleLabelsText({ roleKeys }: { roleKeys: string[] }) {
  const labels = useRoleLabelMap();
  if (roleKeys.length === 0) return null;
  return <>{roleKeys.map((k) => roleLabel(k, labels)).join(', ')}</>;
}
