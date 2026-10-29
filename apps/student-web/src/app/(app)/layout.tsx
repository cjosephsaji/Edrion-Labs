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
    } else if (me.data?.passwordChangeRequired) {
      router.replace('/change-password');
    }
  }, [me.error, me.data?.passwordChangeRequired, router]);

  if (me.data?.passwordChangeRequired) {
    return <div className="mx-auto max-w-lg px-4 py-10"><LoadingBlock label="Opening password setup…" /></div>;
  }

  if (me.isLoading) {
    return <AppShell><LoadingBlock label="Opening your portal…" /></AppShell>;
  }

  if (me.error instanceof StudentApiError && me.error.status === 401) {
    return (
      <main className="grid min-h-dvh w-full place-items-center px-4 py-10">
        <div className="w-full max-w-lg">
          <UnauthorizedState />
        </div>
      </main>
    );
  }

  if (me.error) {
    return (
      <main className="grid min-h-dvh w-full place-items-center px-4 py-10">
        <div className="w-full max-w-lg">
          <UnauthorizedState
            title="Couldn’t verify your session"
            description="Please sign in again to continue."
          />
        </div>
      </main>
    );
  }

  return <AppShell>{children}</AppShell>;
}
