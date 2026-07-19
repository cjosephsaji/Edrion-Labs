'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight, Plus, Minus, ShieldCheck } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBadge,
  Skeleton,
  ErrorState,
  Label,
  Select,
  cn,
} from '@edrion/ui';
import {
  ApiClientError,
  useCampuses,
  useInstitutionAvailableRoles,
  useInstitutionUser,
  useInstitutionUserAction,
  type InstitutionUserDetailDto,
} from '@edrion/api-client';
import { ALL_INSTITUTION_PERMISSION_KEYS } from '@edrion/permissions/institution';
import { Topbar } from '@/components/app-shell/topbar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AccessChangeDialog } from '@/components/institution-users/access-change-dialog';
import { roleLabel } from '@/components/institution-users/institution-users-table';

const permLabel = (k: string) => k.replace(/\./g, ' · ').replace(/_/g, ' ');

interface AccessChange {
  title: string;
  description?: string;
  change: Record<string, unknown>;
  action: string;
  buildBody: (reason: string) => Record<string, unknown>;
}

interface SecAction {
  title: string;
  description: string;
  action: string;
  tone?: 'primary' | 'danger';
  requireReason: boolean;
  buildBody: (reason: string) => Record<string, unknown>;
}

export default function InstitutionUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError } = useInstitutionUser(id);
  const action = useInstitutionUserAction(id);

  const [accessChange, setAccessChange] = useState<AccessChange | null>(null);
  const [secAction, setSecAction] = useState<SecAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAccessChange(reason: string) {
    if (!accessChange) return;
    setError(null);
    action.mutate(
      { action: accessChange.action, body: accessChange.buildBody(reason) },
      {
        onSuccess: () => setAccessChange(null),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Change failed. Please retry.'),
      },
    );
  }

  function runSecAction(reason: string) {
    if (!secAction) return;
    setError(null);
    action.mutate(
      { action: secAction.action, body: secAction.buildBody(reason) },
      {
        onSuccess: () => setSecAction(null),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Action failed. Please retry.'),
      },
    );
  }

  return (
    <>
      <Topbar title="Institution User" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <Link href="/institution-users" className="hover:text-text-primary">Institution Users</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">{user?.fullName ?? '…'}</span>
        </nav>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError || !user ? (
          <ErrorState description="Could not load this user." />
        ) : (
          <>
            <Header user={user} />
            <div className="grid gap-4 lg:grid-cols-2">
              <RolesCard user={user} onChange={setAccessChange} />
              <CampusAccessCard user={user} onChange={setAccessChange} />
              <OverridesCard user={user} onChange={setAccessChange} />
              <EffectiveCard user={user} />
              <SecurityCard user={user} onAction={setSecAction} />
              <HistoryCard user={user} />
            </div>
          </>
        )}
      </div>

      {accessChange && (
        <AccessChangeDialog
          userId={id}
          open
          title={accessChange.title}
          description={accessChange.description}
          change={accessChange.change}
          loading={action.isPending}
          error={error}
          onConfirm={runAccessChange}
          onClose={() => setAccessChange(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(secAction)}
        title={secAction?.title ?? ''}
        description={secAction?.description}
        tone={secAction?.tone}
        requireReason={secAction?.requireReason ?? true}
        confirmLabel="Confirm"
        loading={action.isPending}
        error={error}
        onConfirm={runSecAction}
        onClose={() => setSecAction(null)}
      />
    </>
  );
}

function Header({ user }: { user: InstitutionUserDetailDto }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-text-primary">{user.fullName}</h2>
          <StatusBadge status={user.status} />
          {user.mfaEnrolled && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <ShieldCheck className="h-3.5 w-3.5" /> MFA enrolled
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {user.email}
          {' · '}
          <Link href={`/institutions/${user.institutionId}?tab=users`} className="hover:text-primary">
            View institution
          </Link>
        </p>
      </div>
    </div>
  );
}

function RolesCard({ user, onChange }: { user: InstitutionUserDetailDto; onChange: (c: AccessChange) => void }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(user.roleKeys);
  const availableRoles = useInstitutionAvailableRoles(user.institutionId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Roles</CardTitle>
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => { setSelected(user.roleKeys); setEditing(true); }}>
            Change roles
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!editing ? (
          user.roleKeys.length ? (
            <div className="flex flex-wrap gap-1.5">
              {user.roleKeys.map((k) => (
                <span key={k} className="rounded-full border border-border bg-background-secondary px-2.5 py-0.5 text-xs">
                  {roleLabel(k)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-text-muted">No roles assigned.</p>
          )
        ) : (
          <>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
              {(availableRoles.data ?? []).map((r) => (
                <label key={r.key} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 hover:bg-background-secondary">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.key)}
                    onChange={() =>
                      setSelected((p) => (p.includes(r.key) ? p.filter((k) => k !== r.key) : [...p, r.key]))
                    }
                  />
                  {r.name}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={selected.length === 0}
                onClick={() => {
                  onChange({
                    title: 'Change roles?',
                    description: 'Roles determine the user’s effective permissions inside their institution.',
                    change: { roleKeys: selected },
                    action: 'change-role',
                    buildBody: (reason) => ({ roleKeys: selected, reason, version: user.version }),
                  });
                  setEditing(false);
                }}
              >
                Preview &amp; apply
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CampusAccessCard({ user, onChange }: { user: InstitutionUserDetailDto; onChange: (c: AccessChange) => void }) {
  const [editing, setEditing] = useState(false);
  const { data: campuses, isLoading } = useCampuses({ institutionId: user.institutionId, pageSize: 100 });
  const [grants, setGrants] = useState<Record<string, string>>(
    Object.fromEntries(user.campusAccess.map((c) => [c.campusId, c.accessLevel])),
  );

  const proposed = useMemo(
    () => Object.entries(grants).map(([campusId, accessLevel]) => ({ campusId, accessLevel })),
    [grants],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Campus access</CardTitle>
        {!editing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setGrants(Object.fromEntries(user.campusAccess.map((c) => [c.campusId, c.accessLevel])));
              setEditing(true);
            }}
          >
            Change access
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!editing ? (
          user.campusAccess.length ? (
            <ul className="space-y-1">
              {user.campusAccess.map((c) => (
                <li key={c.campusId} className="flex items-center justify-between">
                  <span className="text-text-primary">{c.campusName ?? c.campusId}</span>
                  <span className="text-xs capitalize text-text-muted">{c.accessLevel}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No campus access. Grants stay within this institution only.</p>
          )
        ) : isLoading ? (
          <Skeleton className="h-20" />
        ) : (
          <>
            <div className="space-y-1.5">
              {(campuses?.items ?? []).map((c) => {
                const on = c.id in grants;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setGrants((p) => {
                            const next = { ...p };
                            if (on) delete next[c.id];
                            else next[c.id] = 'manage';
                            return next;
                          })
                        }
                      />
                      {c.name}
                    </label>
                    {on && (
                      <Select
                        value={grants[c.id]}
                        onChange={(e) => setGrants((p) => ({ ...p, [c.id]: e.target.value }))}
                        className="text-xs"
                        options={[{ value: 'manage', label: 'manage' }, { value: 'view', label: 'view' }]}
                      />
                    )}
                  </div>
                );
              })}
              {(campuses?.items ?? []).length === 0 && (
                <p className="text-text-muted">This institution has no campuses yet.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  onChange({
                    title: 'Change campus access?',
                    description: 'Campus grants only ever apply within this institution.',
                    change: { campusAccess: proposed },
                    action: 'change-campus-access',
                    buildBody: (reason) => ({ campusAccess: proposed, reason, version: user.version }),
                  });
                  setEditing(false);
                }}
              >
                Preview &amp; apply
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OverridesCard({ user, onChange }: { user: InstitutionUserDetailDto; onChange: (c: AccessChange) => void }) {
  const [key, setKey] = useState<string>(ALL_INSTITUTION_PERMISSION_KEYS[0]!);
  const [effect, setEffect] = useState<'grant' | 'deny'>('grant');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permission overrides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {user.directGrants.length === 0 && user.directDenies.length === 0 ? (
          <p className="text-text-muted">No overrides. Effective access comes from roles alone.</p>
        ) : (
          <ul className="space-y-1">
            {user.directGrants.map((k) => (
              <li key={`g-${k}`} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-success"><Plus className="h-3.5 w-3.5" /> {permLabel(k)}</span>
                <button
                  className="text-xs text-text-muted hover:text-danger"
                  onClick={() =>
                    onChange({
                      title: 'Remove override?',
                      change: { removeOverrides: [k] },
                      action: 'remove-permission-override',
                      buildBody: (reason) => ({ key: k, reason, version: user.version }),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
            {user.directDenies.map((k) => (
              <li key={`d-${k}`} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-danger"><Minus className="h-3.5 w-3.5" /> {permLabel(k)}</span>
                <button
                  className="text-xs text-text-muted hover:text-danger"
                  onClick={() =>
                    onChange({
                      title: 'Remove override?',
                      change: { removeOverrides: [k] },
                      action: 'remove-permission-override',
                      buildBody: (reason) => ({ key: k, reason, version: user.version }),
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <Label>Add override</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={key} onChange={(e) => setKey(e.target.value)} className="h-input flex-1 text-xs" options={ALL_INSTITUTION_PERMISSION_KEYS.map((k) => ({ value: k, label: permLabel(k) }))} />
            <Select value={effect} onChange={(e) => setEffect(e.target.value as 'grant' | 'deny')} className="h-input text-xs" options={[{ value: 'grant', label: 'grant' }, { value: 'deny', label: 'deny' }]} />
            <Button
              size="sm"
              onClick={() =>
                onChange({
                  title: `Add ${effect} override?`,
                  description: 'Direct overrides layer on top of roles. A deny always wins.',
                  change: effect === 'grant' ? { addGrants: [key] } : { addDenies: [key] },
                  action: 'permission-overrides',
                  buildBody: (reason) => ({ key, effect, reason, version: user.version }),
                })
              }
            >
              Preview
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EffectiveCard({ user }: { user: InstitutionUserDetailDto }) {
  const keys = user.effectiveAccess.permissionKeys;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Effective permissions ({keys.length})</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {keys.length === 0 ? (
          <p className="text-text-muted">No effective permissions.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {keys.map((k) => {
              const added = user.effectiveAccess.addedByOverride.includes(k);
              return (
                <span
                  key={k}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    added ? 'border-success/40 bg-success-soft text-success' : 'border-border bg-background-secondary text-text-secondary',
                  )}
                >
                  {permLabel(k)}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecurityCard({ user, onAction }: { user: InstitutionUserDetailDto; onAction: (a: SecAction) => void }) {
  const disabled = user.status === 'disabled';
  const locked = user.status === 'locked' || Boolean(user.lockedAt);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security &amp; lifecycle</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 text-sm">
        {disabled ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAction({ title: 'Re-enable user?', description: 'Restores access for this user.', action: 'enable', requireReason: true, buildBody: (reason) => ({ reason, version: user.version }) })}
          >
            Enable
          </Button>
        ) : (
          <>
            {user.status === 'invited' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAction({ title: 'Activate user?', description: 'Manually activates this invited user.', action: 'enable', requireReason: true, buildBody: (reason) => ({ reason, version: user.version }) })}
              >
                Activate
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAction({ title: 'Disable user?', description: 'Immediately blocks this user from signing in. Logged to the audit trail.', tone: 'danger', action: 'disable', requireReason: true, buildBody: (reason) => ({ reason, version: user.version }) })}
            >
              Disable
            </Button>
          </>
        )}
        {locked && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAction({ title: 'Unlock user?', description: 'Clears the lockout so the user can sign in again.', action: 'unlock', requireReason: true, buildBody: (reason) => ({ reason, version: user.version }) })}
          >
            Unlock
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction({ title: user.requireMfa ? 'Stop requiring MFA?' : 'Require MFA?', description: 'Controls whether the user must enrol MFA before next sign-in.', action: 'require-mfa', requireReason: true, buildBody: (reason) => ({ required: !user.requireMfa, reason, version: user.version }) })}
        >
          {user.requireMfa ? 'Drop MFA requirement' : 'Require MFA'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction({ title: 'Force password reset?', description: 'The user must set a new password on next sign-in.', tone: 'danger', action: 'force-password-reset', requireReason: true, buildBody: (reason) => ({ reason }) })}
        >
          Force password reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAction({ title: 'Revoke all sessions?', description: 'Signs the user out of every active session immediately.', tone: 'danger', action: 'revoke-sessions', requireReason: true, buildBody: (reason) => ({ reason }) })}
        >
          Revoke sessions
        </Button>
        {user.status === 'invited' && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAction({ title: 'Resend invitation?', description: 'Sends a fresh invitation email.', action: 'resend-invite', requireReason: false, buildBody: () => ({}) })}
          >
            Resend invite
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryCard({ user }: { user: InstitutionUserDetailDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <ul className="space-y-1.5">
          {user.history.map((h, i) => (
            <li key={`${h.event}-${i}`} className="flex justify-between gap-4">
              <span className="capitalize text-text-secondary">{h.event.replace(/_/g, ' ')}</span>
              <span className="text-text-muted">{new Date(h.at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
