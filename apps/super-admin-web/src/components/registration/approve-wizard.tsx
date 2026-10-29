'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react';
import { Button, Dialog, FieldError, Input, Label, Select, cn, countryName } from '@edrion/ui';
import {
  ApiClientError,
  useApproveRegistration,
  usePlans,
  type RegistrationApprovalResultDto,
  type RegistrationRequestDto,
} from '@edrion/api-client';
import { formatPlanName, planNameByKey } from '@/lib/registration-display';

const STEP_TITLES = ['Review', 'Subscription', 'Campus', 'Administrator', 'Confirm'];

const TIER_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'priority', label: 'Priority' },
  { value: 'enterprise', label: 'Enterprise' },
];
const ROLE_OPTIONS = [
  { value: 'institution_owner', label: 'Institution Owner' },
  { value: 'institution_admin', label: 'Institution Admin' },
];
const DELIVERY_OPTIONS = [
  { value: 'activation', label: 'Activation link for new accounts' },
  { value: 'temporary_password', label: 'Temporary password for new accounts' },
];

/**
 * Guided approval. Provisioning is never a single click — the reviewer confirms the institution,
 * subscription, first campus and primary administrator before the server creates anything.
 */
export function ApproveWizard({
  open,
  onClose,
  request,
  onApproved,
}: {
  open: boolean;
  onClose: () => void;
  request: RegistrationRequestDto;
  onApproved: (result: RegistrationApprovalResultDto) => void;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mutation = useApproveRegistration(request.id);
  const plans = usePlans({ pageSize: 100 });
  const planNames = planNameByKey(plans.data?.items ?? []);

  const [supportTier, setSupportTier] = useState('standard');
  const [planKey] = useState(request.preferredPlanKey ?? '');
  const [campusName, setCampusName] = useState(
    request.campusInfo?.firstCampusName ?? `${request.displayName ?? 'Main'} Campus`,
  );
  const [adminName, setAdminName] = useState(request.contactName ?? '');
  const [adminEmail, setAdminEmail] = useState(request.contactEmail ?? '');
  const [adminRole, setAdminRole] = useState('institution_owner');
  const [delivery, setDelivery] = useState('activation');
  const [note, setNote] = useState('');

  const next = () => {
    setError(null);
    if (step === 2 && !campusName.trim()) {
      setError('Campus name is required.');
      return;
    }
    if (step === 3) {
      if (adminName.trim().length < 2) return setError('Administrator name is required.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail.trim()))
        return setError('Enter a valid administrator email.');
    }
    setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1));
  };
  const back = () => {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const confirm = () => {
    setError(null);
    mutation.mutate(
      {
        version: request.version,
        supportTier: supportTier as 'standard' | 'priority' | 'enterprise',
        planKey: planKey.trim() || undefined,
        campus: { name: campusName.trim() },
        admin: {
          fullName: adminName.trim(),
          email: adminEmail.trim(),
          roleKeys: [adminRole],
          credentialDelivery: delivery as 'activation' | 'temporary_password',
        },
        note: note.trim() || undefined,
      },
      {
        onSuccess: (res) => onApproved(res),
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Approval failed. Please retry.'),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Approve & provision institution"
      className="max-w-lg"
    >
      <div className="p-5">
        <div className="mb-4">
          <h2 className="text-md font-semibold text-text-primary">Approve &amp; provision</h2>
          <ol className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            {STEP_TITLES.map((t, i) => (
              <li key={t} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex items-center gap-1',
                    i === step
                      ? 'font-semibold text-primary'
                      : i < step
                        ? 'text-success'
                        : 'text-text-muted',
                  )}
                >
                  {i < step && <Check className="h-3 w-3 shrink-0" />}
                  <span>{t}</span>
                </span>
                {i < STEP_TITLES.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-text-muted/40 shrink-0" />
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="page-enter min-h-[180px] space-y-4">
          {step === 0 && (
            <div className="space-y-2 text-sm">
              <p className="text-text-secondary">
                You're about to create a live institution from this application.
              </p>
              <Row label="Institution" value={request.displayName ?? request.legalName ?? '—'} />
              <Row label="Legal name" value={request.legalName ?? '—'} />
              <Row label="Type" value={request.type?.replace(/_/g, ' ') ?? '—'} />
              <Row label="Country" value={request.country ? countryName(request.country) : '—'} />
              <Row
                label="Primary contact"
                value={`${request.contactName ?? '—'} · ${request.contactEmail ?? ''}`}
              />
              <Row
                label="Expected students"
                value={request.expectedStudents?.toLocaleString() ?? '—'}
              />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="tier">Support tier</Label>
                <Select
                  id="tier"
                  options={TIER_OPTIONS}
                  value={supportTier}
                  onChange={(e) => setSupportTier(e.target.value)}
                />
              </div>
              <div>
                <Label>Selected plan</Label>
                <div className="rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-text-primary">
                  {planKey ? (
                    formatPlanName(planKey, planNames)
                  ) : (
                    <span className="text-text-muted">No plan chosen by the institution</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Chosen by the institution during registration. A trial subscription on this plan
                  is opened on approval.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="campus-name">First campus name</Label>
                <Input
                  id="campus-name"
                  value={campusName}
                  onChange={(e) => setCampusName(e.target.value)}
                />
                <p className="mt-1 text-xs text-text-muted">
                  A unique campus code is generated automatically on provisioning.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="admin-name">Administrator name</Label>
                <Input
                  id="admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="admin-email">Administrator email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="admin-role">Role</Label>
                  <Select
                    id="admin-role"
                    options={ROLE_OPTIONS}
                    value={adminRole}
                    onChange={(e) => setAdminRole(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="admin-delivery">Access</Label>
                  <Select
                    id="admin-delivery"
                    aria-describedby="admin-delivery-note"
                    options={DELIVERY_OPTIONS}
                    value={delivery}
                    onChange={(e) => setDelivery(e.target.value)}
                  />
                </div>
              </div>
              <p id="admin-delivery-note" className="text-xs text-text-muted">
                An existing active institution account uses its current sign-in and receives an
                approval email. This choice applies to new accounts.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2 text-sm">
              <p className="text-text-secondary">
                Confirm to create the institution (in Onboarding), its first campus, the
                administrator and an onboarding checklist.
              </p>
              <Row label="Institution" value={request.displayName ?? request.legalName ?? '—'} />
              <Row label="Support tier" value={supportTier} />
              <Row label="Campus" value={campusName} />
              <Row label="Administrator" value={`${adminName} · ${adminEmail}`} />
              <Row label="Role" value={adminRole.replace(/_/g, ' ')} />
              <Row
                label="Access"
                value={
                  delivery === 'activation'
                    ? 'Existing account sign-in, or activation for a new account'
                    : 'Existing account sign-in, or a temporary password for a new account'
                }
              />
              <div className="pt-2">
                <Label htmlFor="approve-note">Note (optional)</Label>
                <Input
                  id="approve-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Recorded with the approval"
                />
              </div>
            </div>
          )}

          <FieldError>{error}</FieldError>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={step === 0 ? onClose : back}
            disabled={mutation.isPending}
          >
            {step === 0 ? (
              'Cancel'
            ) : (
              <>
                <ArrowLeft className="h-4 w-4" /> Back
              </>
            )}
          </Button>
          {step < STEP_TITLES.length - 1 ? (
            <Button onClick={next}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={confirm} loading={mutation.isPending} disabled={mutation.isPending}>
              {mutation.isPending ? 'Provisioning…' : 'Approve & create'}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium text-text-primary">{value}</span>
    </div>
  );
}
