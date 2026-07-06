import type { Metadata } from 'next';
import {
  BarChart3,
  GraduationCap,
  LifeBuoy,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { RegisterFlow } from '@/components/register/register-flow';

export const metadata: Metadata = {
  title: 'Register your institution · Edrion',
  description:
    'Apply to bring your school or college onto Edrion — the modern, secure platform for institution operations.',
};

const BENEFITS = [
  { icon: Workflow, title: 'One platform, every department', body: 'Academics, admissions, fees, HR, library, transport and more — unified and audited.' },
  { icon: ShieldCheck, title: 'Enterprise-grade security', body: 'Role-based access, full audit trails and tenant isolation built into every layer.' },
  { icon: Sparkles, title: 'AI you can trust', body: 'Guardrailed AI copilot that prepares work and asks before it ever changes anything.' },
  { icon: BarChart3, title: 'Insight from day one', body: 'Live dashboards and reports across campuses, so leadership always has the picture.' },
];

const FAQS = [
  { q: 'How long does approval take?', a: 'Most applications are reviewed within a few business days. You’ll get an email the moment a decision is made.' },
  { q: 'Why do I need to verify my email?', a: 'It confirms you own the contact address and protects your institution from fraudulent applications. We send a single-use code that expires in 10 minutes.' },
  { q: 'What happens after I’m approved?', a: 'We create your workspace, set up your administrator account and start a guided onboarding checklist toward go-live.' },
  { q: 'Can I save and finish later?', a: 'Yes. Your progress is saved automatically on this device, so you can close the tab and pick up where you left off.' },
];

export default function RegisterPage() {
  return (
    <main className="h-full overflow-y-auto bg-background scrollbar-thin">
      {/* Hero */}
      <header className="border-b border-border bg-background-secondary">
        <div className="mx-auto max-w-6xl px-5 py-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-md font-semibold text-text-primary">Edrion</span>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-12 pt-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Now welcoming new institutions
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Bring your institution onto Edrion
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-md text-text-secondary">
            Tell us about your school or college and verify your email. Our onboarding team reviews
            every application personally — no account is created until you’re approved.
          </p>
        </div>
      </header>

      {/* Form */}
      <section className="mx-auto w-full max-w-2xl px-5 py-12">
        <RegisterFlow />
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
              We only use these details to evaluate your application. Email verification and rate
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
              <p className="text-sm font-medium text-text-primary">Need a hand?</p>
              <p className="text-sm text-text-secondary">Our onboarding team is happy to help.</p>
            </div>
          </div>
          <a
            href="mailto:onboarding@edrion.com"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-background-secondary"
          >
            <Mail className="h-4 w-4" /> onboarding@edrion.com
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
