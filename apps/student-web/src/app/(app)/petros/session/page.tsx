import { PetrosRepairSession } from '@/components/petros/petros-repair-session';

export default function PetrosSessionPage({ searchParams }: { searchParams: { session?: string } }) {
  return <PetrosRepairSession topic="this learning goal" source="portal" sessionId={searchParams.session} />;
}
