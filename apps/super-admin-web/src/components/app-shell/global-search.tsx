'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CornerDownLeft, CreditCard, Loader2, Search, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@edrion/ui';
import { useInstitutions, useInstitutionUsers, usePlans } from '@edrion/api-client';

interface SearchHit {
  id: string;
  label: string;
  sub: string;
  href: string;
  group: string;
  icon: LucideIcon;
}

/** Global type-ahead. Queries institutions, users and plans in parallel and shows an
 *  animated results dropdown. Keyboard: ↑/↓ to move, Enter to open, Esc to close. */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const active = debounced.length >= 2;

  function go(href: string) {
    setOpen(false);
    setQuery('');
    setDebounced('');
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Search institutions, users, plans"
        placeholder="Search institutions, users, plans…"
        className="h-9 w-64 rounded-full border border-border bg-surface-elevated pl-8 pr-3 text-sm text-text-primary shadow-xs placeholder:text-text-muted transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      />

      {open && active && <SearchResults query={debounced} onSelect={go} />}
      {open && !active && query.length > 0 && (
        <div className="absolute right-0 top-full z-30 mt-2 w-96 rounded-xl border border-border bg-surface-elevated px-4 py-6 text-sm text-text-muted shadow-lg animate-fade-in-up">
          Keep typing to search…
        </div>
      )}
    </div>
  );
}

function SearchResults({ query, onSelect }: { query: string; onSelect: (href: string) => void }) {
  const institutions = useInstitutions({ search: query, page: 1, pageSize: 5 });
  const users = useInstitutionUsers({ search: query, page: 1, pageSize: 5 });
  const plans = usePlans({ search: query, page: 1, pageSize: 5 });

  const results = useMemo<SearchHit[]>(() => {
    const out: SearchHit[] = [];
    for (const i of institutions.data?.items ?? [])
      out.push({
        id: i.id,
        label: i.displayName || i.legalName,
        sub: i.publicId,
        href: `/institutions/${i.id}`,
        group: 'Institutions',
        icon: Building2,
      });
    for (const u of users.data?.items ?? [])
      out.push({ id: u.id, label: u.fullName, sub: u.email, href: `/institution-users/${u.id}`, group: 'Users', icon: Users });
    for (const p of plans.data?.items ?? [])
      out.push({ id: p.id, label: p.name, sub: p.key, href: `/plans/${p.id}`, group: 'Plans', icon: CreditCard });
    return out;
  }, [institutions.data, users.data, plans.data]);

  const loading = institutions.isFetching || users.isFetching || plans.isFetching;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => setActiveIndex(0), [query, results.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (results.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const hit = results[activeIndex];
        if (hit) onSelect(hit.href);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [results, activeIndex, onSelect]);

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-96 overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
      {loading && results.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      ) : results.length === 0 ? (
        <div className="px-4 py-6 text-sm text-text-muted">
          No matches for “{query}”.
        </div>
      ) : (
        <ul className="max-h-96 overflow-y-auto py-1">
          {results.map((r, idx) => {
            const showHeader = idx === 0 || results[idx - 1]?.group !== r.group;
            const Icon = r.icon;
            return (
              <Fragment key={r.group + r.id}>
                {showHeader && (
                  <li className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {r.group}
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => onSelect(r.href)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                      idx === activeIndex ? 'bg-primary-soft/55' : 'hover:bg-primary-soft/55',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{r.label}</span>
                      <span className="block truncate text-xs text-text-muted">{r.sub}</span>
                    </span>
                    {idx === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-text-muted" />}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
