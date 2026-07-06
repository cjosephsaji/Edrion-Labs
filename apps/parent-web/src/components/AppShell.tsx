'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, User, CreditCard, Inbox, MoreHorizontal } from 'lucide-react';
import { useMe } from '@/lib/hooks';
import type { ReactNode } from 'react';

const tabs = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/ward', label: 'Ward', icon: User, match: (p: string) => p.startsWith('/ward') || p.startsWith('/child') },
  { href: '/fees', label: 'Fees', icon: CreditCard, match: (p: string) => p.startsWith('/fees') },
  { href: '/inbox', label: 'Inbox', icon: Inbox, match: (p: string) => p.startsWith('/inbox') },
  { href: '/more', label: 'More', icon: MoreHorizontal, match: (p: string) => p.startsWith('/more') },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const unread = me?.unread;

  return (
    <div className="min-h-dvh bg-transparent">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-app px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-brand">Edrion <span className="text-ink font-semibold">Parent</span></span>
          {me && me.children.length > 1 && <ChildChips />}
        </div>
      </header>

      <main className="mx-auto max-w-app px-4 py-5 pb-28">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface/95 shadow-[0_-12px_26px_-22px_rgb(42_38_29_/_0.35)] backdrop-blur">
        <div className="mx-auto grid max-w-app grid-cols-5 px-2">
          {tabs.map((t) => {
            const active = t.match(pathname);
            const badge = t.href === '/inbox' && unread ? unread.notifications + unread.notices + unread.messages : 0;
            return (
              <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] font-medium transition-colors ${active ? 'text-brand' : 'text-muted'}`}>
                <span className={`relative rounded-full p-1.5 ${active ? 'bg-brand/10' : ''}`}>
                  <t.icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                  {badge > 0 && <span className="absolute -top-1 -right-2 bg-bad text-white rounded-full text-[10px] px-1 min-w-[16px] text-center">{badge}</span>}
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** Header child switcher — avatar chips persisted in the URL via /ward links. */
function ChildChips() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto">
      {me.children.map((c) => (
        <Link key={c.studentId} href={`/child/${c.studentId}`} className="flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-1 pr-2.5 shadow-sm">
          <span className="w-6 h-6 rounded-full bg-brand/15 text-brand text-xs font-bold grid place-items-center">{c.firstName[0]}</span>
          <span className="text-xs font-medium">{c.firstName}</span>
        </Link>
      ))}
    </div>
  );
}
