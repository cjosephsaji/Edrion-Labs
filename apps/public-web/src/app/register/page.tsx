import type { Metadata } from 'next';
import Link from 'next/link';
import {
  BarChart3,
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

const NAV = [
  { href: '#benefits', label: 'Why Edrion' },
  { href: '#faq', label: 'FAQ' },
  { href: '/apply', label: 'Apply for admission' },
  { href: '#support', label: 'Support' },
];

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
      <header className="border-b border-border bg-background-secondary">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/register" className="shrink-0">
            <span className="text-2xl font-bold tracking-[0.02em] text-primary sm:text-[1.65rem]">Edrion</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-text-secondary transition-colors hover:text-primary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mx-auto max-w-6xl px-5 pb-6 pt-2 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> Now welcoming new institutions
          </span>
          <h1 className="mx-auto mt-2 max-w-2xl text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Bring your institution onto Edrion
          </h1>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-text-secondary">
            Tell us about your school or college and verify your email. Our team reviews every
            application — no account is created until you&apos;re approved.
          </p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl px-5 py-8">
        <RegisterFlow />
      </section>

      <section id="benefits" className="mx-auto max-w-5xl scroll-mt-16 px-5 pb-10">
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

      <section id="faq" className="scroll-mt-16 border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-10">
          <h2 className="text-center text-xl font-bold text-text-primary">Frequently asked questions</h2>
          <div className="mt-6 space-y-3">
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

      <section id="support" className="scroll-mt-16 border-t border-border bg-background-secondary">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-6 text-center sm:flex-row sm:text-left">
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
        <div className="mx-auto max-w-6xl px-5 py-5 text-center text-xs text-text-muted">
          © {new Date().getFullYear()} Edrion. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
