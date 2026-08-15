'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/design-system';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1120px] place-items-center px-4 py-12">
      <div className="w-full">
        <ErrorState
          title="This page hit an unexpected problem"
          description="Your information is safe. Try the page again; if it continues, return to the portal and open the section once more."
          onRetry={reset}
        />
      </div>
    </main>
  );
}
