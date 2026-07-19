'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Select } from '@edrion/ui';
import {
  ApiClientError,
  useUpsertFeatureAssignment,
  useRemoveFeatureAssignment,
  type FeatureAssignmentDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const SCOPES = ['global', 'plan', 'institution', 'campus', 'institution_user', 'independent_user', 'employee_role'];

export function FeatureAssignments({
  featureId,
  assignments,
  availableScopes,
}: {
  featureId: string;
  assignments: FeatureAssignmentDto[];
  availableScopes: string[];
}) {
  const upsert = useUpsertFeatureAssignment(featureId);
  const remove = useRemoveFeatureAssignment(featureId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FeatureAssignmentDto | null>(null);

  const scopes = availableScopes.length ? availableScopes : SCOPES;
  const [scope, setScope] = useState(scopes[0] ?? 'global');
  const [scopeId, setScopeId] = useState('');
  const [value, setValue] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [activatesAt, setActivatesAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  function openNew() {
    setError(null);
    setScope(scopes[0] ?? 'global');
    setScopeId('');
    setValue(true);
    setEnabled(true);
    setActivatesAt('');
    setExpiresAt('');
    setOpen(true);
  }

  function submit(reason: string) {
    setError(null);
    if (scope !== 'global' && !scopeId.trim()) {
      return setError('A scope ID (or role key) is required for non-global scopes.');
    }
    upsert.mutate(
      {
        scope,
        scopeId: scope === 'global' ? null : scopeId.trim(),
        value,
        enabled,
        activatesAt: activatesAt ? new Date(activatesAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        reason,
      },
      {
        onSuccess: () => setOpen(false),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not save assignment.'),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Scope assignments</CardTitle>
          <CardDescription>Values attached at a scope. Most specific wins on resolution.</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-text-muted">No scope assignments. Resolution falls to the global default.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="py-2">Scope</th>
                <th className="py-2">Scope ID</th>
                <th className="py-2 text-center">Value</th>
                <th className="py-2 text-center">Enabled</th>
                <th className="py-2">Window</th>
                <th className="py-2">Set by</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 capitalize text-text-secondary">{a.scope}</td>
                  <td className="py-2 font-mono text-xs text-text-muted">{a.scopeId ?? '—'}</td>
                  <td className="py-2 text-center">
                    <span className={a.value ? 'text-success' : 'text-danger'}>{a.value ? 'ON' : 'OFF'}</span>
                  </td>
                  <td className="py-2 text-center text-text-secondary">{a.enabled ? 'Yes' : 'No'}</td>
                  <td className="py-2 text-xs text-text-muted">
                    {a.activatesAt ? `from ${new Date(a.activatesAt).toLocaleDateString()}` : ''}
                    {a.expiresAt ? ` to ${new Date(a.expiresAt).toLocaleDateString()}` : ''}
                    {!a.activatesAt && !a.expiresAt ? 'always' : ''}
                  </td>
                  <td className="py-2 text-xs text-text-muted">{a.setByName ?? '—'}</td>
                  <td className="py-2 text-right">
                    <button
                      className="text-text-muted hover:text-danger"
                      onClick={() => setRemoveTarget(a)}
                      aria-label="Remove assignment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <ConfirmDialog
        open={open}
        title="Set scope assignment"
        description="Override the feature value at a scope. The scope-specific permission is enforced at the API."
        confirmLabel="Save assignment"
        loading={upsert.isPending}
        error={error}
        onConfirm={submit}
        onClose={() => setOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="a-scope">Scope</Label>
            <Select id="a-scope" value={scope} onChange={(e) => setScope(e.target.value)} className={fieldClass} options={scopes.map((s) => ({ value: s, label: s }))} />
          </div>
          <div>
            <Label htmlFor="a-scopeid">Scope ID / role key</Label>
            <input id="a-scopeid" value={scopeId} onChange={(e) => setScopeId(e.target.value)} disabled={scope === 'global'} placeholder={scope === 'global' ? 'n/a' : 'uuid or role_key'} className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="a-value">Value</Label>
            <Select id="a-value" value={value ? 'on' : 'off'} onChange={(e) => setValue(e.target.value === 'on')} className={fieldClass} options={[{ value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }]} />
          </div>
          <div>
            <Label htmlFor="a-enabled">Enabled</Label>
            <Select id="a-enabled" value={enabled ? 'yes' : 'no'} onChange={(e) => setEnabled(e.target.value === 'yes')} className={fieldClass} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </div>
          <div>
            <Label htmlFor="a-activates">Activates at</Label>
            <input id="a-activates" type="datetime-local" value={activatesAt} onChange={(e) => setActivatesAt(e.target.value)} className={fieldClass} />
          </div>
          <div>
            <Label htmlFor="a-expires">Expires at</Label>
            <input id="a-expires" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={fieldClass} />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove assignment"
        description={`Remove the ${removeTarget?.scope} assignment? Resolution will fall back to the next layer.`}
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={(reason) => {
          if (!removeTarget) return;
          remove.mutate(
            { assignmentId: removeTarget.id, reason },
            { onSuccess: () => setRemoveTarget(null) },
          );
        }}
        onClose={() => setRemoveTarget(null)}
      />
    </Card>
  );
}
