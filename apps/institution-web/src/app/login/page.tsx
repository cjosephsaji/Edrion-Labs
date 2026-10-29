'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, GraduationCap, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { Button, Input, Label, cn } from '@edrion/ui';
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

const MODE_OPTIONS: Array<{ value: Mode; label: string }> = [
  { value: 'password', label: 'Password' },
  { value: 'dev', label: 'Dev' },
  { value: 'token', label: 'Token' },
];

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
      if (data.requiresInstitutionSelection) {
        await qc.cancelQueries();
        finalizePortalSignIn(qc);
        const next = new URLSearchParams(window.location.search).get('next');
        router.replace(`/choose-institution${next ? `?next=${encodeURIComponent(next)}` : ''}`);
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
      router.replace(requestedNext?.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\') ? requestedNext : defaultHome);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgb(222_238_228_/_0.68),transparent_32rem),linear-gradient(180deg,var(--background),var(--background-secondary))] px-4 py-6 text-text-primary sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative flex min-h-[18rem] flex-col justify-between overflow-hidden bg-sidebar px-6 py-6 text-sidebar-text sm:px-8 lg:min-h-full lg:px-10">
          <div
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255_/_0.10),transparent_34%),linear-gradient(180deg,transparent,rgb(0_0_0_/_0.18))]"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:h-auto lg:w-px lg:bg-gradient-to-b"
          />

          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold text-white">Edrion</p>
                <p className="text-xs text-sidebar-muted">Education OS</p>
              </div>
            </div>

            <div className="mt-12 max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Institution portal</p>
              <h1 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Sign in to your campus workspace.
              </h1>
              <p className="mt-4 text-sm leading-6 text-sidebar-text/80">
                Everything your institution runs starts here.
              </p>
            </div>
          </div>

          <div className="relative mt-10 grid gap-3 text-sm text-sidebar-text/85 sm:grid-cols-2 lg:grid-cols-1">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] ring-1 ring-white/10">
                <ShieldCheck className="h-4 w-4 text-primary-soft" aria-hidden />
              </span>
              <span>Secure access</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] ring-1 ring-white/10">
                <Building2 className="h-4 w-4 text-primary-soft" aria-hidden />
              </span>
              <span>Campus-ready workspace</span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold text-text-primary">Institution sign in</h2>
              <p className="mt-2 text-sm text-text-secondary">Use your portal credentials to continue.</p>
            </div>

            <div className="mb-5 grid grid-cols-3 rounded-lg border border-border bg-background-secondary/60 p-1">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setMode(option.value);
                    setError(null);
                  }}
                  className={cn(
                    'h-9 rounded-md px-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-100',
                    mode === option.value
                      ? 'bg-surface-elevated text-text-primary shadow-xs'
                      : 'text-text-muted hover:bg-surface/70 hover:text-text-secondary',
                  )}
                  aria-pressed={mode === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {mode === 'token' ? (
                <div>
                  <Label htmlFor="login-token">Supabase access token</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
                    <Input
                      id="login-token"
                      type="password"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="eyJhbGciOi…"
                      className="pl-10"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@institution.edu"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  {mode === 'password' && (
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor="login-password">Password</Label>
                        <Link
                          href="/forgot-password"
                          className="mb-1.5 shrink-0 text-xs font-medium text-primary hover:underline"
                        >
                          Forgot password?
                        </Link>
                      </div>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
                        <Input
                          id="login-password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="pl-10"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" loading={busy} className="w-full">
                Sign in
              </Button>
            </form>

            <p className="mt-6 border-t border-border pt-4 text-center text-xs leading-5 text-text-muted">
              Access is managed by your institution administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
