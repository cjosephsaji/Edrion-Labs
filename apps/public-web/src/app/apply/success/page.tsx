'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, GraduationCap, Mail } from 'lucide-react';

/**
 * Post-submission confirmation for the parent admission funnel. Reads the reference from the query
 * string (via `window.location`, so no Suspense boundary is needed) and sets expectations for review.
 */
export default function ApplySuccessPage() {
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
          <h1 className="mt-5 text-2xl font-bold text-text-primary">Application submitted</h1>
          <p className="mt-2 text-md text-text-secondary">
            Thank you — your application has been received. The institution’s admissions team will
            review it and email you with the outcome.
          </p>

          {ref && (
            <div className="mt-6 rounded-xl border border-border bg-background-secondary p-4">
              <p className="text-xs uppercase tracking-wide text-text-muted">Your reference number</p>
              <p className="mt-1 font-mono text-lg font-semibold text-primary">{ref}</p>
              <p className="mt-1 text-xs text-text-muted">Keep this for your records.</p>
            </div>
          )}

          <div className="mt-6 space-y-3 text-left">
            <Step icon={ClipboardCheck} title="The school reviews your application" body="An admissions officer evaluates your details." />
            <Step icon={Mail} title="You hear back by email" body="We’ll email the address you verified with any updates or requests." />
            <Step icon={GraduationCap} title="Next steps" body="If accepted, the school guides you through enrolment." />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Link href="/apply/status" className="font-medium text-primary hover:underline">
            Check status
          </Link>
          <span className="text-text-muted">·</span>
          <Link href="/apply" className="font-medium text-primary hover:underline">
            Apply to another school
          </Link>
        </div>
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
