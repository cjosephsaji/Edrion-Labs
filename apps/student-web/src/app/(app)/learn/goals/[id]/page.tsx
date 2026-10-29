'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QueryPage } from '@/components/query-page';
import { PetrosAssignedGoal, type AssignedPetrosGoal } from '@/components/petros/petros-assigned-goal';
import { useStudentApi } from '@/lib/api-client';

export default function TeacherLearningGoalPage() {
  const { id } = useParams<{ id: string }>();
  const api = useStudentApi();
  const query = useQuery({ queryKey: ['student', 'assignments', 'learning-goals', id],
    queryFn: () => api.get<AssignedPetrosGoal>(`/student/assignments/learning-goals/${id}`), enabled: Boolean(id) });
  return <QueryPage query={query} loadingLabel="Loading your teacher’s learning goal…">{(data) => <PetrosAssignedGoal data={data as AssignedPetrosGoal} />}</QueryPage>;
}
