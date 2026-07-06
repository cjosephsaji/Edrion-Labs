'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentMe } from '@/lib/hooks';
import { AppShell } from '@/components/app-shell/app-shell';
import { StudentClientError } from '@/lib/student-client';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: me, isLoading, isError, error } = useStudentMe();

  useEffect(() => {
    if (!isLoading && isError) {
      const status = error instanceof StudentClientError ? error.status : 0;
      if (status === 401 || status === 403) {
        router.replace('/login');
      }
    }
  }, [isLoading, isError, error, router]);

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-st-page">
        <div className="h-10 w-48 shimmer rounded-xl" />
      </div>
    );
  }

  if (isError && error instanceof StudentClientError && error.status === 403) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-semibold text-st-ink">Access suspended</h1>
        <p className="mt-2 text-sm text-st-muted">
          Your student portal access is not available right now. Contact your school for help.
        </p>
      </div>
    );
  }

  if (!me) return null;

  return <AppShell>{children}</AppShell>;
}
