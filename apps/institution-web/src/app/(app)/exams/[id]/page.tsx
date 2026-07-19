'use client';
import { useParams } from 'next/navigation';
import { ExamBuilder } from '@/components/exams/exam-builder';

export default function EditExamPage() {
  const { id } = useParams<{ id: string }>();
  return <ExamBuilder examId={id} />;
}
