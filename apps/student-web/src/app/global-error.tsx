'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f5f2e9', color: '#17372f', fontFamily: "'Source Sans 3', system-ui, sans-serif" }}>
        <main style={{ boxSizing: 'border-box', display: 'grid', minHeight: '100vh', placeItems: 'center', padding: 24 }}>
          <section style={{ width: 'min(100%, 720px)', border: '1px solid #d7d2c5', background: '#fbfaf5', padding: 'clamp(24px, 5vw, 48px)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: '#596b64' }}>Edrion student portal</p>
            <h1 style={{ margin: '16px 0 0', fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 400, lineHeight: 1.05 }}>The portal couldn’t finish loading</h1>
            <p style={{ maxWidth: 560, margin: '16px auto 0', fontSize: 16, lineHeight: 1.6, color: '#596b64' }}>Your information is safe. Reload the application and try again.</p>
            <button type="button" onClick={reset} style={{ minHeight: 44, marginTop: 24, border: '1px solid #0c3f31', background: '#0c3f31', padding: '10px 18px', color: '#fff', font: 'inherit', fontSize: 16, cursor: 'pointer' }}>Reload portal</button>
          </section>
        </main>
      </body>
    </html>
  );
}
