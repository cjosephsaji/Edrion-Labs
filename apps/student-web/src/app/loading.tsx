import { CardSkeleton } from '@/components/design-system';

export default function Loading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1120px] px-4 py-12" role="status" aria-live="polite">
      <CardSkeleton label="Loading page…" />
    </main>
  );
}
