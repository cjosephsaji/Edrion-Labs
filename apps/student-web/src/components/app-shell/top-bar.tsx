'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, Settings } from 'lucide-react';
import { useState } from 'react';
import { usePersona } from '@/lib/persona';
import { useStudentClient } from '@/lib/student-client';
import { useT } from '@/i18n/use-t';
import {
  coreNav,
  filterSurfaceNav,
  institutionalNav,
  youNav,
  type NavItem,
} from '@/lib/nav';
import { useStudentTerm } from '@/lib/persona';

const titles: Record<string, string> = {
  '/home': 'Home',
  '/learn': 'Learn',
  '/library': 'Library',
  '/lab': 'The Lab',
  '/settings': 'Settings',
};

function screenTitle(pathname: string): string {
  if (titles[pathname]) return titles[pathname];
  const match = Object.entries(titles).find(([p]) => pathname.startsWith(p) && p !== '/home');
  return match?.[1] ?? 'Edrion';
}

export function TopBar() {
  const pathname = usePathname();
  const { me } = usePersona();
  const { t } = useT();
  const terms = useStudentTerm();
  const router = useRouter();
  const client = useStudentClient();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    try {
      await client.post('/auth/logout');
    } catch {
      // continue
    }
    router.push('/login');
  }

  const moreItems: NavItem[] = [
    ...coreNav.filter((n) => !['/home', '/learn', '/library', '/lab'].includes(n.href)),
    ...(me?.kind === 'institutional'
      ? [...institutionalNav(terms), ...filterSurfaceNav(me.surfaces)]
      : []),
    ...youNav,
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-st-bd1 bg-st-page/90 backdrop-blur min-[921px]:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-st-accent text-xs font-bold text-white">
            E
          </span>
          <span className="font-display text-sm font-semibold">{screenTitle(pathname)}</span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full p-1"
            aria-label="Menu"
          >
            {me ? (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-st-accentSoft text-xs font-bold text-st-accentDeep">
                {me.initial}
              </span>
            ) : (
              <Menu size={22} className="text-st-muted" />
            )}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-st-bd1 bg-st-card py-2 shadow-lg">
              <Link
                href="/settings"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-st-ink hover:bg-st-accentSoft/40"
                onClick={() => setMenuOpen(false)}
              >
                <Settings size={16} /> Settings
              </Link>
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm text-st-muted hover:bg-st-accentSoft/40"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                {t('shell.logout')}
              </button>
              <div className="my-1 border-t border-st-bd1" />
              {moreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-4 py-2 text-sm text-st-muted hover:bg-st-accentSoft/40"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
