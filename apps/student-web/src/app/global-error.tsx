'use client';
import { useEffect } from 'react';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Last-resort boundary — it replaces the root layout, so it cannot rely on the app's
 * fonts or Tailwind layer being present. Styles are inline, with token vars where they
 * resolve and literal ivory/ink fallbacks where they don't.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isDev) console.error('[student-web] global error boundary', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--st-page, #F3F0E7)',
          color: 'var(--st-ink, #17251F)',
          fontFamily: 'var(--font-body, ui-sans-serif, system-ui, sans-serif)',
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 23, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: 'var(--st-muted, #5C6660)' }}>
            The app hit an unexpected problem. Reloading usually clears it.
          </p>
          {error.digest && (
            <p style={{ marginTop: 6, fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--st-faint, #8A928C)' }}>
              {error.digest.toUpperCase()}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              border: 0,
              borderRadius: 999,
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 500,
              color: '#FFFFFF',
              background: 'var(--st-accentDeep, #1f604a)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
