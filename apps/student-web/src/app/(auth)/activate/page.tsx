'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatApiError, useStudentApi } from '@/lib/api-client';

export default function ActivatePage() {
  const api = useStudentApi();
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post('/student/auth/activate', {
        token: token.trim(),
        password,
      });
      router.replace('/home');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <p className="font-display text-3xl font-semibold text-[var(--s-accentDeep)]">Edrion</p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--s-ink)]">
          Activate your account
        </h1>
        <p className="mt-1 text-sm text-[var(--s-muted)]">
          Enter the invite code from your institution and choose a password.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-[var(--s-bd1)] bg-[var(--s-card)] p-5 shadow-[0_16px_40px_-28px_rgba(23,37,31,0.45)]"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--s-inkSoft)]">Activation code</span>
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-xl border border-[var(--s-bd1)] bg-[var(--s-cardAlt)] px-3 py-2.5 text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block font-medium text-[var(--s-inkSoft)]">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--s-bd1)] bg-[var(--s-cardAlt)] px-3 py-2.5 text-[var(--s-ink)] outline-none focus:border-[var(--s-accent)]"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-[var(--s-danger)]">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="mt-5 w-full rounded-xl bg-[var(--s-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Activating…' : 'Activate'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-[var(--s-muted)]">
        Already activated?{' '}
        <Link href="/login" className="font-medium text-[var(--s-accentDeep)] underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
