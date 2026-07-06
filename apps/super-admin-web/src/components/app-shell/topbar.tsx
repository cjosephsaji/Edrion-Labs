'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Bell,
  HelpCircle,
  Keyboard,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button, cn } from '@edrion/ui';
import { usePendingActions, type PendingActionItemDto } from '@edrion/api-client';
import { GlobalSearch } from './global-search';

/** Top navigation. Title is page-supplied; global search + copilot + help + notifications
 *  are persistent. Pages may pass their own primary `actions` (e.g. a "New plan" button). */
export function Topbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-3 border-b border-border bg-surface/90 px-5 shadow-xs backdrop-blur">
      <h1 className="text-md font-semibold tracking-[0.01em] text-text-primary">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <GlobalSearch />

        <Button variant="ghost" size="icon" aria-label="Copilot" onClick={() => router.push('/copilot')}>
          <Sparkles className="h-[18px] w-[18px]" />
        </Button>

        <HelpMenu />
        <NotificationsMenu />

        {actions}
      </div>
    </header>
  );
}

/** Icon button that toggles an animated dropdown. Closes on outside click or Escape. */
function IconMenu({
  icon: Icon,
  label,
  badge,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
}) {
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

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-expanded={open}
        className="relative"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon className="h-[18px] w-[18px]" />
        {badge}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-surface-elevated shadow-lg animate-fade-in-up">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const PRIORITY_DOT: Record<PendingActionItemDto['priority'], string> = {
  critical: 'bg-danger',
  today: 'bg-warning',
  upcoming: 'bg-primary',
  informational: 'bg-text-muted',
};

function NotificationsMenu() {
  const { data } = usePendingActions();
  const items = data ? Object.values(data.groups).flat() : [];
  const top = items.slice(0, 6);
  const hasItems = (data?.total ?? 0) > 0;

  return (
    <IconMenu
      icon={Bell}
      label="Notifications"
      badge={hasItems ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" /> : null}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-text-primary">Notifications</span>
            <span className="text-xs text-text-muted">{data?.total ?? 0} pending</span>
          </div>
          {top.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-muted">You&rsquo;re all caught up.</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {top.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} onClick={close} className="block px-4 py-2 transition-colors hover:bg-primary-soft/55">
                    <span className="flex items-center gap-2">
                      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[item.priority])} />
                      <span className="truncate text-sm text-text-primary">{item.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-3.5 text-xs text-text-muted">{item.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/pending-actions"
            onClick={close}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-primary-soft/55"
          >
            View all pending actions
          </Link>
        </div>
      )}
    </IconMenu>
  );
}

const HELP_LINKS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Support cases', href: '/support', icon: LifeBuoy },
  { label: 'System health', href: '/system-health', icon: Activity },
  { label: 'Audit logs', href: '/audit', icon: ShieldCheck },
];

function HelpMenu() {
  return (
    <IconMenu icon={HelpCircle} label="Help">
      {(close) => (
        <div className="py-1">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold text-text-primary">
            Help &amp; resources
          </div>
          {HELP_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-primary-soft/55 hover:text-text-primary"
            >
              <l.icon className="h-4 w-4 text-text-muted" />
              {l.label}
            </Link>
          ))}
          <div className="flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-xs text-text-muted">
            <Keyboard className="h-4 w-4" />
            Press <kbd className="rounded border border-border px-1">↑</kbd>
            <kbd className="rounded border border-border px-1">↓</kbd> in search to navigate
          </div>
        </div>
      )}
    </IconMenu>
  );
}
