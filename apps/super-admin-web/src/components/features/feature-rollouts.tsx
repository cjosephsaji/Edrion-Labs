'use client';
import { useState } from 'react';
import { Plus, Trash2, Power } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Select } from '@edrion/ui';
import {
  ApiClientError,
  useUpsertFeatureRollout,
  useRemoveFeatureRollout,
  useSetFeatureKillSwitch,
  type FeatureRolloutDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

const ROLLOUT_TYPES = ['percentage', 'allow_list', 'block_list', 'environment', 'schedule'];

function summarise(r: FeatureRolloutDto): string {
  switch (r.type) {
    case 'percentage':
      return `${r.percentage ?? 0}% of subjects`;
    case 'allow_list':
      return `${r.allowList?.length ?? 0} allow-listed`;
    case 'block_list':
      return `${r.blockList?.length ?? 0} block-listed`;
    case 'environment':
      return (r.environments ?? []).join(', ') || 'all environments';
    case 'schedule':
      return [r.startsAt && `from ${new Date(r.startsAt).toLocaleDateString()}`, r.endsAt && `to ${new Date(r.endsAt).toLocaleDateString()}`]
        .filter(Boolean)
        .join(' ') || 'no window';
    default:
      return r.type;
  }
}

export function FeatureRollouts({
  featureId,
  rollouts,
}: {
  featureId: string;
  rollouts: FeatureRolloutDto[];
}) {
  const upsert = useUpsertFeatureRollout(featureId);
  const remove = useRemoveFeatureRollout(featureId);
  const killSwitch = useSetFeatureKillSwitch(featureId);

  const kill = rollouts.find((r) => r.type === 'kill_switch');
  const modifiers = rollouts.filter((r) => r.type !== 'kill_switch');
  const killOn = !!kill?.enabled;

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FeatureRolloutDto | null>(null);
  const [killOpen, setKillOpen] = useState(false);

  const [type, setType] = useState('percentage');
  const [enabled, setEnabled] = useState(true);
  const [percentage, setPercentage] = useState(10);
  const [allowList, setAllowList] = useState('');
  const [blockList, setBlockList] = useState('');
  const [environments, setEnvironments] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  function openNew() {
    setError(null);
    setType('percentage');
    setEnabled(true);
    setPercentage(10);
    setAllowList('');
    setBlockList('');
    setEnvironments('');
    setStartsAt('');
    setEndsAt('');
    setOpen(true);
  }

  const splitIds = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

  function submit(reason: string) {
    setError(null);
    upsert.mutate(
      {
        type,
        enabled,
        percentage: type === 'percentage' ? percentage : null,
        allowList: type === 'allow_list' ? splitIds(allowList) : [],
        blockList: type === 'block_list' ? splitIds(blockList) : [],
        environments: type === 'environment' ? splitIds(environments) : [],
        startsAt: type === 'schedule' && startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: type === 'schedule' && endsAt ? new Date(endsAt).toISOString() : null,
        reason,
      },
      {
        onSuccess: () => setOpen(false),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not save rollout.'),
      },
    );
  }

  return (
    <>
      {/* Emergency kill switch */}
      <Card className={killOn ? 'border-danger' : undefined}>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Power className={'h-4 w-4 ' + (killOn ? 'text-danger' : 'text-text-muted')} />
              Emergency kill switch
            </CardTitle>
            <CardDescription>
              When active, this feature resolves OFF for everyone, overriding every override and rollout.
            </CardDescription>
          </div>
          <Button variant={killOn ? 'secondary' : 'danger'} size="sm" onClick={() => setKillOpen(true)}>
            {killOn ? 'Deactivate' : 'Activate kill switch'}
          </Button>
        </CardHeader>
        {killOn && (
          <CardContent>
            <p className="text-sm text-danger">
              Kill switch is ACTIVE{kill?.setByName ? ` (by ${kill.setByName})` : ''}. The feature is forced OFF.
            </p>
          </CardContent>
        )}
      </Card>

      {/* Rollout modifiers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Rollouts</CardTitle>
            <CardDescription>Percentage, allow/block lists, environment and schedule modifiers.</CardDescription>
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> Add rollout
          </Button>
        </CardHeader>
        <CardContent>
          {modifiers.length === 0 ? (
            <p className="text-sm text-text-muted">No rollout modifiers configured.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="py-2">Type</th>
                  <th className="py-2">Configuration</th>
                  <th className="py-2 text-center">Enabled</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {modifiers.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 capitalize text-text-secondary">{r.type.replace('_', ' ')}</td>
                    <td className="py-2 text-text-muted">{summarise(r)}</td>
                    <td className="py-2 text-center text-text-secondary">{r.enabled ? 'Yes' : 'No'}</td>
                    <td className="py-2 text-right">
                      <button className="text-text-muted hover:text-danger" onClick={() => setRemoveTarget(r)} aria-label="Remove rollout">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Add/edit rollout dialog */}
      <ConfirmDialog
        open={open}
        title="Configure rollout"
        description="A rollout modifier layers on top of the scope hierarchy (kill switch still wins)."
        confirmLabel="Save rollout"
        loading={upsert.isPending}
        error={error}
        onConfirm={submit}
        onClose={() => setOpen(false)}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="r-type">Type</Label>
            <Select id="r-type" value={type} onChange={(e) => setType(e.target.value)} className={fieldClass} options={ROLLOUT_TYPES.map((t) => ({ value: t, label: t.replace('_', ' ') }))} />
          </div>
          <div>
            <Label htmlFor="r-enabled">Enabled</Label>
            <Select id="r-enabled" value={enabled ? 'yes' : 'no'} onChange={(e) => setEnabled(e.target.value === 'yes')} className={fieldClass} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </div>
        </div>
        {type === 'percentage' && (
          <div>
            <Label htmlFor="r-pct">Percentage ({percentage}%)</Label>
            <input id="r-pct" type="range" min={0} max={100} value={percentage} onChange={(e) => setPercentage(Number(e.target.value))} className="w-full" />
          </div>
        )}
        {type === 'allow_list' && (
          <div>
            <Label htmlFor="r-allow">Allow list (ids, comma/space separated)</Label>
            <textarea id="r-allow" value={allowList} onChange={(e) => setAllowList(e.target.value)} rows={2} className={fieldClass} />
          </div>
        )}
        {type === 'block_list' && (
          <div>
            <Label htmlFor="r-block">Block list (ids, comma/space separated)</Label>
            <textarea id="r-block" value={blockList} onChange={(e) => setBlockList(e.target.value)} rows={2} className={fieldClass} />
          </div>
        )}
        {type === 'environment' && (
          <div>
            <Label htmlFor="r-env">Environments (comma separated)</Label>
            <input id="r-env" value={environments} onChange={(e) => setEnvironments(e.target.value)} placeholder="production, staging" className={fieldClass} />
          </div>
        )}
        {type === 'schedule' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="r-start">Starts at</Label>
              <input id="r-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <Label htmlFor="r-end">Ends at</Label>
              <input id="r-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={fieldClass} />
            </div>
          </div>
        )}
      </ConfirmDialog>

      {/* Remove rollout */}
      <ConfirmDialog
        open={!!removeTarget}
        title="Remove rollout"
        description={`Remove the ${removeTarget?.type.replace('_', ' ')} rollout?`}
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={(reason) => {
          if (!removeTarget) return;
          remove.mutate({ rolloutId: removeTarget.id, reason }, { onSuccess: () => setRemoveTarget(null) });
        }}
        onClose={() => setRemoveTarget(null)}
      />

      {/* Kill switch confirm */}
      <ConfirmDialog
        open={killOpen}
        title={killOn ? 'Deactivate kill switch' : 'Activate emergency kill switch'}
        description={
          killOn
            ? 'Resolution resumes from overrides and rollouts.'
            : 'This forces the feature OFF for everyone immediately. Use for incidents only.'
        }
        confirmLabel={killOn ? 'Deactivate' : 'Activate kill switch'}
        tone={killOn ? 'primary' : 'danger'}
        loading={killSwitch.isPending}
        onConfirm={(reason) => {
          killSwitch.mutate({ enabled: !killOn, reason }, { onSuccess: () => setKillOpen(false) });
        }}
        onClose={() => setKillOpen(false)}
      />
    </>
  );
}
