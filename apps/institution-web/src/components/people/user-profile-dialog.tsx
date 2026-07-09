'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BedDouble, HeartPulse, Home, Pencil, ShieldAlert, X } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  cn,
  Dialog,
  Input,
  Label,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
  type BadgeTone,
  type TabItem,
} from '@edrion/ui';
import { EntityRef } from '@/components/common/entity-ref';
import { useFormat } from '@/lib/format';
import { usePermissions } from '@/lib/permissions';
import { useTerm } from '@/lib/term';
import { useLogIncident, useStudentProfile } from '@/lib/student-profile';
import { useParentProfile, useStaffProfile } from '@/lib/people';
import type { ParentRow, StaffRow, StudentRow } from '@/lib/people-types';
import type { UserRow } from '@/lib/admin-types';

// ── Shared lookups (mirrors the former /students/[id] profile page) ─────────────
const SEV_TONE: Record<string, BadgeTone> = { high: 'danger', medium: 'warning', low: 'neutral' };
const STATUS_TONE: Record<string, BadgeTone> = { open: 'warning', resolved: 'success', dismissed: 'neutral' };
const USER_STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  invited: 'info',
  disabled: 'neutral',
  locked: 'warning',
  pending_deletion: 'danger',
};
const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  visiting: 'Visiting',
};
const CATEGORIES = [
  { value: 'behavior', label: 'Behaviour' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'bullying', label: 'Bullying' },
  { value: 'property_damage', label: 'Property damage' },
  { value: 'other', label: 'Other' },
];
const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? v;

interface Common {
  open: boolean;
  onClose: () => void;
  /** Close the popup and open the record's edit form. */
  edit: () => void;
  canEdit: boolean;
}
export type UserProfileDialogProps = Common &
  (
    | { kind: 'student'; row: StudentRow | null }
    | { kind: 'staff'; row: StaffRow | null }
    | { kind: 'parent'; row: ParentRow | null }
    | { kind: 'user'; row: UserRow | null }
  );

/**
 * The single user-details popup, replacing the old left-sliding DetailPanel and the separate
 * /students/[id] "ID card" page. One centred modal shows everything about a person; when there's a
 * lot (students), it's split into tabs. Used by every people/admin directory via
 * ResourceManager's `renderDetail`. Kind-specific bodies own their own hooks, so they mount only
 * while the modal is open (the parent unmounts on close).
 */
export function UserProfileDialog(props: UserProfileDialogProps) {
  const { open, onClose } = props;
  if (!open || !props.row) return null;
  const title =
    props.kind === 'user'
      ? props.row.fullName
      : `${props.row.firstName} ${props.row.lastName}`;

  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-3xl">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-text-primary"
      >
        <X className="h-5 w-5" />
      </button>
      {props.kind === 'student' && <StudentBody row={props.row} edit={props.edit} canEdit={props.canEdit} />}
      {props.kind === 'staff' && <StaffBody row={props.row} edit={props.edit} canEdit={props.canEdit} />}
      {props.kind === 'parent' && <ParentBody row={props.row} edit={props.edit} canEdit={props.canEdit} />}
      {props.kind === 'user' && <UserBody row={props.row} edit={props.edit} canEdit={props.canEdit} />}
    </Dialog>
  );
}

// ── Modal chrome + presentational helpers ───────────────────────────────────────
function Shell({
  header,
  actions,
  children,
}: {
  header: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex max-h-[85vh] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-5 pr-14">
        <div className="min-w-0 flex-1">{header}</div>
        {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>}
      </div>
      <div className="flex-1 overflow-y-auto p-5">{children}</div>
    </div>
  );
}

function PersonHeader({
  id,
  name,
  sub,
  trailing,
  meta,
}: {
  id: string;
  name: string;
  sub?: string;
  trailing?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <EntityRef entity={{ id, label: name, sub }} />
        {trailing}
      </div>
      {meta && <div className="mt-2">{meta}</div>}
    </>
  );
}

