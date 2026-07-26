'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, GraduationCap, Mail } from 'lucide-react';

/**
 * Post-submission confirmation. Reads the reference from the query string (via `window.location`
 * so no Suspense boundary is needed). Reassures the applicant the submission landed and sets clear
 * expectations for the review step.
 */
export default function RegistrationSuccessPage() {
  const [ref, setRef] = useState<string | null>(null);
  useEffect(() => {
    setRef(new URLSearchParams(window.location.search).get('ref'));
  }, []);

  return (
    <main className="flex min-h-full items-center justify-center overflow-y-auto bg-background px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-md font-semibold text-text-primary">Edrion</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface-elevated p-8 shadow-sm">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-text-primary">Application received</h1>
          <p className="mt-2 text-md text-text-secondary">
            Thank you for your interest in Edrion. Our onboarding team will review your request and
            email you once the review is complete.
          </p>

          {ref && (
            <div className="mt-6 rounded-xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Your reference number</p>
              <p className="mt-1 font-mono text-lg font-semibold text-primary">{ref}</p>
            </div>
          )}

          <div className="mt-6 space-y-3 text-left">
            <Step icon={ClipboardCheck} title="We review your application" body="A reviewer evaluates your details — usually within a few business days." />
            <Step icon={Mail} title="You hear back by email" body="We’ll email the contact address you verified with the outcome." />
            <Step icon={GraduationCap} title="Onboarding begins" body="Once approved, your administrator is invited and onboarding starts." />
          </div>
        </div>

        <Link href="/register" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">
          Back to registration
        </Link>
      </div>
    </main>
  );
}

function Step({ icon: Icon, title, body }: { icon: typeof Mail; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary">{body}</p>
      </div>
    </div>
  );
}
