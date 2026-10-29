'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Home, User, CreditCard, Inbox, MoreHorizontal, LogOut } from 'lucide-react';
import { useMe } from '@/lib/guardian/hooks';
import { FAMILY_BASE, familyPath } from '@/lib/guardian/paths';
import { usePortalClient } from '@/lib/portal-client';
import { clearPortalSession } from '@/lib/portal-session';
import { SwitchInstitutionLink } from '@/components/app-shell/switch-institution-link';
import type { ReactNode } from 'react';

const tabs = [
  { href: FAMILY_BASE, label: 'Home', icon: Home, match: (p: string) => p === FAMILY_BASE },
  {
    href: familyPath('/ward'),
    label: 'Ward',
    icon: User,
    match: (p: string) => p.startsWith(familyPath('/ward')) || p.startsWith(familyPath('/child')),
  },
  { href: familyPath('/fees'), label: 'Fees', icon: CreditCard, match: (p: string) => p.startsWith(familyPath('/fees')) },
  { href: familyPath('/inbox'), label: 'Inbox', icon: Inbox, match: (p: string) => p.startsWith(familyPath('/inbox')) },
  { href: familyPath('/more'), label: 'More', icon: MoreHorizontal, match: (p: string) => p.startsWith(familyPath('/more')) },
];

export function GuardianAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const client = usePortalClient();
  const { data: me } = useMe();
  const unread = me?.unread;

  async function handleLogout() {
    try {
      await client.post('/portal/auth/logout', { mode: 'institution' }, {});
    } catch {
      /* session already gone */
    }
    clearPortalSession(qc);
    router.push('/login');
  }

  return (
    <div className="min-h-dvh bg-transparent" data-guardian-theme>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-14 max-w-app items-center justify-between px-4">
          <span className="font-bold text-brand">
            Edrion <span className="font-semibold text-ink">Family</span>
          </span>
          <div className="flex items-center gap-2">
            {me && me.children.length > 1 && <ChildChips />}
            <SwitchInstitutionLink guardian collapsed enabled={!!me} />
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-line/50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-app px-4 py-5 pb-28">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 shadow-[0_-12px_26px_-22px_rgb(42_38_29_/_0.35)] backdrop-blur">
        <div className="mx-auto grid max-w-app grid-cols-5 px-2">
          {tabs.map((t) => {
            const active = t.match(pathname);
            const badge =
              t.href === familyPath('/inbox') && unread
                ? unread.notifications + unread.notices + unread.messages
                : 0;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] font-medium transition-colors ${active ? 'text-brand' : 'text-muted'}`}
              >
                <span className={`relative rounded-full p-1.5 ${active ? 'bg-brand/10' : ''}`}>
                  <t.icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-bad px-1 text-center text-[10px] text-white">
                      {badge}
                    </span>
                  )}
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

function ChildChips() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto">
      {me.children.map((c) => (
        <Link
          key={c.studentId}
          href={familyPath(`/child/${c.studentId}`)}
          className="flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-1 pr-2.5 shadow-sm"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">
            {c.firstName[0]}
          </span>
          <span className="text-xs font-medium">{c.firstName}</span>
        </Link>
      ))}
    </div>
  );
}
