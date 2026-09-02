'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Eye,
  EyeOff,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { formatApiError } from '@/lib/api-client';
import { useStudentLogin } from '@/lib/hooks';
import styles from './login.module.css';

const portalFeatures = [
  {
    icon: CalendarDays,
    title: 'Your day, already organised',
    detail: 'Classes, deadlines and important updates in one view.',
  },
  {
    icon: BookOpen,
    title: 'Learning that keeps its place',
    detail: 'Continue materials, homework and Petros sessions where you stopped.',
  },
  {
    icon: TrendingUp,
    title: 'Progress with context',
    detail: 'See results, feedback and the next useful topic—not just a score.',
  },
];

export default function LoginPage() {
  const login = useStudentLogin();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ identifier: identifier.trim(), password });
  }

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.brandGroup}>
          <Link href="/login" className={styles.brand} aria-label="Edrion student portal sign in">
            edrion
          </Link>
          <span className={styles.brandDivider} aria-hidden="true" />
          <span className={styles.portalLabel}>Student portal</span>
        </div>
        <span className={styles.accessLabel}>Institution access</span>
      </header>

      <main className={styles.main}>
        <section className={styles.introduction} aria-labelledby="portal-welcome">
          <p className={styles.kicker}>Your academic day, connected</p>
          <h1 id="portal-welcome">Everything you need to move learning forward.</h1>
          <p className={styles.introCopy}>
            Timetable, assignments, study material and progress live in the same calm workspace—personal to you and shaped by your institution.
          </p>

          <div className={styles.portalPreview} aria-label="Inside the student portal">
            <div className={styles.previewHeader}>
              <span>Inside your portal</span>
              <span>Personal to you</span>
            </div>
            <ul>
              {portalFeatures.map(({ icon: Icon, title, detail }) => (
                <li key={title}>
                  <span className={styles.featureIcon}><Icon aria-hidden="true" /></span>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className={styles.securityNote}>
            <ShieldCheck aria-hidden="true" />
            Your account is issued and managed by your institution.
          </p>
        </section>

        <section className={styles.signInColumn} aria-labelledby="student-sign-in">
          <div className={styles.signInPanel}>
            <header className={styles.panelHeader}>
              <p>Student access</p>
              <h2 id="student-sign-in">Welcome back.</h2>
              <span>Use the same details provided by your institution.</span>
            </header>

            <form onSubmit={onSubmit} className={styles.form}>
              <label htmlFor="student-identifier">Email or student ID</label>
              <input
                id="student-identifier"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Enter your email or ID"
              />

              <div className={styles.passwordLabel}>
                <label htmlFor="student-password">Password</label>
              </div>
              <div className={styles.passwordField}>
                <input
                  id="student-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>

              {login.error ? (
                <p className={styles.error} role="alert">{formatApiError(login.error)}</p>
              ) : null}

              <button type="submit" disabled={login.isPending} aria-busy={login.isPending} className={styles.submit}>
                <span>{login.isPending ? 'Signing in…' : 'Sign in to your portal'}</span>
                {!login.isPending ? <ArrowRight aria-hidden="true" /> : null}
              </button>
            </form>

            <div className={styles.activation}>
              <span>First time here?</span>
              <Link href="/activate">Activate your account <ArrowRight aria-hidden="true" /></Link>
            </div>
          </div>

          <p className={styles.helpText}>
            Can’t access your account? Contact your institution administrator.
          </p>
        </section>
      </main>
    </div>
  );
}
