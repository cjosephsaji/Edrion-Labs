'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, FieldError, Input, Label } from '@edrion/ui';
import { useStudentClient, StudentClientError } from '@/lib/student-client';
import { useT } from '@/i18n/use-t';

export default function LoginPage() {
  const { t } = useT();
  const client = useStudentClient();
  const router = useRouter();
  const [useAdmission, setUseAdmission] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institutionCode, setInstitutionCode] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = useAdmission
        ? { institutionCode: institutionCode.trim(), admissionNo: admissionNo.trim(), password }
        : { email: email.trim(), password };
      await client.post('/auth/login', body);
      router.replace('/home');
    } catch (err) {
      if (err instanceof StudentClientError) {
        setError(err.message);
      } else {
        setError('Could not sign in. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-st-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-st-bd1 bg-st-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <span className="mb-3 inline-grid h-11 w-11 place-items-center rounded-xl bg-st-accent text-sm font-bold text-white">
            E
          </span>
          <h1 className="font-display text-2xl font-semibold text-st-ink">{t('auth.loginTitle')}</h1>
          <p className="text-sm text-st-muted">{t('auth.loginSubtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {useAdmission ? (
            <>
              <div>
                <Label htmlFor="institutionCode">Institution code</Label>
                <Input
                  id="institutionCode"
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="admissionNo">Admission number</Label>
                <Input
                  id="admissionNo"
                  value={admissionNo}
                  onChange={(e) => setAdmissionNo(e.target.value)}
                  required
                />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={busy} className="w-full bg-st-accent hover:bg-st-accentDeep">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-st-accent hover:underline"
          onClick={() => setUseAdmission((v) => !v)}
        >
          {t('auth.useAdmission')}
        </button>

        <p className="mt-6 text-center text-sm text-st-muted">
          New here?{' '}
          <Link href="/welcome" className="font-medium text-st-accent hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
