'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { formatApiError, StudentApiError, useStudentApi } from '@/lib/api-client';
import { useStudentLogout, useStudentMe } from '@/lib/hooks';
import styles from '../login/login.module.css';

export default function ChangePasswordPage() {
  const api = useStudentApi();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useStudentMe();
  const logout = useStudentLogout();
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me.error instanceof StudentApiError && me.error.status === 401) router.replace('/login');
    else if (me.data && !me.data.passwordChangeRequired) router.replace('/home');
  }, [me.data, me.error, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError('Your new passwords do not match.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post('/student/auth/change-password', { newPassword, confirmPassword: confirmation });
      qc.removeQueries({ queryKey: ['student'] });
      router.replace('/home');
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className={styles.signInPanel}>
        <header className={styles.panelHeader}>
          <p>Student account setup</p>
          <h1>Choose your password</h1>
          <span>Choose a new password different from your student ID before using your portal.</span>
        </header>
        {me.data?.passwordChangeRequired ? (
          <form onSubmit={onSubmit} className={styles.form}>
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password"
              value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 8 characters" />
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" type="password" required minLength={8} maxLength={72} autoComplete="new-password"
              value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            {error ? <p role="alert" className={styles.error}>{error}</p> : null}
            <button type="submit" className={styles.submit} disabled={pending || logout.isPending} aria-busy={pending}>
              {pending ? 'Saving password…' : 'Save password and open portal'}
            </button>
          </form>
        ) : <p className="px-6 py-4 text-sm" role="status">{me.error ? formatApiError(me.error) : 'Checking your account…'}</p>}
        <div className={styles.activation}>
          <button type="button" disabled={pending || logout.isPending} onClick={() => logout.mutate()}>
            {logout.isPending ? 'Signing out…' : 'Sign out'}
          </button>
          {logout.error ? <p role="alert" className={styles.error}>{formatApiError(logout.error)}</p> : null}
        </div>
      </div>
    </main>
  );
}
