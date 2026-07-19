'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

  if (isLoading) return null;
  if (isError) return null;
  if (me && isParentPortalUser(me.roleKeys, me.permissions)) return null;

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

  if (isLoading) return null;
  if (!me || !isParentPortalUser(me.roleKeys, me.permissions)) return null;

  return <>{children}</>;
}
