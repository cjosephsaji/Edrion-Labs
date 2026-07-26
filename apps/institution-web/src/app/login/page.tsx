'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { Button, Input, Label } from '@edrion/ui';
import { webEnv } from '@/lib/env';
import { finalizePortalSignIn } from '@/lib/portal-session';
import { isParentPortalUser } from '@/lib/parent-portal-user';
import type { PortalMeDto } from '@/lib/types';

/**
 * Institution-portal sign-in. The primary path is native email + password, posted to
 * `POST /v1/portal/auth/login`, which sets the HTTP-only portal session cookie; on success the user
 * lands on the dashboard authenticated by that cookie. A secondary "developer" path keeps the
 * email-only dev login and Supabase access-token flows working while real auth is rolled out (both
 * are gated server-side behind flags). Sits outside the (app) shell.
 */
type Mode = 'password' | 'dev' | 'token';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body =
        mode === 'token'
          ? { accessToken: token.trim() }
          : mode === 'dev'
            ? { email: email.trim() }
            : { email: email.trim(), password };
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
      finalizePortalSignIn(qc);
      const meRes = await fetch(`${webEnv.apiBaseUrl}/v1/portal/me`, {
        credentials: 'include',
        cache: 'no-store',
        headers: webEnv.devUserEmail ? { 'x-institution-user-email': webEnv.devUserEmail } : undefined,
      });
      const me = (await meRes.json().catch(() => null)) as PortalMeDto | null;
      const requestedNext = new URLSearchParams(window.location.search).get('next');
      const defaultHome =
        me && isParentPortalUser(me.roleKeys, me.permissions) ? '/family' : '/dashboard';
      router.replace(requestedNext || defaultHome);
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
            <h1 className="text-md font-semibold text-text-primary">Institution sign in</h1>
            <p className="text-xs text-text-secondary">Edrion Institution Portal</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'token' ? (
            <div>
              <Label htmlFor="login-token">Supabase access token</Label>
              <Input
                id="login-token"
                type="password"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="eyJhbGciOi…"
              />
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="login-email">Email</Label>
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
              {mode === 'password' && (
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              )}
            </>
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

        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-text-muted">
          {mode !== 'password' && (
            <button type="button" className="hover:text-text-primary" onClick={() => setMode('password')}>
              Password sign-in
            </button>
          )}
          {mode !== 'dev' && (
            <button type="button" className="hover:text-text-primary" onClick={() => setMode('dev')}>
              Dev login
            </button>
          )}
          {mode !== 'token' && (
            <button type="button" className="hover:text-text-primary" onClick={() => setMode('token')}>
              Access token
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
