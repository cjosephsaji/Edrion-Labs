import { Suspense } from 'react';
import { PetrosInputModes } from '@/components/petros/petros-input-modes';

export default function PetrosInputModesPage() {
  return <Suspense fallback={<p>Opening Petros input modes…</p>}><PetrosInputModes /></Suspense>;
}
