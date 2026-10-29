'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building2, Check, GraduationCap } from 'lucide-react';
import { Button, Input, Label } from '@edrion/ui';
import { useInstitutionChoices, type InstitutionMembership } from '@/lib/institutions';
import { formatPortalError, PortalClientError, usePortalClient } from '@/lib/portal-client';
import { finalizePortalSignIn } from '@/lib/portal-session';
import { isParentPortalUser } from '@/lib/parent-portal-user';
import type { PortalMeDto } from '@/lib/types';

export default function ChooseInstitutionPage() {
  const client = usePortalClient();
  const qc = useQueryClient();
  const choices = useInstitutionChoices();
  const [selected, setSelected] = useState<InstitutionMembership | null>(null);
  const [password, setPassword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(membership: InstitutionMembership, institutionPassword?: string) {
    setError(null);
    setBusyId(membership.institutionUserId);
    try {
      await client.post(
        '/portal/auth/select-institution',
        { mode: 'institution' },
        {
          institutionUserId: membership.institutionUserId,
          ...(institutionPassword ? { password: institutionPassword } : {}),
        },
      );
      await qc.cancelQueries();
      finalizePortalSignIn(qc);
      const me = await client.get<PortalMeDto>('/portal/me', { mode: 'institution' });
      const next = new URLSearchParams(window.location.search).get('next');
      const home = isParentPortalUser(me.roleKeys, me.permissions) ? '/family' : '/dashboard';
      // Reload providers as well as query data so campus, academic context and unsaved state reset.
      window.location.replace(
        next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : home,
      );
    } catch (err) {
      if (err instanceof PortalClientError && err.code === 'PASSWORD_REQUIRED')
        setSelected(membership);
      setError(formatPortalError(err, 'Could not access this institution. Try again.'));
      setBusyId(null);
    }
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (selected) void choose(selected, password);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-text-primary">
      <div className="w-full max-w-xl rounded-xl border border-border bg-surface-elevated p-6 shadow-lg sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <GraduationCap aria-hidden className="h-6 w-6" />
          </span>
          <span className="font-semibold">
            Edrion <span className="font-normal text-text-muted">Institution portal</span>
          </span>
        </div>
        <h1 className="text-2xl font-semibold">Choose an institution</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Select the institution you’d like to access. You can switch again beside Sign out.
        </p>

        {choices.isPending && (
          <p role="status" className="mt-6 text-sm text-text-muted">
            Loading your institutions…
          </p>
        )}
        {choices.isError && (
          <div className="mt-6">
            <p role="alert" className="text-sm text-danger">
              {formatPortalError(choices.error)}
            </p>
            <Link
              href="/login"
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
            >
              Return to sign in
            </Link>
          </div>
        )}
        {choices.data && (
          <div className="mt-6 space-y-3">
            {choices.data.institutions.map((membership) => {
              const current = membership.institutionUserId === choices.data.currentUserId;
              return (
                <button
                  key={membership.institutionUserId}
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => {
                    setError(null);
                    setPassword('');
                    if (membership.requiresPassword) setSelected(membership);
                    else {
                      setSelected(null);
                      void choose(membership);
                    }
                  }}
                  className="flex min-h-20 w-full items-center gap-4 rounded-lg border border-border px-4 py-4 text-left transition-colors hover:border-primary hover:bg-primary-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60"
                >
                  <Building2 aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-medium">
                      {membership.institutionName}
                    </span>
                    <span className="mt-1 block text-xs text-text-muted">
                      {current
                        ? 'Current institution'
                        : membership.requiresPassword
                          ? 'Password required for this institution'
                          : 'Access institution'}
                    </span>
                  </span>
                  {busyId === membership.institutionUserId ? (
                    <span role="status" className="text-xs">
                      Opening…
                    </span>
                  ) : current ? (
                    <Check aria-hidden className="h-4 w-4 text-primary" />
                  ) : (
                    <ArrowRight aria-hidden className="h-4 w-4 text-text-muted" />
                  )}
                </button>
              );
            })}
          </div>
        )}
        {selected && (
          <form
            onSubmit={submitPassword}
            className="mt-5 space-y-3 rounded-lg border border-border bg-background-secondary p-4"
          >
            <Label htmlFor="institution-password">Password for {selected.institutionName}</Label>
            <Input
              id="institution-password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busyId !== null}
            />
            <div className="flex gap-2">
              <Button type="submit" loading={busyId !== null}>
                Continue
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busyId !== null}
                onClick={() => {
                  setSelected(null);
                  setPassword('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {choices.data && !choices.data.currentUserId && (
          <Link
            href="/login"
            className="mt-6 inline-block text-sm text-text-muted hover:text-primary"
          >
            Use another account
          </Link>
        )}
      </div>
    </main>
  );
}
