'use client';
import { Bell, HelpCircle, Plus, Search, Sparkles } from 'lucide-react';
import { Button } from '@edrion/ui';

/** Top navigation. Title is page-supplied; global search + copilot + create are persistent. */
export function Topbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-5 backdrop-blur">
      <h1 className="text-md font-semibold text-text-primary">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            aria-label="Search institutions, users, invoices"
            placeholder="Search institutions, users, invoices…"
            className="h-9 w-64 rounded-md border border-border bg-background-secondary pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <Button variant="ghost" size="icon" aria-label="Copilot">
          <Sparkles className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Help">
          <HelpCircle className="h-[18px] w-[18px]" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
        </Button>
        {actions ?? (
          <Button size="sm">
            <Plus className="h-4 w-4" /> Create
          </Button>
        )}
      </div>
    </header>
  );
}
