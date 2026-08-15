'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorState } from '@edrion/ui';
import { usePortalMe } from '@/lib/hooks';
import { PortalClientError } from '@/lib/portal-client';
import { isParentPortalUser } from '@/lib/parent-portal-user';

/** Redirect guardian-only users away from the staff portal shell. */
export function StaffPortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, isLoading, isError, error } = usePortalMe();

  useEffect(() => {
    if (isLoading) return;
    if (isError && error instanceof PortalClientError && error.status === 401) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?next=${next}`);
      return;
    }
    if (!me) return;
    if (isParentPortalUser(me.roleKeys, me.permissions)) {
      router.replace('/family');
    }
  }, [isLoading, isError, error, me, router]);

  if (isLoading) return <GateStatus message="Loading portal..." />;
  if (isError) {
    if (error instanceof PortalClientError && error.status === 401) {
      return <GateStatus message="Redirecting to sign in..." />;
    }
    return (
      <GateStatus>
        <ErrorState
          title="Could not load the portal"
          description={error instanceof Error ? error.message : 'The portal API did not respond correctly.'}
        />
      </GateStatus>
    );
  }
  if (me && isParentPortalUser(me.roleKeys, me.permissions)) {
    return <GateStatus message="Redirecting to family portal..." />;
  }

  return <>{children}</>;
}

/** Keep staff users out of the guardian experience. */
export function GuardianPortalGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, isLoading } = usePortalMe();

  useEffect(() => {
    if (isLoading || !me) return;
    if (!isParentPortalUser(me.roleKeys, me.permissions)) {
      router.replace('/dashboard');
    }
  }, [isLoading, me, router]);

  if (isLoading) return <GateStatus message="Loading family portal..." />;
  if (!me || !isParentPortalUser(me.roleKeys, me.permissions)) {
    return <GateStatus message="Redirecting to staff portal..." />;
  }

  return <>{children}</>;
}

function GateStatus({ message, children }: { message?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children ?? <p className="text-sm font-medium text-text-muted">{message}</p>}
    </div>
  );
}
