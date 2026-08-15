'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { formatApiError } from '@/lib/api-client';
import { useStudentLogin } from '@/lib/hooks';

export default function LoginPage() {
  const login = useStudentLogin();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ identifier: identifier.trim(), password });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-3xl font-semibold text-[var(--s-accentDeep)]">Edrion</p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--s-ink)]">
          Student sign in
        </h1>
        <p className="mt-1 text-sm text-[var(--s-muted)]">
          Use the email and password from your institution invite.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-[var(--s-bd1)] bg-[var(--s-card)] p-5 shadow-[0_16px_40px_-28px_rgba(23,37,31,0.45)]"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--s-inkSoft)]">Email or student ID</span>
          <input
            type="text"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full rounded-xl border border-[var(--s-bd1)] bg-[var(--s-cardAlt)] px-3 py-2.5 text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--s-inkSoft)]">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--s-bd1)] bg-[var(--s-cardAlt)] px-3 py-2.5 text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]"
          />
        </label>

        {login.error ? (
          <p className="mt-3 text-sm text-[var(--s-danger)]">{formatApiError(login.error)}</p>
        ) : null}

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-5 w-full rounded-xl bg-[var(--s-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-[var(--s-muted)]">
        Have an activation code?{' '}
        <Link href="/activate" className="font-medium text-[var(--s-accentDeep)] underline-offset-2 hover:underline">
          Activate account
        </Link>
      </p>
    </div>
  );
}
