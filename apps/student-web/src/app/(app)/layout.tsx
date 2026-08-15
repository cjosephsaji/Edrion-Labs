'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { LoadingBlock, UnauthorizedState } from '@/components/ui/states';
import { StudentApiError } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useStudentMe();

  useEffect(() => {
    if (me.error instanceof StudentApiError && me.error.status === 401) {
      router.replace('/login');
    }
  }, [me.error, router]);

  if (me.isLoading) {
    return <AppShell><LoadingBlock label="Opening your portal…" /></AppShell>;
  }

  if (me.error instanceof StudentApiError && me.error.status === 401) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <UnauthorizedState />
      </div>
    );
  }

  if (me.error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <UnauthorizedState
          title="Couldn’t verify your session"
          description="Please sign in again to continue."
        />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
