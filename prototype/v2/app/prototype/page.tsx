import { headers } from 'next/headers';
import { identity } from '../../server/access';
import { LiveTeachingSurface } from '../../components/LiveTeachingSurface';
import { prototypeFeatures } from '../../core/prototype-features';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ retry?: string; view?: string }>;
}) {
  const query = await searchParams;
  if (identity(new Headers(await headers())))
    return (
      <LiveTeachingSurface
        presentation={
          prototypeFeatures.world && query.view !== '2d' ? 'world' : '2d'
        }
      />
    );
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#eff0e3',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui',
        color: '#2d4d39',
      }}
    >
      <form
        method="post"
        action="/prototype/api/unlock"
        style={{
          width: 'min(380px,85vw)',
          padding: 30,
          background: '#fffef4',
          borderRadius: 20,
          border: '1px solid #cbd4ba',
        }}
      >
        <small style={{ letterSpacing: 2 }}>PETROS / PRIVATE PREVIEW</small>
        <h1 style={{ fontFamily: 'Georgia', fontWeight: 400 }}>
          A place for your curiosity.
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>
          Enter your preview passphrase to explore the five live experiments.
        </p>
        {query.retry && <p role="alert">That passphrase didn’t match.</p>}
        <label htmlFor="secret">Preview passphrase</label>
        <input
          id="secret"
          name="secret"
          type="password"
          autoComplete="current-password"
          maxLength={256}
          required
          style={{
            display: 'block',
            boxSizing: 'border-box',
            width: '100%',
            padding: 12,
            marginTop: 8,
            border: '1px solid #bccbad',
            borderRadius: 8,
          }}
        />
        <button
          style={{
            marginTop: 12,
            padding: 12,
            width: '100%',
            border: 0,
            borderRadius: 8,
            background: '#42684b',
            color: '#fff',
          }}
        >
          Enter the study
        </button>
      </form>
    </main>
  );
}
