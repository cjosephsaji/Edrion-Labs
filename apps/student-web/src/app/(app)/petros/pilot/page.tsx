import { PetrosPilotPageContent } from '@/components/petros/petros-pilot-entry';

export default function PetrosPilotPage({ searchParams }: { searchParams: { session?: string } }) {
  return <main><PetrosPilotPageContent sessionId={searchParams.session} /></main>;
}
