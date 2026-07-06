'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlaskConical, Home, Library, MoreHorizontal, Sparkles } from 'lucide-react';

const tabs = [
  { href: '/home', label: 'Home', icon: Home, match: (p: string) => p === '/home' || p === '/' },
  { href: '/learn', label: 'Learn', icon: Sparkles, match: (p: string) => p.startsWith('/learn') },
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

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-st-bd1 bg-st-card/95 backdrop-blur min-[921px]:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-medium ${
                active ? 'text-st-accentDeep' : 'text-st-muted'
              }`}
            >
              <span className={`rounded-full p-1.5 ${active ? 'bg-st-accentDeep/10' : ''}`}>
                <t.icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
