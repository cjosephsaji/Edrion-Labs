'use client';

import { useParams } from 'next/navigation';
import { useVisualCanvas } from '@/lib/hooks';
import { StudentClientError } from '@/lib/student-client';
import { ThinkingCanvasShell } from '@/components/visual-studio/ThinkingCanvasShell';
import { CanvasErrorState } from '@/components/visual-studio/CanvasErrorState';

export default function VisualCanvasPage() {
  const params = useParams<{ id: string }>();
  const canvasId = params.id;
  const { data, isLoading, isError, error } = useVisualCanvas(canvasId);

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center bg-st-page">
        <div className="h-10 w-48 shimmer rounded-xl" />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof StudentClientError && error.status === 404;
    return (
      <CanvasErrorState
        title={notFound ? "This canvas isn't here." : 'Could not open this canvas'}
        message={
          notFound
            ? 'It may have been removed or you may not have access.'
            : 'Check your connection and try again.'
        }
      />
    );
  }

  if (!data) return null;

  return (
    <ThinkingCanvasShell
      canvasId={data.id}
      title={data.title}
      graph={data.graph}
      serverVersion={data.version}
      origin={data.origin}
    />
  );
}
