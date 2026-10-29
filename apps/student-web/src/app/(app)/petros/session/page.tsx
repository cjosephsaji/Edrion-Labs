import { PetrosSessionDispatch } from '@/features/petros-v2/petros-session-dispatch';

export default function PetrosSessionPage({ searchParams }: { searchParams: { session?: string } }) {
  return <PetrosSessionDispatch sessionId={searchParams.session} />;
}
