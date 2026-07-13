'use client';
import { useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useStudentOptions } from '@/lib/people';
import { namedPersonLabel } from '@/lib/person-name';
import { useBookLoanMutations, useBookLoans } from '@/lib/library';
import { PortalClientError } from '@/lib/portal-client';

/** Inline book loans — shown in the book detail popup. */
export function BookLoansPanel({
  bookId,
  title,
  totalCopies,
  availableCopies,
  activeLoans,
}: {
  bookId: string;
  title: string;
  totalCopies: number;
  availableCopies: number;
  activeLoans: number;
}) {
  const { can } = usePermissions();
  const canManage = can('library.manage');
  const { data: loans, isLoading } = useBookLoans(bookId);
  const { data: students } = useStudentOptions();
  const { issue, returnLoan, remove } = useBookLoanMutations(bookId);

  const [studentId, setStudentId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStudentId('');
    setIssueDate('');
    setDueDate('');
  }

  async function add() {
    if (!studentId) return;
    setError(null);
    try {
      await issue.mutateAsync({ studentId, issueDate: issueDate || null, dueDate: dueDate || null });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not issue this book.');
    }
  }

  async function ret(loanId: string) {
    setError(null);
    try {
      await returnLoan.mutateAsync({ loanId, body: { fineAmount: 0 } });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not return this loan.');
    }
  }

  async function drop(loanId: string) {
    setError(null);
    try {
      await remove.mutateAsync(loanId);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove this loan.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Loans</h3>
      <p className="text-xs text-text-muted">Copies on loan for {title}.</p>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
        <div>
          <p className="text-xs text-text-muted">Total copies</p>
          <p className="font-medium tabular-nums">{totalCopies}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Available</p>
          <p className="font-medium tabular-nums">{availableCopies}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">On loan</p>
          <p className="font-medium tabular-nums">{activeLoans}</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label htmlFor="loan-student">Student</Label>
              <Select
                id="loan-student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="Student…"
                options={(students?.items ?? []).map((s) => ({
                  value: s.id,
                  label: namedPersonLabel(s, s.admissionNo),
                }))}
              />
            </div>
            <div>
              <Label htmlFor="loan-issue">Issued on</Label>
              <Input id="loan-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="loan-due">Due on</Label>
              <Input id="loan-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <Button onClick={add} loading={issue.isPending} disabled={!studentId}>
            Issue book
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : (loans ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted">No copies of this book are on loan yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(loans ?? []).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{l.studentName ?? 'Student'}</p>
                <p className="truncate text-xs text-text-muted">
                  {[l.status, l.issueDate, l.dueDate ? `due ${l.dueDate}` : null, l.returnDate ? `returned ${l.returnDate}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1">
                  {l.status === 'issued' && (
                    <button
                      type="button"
                      aria-label="Return loan"
                      title="Return"
                      onClick={() => ret(l.id)}
                      className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove loan"
                    onClick={() => drop(l.id)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
