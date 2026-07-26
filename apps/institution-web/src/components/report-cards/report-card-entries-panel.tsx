'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Label, Skeleton } from '@edrion/ui';
import { useReportCardEntries, useUpsertReportCardEntries } from '@/lib/report-cards';
import type { ReportCardRow } from '@/lib/report-cards-types';
import { PortalClientError } from '@/lib/portal-client';

interface EntryRow {
  subjectLabel: string;
  marks: string;
  maxMarks: string;
  gradeLetter: string;
}

const emptyEntry = (): EntryRow => ({ subjectLabel: '', marks: '', maxMarks: '100', gradeLetter: '' });

export function ReportCardEntriesPanel({ card }: { card: ReportCardRow }) {
  const { data: existing, isLoading } = useReportCardEntries(card.id);
  const upsert = useUpsertReportCardEntries(card.id);
  const [entries, setEntries] = useState<EntryRow[]>([emptyEntry()]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setEntries([emptyEntry()]);
  }, [card.id]);

  useEffect(() => {
    if (loaded || isLoading || !existing) return;
    if (existing.length > 0) {
      setEntries(
        existing.map((e) => ({
          subjectLabel: e.subjectLabel,
          marks: String(e.marks),
          maxMarks: String(e.maxMarks),
          gradeLetter: e.gradeLetter ?? '',
        })),
      );
    }
    setLoaded(true);
  }, [existing, isLoading, loaded]);

  if (card.status === 'published') {
    return <p className="text-sm text-text-muted">Published report cards are read-only.</p>;
  }

  async function save() {
    setError(null);
    setSaved(false);
    try {
      await upsert.mutateAsync({
        entries: entries
          .filter((e) => e.subjectLabel.trim())
          .map((e, idx) => ({
            subjectLabel: e.subjectLabel.trim(),
            marks: Number(e.marks) || 0,
            maxMarks: Number(e.maxMarks) || 100,
            gradeLetter: e.gradeLetter.trim() || undefined,
            sequence: idx,
          })),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not save entries.');
    }
  }

  if (isLoading && !loaded) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Grade entries</h3>
      {entries.map((e, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Label className="text-xs">Subject</Label>
            <Input
              value={e.subjectLabel}
              onChange={(ev) =>
                setEntries((prev) => prev.map((row, i) => (i === idx ? { ...row, subjectLabel: ev.target.value } : row)))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Marks</Label>
            <Input
              type="number"
              value={e.marks}
              onChange={(ev) =>
                setEntries((prev) => prev.map((row, i) => (i === idx ? { ...row, marks: ev.target.value } : row)))
              }
            />
          </div>
          <div>
            <Label className="text-xs">Out of</Label>
            <Input
              type="number"
              value={e.maxMarks}
              onChange={(ev) =>
                setEntries((prev) => prev.map((row, i) => (i === idx ? { ...row, maxMarks: ev.target.value } : row)))
              }
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Grade</Label>
              <Input
                value={e.gradeLetter}
                onChange={(ev) =>
                  setEntries((prev) => prev.map((row, i) => (i === idx ? { ...row, gradeLetter: ev.target.value } : row)))
                }
              />
            </div>
            {entries.length > 1 && (
              <button
                type="button"
                className="text-text-muted hover:text-danger"
                onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEntries((prev) => [...prev, emptyEntry()])}>
          <Plus className="h-4 w-4" />
          Add subject
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={upsert.isPending}>
          Save entries
        </Button>
      </div>
      {saved && <p className="text-xs text-success">Entries saved.</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
