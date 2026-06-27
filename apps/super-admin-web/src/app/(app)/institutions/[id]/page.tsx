'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatusBadge,
  Skeleton,
  ErrorState,
  cn,
} from '@edrion/ui';
import {
  ApiClientError,
  useInstitution,
  useInstitutionStatusAction,
  type InstitutionAction,
} from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EnterPortalDialog } from '@/components/support/enter-portal-dialog';
import { InstitutionAccessSessions } from '@/components/support/institution-access-sessions';
import { InstitutionUsersTab } from '@/components/institution-users/institution-users-tab';
import { CampusesTab } from '@/components/campuses/campuses-tab';
import { SubscriptionTab } from '@/components/subscriptions/subscription-tab';
import { BillingTab } from '@/components/billing/billing-tab';

const TABS = [
  'overview',
  'campuses',
  'users',
  'subscription',
  'billing',
  'features',
  'usage',
  'support',
  'access-sessions',
  'activity',
  'audit',
  'security',
  'notes',
  'settings',
] as const;

const ACTIONS: { action: InstitutionAction; label: string; tone: 'primary' | 'danger' }[] = [
  { action: 'activate', label: 'Activate', tone: 'primary' },
  { action: 'restrict', label: 'Restrict', tone: 'danger' },
  { action: 'suspend', label: 'Suspend', tone: 'danger' },
  { action: 'archive', label: 'Archive', tone: 'danger' },
];

export default function InstitutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get('tab') ?? 'overview') as (typeof TABS)[number];

  const { data: inst, isLoading, isError } = useInstitution(id);
  const mutation = useInstitutionStatusAction(id);
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setTab(t: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set('tab', t);
    router.replace(`/institutions/${id}?${sp.toString()}`);
  }

  function runAction(reason: string) {
    if (!pending || !inst) return;
    setError(null);
    mutation.mutate(
      { action: pending.action, reason, version: inst.version },
      {
        onSuccess: () => setPending(null),
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : 'Action failed. Please retry.'),
      },
    );
  }

  return (
    <>
      <Topbar title="Institution" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-text-muted">
          <Link href="/institutions" className="hover:text-text-primary">
            Institutions
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-text-secondary">{inst?.displayName ?? '…'}</span>
        </nav>

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : isError || !inst ? (
          <ErrorState description="Could not load this institution." />
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-text-primary">{inst.displayName}</h2>
                  <StatusBadge status={inst.status} />
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {inst.publicId} · {inst.legalName} · {inst.country}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <EnterPortalDialog institutionId={inst.id} institutionName={inst.displayName} />
                {ACTIONS.map((a) => (
                  <Button
                    key={a.action}
                    variant={a.tone === 'danger' ? 'outline' : 'primary'}
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setPending(a);
                    }}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto border-b border-border">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'relative whitespace-nowrap px-3 py-2 text-sm capitalize transition-colors',
                    tab === t
                      ? 'font-medium text-primary'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {t.replace(/-/g, ' ')}
                  {tab === t && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === 'overview' ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Type" value={inst.type} />
                    <Row label="Support tier" value={inst.supportTier} />
                    <Row label="Onboarding" value={inst.onboardingStatus.replace(/_/g, ' ')} />
                    <Row label="Country" value={inst.country} />
                    <Row
                      label="Activated"
                      value={inst.activatedAt ? new Date(inst.activatedAt).toLocaleDateString() : '—'}
                    />
                    <Row
                      label="Trial ends"
                      value={inst.trialEndsAt ? new Date(inst.trialEndsAt).toLocaleDateString() : '—'}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Risk &amp; flags</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    {inst.riskFlags && inst.riskFlags.length > 0 ? (
                      <ul className="list-inside list-disc text-danger">
                        {inst.riskFlags.map((f) => (
                          <li key={f}>{f.replace(/_/g, ' ')}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-text-muted">No active risk flags.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : tab === 'campuses' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Campuses</CardTitle>
                </CardHeader>
                <CardContent>
                  <CampusesTab institutionId={inst.id} institutionName={inst.displayName} />
                </CardContent>
              </Card>
            ) : tab === 'users' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Institution users</CardTitle>
                </CardHeader>
                <CardContent>
                  <InstitutionUsersTab institutionId={inst.id} institutionName={inst.displayName} />
                </CardContent>
              </Card>
            ) : tab === 'subscription' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Subscription</CardTitle>
                </CardHeader>
                <CardContent>
                  <SubscriptionTab institutionId={inst.id} />
                </CardContent>
              </Card>
            ) : tab === 'billing' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Billing</CardTitle>
                </CardHeader>
                <CardContent>
                  <BillingTab institutionId={inst.id} />
                </CardContent>
              </Card>
            ) : tab === 'access-sessions' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Support access sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  <InstitutionAccessSessions institutionId={inst.id} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-sm text-text-muted">
                  The <span className="font-medium capitalize">{tab.replace(/-/g, ' ')}</span> tab is
                  delivered in a later phase. The data model and API for it already exist.
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? `${pending.label} ${inst?.displayName ?? 'institution'}?` : ''}
        description={
          pending?.tone === 'danger'
            ? 'This is a sensitive action. It is logged to the immutable audit trail and may require recent authentication.'
            : 'This action is logged to the audit trail.'
        }
        tone={pending?.tone}
        confirmLabel={pending?.label}
        loading={mutation.isPending}
        error={error}
        onConfirm={runAction}
        onClose={() => setPending(null)}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="capitalize text-text-primary">{value}</span>
    </div>
  );
}
