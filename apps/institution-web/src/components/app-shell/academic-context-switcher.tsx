'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { cn } from '@edrion/ui';
import { useAcademicYearOptions } from '@/lib/academics';
import { useAcademicContext } from '@/lib/academic-context';
import { isAcademicSwitcherHidden } from '@/lib/nav';
import { useTerm } from '@/lib/term';

/**
 * Toolbar switcher for the active academic year — narrows academics lists that honour
 * the global academic context. (Term/semester is page-level only for now.)
 */
export function AcademicContextSwitcher() {
  const pathname = usePathname();
  const { t } = useTerm();
  const { academicYearId, setAcademicYearId, academicYearLabel } = useAcademicContext();
  const { data: years } = useAcademicYearOptions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const yearItems = years?.items ?? [];

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (isAcademicSwitcherHidden(pathname)) return null;
  if (yearItems.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Switch academic year"
        className="flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-primary transition-colors hover:bg-background-secondary"
      >
        <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">{academicYearLabel}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {t('academicYear')}
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            <ul className="py-1">
              {yearItems.map((y) => (
                <ContextRow
                  key={y.id}
                  label={y.name}
                  active={academicYearId === y.id}
                  onClick={() => {
                    setAcademicYearId(y.id);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ContextRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:bg-background-secondary hover:text-text-primary"
      >
        <span className="flex-1 truncate">{label}</span>
        {active && <Check className="h-4 w-4 text-primary" />}
      </button>
    </li>
  );
}
