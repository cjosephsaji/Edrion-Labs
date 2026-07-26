'use client';
import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { Button, Input, Label } from '@edrion/ui';
import { webEnv } from '@/lib/env';

/** Complete a super-admin password reset using the single-use token from the email link. */
function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const res = await fetch(`${webEnv.apiBaseUrl}/v1/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? 'Reset failed. The link may have expired.');
        return;
      }
      setDone(true);
      setTimeout(() => router.replace('/login'), 1500);
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
            <h1 className="text-md font-semibold text-text-primary">Choose a new password</h1>
            <p className="text-xs text-text-secondary">Edrion control plane</p>
          </div>
        </div>

        {done ? (
          <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-text-secondary">
            Your password has been reset. Redirecting you to sign in…
          </p>
        ) : !token ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            This reset link is missing its token. Request a new one from the sign-in page.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
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
              Reset password
            </Button>
            <Link href="/login" className="block text-center text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
