'use client';
import { Suspense } from 'react';
import QuizPageInner from './QuizPageInner';

export default function QuizPage({ params }: { params: { id: string } }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-6">
          <div className="h-64 shimmer rounded-[15px]" />
        </div>
      }
    >
      <QuizPageInner params={params} />
    </Suspense>
  );
}
