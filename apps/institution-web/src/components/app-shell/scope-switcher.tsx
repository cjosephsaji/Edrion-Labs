'use client';
import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, School } from 'lucide-react';
import { cn } from '@edrion/ui';
import { useScope } from '@/lib/scope';
import type { InstitutionScope } from '@/lib/types';

/**
 * The global scope switcher. Selecting a scope narrows every dashboard, table, report and
 * analytic below it (the active scope rides on the API request header). Institution-wide users
 * can pick "Entire Institution"; confined users (e.g. Campus Admin) see only their campuses.
 */
export function ScopeSwitcher() {
  const { scope, setScope, campuses, canSelectEntireInstitution, activeLabel } = useScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  // Nothing to switch between — hide entirely (single-campus, confined user).
  if (!canSelectEntireInstitution && campuses.length <= 1) return null;

  function choose(next: InstitutionScope) {
    setScope(next);
    setOpen(false);
  }

  const isActive = (s: InstitutionScope) =>
    s.mode === scope.mode &&
    (s.mode === 'institution' || (scope.mode === 'campus' && s.campusId === scope.campusId));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Switch viewing scope"
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-text-primary transition-colors hover:bg-background-secondary"
      >
        {scope.mode === 'institution' ? (
          <Building2 className="h-4 w-4 text-primary" />
        ) : (
          <School className="h-4 w-4 text-primary" />
        )}
        <span className="hidden max-w-[160px] truncate sm:inline">Viewing: {activeLabel}</span>
        <span className="sm:hidden">{activeLabel}</span>
        <ChevronDown className={cn('h-4 w-4 text-text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Viewing scope
          </div>
          <ul className="max-h-80 overflow-y-auto py-1">
            {canSelectEntireInstitution && (
              <ScopeRow
                icon={Building2}
                label="Entire Institution"
                active={isActive({ mode: 'institution' })}
                onClick={() => choose({ mode: 'institution' })}
              />
            )}
            {campuses.map((c) => (
              <ScopeRow
                key={c.id}
                icon={School}
                label={c.name}
                active={isActive({ mode: 'campus', campusId: c.id })}
                onClick={() => choose({ mode: 'campus', campusId: c.id })}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ScopeRow({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Building2;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:bg-background-secondary hover:text-text-primary"
      >
        <Icon className="h-4 w-4 text-text-muted" />
        <span className="flex-1 truncate">{label}</span>
        {active && <Check className="h-4 w-4 text-primary" />}
      </button>
    </li>
  );
}
