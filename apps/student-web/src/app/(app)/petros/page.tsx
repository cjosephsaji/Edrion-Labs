import { Suspense } from 'react';
import { PetrosHome } from '@/components/petros/petros-home';
import { PetrosV2Door } from '@/features/petros-v2/petros-v2-door';

export default function PetrosInputModesPage() {
  return (
    <Suspense fallback={<p>Opening Petros…</p>}>
      <PetrosV2Door />
      <PetrosHome />
    </Suspense>
  );
}
