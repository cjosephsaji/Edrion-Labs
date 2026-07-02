'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@edrion/ui';
import { NAV } from '@/lib/nav';
import { usePermissions } from '@/lib/permissions';
import { useGlobalSearch } from '@/lib/search';
import { ScopeSwitcher } from './scope-switcher';

/**
 * Top navigation. Title is page-supplied; the scope switcher, global search, Copilot and
 * notifications are persistent. Pages may pass their own primary `actions`.
 */
export function Topbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-5 backdrop-blur">
      <h1 className="text-md shrink-0 font-semibold text-text-primary">{title}</h1>

      <div className="ml-2">
        <ScopeSwitcher />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch />
        <Button variant="ghost" size="icon" aria-label="AI Copilot" onClick={() => router.push('/copilot')}>
          <Sparkles className="h-[18px] w-[18px]" />
        </Button>
        <Notifications />
        {actions}
      </div>
    </header>
  );
}

/** A flat, navigable entry in the results dropdown (a DB record or a module page). */
interface FlatResult {
  href: string;
  label: string;
  sublabel?: string | null;
}

/**
 * Global search across the whole institution — people (name / number / email / phone) and the
 * academic structure (classes, subjects, departments, grades) — plus the module map. DB results
 * come from the scope-aware `/portal/search` API (permission-filtered server-side); module matches
 * are filtered client-side by the user's permissions. Selecting a record opens its list pre-filtered.
 */
function GlobalSearch() {
  const router = useRouter();
  const { can } = usePermissions();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Debounce the term that hits the API (typing stays instant for the module matches).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useGlobalSearch(debounced);

  const modules = useMemo(() => NAV.flatMap((g) => g.items).filter((i) => can(i.permission)), [can]);
  const moduleMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return modules.filter((i) => i.label.toLowerCase().includes(term)).slice(0, 4);
  }, [q, modules]);

  const groups = data?.groups ?? [];
  // First selectable result drives the Enter key: prefer a real record, else a module.
  const first: FlatResult | undefined =
    groups[0]?.hits[0] ?? (moduleMatches[0] ? { href: moduleMatches[0].href, label: moduleMatches[0].label } : undefined);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function go(href: string) {
    router.push(href);
    setQ('');
    setOpen(false);
  }

  const hasQuery = q.trim().length > 0;
  const hasResults = groups.length > 0 || moduleMatches.length > 0;

  return (
    <div ref={ref} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      {isFetching && (
        <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-muted" />
      )}
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && first) go(first.href);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search people, classes, staff…"
        className="h-9 w-72 rounded-md border border-border bg-surface pl-8 pr-8 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
      />
      {open && hasQuery && (
        <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-80 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
          {groups.map((grp) => (
            <div key={grp.type} className="border-b border-border last:border-b-0">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-muted">{grp.label}</p>
              <ul className="pb-1">
                {grp.hits.map((h) => (
                  <li key={`${grp.type}:${h.id}`}>
                    <button
                      onClick={() => go(h.href)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left hover:bg-background-secondary"
                    >
                      <span className="truncate text-sm text-text-primary">{h.label}</span>
                      {h.sublabel && <span className="truncate text-xs text-text-muted">{h.sublabel}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {moduleMatches.length > 0 && (
            <div className="border-b border-border last:border-b-0">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-muted">Modules</p>
              <ul className="pb-1">
                {moduleMatches.map((r) => {
                  const Icon = r.icon;
                  return (
                    <li key={r.href}>
                      <button
                        onClick={() => go(r.href)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-text-secondary hover:bg-background-secondary hover:text-text-primary"
                      >
                        <Icon className="h-4 w-4 text-text-muted" />
                        {r.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {!hasResults && (
            <p className="px-3 py-6 text-center text-sm text-text-muted">
              {isFetching ? 'Searching…' : 'No matches found.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Notifications bell. Empty until the messaging/announcements backend lands (later phase). */
function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" aria-label="Notifications" onClick={() => setOpen((o) => !o)}>
        <Bell className="h-[18px] w-[18px]" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-text-primary">
            Notifications
          </div>
          <div className="px-4 py-6 text-sm text-text-muted">You&rsquo;re all caught up.</div>
        </div>
      )}
    </div>
  );
}
