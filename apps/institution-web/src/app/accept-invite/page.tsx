'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { Button, Input, Label } from '@edrion/ui';
import { webEnv } from '@/lib/env';
import { finalizePortalSignIn } from '@/lib/portal-session';
import { isParentPortalUser } from '@/lib/parent-portal-user';
import type { PortalMeDto } from '@/lib/types';

interface InvitePreview {
  fullName: string;
  email: string;
  institutionName: string;
}

/**
 * Portal invitation acceptance. Staff and other institution users arrive from the invitation email
 * with a signed JWT, confirm who they are, choose a password, and land on the dashboard signed in.
 */
function AcceptInviteForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(Boolean(token));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void (async () => {
      try {
        const res = await fetch(
          `${webEnv.apiBaseUrl}/v1/portal/auth/accept-invite/preview?token=${encodeURIComponent(token)}`,
          { credentials: 'include' },
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data?.message ?? 'This invitation link is invalid or has expired.');
          return;
        }
        setPreview(data as InvitePreview);
      } catch {
        if (!cancelled) setPreviewError('Could not reach the server. Try again.');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const res = await fetch(`${webEnv.apiBaseUrl}/v1/portal/auth/accept-invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? 'Could not accept this invitation. The link may have expired.');
        return;
      }
      finalizePortalSignIn(qc);
      const meRes = await fetch(`${webEnv.apiBaseUrl}/v1/portal/me`, {
        credentials: 'include',
        cache: 'no-store',
        headers: webEnv.devUserEmail ? { 'x-institution-user-email': webEnv.devUserEmail } : undefined,
      });
      const me = (await meRes.json().catch(() => null)) as PortalMeDto | null;
      const defaultHome =
        me && isParentPortalUser(me.roleKeys, me.permissions) ? '/family' : '/dashboard';
      router.replace(defaultHome);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface-elevated p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <h1 className="text-md font-semibold text-text-primary">Accept your invitation</h1>
            <p className="text-xs text-text-secondary">Set a password to join your institution</p>
          </div>
        </div>

        {!token ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            This invitation link is missing its token. Use the link from your invitation email.
          </p>
        ) : previewLoading ? (
          <p className="text-sm text-text-secondary">Loading invitation details…</p>
        ) : previewError ? (
          <div className="space-y-3">
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {previewError}
            </p>
            <p className="text-sm text-text-secondary">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        ) : preview ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="rounded-md border border-border bg-background-secondary/60 px-3 py-2.5 text-sm">
              <p className="font-medium text-text-primary">{preview.fullName}</p>
              <p className="text-text-secondary">{preview.email}</p>
              <p className="mt-1 text-xs text-text-muted">
                Invited to <span className="font-medium text-text-secondary">{preview.institutionName}</span>
              </p>
            </div>

            <div>
              <Label htmlFor="pw">New password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={busy} className="w-full">
              Accept invitation and sign in
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
