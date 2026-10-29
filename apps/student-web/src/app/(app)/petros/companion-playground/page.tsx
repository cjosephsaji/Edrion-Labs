import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CompanionPlayground } from '@/features/petros-v2/playground/companion-playground';
import { authorizedPlaygroundTester, playgroundEnabled } from '@/features/petros-v2/playground/playground-admission';

export const dynamic = 'force-dynamic';

export default async function CompanionPlaygroundPage() {
  if (!playgroundEnabled(process.env.PETROS_V2_COMPANION_PLAYGROUND_ENABLED) || !process.env.PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS) notFound();
  const cookie = cookies().toString();
  if (!cookie) redirect('/login');
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3007').replace(/\/$/, '');
  let ownerId: string | null = null;
  try {
    const response = await fetch(`${base}/v1/student/me`, { headers: { cookie }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.ok) ownerId = authorizedPlaygroundTester(await response.json(), process.env.PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS);
  } catch { /* Fail closed. Existing layout also verifies authentication. */ }
  if (!ownerId) notFound();
  return <CompanionPlayground ownerId={ownerId} />;
}
