'use client';
import { useEffect } from 'react';
import Link from 'next/link';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * App-wide catch-all for render/runtime errors. Deliberately generic — feature screens
 * surface their own specific failures; this only catches what they did not.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isDev) console.error('[student-web] unhandled error boundary', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-[640px] flex-col items-center justify-center px-5 py-16 text-center animate-st-block-in motion-reduce:animate-none">
      <h1 className="font-display text-[23px] font-semibold text-st-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-st-muted">
        This page didn&apos;t load properly. Nothing you did caused it — try again.
      </p>
      {error.digest && (
        <p className="mt-1.5 font-mono-ui text-[10.5px] uppercase text-st-faint">{error.digest}</p>
      )}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-st-accentDeep px-4 py-2 text-sm font-medium text-white"
        >
          Try again
        </button>
        <Link href="/home" className="rounded-full border border-st-bd2 px-4 py-2 text-sm text-st-ink">
          Go home
        </Link>
      </div>
    </div>
  );
}
