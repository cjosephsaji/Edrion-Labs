'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, Home, Library, MoreHorizontal, Sparkles } from 'lucide-react';
import { PetrosMark } from '@/components/ui/primitives';
import { usePortalConfig } from '@/lib/portal-config';
import { configNav } from '@/lib/nav';

const tabs = [
  { href: '/home', label: 'Today', icon: Home, match: (p: string) => p === '/home' || p === '/' },
  { href: '/learn', label: 'Learn', icon: Sparkles, match: (p: string) => p.startsWith('/learn'), sparkle: true },
  { href: '/library', label: 'Library', icon: Library, match: (p: string) => p.startsWith('/library') },
  { href: '/lab', label: 'Lab', icon: FlaskConical, match: (p: string) => p.startsWith('/lab') },
  {
    href: '/settings',
    label: 'More',
    icon: MoreHorizontal,
    match: (p: string) =>
      !['/home', '/learn', '/library', '/lab', '/'].some(
        (x) => p === x || (x !== '/home' && p.startsWith(x)),
      ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { config } = usePortalConfig();
  const dynamic = configNav(config?.modules ?? []).slice(0, 3).map((item) => ({
    href: item.href, label: item.label, icon: item.icon,
    match: (p: string) => p === item.href || p.startsWith(`${item.href}/`),
  }));
  const visibleTabs = config
    ? [tabs[0]!, ...dynamic, tabs[4]!]
    : [tabs[0]!, tabs[4]!];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-st-bd1 bg-st-sidebar/95 backdrop-blur min-[921px]:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1">
        {visibleTabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-medium ${
                active ? 'text-st-accentDeep' : 'text-st-muted'
              }`}
            >
              <span className={`relative rounded-full p-1.5 ${active ? 'bg-st-accentDeep/[0.07]' : ''}`}>
                <t.icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                {Boolean((t as { sparkle?: boolean }).sparkle) && active && (
                  <span className="absolute -right-0.5 -top-0.5">
                    <PetrosMark className="text-[8px]" />
                  </span>
                )}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
