'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useStudentOptions, studentRowSelectOptions } from '@/lib/people';
import { useExamOptions } from '@/lib/exams';
import { useGradebookList, useGradebookMutations } from '@/lib/gradebook';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useTerm } from '@/lib/term';
import type { GradeEntryRow } from '@/lib/gradebook-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'gradebook.view',
  create: 'gradebook.manage',
  update: 'gradebook.manage',
  delete: 'gradebook.manage',
};

export default function GradebookPage() {
  const { t } = useTerm();
  const contextFilters = useAcademicContextFilters();
  const { data: students } = useStudentOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: classes } = useClassOptions();
  const { data: exams } = useExamOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'studentId',
        label: t('student'),
        type: 'select',
        required: true,
        options: studentRowSelectOptions(students?.items),
      },
      {
        name: 'subjectId',
        label: t('subject'),
        type: 'select',
        required: true,
        options: (subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: 'examId',
        label: 'Exam',
        type: 'select',
        nullable: true,
        options: (exams?.items ?? []).map((e) => ({ value: e.id, label: e.name })),
        help: 'Optional — leave blank for an ad-hoc assessment.',
      },
      {
        name: 'classId',
        label: t('class'),
        type: 'select',
        nullable: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      { name: 'assessmentName', label: 'Assessment', type: 'text', required: true, placeholder: 'e.g. Midterm' },
      { name: 'marksObtained', label: 'Marks obtained', type: 'number', required: true, min: 0 },
      { name: 'maxMarks', label: 'Max marks', type: 'number', required: true, min: 1 },
      { name: 'letterGrade', label: 'Grade', type: 'text', nullable: true, placeholder: 'e.g. A' },
      { name: 'remarks', label: 'Remarks', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [students, subjects, classes, exams, t],
  );

  const columns = useMemo<Column<GradeEntryRow>[]>(
    () => [
      { key: 'studentName', header: t('student'), render: (r) => <span className="font-medium">{r.studentName ?? '—'}</span> },
      { key: 'subjectName', header: t('subject'), render: (r) => r.subjectName ?? '—' },
      { key: 'assessmentName', header: 'Assessment', sortable: true, render: (r) => <span className="text-text-muted">{r.assessmentName}</span> },
      { key: 'examName', header: 'Exam', render: (r) => <span className="text-text-muted">{r.examName ?? '—'}</span> },
      {
        key: 'marksObtained',
        header: 'Marks',
        align: 'right',
        sortable: true,
        render: (r) => <span className="tabular-nums font-medium">{r.marksObtained}/{r.maxMarks}</span>,
      },
      { key: 'letterGrade', header: 'Grade', align: 'right', render: (r) => r.letterGrade ?? '—' },
    ],
    [t],
  );

  return (
    <ResourceManager<GradeEntryRow>
      resource="gradebook"
      title="Gradebook"
      noun={t('gradeLevel').toLowerCase()}
      columns={columns}
      fields={fields}
      extraFilters={contextFilters}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      searchable
      permissions={PERMISSIONS}
      useList={useGradebookList}
      useMutations={useGradebookMutations}
      rowLabel={(r) => `${r.studentName ?? t('student')} · ${r.assessmentName}`}
      toFormValues={(r) => ({
        studentId: r.studentId,
        subjectId: r.subjectId,
        examId: r.examId ?? '',
        classId: r.classId ?? '',
        assessmentName: r.assessmentName,
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks,
        letterGrade: r.letterGrade ?? '',
        remarks: r.remarks ?? '',
      })}
    />
  );
}
