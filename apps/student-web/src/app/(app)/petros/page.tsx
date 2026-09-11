import { Suspense } from 'react';
import { PetrosInputModes } from '@/components/petros/petros-input-modes';
import { TeachingStudioLauncher } from '@/features/learning-studio/teaching-studio-launcher';

export default function PetrosInputModesPage() {
  return (
    <>
      <TeachingStudioLauncher />
      <Suspense fallback={<p>Opening Petros…</p>}><PetrosInputModes /></Suspense>
    </>
  );
}
