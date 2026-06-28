'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, Sparkles } from 'lucide-react';
import { Button } from '@edrion/ui';
import { NAV } from '@/lib/nav';
import { usePermissions } from '@/lib/permissions';
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

/** Lightweight global search over the module map (filtered by the user's permissions). */
function GlobalSearch() {
  const router = useRouter();
  const { can } = usePermissions();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => NAV.flatMap((g) => g.items).filter((i) => can(i.permission)),
    [can],
  );
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return items.filter((i) => i.label.toLowerCase().includes(term)).slice(0, 6);
  }, [q, items]);

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

  return (
    <div ref={ref} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].href);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search modules…"
        className="h-9 w-56 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
      />
      {open && results.length > 0 && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
          <ul className="py-1">
            {results.map((r) => {
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
