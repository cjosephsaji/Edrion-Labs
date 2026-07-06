'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { Button, FieldError, Input, Label } from '@edrion/ui';
import { useStudentClient, StudentClientError } from '@/lib/student-client';
import { useT } from '@/i18n/use-t';

function ActivateForm() {
  const { t } = useT();
  const client = useStudentClient();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await client.post('/auth/activate', { token, password });
      router.replace('/home');
    } catch (err) {
      setError(err instanceof StudentClientError ? err.message : 'Activation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-st-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-st-bd1 bg-st-card p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-st-ink">{t('auth.activateTitle')}</h1>
        <p className="mt-1 text-sm text-st-muted">Choose a password to finish setting up your account.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={busy || !token} className="w-full bg-st-accent hover:bg-st-accentDeep">
            {busy ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-st-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-st-page" />}>
      <ActivateForm />
    </Suspense>
  );
}
