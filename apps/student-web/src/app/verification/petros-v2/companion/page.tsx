import { notFound } from 'next/navigation';
import { CompanionSampler } from '@/features/petros-v2/companion/companion-sampler';
export const dynamic = 'force-dynamic';
export default function Page() {
  if (
    process.env.PETROS_ISOLATED_VERIFICATION !== '1' ||
    process.env.NEXT_PUBLIC_PETROS_M4_DEMO !== '1'
  )
    notFound();
  return <CompanionSampler />;
}
