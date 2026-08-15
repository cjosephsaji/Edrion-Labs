'use client';

import { ExamAttemptScreen } from '@/components/exams/exam-attempt-screen';

export default function Page({ params }: { params: { scheduleId: string } }) {
  return <ExamAttemptScreen scheduleId={params.scheduleId} />;
}
