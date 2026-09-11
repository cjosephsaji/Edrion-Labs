import { PetrosDocumentTeaching } from '@/components/petros/petros-document-teaching';

export default function PetrosDocumentPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  return <PetrosDocumentTeaching sessionId={searchParams.session} />;
}
