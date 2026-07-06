'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, GraduationCap, LifeBuoy, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { ApplyFlow } from '@/components/apply/apply-flow';

const BENEFITS = [
  { icon: CalendarCheck, title: 'Apply in minutes', body: 'A short guided form — your progress saves automatically, so you can finish later on this device.' },
  { icon: ShieldCheck, title: 'Verified & secure', body: 'We confirm your email with a single-use code and protect submissions with rate limiting.' },
  { icon: Sparkles, title: 'One application, direct to the school', body: 'Your details go straight to the institution’s admissions team for review.' },
];

const FAQS = [
  { q: 'Can I save and finish later?', a: 'Yes. Your answers are saved automatically on this device, so you can close the tab and pick up where you left off.' },
  { q: 'Why do I need to verify my email?', a: 'It confirms the contact address is yours and protects the school from fraudulent applications. The code expires in 10 minutes.' },
  { q: 'What happens after I submit?', a: 'You’ll get a reference number and a confirmation email. The institution’s admissions team reviews your application and contacts you with the outcome.' },
  { q: 'How do I check my application status?', a: 'Use the “Check application status” link — you’ll need the device you applied from (your resume link is stored there).' },
];

export default function ApplyPage() {
  // Resume a specific draft from a ?draft=<id> link (token still comes from this device's storage).
  const [resumeDraftId, setResumeDraftId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('draft');
    if (id) setResumeDraftId(id);
  }, []);

  return (
    <main className="h-full overflow-y-auto bg-background scrollbar-thin">
      {/* Hero */}
      <header className="border-b border-border bg-background-secondary">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-md font-semibold text-text-primary">Edrion</span>
          </div>
          <Link href="/apply/status" className="text-sm font-medium text-primary hover:underline">
            Check application status
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Admissions open
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Apply for admission
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-md text-text-secondary">
            Choose your school, tell us about the applicant and verify your email. Your application
            goes straight to the institution’s admissions team.
          </p>
        </div>
      </header>

      {/* Form */}
      <section className="mx-auto w-full max-w-2xl px-5 py-12">
        <ApplyFlow resumeDraftId={resumeDraftId} />
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-5xl px-5 pb-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <b.icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-text-primary">{b.title}</p>
              <p className="mt-1 text-sm text-text-secondary">{b.body}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-border bg-primary-soft/40 p-5 sm:col-span-3">
            <div className="flex items-center gap-2 text-primary">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-semibold">Your data is safe</span>
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              We only use these details to process your application. Email verification and rate
              limiting protect against fraud and spam.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-center text-2xl font-bold text-text-primary">Frequently asked questions</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-surface-elevated p-4 [&_summary]:cursor-pointer">
                <summary className="flex list-none items-center justify-between text-sm font-medium text-text-primary">
                  {f.q}
                  <span className="ml-4 text-text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm text-text-secondary">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Support + footer */}
      <section className="border-t border-border bg-background-secondary">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">Questions about admissions?</p>
              <p className="text-sm text-text-secondary">Reach the school directly, or contact us.</p>
            </div>
          </div>
          <a
            href="mailto:admissions@edrion.com"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-background-secondary"
          >
            <Mail className="h-4 w-4" /> admissions@edrion.com
          </a>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-6 text-center text-xs text-text-muted">
          © {new Date().getFullYear()} Edrion. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
