'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, FieldError, Input, Label } from '@edrion/ui';
import { useStudentClient, StudentClientError } from '@/lib/student-client';
import { useT } from '@/i18n/use-t';

type Step = 'details' | 'otp' | 'password';

export default function WelcomePage() {
  const { t } = useT();
  const client = useStudentClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('IN');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await client.post('/auth/signup/start', { email: email.trim(), fullName: fullName.trim(), country });
      setStep('otp');
    } catch (err) {
      setError(err instanceof StudentClientError ? err.message : 'Could not start signup.');
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await client.post('/auth/signup/verify-otp', { email: email.trim(), otp: otp.trim() });
      setStep('password');
    } catch (err) {
      setError(err instanceof StudentClientError ? err.message : 'Invalid code.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await client.post('/auth/signup/complete', { email: email.trim(), password });
      router.replace('/home');
    } catch (err) {
      setError(err instanceof StudentClientError ? err.message : 'Could not create account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-st-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-st-bd1 bg-st-card p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-st-ink">{t('auth.welcomeTitle')}</h1>

        {step === 'details' && (
          <form onSubmit={submitDetails} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} required />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={busy} className="w-full bg-st-accent hover:bg-st-accentDeep">
              Continue
            </Button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={submitOtp} className="mt-6 space-y-4">
            <p className="text-sm text-st-muted">Enter the 6-digit code we sent to {email}.</p>
            <div>
              <Label htmlFor="otp">Verification code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={busy} className="w-full bg-st-accent hover:bg-st-accentDeep">
              Verify
            </Button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={submitPassword} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={busy} className="w-full bg-st-accent hover:bg-st-accentDeep">
              Create account
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-st-accent hover:underline">
            Already have an account?
          </Link>
        </p>
      </div>
    </main>
  );
}
