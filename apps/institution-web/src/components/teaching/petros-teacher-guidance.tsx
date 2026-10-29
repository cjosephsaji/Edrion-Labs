'use client';

import styles from './petros-learn.module.css';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, BookOpen, CalendarDays, CheckCircle2, Users } from 'lucide-react';
import { createPetrosTeacherGuidanceSchema, type PetrosTeacherGuidance, type PetrosGuidanceAttachment } from '@edrion/schemas';
import { Button, Checkbox, FieldError, Input, Label, Select } from '@edrion/ui';
import { useFormat } from '@/lib/format';
import { GuidanceAttachments, GuidanceFileList } from './petros-guidance-attachments';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import type { TeachingAssignment } from '@/lib/teaching';

type Student = { id: string; name: string; rollNo: string | null };
type Goal = { id: string; version: number; status: string; dueDate: string;
  guidance: PetrosTeacherGuidance; attachments?: PetrosGuidanceAttachment[]; recipients: Array<{ studentId: string; name: string; progress: string }> };
type Workspace = { students: Student[]; goals: Goal[]; assignmentAvailability?: { available: boolean; reason: string } };
const textarea = 'w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary shadow-xs placeholder:text-text-muted focus-visible:bg-surface focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25';
const approachLabels = { understand: 'Build understanding', practice: 'Practise a weak area', review: 'Review and recall' };
const progressLabels: Record<string, string> = { not_started: 'Not started', started: 'Started',
  session_finished: 'Session ended', reported_complete: 'Reported complete' };