function EditButton({ canEdit, edit }: { canEdit: boolean; edit: () => void }) {
  if (!canEdit) return null;
  return (
    <Button size="sm" variant="secondary" onClick={edit}>
      <Pencil className="h-4 w-4" /> Edit
    </Button>
  );
}

function Chips({ items }: { items: (string | null | undefined | false)[] }) {
  const shown = items.filter(Boolean) as string[];
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {shown.map((c) => (
        <span key={c} className="rounded-full bg-background-secondary px-2 py-0.5 text-text-secondary">
          {c}
        </span>
      ))}
    </div>
  );
}

interface FieldItem {
  label: string;
  value: ReactNode;
  full?: boolean;
}
const isEmpty = (v: ReactNode) => v === null || v === undefined || v === '';

function FieldGrid({ fields }: { fields: FieldItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {fields.map((f, i) => (
        <div key={f.label + i} className={cn('min-w-0', f.full && 'col-span-2')}>
          <dt className="text-xs text-text-muted">{f.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-text-primary">
            {isEmpty(f.value) ? <span className="text-text-muted">—</span> : f.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Panel({ title, icon, className, children }: { title: string; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4', className)}>
      <h4 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

// ── Student: the full 360 (identity, snapshot, residence, guardians, academics, health, conduct) ──
function StudentBody({ row, edit, canEdit }: { row: StudentRow; edit: () => void; canEdit: boolean }) {
  const fmt = useFormat();
  const { can } = usePermissions();
  const { data, isLoading, isError } = useStudentProfile(row.id);
  const [logging, setLogging] = useState(false);
  const canLog = can('student_conduct.manage');

  const name = `${row.firstName} ${row.lastName}`;
  const header = (
    <PersonHeader
      id={row.id}
      name={name}
      sub={row.admissionNo ? `Adm ${row.admissionNo}` : undefined}
      trailing={
        <>
          <StatusBadge status={row.status} />
          {data?.hostel?.resident && (
            <Badge tone="info">
              <BedDouble className="mr-1 h-3 w-3" /> Hosteller
            </Badge>
          )}
          {data?.hostel && !data.hostel.resident && (
            <Badge tone="neutral">
              <Home className="mr-1 h-3 w-3" /> Day scholar
            </Badge>
          )}
        </>
      }
      meta={
        <div className="flex flex-col gap-2">
          <Chips
            items={[
              row.rollNo && `Roll ${row.rollNo}`,
              row.className,
              row.gradeLevelName,
              row.gender,
              row.dateOfBirth && `DOB ${fmt.date(row.dateOfBirth)}`,
            ]}
          />
          {(row.email || row.phone) && (
            <p className="text-sm text-text-secondary">{[row.email, row.phone].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      }
    />
  );

  const actions = (
    <>
      {canLog && (
        <Button size="sm" variant="secondary" onClick={() => setLogging(true)}>
          <ShieldAlert className="h-4 w-4" /> Log incident
        </Button>
      )}
      <EditButton canEdit={canEdit} edit={edit} />
    </>
  );

  if (logging) {
    return (
      <Shell header={header}>
        <LogIncidentForm studentId={row.id} studentName={name} onDone={() => setLogging(false)} />
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell header={header} actions={actions}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Shell>
    );
  }
  if (isError || !data) {
    return (
      <Shell header={header} actions={actions}>
        <p className="py-10 text-center text-sm text-text-muted">Couldn’t load this student’s full profile.</p>
      </Shell>
    );
  }

  const tabs: TabItem[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.attendance && (
              <StatCard label="Attendance" value={data.attendance.ratePct != null ? `${data.attendance.ratePct}%` : '—'} hint={`${data.attendance.total} sessions`} />
            )}
            {data.academics && (
              <StatCard label="Average mark" value={data.academics.averagePct != null ? `${data.academics.averagePct}%` : '—'} hint={`${data.academics.gradesRecorded} grades`} />
            )}
            {data.fees && (
              <StatCard label="Fees outstanding" value={fmt.money(data.fees.outstandingMinor)} hint={data.fees.overdue > 0 ? `${data.fees.overdue} overdue` : `${data.fees.invoices} invoices`} />
            )}
            {data.conduct && <StatCard label="Open incidents" value={data.conduct.open} hint={`${data.conduct.total} total`} />}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.hostel && (
              <Panel title="Residence" icon={<BedDouble className="h-4 w-4" />}>
                {data.hostel.resident ? (
                  <FieldGrid
                    fields={[
                      { label: 'Block', value: data.hostel.blockName },
                      { label: 'Room', value: data.hostel.roomNo },
                      { label: 'Bed', value: data.hostel.bedNo },
                      { label: 'Since', value: data.hostel.since ? fmt.date(data.hostel.since) : null },
                    ]}
                  />
                ) : (
                  <p className="text-sm text-text-muted">Day scholar — no hostel allocation.</p>
                )}
              </Panel>
            )}
            {data.guardians && (
              <Panel title={`Guardians (${data.guardians.length})`}>
                {data.guardians.length === 0 ? (
                  <p className="text-sm text-text-muted">No guardians on file.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.guardians.map((g, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-medium text-text-primary">{g.name}</span>
                          <span className="text-text-muted"> · {g.relationship}</span>
                          {g.isPrimary && <Badge tone="info" className="ml-1.5">Primary</Badge>}
                          {g.isEmergencyContact && <Badge tone="warning" className="ml-1">Emergency</Badge>}
                        </span>
                        <span className="text-text-secondary">{[g.phone, g.email].filter(Boolean).join(' · ') || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'academics',
      label: 'Academics & fees',
      content: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.academics && (
            <Panel title="Academics" className="lg:col-span-2">
              <p className="mb-2 text-sm text-text-secondary">
                Assignments: <span className="font-medium text-text-primary">{data.academics.submissions.graded}</span> graded ·{' '}
                {data.academics.submissions.submitted} submitted · {data.academics.submissions.pending} pending
              </p>
              {data.academics.recentGrades.length === 0 ? (
                <p className="text-sm text-text-muted">No grades recorded yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.academics.recentGrades.map((g, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-text-secondary">{g.remarks || 'Grade'}{g.letterGrade ? ` · ${g.letterGrade}` : ''}</span>
                      <span className="tabular-nums text-text-primary">{g.marksObtained}/{g.maxMarks}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {data.attendance && (
            <Panel title="Attendance">
              <FieldGrid
                fields={[
                  { label: 'Rate', value: data.attendance.ratePct != null ? `${data.attendance.ratePct}%` : null },
                  { label: 'Sessions', value: data.attendance.total },
                  { label: 'Present', value: data.attendance.present },
                  { label: 'Absent', value: data.attendance.absent },
                  { label: 'Late', value: data.attendance.late },
                ]}
              />
            </Panel>
          )}
          {data.fees && (
            <Panel title="Fees">
              <FieldGrid
                fields={[
                  { label: 'Invoices', value: data.fees.invoices },
                  { label: 'Billed', value: fmt.money(data.fees.billedMinor) },
                  { label: 'Paid', value: fmt.money(data.fees.paidMinor) },
                  { label: 'Outstanding', value: fmt.money(data.fees.outstandingMinor) },
                  { label: 'Overdue', value: data.fees.overdue },
                ]}
              />
            </Panel>
          )}
        </div>
      ),
    },
    {
      key: 'wellbeing',
      label: 'Health & conduct',
      content: (
        <div className="flex flex-col gap-4">
          {data.health && (
            <Panel title="Health" icon={<HeartPulse className="h-4 w-4" />}>
              <p className="mb-2 text-sm text-text-secondary">
                Incidents: <span className="font-medium text-text-primary">{data.health.incidentsOpen}</span> open / {data.health.incidentsTotal} total
              </p>
              {data.health.records.length === 0 ? (
                <p className="text-sm text-text-muted">No health records.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.health.records.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3">
                      <span className="text-text-primary">{r.title} <span className="text-text-muted">· {r.recordType}</span></span>
                      <span className="flex items-center gap-1.5">
                        {r.followUpRequired && <Badge tone="warning">Follow-up</Badge>}
                        <span className="text-text-muted">{fmt.date(r.at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {data.conduct && (
            <Panel title={`Conduct & complaints (${data.conduct.total})`} icon={<ShieldAlert className="h-4 w-4" />}>
              {data.conduct.recent.length === 0 ? (
                <p className="text-sm text-text-muted">No incidents or complaints on record.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.conduct.recent.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        <span className="font-medium text-text-primary">{c.title}</span>
                        <span className="ml-1.5 text-text-muted">{catLabel(c.category)}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={SEV_TONE[c.severity] ?? 'neutral'}>{c.severity}</Badge>
                        <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                        <span className="text-text-muted">{c.occurredOn ? fmt.date(c.occurredOn) : fmt.date(c.at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {!data.health && !data.conduct && (
            <p className="py-6 text-center text-sm text-text-muted">No wellbeing records visible for your role.</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <Shell header={header} actions={actions}>
      <Tabs items={tabs} />
    </Shell>
  );
}

// ── Staff (merged teachers + non-teaching) ────────────────────────────────────
function StaffBody({ row, edit, canEdit }: { row: StaffRow; edit: () => void; canEdit: boolean }) {
  const fmt = useFormat();
  const { t } = useTerm();
  const { data, isLoading, isError } = useStaffProfile(row.id);

  const header = (
    <PersonHeader
      id={row.id}
      name={`${row.firstName} ${row.lastName}`}
      sub={row.employeeNo ?? undefined}
      trailing={
        <>
          <StatusBadge status={row.status} />
          {row.isTeaching && <Badge tone="info">Teaching</Badge>}
        </>
      }
      meta={<Chips items={[row.designation, row.departmentName]} />}
    />
  );
  const actions = <EditButton canEdit={canEdit} edit={edit} />;

  if (isLoading) {
    return (
      <Shell header={header} actions={actions}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Shell>
    );
  }
  if (isError || !data) {
    return (
      <Shell header={header} actions={actions}>
        <div className="flex flex-col gap-6">
          <Section title="Employment">
            <FieldGrid
              fields={[
                { label: 'Employee no.', value: row.employeeNo ? <span className="font-mono">{row.employeeNo}</span> : null },
                { label: t('department'), value: row.departmentName },
                { label: 'Designation', value: row.designation },
                { label: 'Employment', value: EMPLOYMENT_LABEL[row.employmentType] ?? row.employmentType },
                { label: 'Status', value: <StatusBadge status={row.status} /> },
                { label: 'Join date', value: row.joinDate ? fmt.date(row.joinDate) : null },
              ]}
            />
          </Section>
          <Section title="Contact">
            <FieldGrid fields={[{ label: 'Email', value: row.email }, { label: 'Phone', value: row.phone }]} />
          </Section>
        </div>
      </Shell>
    );
  }

  const tabs: TabItem[] = [
    {
      key: 'overview',
      label: 'Overview',
      content: (
        <div className="flex flex-col gap-6">
          <Section title="Employment">
            <FieldGrid
              fields={[
                { label: 'Employee no.', value: data.overview.employeeNo ? <span className="font-mono">{data.overview.employeeNo}</span> : null },
                { label: t('department'), value: data.overview.departmentName },
                { label: 'Designation', value: data.overview.designation },
                { label: 'Employment', value: EMPLOYMENT_LABEL[data.overview.employmentType] ?? data.overview.employmentType },
                { label: 'Status', value: <StatusBadge status={data.overview.status} /> },
                { label: 'Join date', value: data.overview.joinDate ? fmt.date(data.overview.joinDate) : null },
                {
                  label: 'Roles',
                  value: data.overview.roleKeys.length ? (
                    <span className="flex flex-wrap gap-1">
                      {data.overview.roleKeys.map((k) => (
                        <Badge key={k} tone="neutral">{k}</Badge>
                      ))}
                    </span>
                  ) : null,
                  full: true,
                },
              ]}
            />
          </Section>
          <Section title="Contact">
            <FieldGrid fields={[{ label: 'Email', value: data.overview.email }, { label: 'Phone', value: data.overview.phone }]} />
          </Section>
        </div>
      ),
    },
    {
      key: 'teaching',
      label: 'Teaching load',
      content: data.teaching ? (
        <div className="flex flex-col gap-4">
          <Panel title={`${t('class')} teacher`}>
            {data.teaching.classTeacherOf.length === 0 ? (
              <p className="text-sm text-text-muted">Not assigned as a class teacher.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.teaching.classTeacherOf.map((c) => (
                  <li key={c.id} className="flex justify-between gap-3">
                    <span className="text-text-primary">{c.name}</span>
                    <span className="tabular-nums text-text-muted">
                      {c.studentCount != null ? `${c.studentCount} students` : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Subject assignments">
            {(data.teaching.subjectTeaching ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">No subject assignments.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.teaching.subjectTeaching.map((a) => (
                  <li key={`${a.classId}-${a.subjectId}`} className="text-text-secondary">
                    <span className="font-medium text-text-primary">{a.subjectName}</span>
                    <span className="text-text-muted"> · {a.className}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Teaching load not visible for your role.</p>
      ),
    },
    {
      key: 'account',
      label: 'Account',
      content: data.account ? (
        <FieldGrid
          fields={[
            { label: 'Portal user', value: data.account.institutionUserId ? 'Linked' : 'No login' },
            { label: 'Status', value: data.account.userStatus },
            { label: 'MFA', value: data.account.mfaEnrolled ? 'Enrolled' : 'Not enrolled' },
            { label: 'Last sign-in', value: data.account.lastLoginAt ? fmt.date(data.account.lastLoginAt) : 'Never' },
          ]}
        />
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Account details not visible for your role.</p>
      ),
    },
  ];

  return (
    <Shell header={header} actions={actions}>
      <Tabs items={tabs} />
    </Shell>
  );
}

// ── Parent / Guardian ───────────────────────────────────────────────────────────
function ParentBody({ row, edit, canEdit }: { row: ParentRow; edit: () => void; canEdit: boolean }) {
  const fmt = useFormat();
  const { data, isLoading, isError } = useParentProfile(row.id);

  const header = <PersonHeader id={row.id} name={`${row.firstName} ${row.lastName}`} sub={row.occupation ?? 'Parent / guardian'} />;
  const actions = <EditButton canEdit={canEdit} edit={edit} />;

  if (isLoading) {
    return (
      <Shell header={header} actions={actions}>
        <Skeleton className="h-24 w-full" />
      </Shell>
    );
  }

  const tabs: TabItem[] = [
    {
      key: 'details',
      label: 'Details',
      content: (
        <div className="flex flex-col gap-6">
          <Section title="Details">
            <FieldGrid fields={[{ label: 'Occupation', value: data?.details.occupation ?? row.occupation }]} />
          </Section>
          <Section title="Contact">
            <FieldGrid
              fields={[
                { label: 'Email', value: data?.details.email ?? row.email },
                { label: 'Phone', value: data?.details.phone ?? row.phone },
                { label: 'Address', value: data?.details.address ?? row.address, full: true },
              ]}
            />
          </Section>
        </div>
      ),
    },
    {
      key: 'children',
      label: 'Children',
      content: data?.children ? (
        data.children.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">No linked children.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {data.children.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-text-primary">{c.name}</span>
                  <span className="text-text-muted"> · {c.relationship}</span>
                  {c.isPrimary && <Badge tone="info" className="ml-1.5">Primary</Badge>}
                </span>
                <span className="text-text-secondary">
                  {[c.admissionNo && `Adm ${c.admissionNo}`, c.className].filter(Boolean).join(' · ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : isError ? (
        <p className="py-6 text-center text-sm text-text-muted">Couldn’t load children.</p>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Children not visible for your role.</p>
      ),
    },
    {
      key: 'fees',
      label: 'Fees',
      content: data?.fees ? (
        <FieldGrid
          fields={[
            { label: 'Invoices', value: data.fees.invoices },
            { label: 'Outstanding', value: fmt.money(data.fees.outstandingMinor) },
            { label: 'Overdue', value: data.fees.overdue },
          ]}
        />
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">Fee summary not visible for your role.</p>
      ),
    },
  ];

  return (
    <Shell header={header} actions={actions}>
      <Tabs items={tabs} />
    </Shell>
  );
}

// ── Administrator / platform user ───────────────────────────────────────────────
function UserBody({ row, edit, canEdit }: { row: UserRow; edit: () => void; canEdit: boolean }) {
  const fmt = useFormat();
  const header = (
    <PersonHeader
      id={row.id}
      name={row.fullName}
      sub={row.email}
      trailing={
        <>
          <Badge tone={USER_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge>
          {row.provisionedFromStaffId && (
            <Link href={`/staff?q=${encodeURIComponent(row.provisionedFromStaffName ?? '')}`}>
              <Badge tone="info">From staff · {row.provisionedFromStaffName ?? 'View record'}</Badge>
            </Link>
          )}
        </>
      }
    />
  );
  return (
    <Shell header={header} actions={<EditButton canEdit={canEdit} edit={edit} />}>
      <div className="flex flex-col gap-6">
        <Section title="Account">
          <FieldGrid
            fields={[
              { label: 'Full name', value: row.fullName },
              { label: 'Email', value: row.email },
              { label: 'Phone', value: row.phone },
              { label: 'Status', value: <Badge tone={USER_STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</Badge> },
              { label: 'MFA', value: row.mfaEnrolled ? 'Enrolled' : 'Not enrolled' },
              { label: 'Last sign-in', value: row.lastLoginAt ? fmt.date(row.lastLoginAt) : 'Never' },
            ]}
          />
        </Section>
        <Section title="Access">
          <FieldGrid
            fields={[
              {
                label: 'Roles',
                value: row.roleKeys.length ? (
                  <span className="flex flex-wrap gap-1">
                    {row.roleKeys.map((k) => (
                      <Badge key={k} tone="neutral">{k}</Badge>
                    ))}
                  </span>
                ) : null,
                full: true,
              },
              { label: 'Campuses', value: row.campusCount },
            ]}
          />
        </Section>
      </div>
    </Shell>
  );
}

// ── Inline "Log incident" form (replaces the tabs in place; avoids a nested modal) ──
function LogIncidentForm({ studentId, studentName, onDone }: { studentId: string; studentName: string; onDone: () => void }) {
  const log = useLogIncident();
  const [form, setForm] = useState({ category: 'behavior', title: '', severity: 'medium', occurredOn: '', description: '', notifyGuardians: false });
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!form.title.trim()) return setError('A short title is required.');
    try {
      await log.mutateAsync({
        studentId,
        category: form.category,
        title: form.title.trim(),
        severity: form.severity,
        occurredOn: form.occurredOn || undefined,
        description: form.description.trim() || undefined,
        notifyGuardians: form.notifyGuardians,
      });
      onDone();
    } catch {
      setError('Could not save the incident.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text-primary">Log incident / complaint — {studentName}</h3>
      {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="up-cat">Category</Label>
          <Select id="up-cat" value={form.category} options={CATEGORIES} onChange={(e) => set('category', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="up-sev">Severity</Label>
          <Select id="up-sev" value={form.severity} options={SEVERITIES} onChange={(e) => set('severity', e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="up-title">Title</Label>
        <Input id="up-title" value={form.title} placeholder="e.g. Disrupted class" onChange={(e) => set('title', e.target.value)} />
      </div>
      <div>
        <Label htmlFor="up-on">Date</Label>
        <Input id="up-on" type="date" value={form.occurredOn} onChange={(e) => set('occurredOn', e.target.value)} />
      </div>
      <div>
        <Label htmlFor="up-desc">Description</Label>
        <textarea
          id="up-desc"
          rows={4}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
        />
      </div>
      <label className="flex items-center gap-2.5 text-sm text-text-primary">
        <Checkbox checked={form.notifyGuardians} onChange={(e) => set('notifyGuardians', e.target.checked)} />
        Flag to notify guardians
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone} disabled={log.isPending}>Cancel</Button>
        <Button onClick={submit} loading={log.isPending}>Save</Button>
      </div>
    </div>
  );
}
