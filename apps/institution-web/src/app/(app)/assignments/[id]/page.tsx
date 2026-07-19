'use client';
import { useParams } from 'next/navigation';
import { AssignmentBuilder } from '@/components/assignments/assignment-builder';

export default function EditAssignmentPage() {
  const { id } = useParams<{ id: string }>();
  return <AssignmentBuilder assignmentId={id} />;
}
