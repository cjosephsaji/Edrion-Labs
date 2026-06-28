'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { Button, Input } from '@edrion/ui';
import { webEnv } from '@/lib/env';

/**
 * Institution-portal sign-in. Posts to the real `POST /v1/portal/auth/login`, which sets the
 * HTTP-only portal session cookie; on success the user lands on the dashboard authenticated by
 * that cookie (no dev header needed). Two inputs: a Supabase access token (production) or, when the
 * API has PORTAL_AUTH_DEV_LOGIN on, an email-only dev login. Sits outside the (app) shell.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'email' | 'token'>('email');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = mode === 'email' ? { email: email.trim() } : { accessToken: token.trim() };
      const res = await fetch(`${webEnv.apiBaseUrl}/v1/portal/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message ?? 'Sign-in failed. Check your credentials and try again.');
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next') || '/dashboard';
      router.replace(next);
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
            <h1 className="text-md font-semibold text-text-primary">Sign in</h1>
            <p className="text-xs text-text-secondary">Edrion Institution Portal</p>
          </div>
        </div>

        <div className="mb-4 inline-flex rounded-md border border-border p-0.5" role="tablist" aria-label="Sign-in method">
          {(['email', 'token'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                mode === m ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {m === 'email' ? 'Dev login' : 'Access token'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'email' ? (
            <div>
              <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-text-secondary">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institution.edu"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="login-token" className="mb-1 block text-sm font-medium text-text-secondary">
                Supabase access token
              </label>
              <Input
                id="login-token"
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eyJhbGciOi…"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
