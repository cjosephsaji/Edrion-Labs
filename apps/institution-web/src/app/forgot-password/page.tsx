'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Button, Input, Label } from '@edrion/ui';
import { webEnv } from '@/lib/env';

/**
 * Request a portal password-reset link. The API always answers 200 (it never reveals whether an
 * address has an account), so we show the same confirmation regardless.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${webEnv.apiBaseUrl}/v1/portal/auth/forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        setError('Something went wrong. Try again.');
        return;
      }
      setSent(true);
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
            <h1 className="text-md font-semibold text-text-primary">Reset your password</h1>
            <p className="text-xs text-text-secondary">Edrion Institution Portal</p>
          </div>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-text-secondary">
              If an account exists for <span className="font-medium">{email}</span>, a reset link is on
              its way. Check your inbox and follow the link to choose a new password.
            </p>
            <Link href="/login" className="block text-center text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <p className="text-sm text-text-secondary">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institution.edu"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" loading={busy} className="w-full">
              Send reset link
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
