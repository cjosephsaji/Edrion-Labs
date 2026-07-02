'use client';
import type { DetailField } from '@edrion/ui';
import type { StudentContext } from '@/lib/types';
import { EntityRef } from './entity-ref';

/**
 * The header block for a read-only detail panel about a student record (Health, Counseling,
 * Attention Centre): avatar + name + admission no, then a compact chip row of class / grade /
 * section / campus / age. Falls back to a muted note when no student is linked.
 */
export function StudentCardHeader({ student }: { student: StudentContext | null | undefined }) {
  if (!student) return <p className="text-sm text-text-muted">No student linked to this record.</p>;
  const chips = [
    student.className && `Class ${student.className}`,
    student.gradeName,
    student.section && `Sec ${student.section}`,
    student.campusName,
    student.age != null && `Age ${student.age}`,
  ].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <EntityRef entity={student} />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className="rounded-full bg-background-secondary px-2 py-0.5 text-xs text-text-secondary">
              {c}
            </span>
          ))}
        </div>
      )}
      {student.guardian && (
        <p className="text-xs text-text-muted">
          Guardian:{' '}
          <span className="text-text-secondary">
            {student.guardian.name}
            {student.guardian.relationship ? ` (${student.guardian.relationship})` : ''}
            {student.guardian.phone ? ` · ${student.guardian.phone}` : ''}
          </span>
        </p>
      )}
    </div>
  );
}

/** Detail fields describing a student's context — reused inside a detail panel's "Student" section. */
export function studentContextFields(student: StudentContext | null | undefined): DetailField[] {
  return [
    { label: 'Student', value: <EntityRef entity={student} /> },
    { label: 'Admission no.', value: student?.sub },
    { label: 'Class', value: student?.className },
    { label: 'Grade', value: student?.gradeName },
    { label: 'Section', value: student?.section },
    { label: 'Campus', value: student?.campusName },
    { label: 'Age', value: student?.age != null ? String(student.age) : null },
    {
      label: 'Guardian',
      value: student?.guardian
        ? `${student.guardian.name}${student.guardian.phone ? ` · ${student.guardian.phone}` : ''}`
        : null,
    },
  ];
}
