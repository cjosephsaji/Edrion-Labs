'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Clock, GraduationCap } from 'lucide-react';
import { Button } from '@edrion/ui';
import { applyApi, ApplyApiError, type AdmissionDraftView } from '@/components/apply/apply-api';

const STORAGE_KEY = 'edrion_admission_v1';

/**
 * Parent application-status lookup. The public API authorises a draft only by its signed resume
 * token, which lives in this device's localStorage and is NEVER shown to or entered by the parent.
 * Status is therefore device-bound: we auto-load the stored draft id + token and resolve status
 * silently. If nothing is on this device we explain that — we never ask the parent for the token.
 */
export default function ApplyStatusPage() {
  const [storedRef, setStoredRef] = useState<string | null>(null);
  const [view, setView] = useState<AdmissionDraftView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const lookup = async (id: string, tok: string, ref?: string | null) => {
    setError(null);
    setLoading(true);
    try {
      const v = await applyApi.resume(id.trim(), tok.trim());
      setView(v);
      if (ref) setStoredRef(ref);
    } catch (e) {
      setView(null);
      setError((e as ApplyApiError).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load whatever's on this device so a returning parent sees status immediately. The resume
  // token stays internal — read from storage, sent as a header, never surfaced in the UI.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const s = raw ? JSON.parse(raw) : {};
      if (s.applicationNo) setStoredRef(s.applicationNo);
      if (s.draftId && s.resumeToken) void lookup(s.draftId, s.resumeToken, s.applicationNo ?? null);
    } catch {
      /* ignore */
    } finally {
      setAutoTried(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applicationNo = view?.submittedApplicationNo ?? storedRef;
  const submitted = view?.status === 'submitted';

  return (
    <main className="flex min-h-full items-center justify-center overflow-y-auto bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-md font-semibold text-text-primary">Edrion</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-bold text-text-primary">Application status</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Check the status of an admission application you started on this device.
          </p>

          {view ? (
            <div className="page-enter mt-6 space-y-4">
              <div
                className={
                  submitted
                    ? 'flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft/50 p-4'
                    : 'flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/50 p-4'
                }
              >
                <span className={submitted ? 'text-success' : 'text-warning'}>
                  {submitted ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {submitted ? 'Submitted' : 'Draft — not yet submitted'}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {submitted
                      ? 'Your application has been received and is awaiting review by the institution.'
                      : 'You haven’t submitted this application yet. Continue where you left off.'}
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-border rounded-xl border border-border">
                {applicationNo && (
                  <Row label="Reference">
                    <span className="font-mono font-semibold text-primary">{applicationNo}</span>
                  </Row>
                )}
                <Row label="Contact email">{view.contactEmail}</Row>
                <Row label="Email verified">{view.emailVerified ? 'Yes' : 'No'}</Row>
                <Row label="Last updated">{new Date(view.updatedAt).toLocaleString()}</Row>
              </dl>

              {!submitted && (
                <Link href={`/apply?draft=${encodeURIComponent(view.id)}`}>
                  <Button className="w-full">Continue application</Button>
                </Link>
              )}
            </div>
          ) : loading || !autoTried ? (
            <p className="mt-6 rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-text-secondary">
              Checking for an application saved on this device…
            </p>
          ) : (
            <div className="page-enter mt-6 space-y-4">
              <div className="rounded-xl border border-border bg-background-secondary p-4">
                <p className="text-sm font-semibold text-text-primary">No application found on this device</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Your application is saved in the browser where you started it. Reopen this page on
                  that device to see its status. If you already submitted, we’ll email updates to the
                  address you verified — check your inbox for your reference number.
                </p>
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Link href="/apply">
                <Button variant="secondary" className="w-full">
                  Start a new application
                </Button>
              </Link>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link href="/apply" className="text-sm font-medium text-primary hover:underline">
            ← Back to apply
          </Link>
        </div>
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="truncate text-right text-text-primary">{children}</dd>
    </div>
  );
}
