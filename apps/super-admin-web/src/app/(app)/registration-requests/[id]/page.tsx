'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  ShieldCheck,
  UserPlus,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  FieldError,
  Label,
  Select,
  Skeleton,
  StatusBadge,
  ErrorState,
  countryName,
  timezoneLabel,
} from '@edrion/ui';
import {
  ApiClientError,
  useAddRegistrationNote,
  useAssignRegistrationReviewer,
  useEmployees,
  useRegistrationRequest,
  useStartRegistrationReview,
  type RegistrationRequestDto,
} from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { ApproveWizard } from '@/components/registration/approve-wizard';
import { RejectDialog } from '@/components/registration/reject-dialog';

export default function RegistrationRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, isError } = useRegistrationRequest(id);
  const employees = useEmployees({ pageSize: 100 });
  const startReview = useStartRegistrationReview(id);
  const addNote = useAddRegistrationNote(id);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const empName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees.data?.items ?? []) m.set(e.id, e.fullName);
    return (eid: string | null) => (eid ? m.get(eid) ?? 'Unknown reviewer' : '—');
  }, [employees.data]);

  if (isLoading) {
    return (
      <>
        <Topbar title="Registration request" actions={<span />} />
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }
  if (isError || !data) {
    return (
      <>
        <Topbar title="Registration request" actions={<span />} />
        <div className="p-6">
          <ErrorState description="Could not load this registration request." />
        </div>
      </>
    );
  }

  const r = data.request;
  const reviewable = r.status === 'submitted' || r.status === 'under_review';
  const comms = data.auditEvents.filter((e) => e.action === 'registration.email_sent');

  const doStartReview = () => {
    setActionError(null);
    startReview.mutate(
      { version: r.version },
      { onError: (e) => setActionError(e instanceof ApiClientError ? e.message : 'Failed to start review.') },
    );
  };
  const doAddNote = () => {
    if (!note.trim()) return;
    setActionError(null);
    addNote.mutate(
      { note: note.trim() },
      {
        onSuccess: () => setNote(''),
        onError: (e) => setActionError(e instanceof ApiClientError ? e.message : 'Failed to add note.'),
      },
    );
  };

  return (
    <>
      <Topbar title="Registration request" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        {/* Breadcrumb + header */}
        <nav className="flex items-center gap-1 text-sm text-text-muted">
          <Link href="/registration-requests" className="hover:text-primary">Registration Requests</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">{r.publicRef ?? 'Draft'}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-text-primary">
                {r.displayName ?? r.legalName ?? 'Untitled application'}
              </h2>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-1 text-sm text-text-muted">
              {r.publicRef ?? 'Draft'} · {r.type?.replace(/_/g, ' ') ?? '—'} · submitted{' '}
              {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '—'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {r.status === 'submitted' && (
              <Button size="sm" variant="secondary" onClick={doStartReview} loading={startReview.isPending}>
                Start review
              </Button>
            )}
            {reviewable && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Assign
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
                <Button size="sm" onClick={() => setApproveOpen(true)}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
              </>
            )}
            {r.status === 'approved' && r.linkedInstitutionId && (
              <Button size="sm" onClick={() => router.push(`/institutions/${r.linkedInstitutionId}`)}>
                <Building2 className="h-4 w-4" /> View institution
              </Button>
            )}
          </div>
        </div>

        {actionError && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {actionError}
          </p>
        )}

        {r.status === 'submitted' && (
          <p className="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info">
            This application is awaiting review. Start the review to take ownership before approving or rejecting.
          </p>
        )}
        {r.status === 'rejected' && r.rejectionReason && (
          <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            <strong>Rejected:</strong> {r.rejectionReason}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* Left: applicant-provided info */}
          <div className="space-y-5">
            <InfoCard icon={Building2} title="Institution information" rows={[
              ['Legal name', r.legalName],
              ['Display name', r.displayName],
              ['Type', r.type?.replace(/_/g, ' ')],
              ['Website', r.institutionInfo?.website as string],
              ['Year established', r.institutionInfo?.yearEstablished as number],
              ['Registration number', r.institutionInfo?.registrationNumber as string],
            ]} />
            <InfoCard icon={MapPin} title="Location" rows={[
              ['Country', r.country ? countryName(r.country) : undefined],
              ['State / Province', r.region],
              ['City', r.location?.city as string],
              ['Address', r.location?.address as string],
              ['Postal code', r.location?.postalCode as string],
              ['Time zone', r.location?.timezone ? timezoneLabel(r.location.timezone as string) : undefined],
            ]} />
            <InfoCard icon={Mail} title="Primary contact" rows={[
              ['Name', r.contactName],
              ['Job title', r.primaryContact?.jobTitle as string],
              ['Email', r.contactEmail],
              ['Phone', r.contactPhone],
              ['Preferred method', r.primaryContact?.preferredContactMethod as string],
            ]} />
            <InfoCard icon={Building2} title="Campus information" rows={[
              ['Current campuses', r.campusesCount],
              ['Expected next year', r.campusInfo?.expectedCampusesNextYear as number],
              ['First campus', r.campusInfo?.firstCampusName as string],
              ['Expected students', r.expectedStudents],
              ['Expected staff', r.campusInfo?.expectedStaff as number],
            ]} />
            <InfoCard icon={ShieldCheck} title="Subscription preferences" rows={[
              ['Preferred plan', r.preferredPlanKey],
              ['Launch timeline', r.subscription?.launchTimeline as string],
              ['Current ERP', r.subscription?.currentErp as string],
              ['Heard about us', r.subscription?.hearAboutUs as string],
              ['Additional requirements', r.subscription?.additionalRequirements as string],
            ]} />
          </div>

          {/* Right: status, verification, reviewer, timeline */}
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle>Verification &amp; review</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Email verified">
                  {r.emailVerifiedAt ? (
                    <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> Verified</span>
                  ) : (
                    <span className="text-text-muted">Not verified</span>
                  )}
                </DetailRow>
                <DetailRow label="Verified email">{r.verifiedEmail ?? '—'}</DetailRow>
                <DetailRow label="Assigned reviewer">{empName(r.assignedReviewerId)}</DetailRow>
                <DetailRow label="Marketing opt-in">{r.consent?.marketingOptIn ? 'Yes' : 'No'}</DetailRow>
              </CardContent>
            </Card>

            {r.status !== 'draft' && (
              <Card>
                <CardHeader><CardTitle>Internal notes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add an internal note…"
                      onKeyDown={(e) => e.key === 'Enter' && doAddNote()}
                      className="h-input w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <Button size="sm" onClick={doAddNote} loading={addNote.isPending} disabled={!note.trim()}>Add</Button>
                  </div>
                  <p className="text-xs text-text-muted">Notes are visible to Edrion employees only — never to the applicant.</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
              <CardContent>
                {data.reviews.length === 0 ? (
                  <p className="text-sm text-text-muted">No reviewer activity yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.reviews.map((rev) => (
                      <li key={rev.id} className="border-l-2 border-border pl-3">
                        <p className="text-sm text-text-primary">
                          <span className="font-medium capitalize">{rev.action.replace(/_/g, ' ')}</span>
                          {' · '}
                          <span className="text-text-secondary">{empName(rev.reviewerId)}</span>
                        </p>
                        {rev.note && <p className="text-sm text-text-secondary">{rev.note}</p>}
                        {rev.rejectionReason && <p className="text-sm text-danger">{rev.rejectionReason}</p>}
                        <p className="text-xs text-text-muted">{new Date(rev.createdAt).toLocaleString()}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Communication history</CardTitle></CardHeader>
              <CardContent>
                {comms.length === 0 ? (
                  <p className="text-sm text-text-muted">No emails sent yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {comms.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 text-text-secondary">
                          <Mail className="h-3.5 w-3.5" />
                          {String((c.newState as Record<string, unknown> | null)?.template ?? 'email').replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-text-muted">{new Date(c.occurredAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Audit events</CardTitle></CardHeader>
              <CardContent>
                {data.auditEvents.length === 0 ? (
                  <p className="text-sm text-text-muted">No audit events.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.auditEvents.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 text-text-secondary">
                          <Clock className="h-3.5 w-3.5" /> {e.action.replace(/^registration\./, '').replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-text-muted">{new Date(e.occurredAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ApproveWizard
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        request={r}
        onApproved={(res) => {
          setApproveOpen(false);
          router.push(`/institutions/${res.institutionId}`);
        }}
      />
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} request={r} onDone={() => {}} />
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        request={r}
        employees={(employees.data?.items ?? []).map((e) => ({ value: e.id, label: e.fullName }))}
      />
    </>
  );
}

function AssignDialog({
  open,
  onClose,
  request,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  request: RegistrationRequestDto;
  employees: { value: string; label: string }[];
}) {
  const [reviewerId, setReviewerId] = useState(request.assignedReviewerId ?? '');
  const [error, setError] = useState<string | null>(null);
  const mutation = useAssignRegistrationReviewer(request.id);

  const submit = () => {
    if (!reviewerId) return setError('Select a reviewer.');
    setError(null);
    mutation.mutate(
      { reviewerId, version: request.version },
      {
        onSuccess: () => onClose(),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Failed to assign.'),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="Assign reviewer">
      <div className="p-5">
        <h2 className="text-md font-semibold text-text-primary">Assign reviewer</h2>
        <p className="mt-1 text-sm text-text-secondary">Hand this application to a specific reviewer.</p>
        <div className="mt-4">
          <Label htmlFor="reviewer">Reviewer</Label>
          <Select
            id="reviewer"
            options={employees}
            placeholder="Select a reviewer…"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
          />
          <FieldError>{error}</FieldError>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={submit} loading={mutation.isPending} disabled={mutation.isPending}>Assign</Button>
        </div>
      </div>
    </Dialog>
  );
}

function InfoCard({
  icon: Icon,
  title,
  rows,
}: {
  icon: typeof Building2;
  title: string;
  rows: [string, unknown][];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
              <dd className="truncate text-sm text-text-primary">{value === undefined || value === null || value === '' ? '—' : String(value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium text-text-primary">{children}</span>
    </div>
  );
}