function nextWeek() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function PetrosTeacherGuidance({ assignment, mode = 'goals', demo = false }: { assignment: TeachingAssignment; mode?: 'goals' | 'progress'; demo?: boolean }) {
  const client = usePortalClient();
  const fmt = useFormat();
  const { scope } = useScope();
  const qc = useQueryClient();
  const path = `/portal/teaching/${assignment.classId}/${assignment.subjectId}/guidance`;
  const key = ['petros-teacher-guidance', scope, assignment.classId, assignment.subjectId];
  const workspace = useQuery({ queryKey: key, queryFn: () => client.get<Workspace>(path, scope), retry: false });
  const [audience, setAudience] = useState<'class' | 'students'>('students');
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState('');
  const [instructions, setInstructions] = useState('');
  const [approach, setApproach] = useState<PetrosTeacherGuidance['approach']>('understand');
  const [sessionMinutes, setSessionMinutes] = useState(15);
  const [dueDate, setDueDate] = useState(nextWeek);
  const [attachments, setAttachments] = useState<PetrosGuidanceAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const commandId = useRef<string | null>(null);
  const students = workspace.data?.students ?? [];
  const assignmentUnavailable = workspace.data?.assignmentAvailability?.available === false;
  const recipients = audience === 'class' ? students : students.filter((student) => studentIds.includes(student.id));
  const visibleStudents = students.filter((student) => `${student.name} ${student.rollNo ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const assign = useMutation({
    mutationFn: () => {
      commandId.current ??= crypto.randomUUID();
      const body = createPetrosTeacherGuidanceSchema.parse({ schemaVersion: 'petros.teacher-guidance.v1',
        commandId: commandId.current, focus, instructions, approach, sessionMinutes, dueDate, attachmentObjectIds: attachments.map((file) => file.id),
        audience: audience === 'class' ? { kind: 'class' } : { kind: 'students', studentIds } });
      return client.post<{ id: string }>(path, scope, body);
    },
    onSuccess: () => {
      setNotice(`Learning goal assigned to ${recipients.length} ${recipients.length === 1 ? 'student' : 'students'}. It is available in their learning workspace and Petros workload.`);
      setFocus(''); setInstructions(''); setAttachments([]); setPreview(false); setError(''); commandId.current = null;
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['assignments'] });
    },
    onError: (cause) => setError(formatPortalError(cause, 'The learning goal could not be assigned.')),
  });
  const close = useMutation({
    mutationFn: (goal: Goal) => client.post(`${path}/${goal.id}/close`, scope, { version: goal.version }),
    onSuccess: () => { setNotice('Learning goal closed.'); void qc.invalidateQueries({ queryKey: key }); },
    onError: (cause) => setError(formatPortalError(cause, 'The goal could not be closed.')),
  });
  const busy = assign.isPending || close.isPending || uploading;
  function change() { setPreview(false); setError(''); setNotice(''); commandId.current = null; }
  function prepare() {
    if (!recipients.length) { setError('Choose at least one student.'); return; }
    const parsed = createPetrosTeacherGuidanceSchema.safeParse({ schemaVersion: 'petros.teacher-guidance.v1',
      commandId: crypto.randomUUID(), focus, instructions, approach, sessionMinutes, dueDate, attachmentObjectIds: attachments.map((file) => file.id),
      audience: audience === 'class' ? { kind: 'class' } : { kind: 'students', studentIds } });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check the learning goal.'); return; }
    setError(''); setPreview(true);
  }

  return <div className="flex flex-col gap-4">
    {mode === 'goals' && <section className="rounded-lg border border-border bg-surface p-4 sm:p-5" aria-labelledby="petros-guidance-title">
      <h2 id="petros-guidance-title" className="text-sm font-semibold text-text-primary">Give students a learning goal</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Choose who needs support, tell Petros what to focus on, and set a completion date. Petros uses your instructions when the student starts their learning session.</p>
      <p className="mt-2 text-sm font-medium text-text-primary">{assignment.subjectName} · {assignment.className}</p>
      {workspace.isPending ? <p role="status" className="mt-4 text-sm text-text-muted">Loading your students and learning goals…</p> : null}
      {workspace.isError ? <p role="alert" className="mt-4 text-sm text-danger">{formatPortalError(workspace.error, 'Students and learning goals could not be loaded.')} <button type="button" className="underline" onClick={() => void workspace.refetch()}>Try again</button></p> : null}
      {workspace.data && <p className="mt-4 text-sm" role="status">{'studentCount' in assignment ? `${assignment.studentCount} ${assignment.studentCount === 1 ? 'student' : 'students'} on the class list · ` : ''}{students.length} permitted {students.length === 1 ? 'recipient' : 'recipients'} for learning goals</p>}
      {assignmentUnavailable && <div className="mt-4 rounded-xl bg-surface-elevated p-5"><h3 className="font-semibold">Student assignment unavailable</h3><p className="mt-2 text-sm text-text-secondary">{workspace.data?.assignmentAvailability?.reason}</p></div>}
      {workspace.data && !students.length && !assignmentUnavailable ? <div className="mt-6 rounded-xl bg-surface-elevated p-6"><h3 className="font-semibold">{demo ? 'No students are available in this demo.' : 'No students are available in this class.'}</h3><p className="mt-2 text-sm text-text-secondary">Learning goals can be assigned once permitted students are available. No assignment has been created.</p></div> : null}
      {workspace.data && students.length > 0 && !assignmentUnavailable ? <fieldset disabled={busy} className="mt-5 flex min-w-0 flex-col gap-5 disabled:opacity-70">
        <div>
          <Label htmlFor="petros-audience" className="flex items-center gap-2"><Users size={16} aria-hidden="true" /> Who should learn this?</Label>
          <Select id="petros-audience" value={audience} disabled={busy} options={[{ value: 'students', label: 'Selected students' }, { value: 'class', label: `Whole class (${students.length})` }]} onChange={(event) => { change(); setAudience(event.target.value as 'class' | 'students'); }} />
          {audience === 'students' ? <div className="mt-3 rounded-lg border border-border bg-surface-elevated p-3">
            <Label htmlFor="petros-student-search" className="text-xs">Find a student</Label><Input id="petros-student-search" type="search" placeholder="Search by name or roll number" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="mt-2 grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">
              {visibleStudents.map((student) => <label key={student.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-surface-elevated">
                <Checkbox checked={studentIds.includes(student.id)} onChange={(event) => { change(); setStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id)); }} />
                <span className="text-sm">{student.name}{student.rollNo ? <span className="ml-2 text-xs text-text-muted">{student.rollNo}</span> : null}</span>
              </label>)}
              {!visibleStudents.length ? <p className="p-2 text-sm text-text-muted">{students.length ? 'No student matches your search.' : 'There are no enrolled students in this class yet.'}</p> : null}
            </div>
            <p className="mt-2 text-xs text-text-muted">{recipients.length} selected</p>
          </div> : null}
        </div>
        <div><Label htmlFor="petros-goal-focus">What should they learn or improve?</Label>
          <Input id="petros-goal-focus" maxLength={160} value={focus} onChange={(event) => { change(); setFocus(event.target.value); }} placeholder="For example: Add fractions with unlike denominators" />
        </div>
        <div><Label htmlFor="petros-goal-instructions">How would you like Petros to guide them? <span className="font-normal text-text-muted">· optional</span></Label>
          <textarea id="petros-goal-instructions" className={textarea} rows={4} maxLength={2000} value={instructions} onChange={(event) => { change(); setInstructions(event.target.value); }} placeholder="Start with equivalent fractions. Use visual examples, then practise three problems. Ask the student to explain each step." />
        </div>
        <GuidanceAttachments path={path} files={attachments} disabled={busy} onBusy={setUploading} onError={setError} onChange={(files) => { change(); setAttachments(files); }} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="petros-goal-approach">Learning focus</Label><Select id="petros-goal-approach" value={approach} disabled={busy} options={Object.entries(approachLabels).map(([value, label]) => ({ value, label }))} onChange={(event) => { change(); setApproach(event.target.value as PetrosTeacherGuidance['approach']); }} /></div>
          <div><Label htmlFor="petros-goal-due">Complete by</Label><Input id="petros-goal-due" type="date" value={dueDate} onChange={(event) => { change(); setDueDate(event.target.value); }} /></div>
          <div><Label htmlFor="petros-goal-length">Suggested session length</Label><Select id="petros-goal-length" value={String(sessionMinutes)} disabled={busy} options={[5, 10, 15, 25, 40].map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` }))} onChange={(event) => { change(); setSessionMinutes(Number(event.target.value)); }} /></div>
        </div>
        {!preview ? <div><Button onClick={prepare} disabled={busy || !students.length || !focus.trim() || !recipients.length}>Preview learning goal</Button></div> : <section className="rounded-lg border border-primary/30 bg-surface-elevated p-4" aria-label="Learning goal preview">
          <h3 className="flex items-center gap-2 font-semibold"><BookOpen size={17} aria-hidden="true" /> {focus.trim()}</h3>
          <p className="mt-2 text-sm text-text-secondary">For {audience === 'class' ? `${assignment.className} (${recipients.length} students)` : recipients.map((student) => student.name).join(', ')}</p>
          <p className="mt-2 text-sm">{approachLabels[approach]} · {sessionMinutes}-minute sessions · complete by {fmt.date(dueDate + 'T12:00:00')}</p>
          {instructions.trim() ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{instructions.trim()}</p> : null}
          <GuidanceFileList files={attachments} path={path} onError={setError} />
          <p className="mt-3 text-xs leading-5 text-text-muted">Students receive this goal and its files in Learn. Petros uses your instructions and readable file excerpts. You can follow participation and reported completion below.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button loading={assign.isPending} onClick={() => assign.mutate()} disabled={busy}>Assign learning goal</Button><Button variant="secondary" onClick={() => setPreview(false)} disabled={busy}>Back to editing</Button></div>
        </section>}
      </fieldset> : null}
      <FieldError prominent>{error}</FieldError>
      {notice ? <p role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-surface-elevated p-3 text-sm"><CheckCircle2 size={18} className="shrink-0 text-primary" aria-hidden="true" />{notice}</p> : null}
    </section>}

    <section aria-labelledby="petros-goal-history-title" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="petros-goal-history-title" className="text-sm font-semibold text-text-primary">{mode === 'progress' ? 'Student progress' : 'Assigned learning goals'}</h2><Button size="sm" variant="secondary" onClick={() => void workspace.refetch()} loading={workspace.isFetching}>{mode === 'progress' ? 'Refresh progress' : 'Refresh goals'}</Button></div>
      {mode === 'progress' && workspace.isPending && <p role="status" className="mt-4 text-sm">Loading available progress…</p>}
      {mode === 'progress' && workspace.isError && <p role="alert" className="mt-4 text-sm text-danger">Progress could not be loaded. Try refreshing.</p>}
      <p className="mt-2 text-xs leading-5 text-text-muted">Participation and reported completion help you follow up. They do not establish mastery.</p>
      <div className="mt-4 grid gap-3">{workspace.data?.goals.map((goal) => <article key={goal.id} className="rounded-lg border border-border bg-surface-elevated p-4">
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{goal.guidance.focus}</h3><span className="text-xs text-text-muted">{goal.status === 'closed' ? 'Closed' : 'Active'}</span></div>
        <p className="mt-2 flex items-center gap-2 text-xs text-text-secondary"><CalendarDays size={14} aria-hidden="true" />Complete by {fmt.date(goal.dueDate + 'T12:00:00')} · {approachLabels[goal.guidance.approach]}</p>
        {goal.guidance.instructions ? <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{goal.guidance.instructions}</p> : null}
        <GuidanceFileList files={goal.attachments ?? []} path={path} onError={setError} />
        <details className="mt-3"><summary className="min-h-8 cursor-pointer text-sm font-medium">Student progress ({goal.recipients.length})</summary>
          <ul className="mt-2 divide-y divide-border">{goal.recipients.map((student) => <li key={student.studentId} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{student.name}</span><span className="text-text-muted">{progressLabels[student.progress] ?? 'Not started'}</span></li>)}</ul>
        </details>
        {goal.status === 'published' ? <Button size="sm" variant="secondary" className="mt-3" disabled={busy} loading={close.isPending && close.variables?.id === goal.id} onClick={() => close.mutate(goal)}>Close goal</Button> : null}
      </article>)}</div>
      {workspace.data && !workspace.data.goals.length ? <div className={styles.empty}><BarChart3 size={30} aria-hidden="true" /><h3>{mode === 'progress' ? 'No student progress available yet' : 'No learning goals assigned yet'}</h3><p>{demo ? 'This demo has no available student progress records. No learning evidence has been recorded.' : mode === 'progress' ? 'Participation and reported completion will appear when students start an assigned learning goal.' : 'Assigned goals will appear here after you review and assign them.'}</p></div> : null}
    </section>
  </div>;
}
